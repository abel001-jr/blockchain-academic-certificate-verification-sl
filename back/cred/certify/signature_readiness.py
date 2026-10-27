"""Stored reference signatures required before credential document intake."""
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView
from accounts.models import Role, User
from accounts.permissions import IsRegistrar

SIGNERS = [(Role.REGISTRAR, "Registrar"), (Role.VC, "Vice-Chancellor"), (Role.CHANCELLOR, "Chancellor")]


def signature_readiness(registrar):
    items = []
    for role, label in SIGNERS:
        officers = list(User.objects.filter(institution_id=registrar.institution_id, role=role, is_active=True)) if registrar.institution_id else []
        if role == Role.REGISTRAR:
            officers = [officer for officer in officers if officer.pk == registrar.pk]
        officer = officers[0] if len(officers) == 1 else None
        ready = False
        reason = "No active officer configured." if not officers else "Multiple active officers found; resolve the role assignment."
        if officer:
            reason = "Signature not configured."
            if officer.signature_image:
                try:
                    with officer.signature_image.open("rb") as image:
                        ready = bool(image.read(1))
                except (OSError, ValueError):
                    pass
                reason = "Signature ready." if ready else "Saved signature file is missing or unreadable; upload it again."
        items.append({"role": role, "label": label, "name": officer.full_name if officer else "", "ready": ready, "detail": reason})
    return {"ready": all(item["ready"] for item in items), "signers": items}


def require_signatures(registrar):
    readiness = signature_readiness(registrar)
    if not readiness["ready"]:
        missing = ", ".join(item["label"] for item in readiness["signers"] if not item["ready"])
        raise ValidationError({"detail": f"Configure all officer signatures before continuing. Not ready: {missing}.", "signature_readiness": readiness})


class SignatureReadinessView(APIView):
    permission_classes = [IsRegistrar]

    def get(self, request):
        return Response(signature_readiness(request.user))
