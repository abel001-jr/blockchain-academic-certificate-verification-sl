"""Resumable drafts for the external-upload flow.

The upload flow used to be a single irreversible step: the Registrar picked a
PDF in the browser, and the bytes only reached the server inside the one
`upload-and-anchor/` request that also pinned them to IPFS and moved the record
out of DRAFT. Closing the tab, a refresh, or a network failure therefore lost the
selection with no way back, and there was no honest way for a Registrar to say
"I started this and do not want it".

These three views give a draft a real lifecycle, without changing what
"anchored" means:

  POST save-draft-document/   store one document locally, encrypted, DRAFT only
  GET  draft-document/        read that local copy back for the review UI
  POST abandon/               throw the draft away

Two deliberate constraints shape this file.

**No IPFS writes happen here.** Pinata is a metered, rate-limited service, and
auto-save fires every time someone picks a file. Pinning a draft that is then
abandoned would spend quota to store bytes nobody will ever verify. So drafts are
written to ordinary Django media storage, already encrypted, and are moved to
Pinata exactly once — by the unchanged `upload-and-anchor/` endpoint. That also
keeps the anchored hashes (`doc_hash`, `transcript_hash`, the CIDs) blank for
the whole drafting phase, so "this document is on the chain" can never be true
for a record no officer has seen.

**The stored bytes are still the reviewed bytes.** Saving locally must not open
a way to swap a document after it has been read. The envelope is bound to the
certificate id and document kind as AES-GCM associated data by
`encrypt_document`, and `DocumentReview.document_sha256` binds a review to the
exact bytes analysed, so replacing the file invalidates the review rather than
inheriting it. `upload-and-anchor/` re-hashes what it receives and re-runs the
review gate, so a file that changed in local storage is caught at submit time
rather than being assumed to be what was reviewed.
"""

import base64

from django.core.files.base import ContentFile
from django.http import HttpResponse
from django.shortcuts import get_object_or_404

from rest_framework import serializers, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsRegistrar
from audit.utils import log_action

from .encrypted_documents import DocumentEncryptionError, decrypt_document, encrypt_document
from .models import Certificate, CertificateStatus, DocumentReviewKind
from .document_intake import prepare_document


MAX_DRAFT_DOCUMENT_BYTES = 20 * 1024 * 1024


from .signature_readiness import require_signatures


class CertificateDocumentPrepareView(APIView):
    """Prepare scan pages for preview; no storage, pinning, or review decision."""
    permission_classes = [IsRegistrar]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, pk):
        cert = get_object_or_404(Certificate, pk=pk, institution=request.user.institution)
        require_signatures(request.user)
        problem = _editable_draft(cert)
        if problem:
            return Response({"detail": problem}, status=400)
        try:
            output = prepare_document(
                request.FILES.getlist("pages"), int(request.data.get("rotation", 0)),
                int(request.data["rotation_page"]) if request.data.get("rotation_page") else None,
            )
        except (ValueError, TypeError) as exc:
            return Response({"detail": str(exc)}, status=400)
        response = HttpResponse(output, content_type="application/pdf")
        response["Content-Disposition"] = 'inline; filename="prepared-document.pdf"'
        return response

#: model field -> the document kind used for the AES-GCM associated data. These
#: strings are the same ones `upload-and-anchor/` encrypts with, so a document
#: saved here stays decryptable after it is pinned and re-read by the graduate's
#: own-copy route.
_KIND_FIELDS = {
    DocumentReviewKind.CERTIFICATE: "document_file",
    DocumentReviewKind.TRANSCRIPT: "transcript_file",
}


class _DraftDocumentSerializer(serializers.Serializer):
    """One local draft document."""

    kind = serializers.ChoiceField(choices=DocumentReviewKind.choices)
    document_file = serializers.FileField()

    def validate_document_file(self, value):
        if value.size > MAX_DRAFT_DOCUMENT_BYTES:
            raise serializers.ValidationError(
                f"Documents may be no larger than {MAX_DRAFT_DOCUMENT_BYTES // (1024 * 1024)} MB."
            )
        if not value.name.lower().endswith(".pdf"):
            raise serializers.ValidationError("Only PDF documents are accepted.")
        return value


