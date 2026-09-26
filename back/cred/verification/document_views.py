"""Share-code gated retrieval of the encrypted credential document pair."""

from io import BytesIO
from zipfile import ZIP_DEFLATED, ZipFile

from django.http import HttpResponse
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from certify.encrypted_documents import (
    DocumentEncryptionError,
    decrypt_document,
    document_sha256,
    is_encrypted_document,
)
from certify.ipfs import fetch_file_from_ipfs
from certify.models import Certificate, CertificateStatus, Transcript, VerificationShareCode


def _get_document(cid: str, associated_id: str, kind: str, expected_hash: str) -> bytes:
    encrypted = fetch_file_from_ipfs(cid)
    if not is_encrypted_document(encrypted):
        raise DocumentEncryptionError(
            "This credential contains a legacy document that has not been re-encrypted."
        )
    document = decrypt_document(encrypted, associated_id, kind)
    if document_sha256(document).lower() != (expected_hash or "").lower():
        raise DocumentEncryptionError("Decrypted document does not match its anchored hash.")
    return document


class SharedCredentialDocumentsView(APIView):
    """Return both PDFs only after validating an active share code."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, certificate_id):
        raw_code = request.query_params.get("code", "").strip()
        if not raw_code:
            return Response(
                {"detail": "A graduate share code is required."},
                status=status.HTTP_403_FORBIDDEN,
            )

        share, error = VerificationShareCode.validate(
            raw_code,
            ip=request.META.get("REMOTE_ADDR", ""),
            consume=False,
        )
        if error or not share or share.certificate.certificate_id != certificate_id:
            return Response(
                {"detail": "The share code is invalid, expired, or revoked."},
                status=status.HTTP_403_FORBIDDEN,
            )

        certificate = Certificate.objects.select_related("institution").filter(
            certificate_id=certificate_id,
            status=CertificateStatus.ISSUED,
        ).first()
        if not certificate:
            return Response(
                {"detail": "No issued credential was found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        transcript_cid = certificate.ipfs_cid_transcript
        transcript_hash = certificate.transcript_hash
        transcript_associated_id = certificate.certificate_id
        if not transcript_cid:
            transcript = Transcript.objects.filter(certificate=certificate).first()
            if transcript:
                transcript_cid = transcript.ipfs_cid
                transcript_hash = transcript.transcript_hash
                transcript_associated_id = transcript.transcript_id

        # The document served is the issued one, which for a sealed credential
        # is the sealed copy rather than the review copy officers approved.
        issued_cid = certificate.issued_pdf_cid
        issued_hash = certificate.authoritative_doc_hash
        if not issued_cid or not issued_hash or not transcript_cid or not transcript_hash:
            return Response(
                {"detail": "This credential is missing one or both finalized documents."},
                status=status.HTTP_409_CONFLICT,
            )

        try:
            certificate_pdf = _get_document(
                issued_cid,
                certificate.certificate_id,
                "certificate",
                issued_hash,
            )
            transcript_pdf = _get_document(
                transcript_cid,
                transcript_associated_id,
                "transcript",
                transcript_hash,
            )
        except DocumentEncryptionError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_409_CONFLICT)
        except RuntimeError:
            return Response(
                {"detail": "The encrypted documents are temporarily unavailable."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        archive = BytesIO()
        with ZipFile(archive, "w", ZIP_DEFLATED) as bundle:
            bundle.writestr(f"{certificate_id}-certificate.pdf", certificate_pdf)
            bundle.writestr(f"{certificate_id}-transcript.pdf", transcript_pdf)
        archive.seek(0)

        if share.single_use:
            updated = VerificationShareCode.objects.filter(
                pk=share.pk,
                used=False,
                revoked=False,
                expires_at__gt=timezone.now(),
            ).update(
                used=True,
                used_at=timezone.now(),
                used_by_ip=request.META.get("REMOTE_ADDR") or None,
            )
            if not updated:
                return Response(
                    {"detail": "The share code is invalid, expired, or already used."},
                    status=status.HTTP_403_FORBIDDEN,
                )

        response = HttpResponse(archive.getvalue(), content_type="application/zip")
        response["Content-Disposition"] = f'attachment; filename="{certificate_id}-documents.zip"'
        response["Cache-Control"] = "private, no-store"
        response["X-Content-Type-Options"] = "nosniff"
        return response
