"""Registrar-only, non-persistent PDF text/layout analysis endpoint."""

from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsRegistrar
from .document_analysis import DocumentAnalysisError, analyze_pdf


MAX_PDF_BYTES = 20 * 1024 * 1024


class DocumentAnalysisView(APIView):
    """Analyze an uploaded PDF before issuance; the file is not stored."""

    permission_classes = [IsRegistrar]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        uploaded = request.FILES.get("document")
        if not uploaded:
            return Response(
                {"detail": "Attach a PDF using the 'document' field."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if uploaded.size > MAX_PDF_BYTES:
            return Response(
                {"detail": "PDFs must be 20 MB or smaller."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        language = request.data.get("language", "eng")
        try:
            result = analyze_pdf(uploaded.read(), language=language)
        except DocumentAnalysisError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(result, status=status.HTTP_200_OK)
