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
from .local_documents import owner_document


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
        if not issued_hash:
            return Response(
                {"detail": "This credential's certificate document is not available."},
                status=status.HTTP_409_CONFLICT,
            )
        document = request.query_params.get("document")
        if document is not None:
            if document not in {"certificate", "transcript"}:
                return Response({"detail": "Choose certificate or transcript."}, status=400)
            cid, expected = (issued_cid, issued_hash) if document == "certificate" else (transcript_cid, transcript_hash)
            if not expected:
                return Response({"detail": f"The {document} is not available."}, status=409)
            try:
                pdf, source = owner_document(certificate, document, cid, expected, fetch_verified_document, return_source=True)
                if request.query_params.get("preview") == "true":
                    import pymupdf as fitz
                    try:
                        page_number = int(request.query_params.get("page", "1"))
                        with fitz.open(stream=pdf, filetype="pdf") as doc:
                            if not 1 <= page_number <= doc.page_count:
                                raise ValueError
                            page = doc[page_number-1]
                            image = page.get_pixmap(matrix=fitz.Matrix(1200/max(page.rect.width, page.rect.height), 1200/max(page.rect.width, page.rect.height)), alpha=False)
                            response = HttpResponse(image.tobytes("png"), content_type="image/png")
                            response["X-Document-Pages"] = str(doc.page_count)
                    except Exception:
                        return Response({"detail": "This document preview could not be rendered."}, status=400)
                else:
                    response = HttpResponse(pdf, content_type="application/pdf")
                    response["Content-Disposition"] = f'attachment; filename="{certificate_id}-{document}.pdf"'
                response["X-Document-Source"] = source
                response["Cache-Control"] = "private, no-store"
                response["X-Content-Type-Options"] = "nosniff"
                return response
            except DocumentEncryptionError as exc:
                return Response({"detail": str(exc)}, status=409)
            except RuntimeError:
                return Response({"detail": "Document storage is temporarily unavailable. Please retry."}, status=502)

        if not transcript_hash:
            return Response(
                {"detail": "This credential's transcript is not available."},
                status=status.HTTP_409_CONFLICT,
            )

        try:
            certificate_pdf = owner_document(certificate, "certificate", issued_cid, issued_hash, fetch_verified_document)
            transcript_pdf = owner_document(certificate, "transcript", transcript_cid, transcript_hash, fetch_verified_document)
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
