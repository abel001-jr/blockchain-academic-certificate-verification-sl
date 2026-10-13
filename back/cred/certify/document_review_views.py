"""Registrar document review — item 4 of `REMAINING_WORK.md`.

Two endpoints and one gate:

* `DocumentAnalyzeView`      — analyse an uploaded PDF against the intake record
* `DocumentReviewResolveView`— record the Registrar's decision
* `document_review_gate`     — refuse on-chain submission while a review is open

The design doc's requirement is that a document is never silently bound to the
entered student, and that automated checks stay advisory while Registrar
attestation is required. Those pull in opposite directions, so they are
separated rather than averaged:

* **The comparison cannot authorise anything.** A mismatch may be cleared by a
  human with a stated reason, because OCR on a scanned transcript is fallible
  and a strict match-only rule would strand correct issuances.
* **The absence of a decision blocks.** A credential is not submitted on-chain
  while its document review is unresolved, so there is no path by which a
  document reaches the chain without somebody having looked at it.

`rejected` also blocks. Rejecting means this file is the wrong document, so the
replacement upload is what gets analysed and hashed; letting a rejected review
be overridden back to resolved would defeat the point of rejecting it.
"""

from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsRegistrar

from .document_analysis import DocumentAnalysisError
from .layered_extraction import extract_with_layers
from .institution_identity import institutional_identity
from .encrypted_documents import document_sha256
from .field_extraction import (
    compare_fields,
    summarize,
    unresolved,
    weak_evidence,
)
from .models import (
    Certificate,
    CertificateStatus,
    DocumentReview,
    DocumentReviewKind,
    DocumentReviewState,
    FlowType,
)
from audit.utils import log_action


MAX_ANALYSIS_BYTES = 20 * 1024 * 1024

#: Flow types whose documents originate outside INTELLIGENT ACADEMIC CREDENTIALING, so the bytes being
#: anchored are not something the system generated from the intake record.
#:
#: A system-designed certificate is rendered *from* the intake data, so
#: comparing it back against the same data would be circular and could only ever
#: agree. It is not gated here.
#:
#: Its *transcript* is a different question and is gated separately below: the
#: transcript is an independent third-party document, so checking the generated
#: certificate against it compares two separate sources, which can and should
#: disagree. `system_designed` is therefore absent from this set on purpose —
#: it is not here because its documents are trustworthy, but because the
#: certificate half is self-referential. The transcript half is handled by the
#: SYSTEM_DESIGNED branch in `required_review_kinds`.
EXTERNAL_DOCUMENT_FLOWS = frozenset({"full_upload", "transcript_then_cert"})


def required_review_kinds(cert: Certificate) -> list[str]:
    """Which documents must be reviewed before this credential can be anchored.

    A transcript is only required once one actually exists on the record, so a
    single-document upload is not blocked waiting for a review of a document
    that was never part of the credential.
    """
    if cert.flow_type == FlowType.SYSTEM_DESIGNED:
        # Only the transcript. The certificate is rendered from this same
        # intake record, so re-reading it would only ever agree with itself —
        # it carries no independent evidence. The transcript is authored by the
        # institution's records office and is not derived from anything typed
        # here, so extracting its text and comparing it against the credential
        # is a real cross-check: a transcript naming a different student,
        # award or year is exactly the mistake this is meant to catch.
        return [DocumentReviewKind.TRANSCRIPT] if cert.transcript_hash else []
    if cert.flow_type not in EXTERNAL_DOCUMENT_FLOWS:
        return []
    kinds = [DocumentReviewKind.CERTIFICATE]
    if cert.flow_type == "full_upload" or cert.transcript_hash:
        kinds.append(DocumentReviewKind.TRANSCRIPT)
    return kinds