def _editable_draft(cert: Certificate) -> str | None:
    """Return an error message unless this record is still a workable draft."""
    if cert.status != CertificateStatus.DRAFT:
        return (
            "Only a draft can be saved or abandoned. This certificate has already "
            "moved on, so its documents are fixed."
        )
    # `tx_hash` and `cert_hash` are belt-and-braces: the status check above
    # already implies a submitted credential is not a draft, but a record that
    # reached the chain must never be deletable through this route even if its
    # status were ever changed by hand.
    if cert.tx_hash or cert.cert_hash:
        return (
            "This certificate was already submitted on-chain, so it cannot be "
            "abandoned. Use revoke if it has to be withdrawn."
        )
    return None


class CertificateDraftDocumentSaveView(APIView):
    """POST /api/certificates/<pk>/save-draft-document/

    Store the selected document locally, encrypted, and leave the record a
    draft. Called on every file selection so a refresh or a closed tab does not
    lose the Registrar's work.
    """

    permission_classes = [IsRegistrar]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, pk):
        cert = get_object_or_404(Certificate, pk=pk, institution=request.user.institution)
        require_signatures(request.user)

        problem = _editable_draft(cert)
        if problem:
            return Response({"detail": problem}, status=status.HTTP_400_BAD_REQUEST)

        s = _DraftDocumentSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        kind = s.validated_data["kind"]
        pdf_bytes = s.validated_data["document_file"].read()
        field = _KIND_FIELDS[kind]

        encrypted = encrypt_document(pdf_bytes, cert.certificate_id, kind)

        # `FieldFile.save()` does not remove the file it replaces, and the
        # storage backend renames a colliding name rather than overwriting it.
        # Replacing a draft document would therefore leak the previous copy on
        # every autosave, so the old name is captured and deleted afterwards.
        #
        # The delete goes through the storage backend by name rather than
        # through the FieldFile: `getattr(cert, field)` hands back the *same*
        # cached instance that `.save()` mutates, so calling `.delete()` on it
        # would remove the copy that was just written instead of the old one.
        stored = getattr(cert, field)
        storage, previous_name = stored.storage, (stored.name or "")

        stored.save(
            f"{cert.certificate_id}-{kind}.pdf.enc", ContentFile(encrypted), save=False,
        )
        cert.save(update_fields=[field, "updated_at"])
        if previous_name and previous_name != stored.name:
            storage.delete(previous_name)

        # Replacing a document invalidates the decision made against the old one.
        # The review carries the SHA-256 of the bytes it analysed, so the
        # submission gate would reject it as stale anyway — but leaving it behind
        # means a refresh restores a verdict on a document that is no longer
        # there, which reads as a decision nobody made. This is the same rule the
        # delete endpoint applies, for the same reason.
        cert.document_reviews.filter(document_kind=kind).delete()

        log_action(
            actor=request.user,
            action="certificate.draft_document_saved",
            target_type="Certificate",
            target_id=str(cert.id),
            detail=f"Draft {kind} stored locally for {cert.certificate_id} (not yet pinned)",
        )
        return Response(
            {"kind": kind, "filename": getattr(cert, field).name, "size": len(pdf_bytes)},
            status=status.HTTP_200_OK,
        )


