"""A graduate's own copy of their credential documents.

The document access model (REMAINING_WORK item 1) deliberately removed
retrievable document locations from the public verification response, which left
a gap on the graduate's side: once claimed, a student could see that a
credential existed but had no route to the certificate or the transcript. The
only download was the share-code route, which is a third party's access path,
not the owner's.

This is the owner's path. It is deliberately narrow:

* it requires an authenticated session, and the credential has to belong to
  `request.user` — a student cannot read another student's documents by
  guessing a certificate ID;
* it serves only `ISSUED` credentials, so a draft or a revoked-in-flight record
  is not downloadable;
* it returns both documents in one archive, because the design doc treats the
  pair as a single credential. A graduate who has to make two requests to
  assemble one award is being handed a worse version of the same record;
* it re-hashes both documents against their anchored values, so this route
  cannot serve bytes that disagree with what was anchored on-chain.
"""

from io import BytesIO
from zipfile import ZIP_DEFLATED, ZipFile

from django.http import HttpResponse
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsFullSession
from certify.encrypted_documents import DocumentEncryptionError, fetch_verified_document
from certify.models import Certificate, CertificateStatus


class MyCertificateDocumentsView(APIView):
    """GET /api/my-certificates/<certificate_id>/documents/

    Returns a zip of the certificate and its transcript for the signed-in
    graduate who owns it.
    """

    permission_classes = [IsFullSession]

    def get(self, request, certificate_id):
        certificate = (
            Certificate.objects.select_related("institution")
            .filter(
                certificate_id=certificate_id,
                student=request.user,
                status=CertificateStatus.ISSUED,
            )
            .first()
        )
        if not certificate:
            # Deliberately one message for "not yours" and "does not exist":
            # distinguishing them would confirm that a certificate ID is real.
            return Response(
                {"detail": "No issued credential of yours was found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # The transcript lives on the credential itself — both the paired upload
        # flow and Flow 2 write these columns, and the associated data for
        # decryption is always the certificate id.
        transcript_cid = certificate.ipfs_cid_transcript
        transcript_hash = certificate.transcript_hash

        # Serve the issued rendering, which for a sealed credential is the
        # sealed copy rather than the review copy the officers approved.
        issued_cid = certificate.issued_pdf_cid
        issued_hash = certificate.authoritative_doc_hash
        if not issued_cid or not issued_hash:
            return Response(
                {"detail": "This credential's certificate document is not available."},
                status=status.HTTP_409_CONFLICT,
            )
        if not transcript_cid or not transcript_hash:
            return Response(
                {"detail": "This credential's transcript is not available."},
                status=status.HTTP_409_CONFLICT,
            )

        try:
            certificate_pdf = fetch_verified_document(
                issued_cid, certificate.certificate_id, "certificate", issued_hash,
            )
            transcript_pdf = fetch_verified_document(
                transcript_cid, certificate.certificate_id, "transcript", transcript_hash,
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

        response = HttpResponse(archive.getvalue(), content_type="application/zip")
        response["Content-Disposition"] = (
            f'attachment; filename="{certificate_id}-documents.zip"'
        )
        # The archive is a decrypted credential. It must not be stored by any
        # intermediary, and a student's own copy is no less sensitive.
        response["Cache-Control"] = "private, no-store"
        response["X-Content-Type-Options"] = "nosniff"
        return response