def document_review_gate(
    cert: Certificate,
    *,
    kinds: list[str] | None = None,
    actual_hashes: dict[str, str] | None = None,
) -> dict | None:
    """Return a blocking payload if a required review is not resolved.

    Returns `None` when nothing stands in the way, so a caller can simply do
    `blocked = document_review_gate(cert); if blocked: return ...`.

    `kinds` narrows which documents are required, for the paths where only some
    of them exist yet — attaching a transcript before the certificate has been
    generated, for instance.

    `actual_hashes` maps a document kind to the SHA-256 of the bytes about to be
    committed. This is the part that stops the check being decorative: analysis
    happens in a separate request against a separately uploaded copy, so without
    comparing hashes a Registrar could clear one file and submit a different
    one, and the review would still read as resolved.
    """
    kinds = kinds if kinds is not None else required_review_kinds(cert)
    if not kinds:
        return None

    reviews = {
        review.document_kind: review
        for review in cert.document_reviews.filter(document_kind__in=kinds)
    }

    blocking, missing, stale = [], [], []
    for kind in kinds:
        review = reviews.get(kind)
        if review is None:
            missing.append(kind)
            continue
        if review.blocks_submission:
            blocking.append(review)
            continue
        expected = (actual_hashes or {}).get(kind)
        if expected and review.document_sha256 and review.document_sha256 != expected:
            stale.append({"document_kind": kind, "state": review.state})

    if not missing and not blocking and not stale:
        return None

    detail = (
        "Every uploaded document must be checked against the record and cleared by "
        "a Registrar before the credential is submitted on-chain."
    )
    if missing:
        detail += f" Not yet analysed: {', '.join(missing)}."
    if blocking:
        detail += f" Awaiting review: {', '.join(r.get_document_kind_display() for r in blocking)}."
    if stale:
        detail += (
            " The document changed since it was reviewed, so the review no longer "
            f"applies: {', '.join(item['document_kind'] for item in stale)}. "
            "Re-analyse and clear the current file."
        )

    return {
        "detail":   detail,
        "code":     "document_review_required",
        "missing":  missing,
        "blocking": [
            {
                "document_kind": review.document_kind,
                "state":         review.state,
                "unresolved":    (review.summary or {}).get("unresolved_count", 0),
            }
            for review in blocking
        ],
        "stale":    stale,
    }


def _intake_expectations(cert: Certificate) -> dict[str, str]:
    """The intake values a document is allowed to contradict."""
    return {
        "student_name":    cert.student_name or "",
        "degree_title":    cert.degree_title or "",
        # Compared on the institution's own name, not a synthetic label.
        "institution":     cert.institution.name if cert.institution_id else "",
        # graduation_year is an int on the model; the comparison is textual.
        "graduation_year": str(cert.graduation_year or ""),
    }


def _expected_from_upload(cert: Certificate, override: dict) -> dict[str, str]:
    """Expectations, letting a draft preview supply its own values.

    The upload wizard builds a certificate in the browser and only creates the
    record once the document is chosen, so the pre-submit check has to run
    against the values the Registrar actually typed rather than whatever the
    stored record happens to hold.
    """
    expectations = _intake_expectations(cert)
    for key in ("student_name", "degree_title", "institution", "graduation_year"):
        if override.get(key):
            expectations[key] = str(override[key])
    return expectations


# ── Serializers ──────────────────────────────────────────────────────────────

class DocumentAnalyzeSerializer(serializers.Serializer):
    document_file = serializers.FileField()
    document_kind = serializers.ChoiceField(
        choices=DocumentReviewKind.choices, default=DocumentReviewKind.CERTIFICATE,
    )
    # Optional pre-submit expectations, so the wizard can check a document
    # before the certificate record exists.
    expected_student_name    = serializers.CharField(required=False, allow_blank=True, max_length=200)
    expected_degree_title    = serializers.CharField(required=False, allow_blank=True, max_length=255)
    expected_institution     = serializers.CharField(required=False, allow_blank=True, max_length=255)
    expected_graduation_year = serializers.CharField(required=False, allow_blank=True, max_length=20)


