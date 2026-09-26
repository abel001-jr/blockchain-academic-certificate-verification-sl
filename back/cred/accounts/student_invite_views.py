"""
accounts/student_invite_views.py

Student invite token claim endpoint.

POST /api/auth/student-invite/claim/
Body: { "token": "<raw_invite_token>" }

Validates the token, issues a full JWT for the student, and marks the
token as used.  The student is then on the platform and can link their
Google account from Settings.

No authentication required — this is the student's first login.
"""

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework import status

from audit.utils import log_action
from .tokens import issue_full_tokens
from .serializers import UserSerializer


class StudentInviteClaimView(APIView):
    """
    POST /api/auth/student-invite/claim/

    Body:
        { "token": "<raw_invite_token>" }

    Success response (200):
        {
            "access":  "<jwt>",
            "refresh": "<jwt>",
            "user":    { ...UserSerializer fields... }
        }

    Error responses:
        400 — missing token field
        403 — invalid / expired / already-used token
    """

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        from certify.models import StudentInviteToken

        raw = (request.data.get("token") or "").strip()
        if not raw:
            return Response(
                {"detail": "token field is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        token_obj, error = StudentInviteToken.claim(raw)
        if error:
            return Response({"detail": error}, status=status.HTTP_403_FORBIDDEN)

        student = token_obj.student

        # Activate account if it was created in a pending state
        if not student.is_active:
            student.is_active = True
            student.save(update_fields=["is_active"])

        tokens = issue_full_tokens(student)

        log_action(
            actor=student,
            action="student.invite_claimed",
            target_type="User",
            target_id=str(student.id),
            detail=(
                f"Student claimed invite token for certificate "
                f"{token_obj.certificate.certificate_id}."
            ),
        )

        return Response({
            **tokens,
            "user": UserSerializer(student, context={"request": request}).data,
            "certificate_id": token_obj.certificate.certificate_id,
        })
