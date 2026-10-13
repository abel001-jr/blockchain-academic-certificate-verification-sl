"""
Officer cosmetic digital signature API.

IMPORTANT: The signature image is display-only. Authenticity is the on-chain
submission or approval transaction — always show the image with its chain record.
"""

from django.core.files.base import ContentFile
from django.utils import timezone
from rest_framework import status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from audit.utils import log_action
from .models import Role
from .serializers import UserSerializer
from .tokens import is_setup_token


def _absolute_media_url(request, file_field):
    if not file_field:
        return ""
    url = file_field.url
    if request:
        return request.build_absolute_uri(url)
    return url


def snapshot_signature_to_certificate(user, certificate, field_name: str):
    """
    Copy the officer's current signature onto the certificate so later
    updates to User.signature_image do not rewrite historical diplomas.
    """
    if not user.signature_image:
        return False
    try:
        user.signature_image.open("rb")
        data = user.signature_image.read()
        user.signature_image.close()
    except Exception:
        return False
    ext = (user.signature_image.name or "sig.png").rsplit(".", 1)[-1]
    filename = f"{certificate.certificate_id}_{field_name}.{ext}"
    getattr(certificate, field_name).save(filename, ContentFile(data), save=False)
    return True


class OfficerSignatureView(APIView):
    """
    GET  /api/auth/signature/  — current officer signature
    POST /api/auth/signature/  — upload / replace (multipart: signature_image)
    DELETE /api/auth/signature/ — clear (rare; prefer replace)

    Allowed for Registrar / VC / Chancellor during a full session.
    """
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def _ensure_officer(self, request):
        if request.user.role not in (
            Role.REGISTRAR, Role.VC, Role.CHANCELLOR,
        ):
            return Response(
                {"detail": "Only institution signers may manage a signature."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return None

    def get(self, request):
        denied = self._ensure_officer(request)
        if denied:
            return denied
        user = request.user
        return Response({
            "has_signature": bool(user.signature_image),
            "signature_url": _absolute_media_url(request, user.signature_image),
            "signature_set_at": user.signature_set_at,
            "full_name": user.full_name,
            "role": user.role,
            "token_use": "officer_setup" if is_setup_token(request.auth) else "full",
            "notice": (
                "Signature images are cosmetic only. On-chain approval transactions "
                "are the proof of authenticity — always display the image with the tx hash."
            ),
        })

    def post(self, request):
        denied = self._ensure_officer(request)
        if denied:
            return denied

        upload = request.FILES.get("signature_image")
        if not upload:
            return Response(
                {"detail": "Upload signature_image (PNG/JPEG recommended)."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Basic size guard (~2 MB)
        if upload.size and upload.size > 2 * 1024 * 1024:
            return Response(
                {"detail": "Signature image must be under 2 MB."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = request.user
        previous = bool(user.signature_image)
        if user.signature_image:
            user.signature_image.delete(save=False)

        user.signature_image = upload
        user.signature_set_at = timezone.now()
        user.save(update_fields=["signature_image", "signature_set_at", "updated_at"])

        log_action(
            actor=user,
            action="officer.signature_updated" if previous else "officer.signature_set",
            target_type="User",
            target_id=str(user.id),
            detail=(
                f"{'Updated' if previous else 'Set'} cosmetic signature for "
                f"{user.full_name} ({user.role}). "
                f"Certificates already signed keep their snapshotted image."
            ),
        )

        return Response({
            "detail": "Signature saved.",
            "has_signature": True,
            "signature_url": _absolute_media_url(request, user.signature_image),
            "signature_set_at": user.signature_set_at,
            "user": UserSerializer(user, context={"request": request}).data,
            "notice": (
                "This image is cosmetic only. Authenticity comes from on-chain "
                "submission and approval transactions."
            ),
        })

    def delete(self, request):
        denied = self._ensure_officer(request)
        if denied:
            return denied
        user = request.user
        if user.signature_image:
            user.signature_image.delete(save=False)
        user.signature_image = None
        user.signature_set_at = timezone.now()
        user.save(update_fields=["signature_image", "signature_set_at", "updated_at"])
        log_action(
            actor=user,
            action="officer.signature_cleared",
            target_type="User",
            target_id=str(user.id),
            detail=f"Cleared signature for {user.full_name}",
        )
        return Response({"detail": "Signature cleared.", "has_signature": False})