class DocumentReviewResolveSerializer(serializers.Serializer):
    ACTION_APPROVE  = "approve"
    ACTION_OVERRIDE = "override"
    ACTION_REJECT   = "reject"

    action = serializers.ChoiceField(
        choices=[ACTION_APPROVE, ACTION_OVERRIDE, ACTION_REJECT],
    )
    resolution_note = serializers.CharField(required=False, allow_blank=True, max_length=2000)
    fields = serializers.ListField(
        child=serializers.CharField(max_length=64), required=False, default=list,
    )

    def validate(self, attrs):
        action = attrs["action"]
        note = (attrs.get("resolution_note") or "").strip()

        # `approve` is only honest when the extractor found nothing to raise,
        # which is checked against the stored comparisons in the view. The other
        # two are a human accepting a known difference or rejecting the file, so
        # both have to say why.
        if action in (self.ACTION_OVERRIDE, self.ACTION_REJECT) and not note:
            raise serializers.ValidationError({
                "resolution_note": (
                    "Give a reason. An override accepts a known difference between the "
                    "document and the record, and a rejection says the wrong document was "
                    "supplied; both are recorded against your name."
                ),
            })
        return attrs


# ── Views ────────────────────────────────────────────────────────────────────

class DocumentAnalyzeView(APIView):
    """POST /api/certificates/<id>/analyze-document/

    Runs text/OCR extraction over an uploaded PDF, compares the configured
    fields against the intake record, and stores the result as a pending
    `DocumentReview`.

    The file is analysed but not stored, encrypted or pinned here. This step
    exists to inform the Registrar, not to fix document bytes; the bytes are
    fixed later by the upload/anchor path, which records the SHA-256 so a
    review cannot be inherited by different content.
    """
    permission_classes = [IsRegistrar]
    parser_classes     = [MultiPartParser, FormParser]

    def post(self, request, pk):
        cert = get_object_or_404(Certificate, pk=pk, institution=request.user.institution)

        s = DocumentAnalyzeSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        document_file = s.validated_data["document_file"]
        kind         = s.validated_data["document_kind"]

        if document_file.size > MAX_ANALYSIS_BYTES:
            return Response(
                {"detail": f"Documents may be no larger than {MAX_ANALYSIS_BYTES // (1024 * 1024)} MB."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not document_file.name.lower().endswith(".pdf"):
            return Response({"detail": "Only PDF documents can be analysed."},
                            status=status.HTTP_400_BAD_REQUEST)

        if cert.status not in (CertificateStatus.DRAFT, CertificateStatus.PENDING):
            return Response(
                {"detail": "Documents can only be analysed while the certificate is still a draft."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        pdf_bytes = document_file.read()
        try:
            analysis, extracted, layers = extract_with_layers(pdf_bytes)
        except DocumentAnalysisError as exc:
            # Surfaced verbatim: it distinguishes "not a PDF", "no pages", "too
            # many pages" and "install Tesseract", all of which the Registrar
            # can act on.
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        expectations = _expected_from_upload(cert, {
            "student_name":    s.validated_data.get("expected_student_name"),
            "degree_title":    s.validated_data.get("expected_degree_title"),
            "institution":     s.validated_data.get("expected_institution"),
            "graduation_year": s.validated_data.get("expected_graduation_year"),
        })

        comparisons = compare_fields(expectations, extracted, pages=analysis["pages"])
        result      = summarize(comparisons)
        result["layers"] = layers
        result["recognition"] = analysis.get("recognition", {})
        result["institution_identity"] = institutional_identity(pdf_bytes, cert)

        review, created = DocumentReview.objects.update_or_create(
            certificate=cert,
            document_kind=kind,
            defaults={
                "extracted":        extracted,
                "comparisons":      comparisons,
                "summary":          result,
                "ocr_used":         analysis["ocr_used"],
                "page_count":       analysis["page_count"],
                "document_sha256":  document_sha256(pdf_bytes),
                # A fresh analysis discards any earlier decision. The bytes may
                # have changed, and a Registrar's sign-off only ever applied to
                # what they were shown.
                "state":            DocumentReviewState.PENDING,
                "resolution_note":  "",
                "overridden_fields": [],
                "reviewed_by":      None,
                "reviewed_at":      None,
            },
        )

        log_action(
            actor=request.user,
            action="certificate.document_analysed",
            target_type="Certificate",
            target_id=str(cert.id),
            detail=(
                f"{review.get_document_kind_display()} analysed for {cert.certificate_id}: "
                f"{result['counts']['match']} matching, {result['counts']['mismatch']} mismatched, "
                f"{result['counts']['not_found']} not found"
                + (" (OCR)" if analysis["ocr_used"] else "")
            ),
        )

        return Response(
            {"review": _serialize_review(review), "replaced_existing": not created},
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class DocumentReviewImagesView(APIView):
    """Enrich an existing inspection without resetting its decision or text results."""
    permission_classes = [IsRegistrar]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, pk, kind):
        from .encrypted_documents import decrypt_document, fetch_verified_document, DocumentEncryptionError
        cert = get_object_or_404(Certificate, pk=pk, institution=request.user.institution)
        review = get_object_or_404(DocumentReview, certificate=cert, document_kind=kind)
        existing = (review.summary or {}).get("institution_identity", {})
        if any(item.get("document_image") for item in existing.get("items", [])):
            return Response({"review": _serialize_review(review)})
        uploaded = request.FILES.get("document_file")
        try:
            if uploaded:
                if uploaded.size > MAX_ANALYSIS_BYTES:
                    return Response({"detail": "Document is too large."}, status=400)
                document = uploaded.read()
            else:
                stored = getattr(cert, "transcript_file" if kind == "transcript" else "document_file")
                if stored:
                    with stored.open("rb") as source:
                        document = decrypt_document(source.read(), cert.certificate_id, kind)
                else:
                    cid = cert.ipfs_cid_transcript if kind == "transcript" else cert.ipfs_cid_pdf
                    if not cid:
                        return Response({"detail": "The inspected file is not stored. Upload the same file to retrieve its image previews."}, status=404)
                    document = fetch_verified_document(cid, cert.certificate_id, kind, review.document_sha256)
            if document_sha256(document).lower() != review.document_sha256.lower():
                return Response({"detail": "This file differs from the inspected document. Re-read it before reviewing its images."}, status=409)
            identity = institutional_identity(document, cert)
        except (OSError, ValueError, DocumentEncryptionError):
            return Response({"detail": "Could not retrieve images from the inspected file."}, status=409)
        review.summary = {**(review.summary or {}), "institution_identity": identity}
        review.save(update_fields=["summary"])
        return Response({"review": _serialize_review(review)})


class DocumentReviewResolveView(APIView):
    """POST /api/certificates/<id>/document-reviews/<kind>/resolve/"""
    permission_classes = [IsRegistrar]

    def post(self, request, pk, kind):
        cert = get_object_or_404(Certificate, pk=pk, institution=request.user.institution)
        try:
            review = cert.document_reviews.get(document_kind=kind)
        except DocumentReview.DoesNotExist:
            return Response(
                {"detail": f"There is no {kind} document review for this certificate. Analyse the document first."},
                status=status.HTTP_404_NOT_FOUND,
            )

        s = DocumentReviewResolveSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        action = s.validated_data["action"]
        note   = (s.validated_data.get("resolution_note") or "").strip()

        open_items = unresolved(review.comparisons or [])

        # `approve` claims every field agrees. If the extractor actually raised
        # something, honouring that would let a mismatch be waved through
        # without a reason, which is precisely the silent binding the design doc
        # rules out. Overriding is still available, and is recorded.
        if action == DocumentReviewResolveSerializer.ACTION_APPROVE and open_items:
            return Response(
                {
                    "detail": (
                        f"{len(open_items)} field(s) still need attention: "
                        + ", ".join(item["field"] for item in open_items)
                        + ". Clear them individually with an override and a reason, "
                        "or reject the document."
                    ),
                    "unresolved": [item["field"] for item in open_items],
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # A label-less certificate can have every field confirmed by text search
        # and nothing at all read from a labelled value. That is a legitimate
        # approval, but it is not a routine one: the Registrar is asserting that
        # each value sits where a credential would put it, having been shown no
        # field at all. A note is required so that assertion is on the record
        # rather than implied by a click on a button that says everything agrees.
        #
        # The test is "nothing was read", not "something was found by text": a
        # document with three parsed fields and one disclosed text hit is still
        # the ordinary case, and turning it into a mandatory form would just
        # train people to type filler.
        if action == DocumentReviewResolveSerializer.ACTION_APPROVE and not note:
            comparisons = review.comparisons or []
            weak = weak_evidence(comparisons)
            parsed = [item for item in comparisons if item["status"] == "match"]
            if weak and not parsed:
                return Response(
                    {
                        "detail": (
                            f"This document labels none of the {len(weak)} value(s) that "
                            "were checked; they were all confirmed by searching its text. "
                            "Record where you confirmed each one before accepting it."
                        ),
                        "weak_evidence": sorted(item["field"] for item in weak),
                        "requires_reason": True,
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        if action == DocumentReviewResolveSerializer.ACTION_REJECT:
            new_state = DocumentReviewState.REJECTED
        elif open_items:
            new_state = DocumentReviewState.OVERRIDDEN
        else:
            new_state = DocumentReviewState.RESOLVED

        known = {item["field"] for item in (review.comparisons or [])}
        requested = [f for f in (s.validated_data.get("fields") or []) if f]
        unknown = [f for f in requested if f not in known]
        if unknown:
            return Response(
                {"detail": f"Unknown field(s): {', '.join(unknown)}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # An override clears the *whole* review, so the recorded field list has to
        # be the complete set the extractor raised. Otherwise a caller could send
        # `fields: []` and the audit trail would record a review that accepted
        # nothing while the credential went on-chain having accepted everything.
        if action == DocumentReviewResolveSerializer.ACTION_OVERRIDE and open_items:
            outstanding = {item["field"] for item in open_items}
            missing = sorted(outstanding - set(requested))
            if missing:
                return Response(
                    {
                        "detail": (
                            "An override has to account for every field the check raised. "
                            f"Not listed: {', '.join(missing)}."
                        ),
                        "unresolved": sorted(outstanding),
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            # Store what was actually outstanding rather than what was sent, so
            # the record cannot diverge from the comparisons it describes.
            requested = [item["field"] for item in open_items]

        review.state             = new_state
        review.resolution_note   = note
        review.overridden_fields = requested if new_state == DocumentReviewState.OVERRIDDEN else []
        review.reviewed_by       = request.user
        review.reviewed_at       = timezone.now()
        review.save(update_fields=[
            "state", "resolution_note", "overridden_fields",
            "reviewed_by", "reviewed_at", "updated_at",
        ])

        log_action(
            actor=request.user,
            action=f"certificate.document_review_{new_state}",
            target_type="Certificate",
            target_id=str(cert.id),
            detail=(
                f"{review.get_document_kind_display()} review for {cert.certificate_id} set to "
                f"{review.get_state_display()} by {request.user.email}"
                + (f" — {', '.join(requested)}" if requested else "")
                + (f". Reason: {note}" if note else ".")
            ),
        )

        return Response({"review": _serialize_review(review)})


def _serialize_review(review: DocumentReview) -> dict:
    """Review as the Registrar's UI needs it."""
    return {
        "id":              str(review.id),
        "document_kind":   review.document_kind,
        "document_label":  review.get_document_kind_display(),
        "state":           review.state,
        "state_label":     review.get_state_display(),
        "extracted":       review.extracted,
        "comparisons":     review.comparisons,
        "summary":         review.summary,
        "ocr_used":        review.ocr_used,
        "page_count":      review.page_count,
        "document_sha256": review.document_sha256,
        "resolution_note": review.resolution_note,
        "overridden_fields": review.overridden_fields,
        "is_resolved":     review.is_resolved,
        "is_rejected":     review.is_rejected,
        "used_weak_evidence": review.used_weak_evidence,
        "blocks_submission": review.blocks_submission,
        "reviewed_by":     review.reviewed_by.email if review.reviewed_by_id else None,
        "reviewed_at":     review.reviewed_at,
    }