class CertificateDraftDocumentView(APIView):
    """GET  /api/certificates/<pk>/draft-document/?kind=certificate|transcript
    DELETE /api/certificates/<pk>/draft-document/?kind=certificate|transcript

    Hand the Registrar's own draft document back so the review screen can show
    the page next to the extracted fields, and remove it again when they clear
    the file. The delete exists so "no document" means the same thing in the
    browser and on the server: without it, clearing a file would look like a
    removal here and then reappear the next time the draft was opened.

    Neither verb is an IPFS route: the public gateway serves the *encrypted*
    envelope, and a draft has no CID to fetch in the first place.
    """

    permission_classes = [IsRegistrar]

    def _target(self, request, cert):
        """Resolve and validate the addressed document, or return a response."""
        kind = request.query_params.get("kind", DocumentReviewKind.CERTIFICATE)
        if kind not in _KIND_FIELDS:
            return kind, None, Response(
                {"detail": "kind must be 'certificate' or 'transcript'."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return kind, _KIND_FIELDS[kind], None

    def get(self, request, pk):
        cert = get_object_or_404(Certificate, pk=pk, institution=request.user.institution)

        problem = _editable_draft(cert)
        if problem:
            return Response({"detail": problem}, status=status.HTTP_400_BAD_REQUEST)

        kind, field, failure = self._target(request, cert)
        if failure:
            return failure

        stored = getattr(cert, field)
        if not stored or not stored.name:
            return Response(
                {"detail": f"No {kind} has been saved to this draft yet."},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            # Decryption is authenticated against the certificate id and kind, so
            # a file copied over from another credential fails here instead of
            # rendering as somebody else's document.
            document = decrypt_document(stored.read(), cert.certificate_id, kind)
        except DocumentEncryptionError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_409_CONFLICT)

        if request.query_params.get("transport") == "json":
            # Background restoration must not look like a PDF download to
            # browser download managers. Rebuild the File in the client.
            response = Response({
                "content_base64": base64.b64encode(document).decode("ascii"),
                "filename": f"{cert.certificate_id}-{kind}-draft.pdf",
            })
        else:
            response = HttpResponse(document, content_type="application/pdf")
            response["Content-Disposition"] = (
                f'inline; filename="{cert.certificate_id}-{kind}-draft.pdf"'
            )
        # An unsubmitted credential is still being worked on, and this is a
        # decrypted copy of it. Nothing may cache it.
        response["Cache-Control"] = "private, no-store"
        response["X-Content-Type-Options"] = "nosniff"
        return response

    def delete(self, request, pk):
        cert = get_object_or_404(Certificate, pk=pk, institution=request.user.institution)

        problem = _editable_draft(cert)
        if problem:
            return Response({"detail": problem}, status=status.HTTP_400_BAD_REQUEST)

        kind, field, failure = self._target(request, cert)
        if failure:
            return failure

        stored = getattr(cert, field)
        if not stored.name:
            # Already gone. Clearing a file twice is not an error worth failing
            # a click over.
            return Response(status=status.HTTP_204_NO_CONTENT)

        # Deleting the file also invalidates any review that was made against
        # it, for the same reason re-picking a different file does.
        cert.document_reviews.filter(document_kind=kind).delete()
        # The column has to be cleared as well. `FieldFile.delete(save=False)`
        # removes the blob but leaves the row pointing at it, which would turn
        # the next read into a 409 on a file that is genuinely gone.
        storage, name = stored.storage, stored.name
        storage.delete(name)
        setattr(cert, field, "")
        cert.save(update_fields=[field, "updated_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)



class CertificateAbandonView(APIView):
    """POST /api/certificates/<pk>/abandon/

    Delete a draft the Registrar no longer wants, together with any documents
    saved against it. Everything into a certificate cascades, so the invite
    tokens, share codes and document reviews go with it.

    Hard delete, deliberately: a draft that was abandoned is not a record of
    anything that happened. It was never submitted, no officer saw it, and
    leaving a dead "Draft" row behind in the list only invites somebody to
    open it again. The audit entry is written first and outlives the row, so
    "this certificate was created and then abandoned" is still answerable.
    """

    permission_classes = [IsRegistrar]

    def post(self, request, pk):
        cert = get_object_or_404(Certificate, pk=pk, institution=request.user.institution)

        problem = _editable_draft(cert)
        if problem:
            return Response({"detail": problem}, status=status.HTTP_400_BAD_REQUEST)

        # Read the ids before the row disappears; the audit log is not a
        # foreign key to the certificate and has to name something concrete.
        certificate_pk = cert.id
        certificate_number = cert.certificate_id
        stored_kinds = [k for k, f in _KIND_FIELDS.items() if getattr(cert, f).name]

        log_action(
            actor=request.user,
            action="certificate.abandoned",
            target_type="Certificate",
            target_id=str(certificate_pk),
            detail=(
                f"Draft {certificate_number} abandoned and deleted by "
                f"{request.user}; documents discarded: {', '.join(stored_kinds) or 'none'}"
            ),
        )

        for field in _KIND_FIELDS.values():
            stored = getattr(cert, field)
            if stored.name:
                stored.delete(save=False)

        cert.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
