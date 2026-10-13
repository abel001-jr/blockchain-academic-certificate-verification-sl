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
    fetch_verified_document,
)
from certify.models import Certificate, CertificateStatus, VerificationShareCode


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

        # The transcript lives on the credential itself; see the paired upload flow
        # in certify/views.py. The decryption associated data is always the
        # certificate id.
        transcript_cid = certificate.ipfs_cid_transcript
        transcript_hash = certificate.transcript_hash

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
            certificate_pdf = fetch_verified_document(
                issued_cid,
                certificate.certificate_id,
                "certificate",
                issued_hash,
            )
            transcript_pdf = fetch_verified_document(
                transcript_cid,
                certificate.certificate_id,
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
