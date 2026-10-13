"""accounts/permissions.py — role-based DRF permission classes."""

from rest_framework.permissions import BasePermission
from .models import Role
from .tokens import is_setup_token

# Institution head = Registrar (or legacy Institutional Admin)
INSTITUTION_HEAD = (Role.REGISTRAR, Role.INSTITUTIONAL_ADMIN)


def _reject_setup_token(request):
    """Limited officer-setup JWTs cannot use normal dashboard APIs."""
    return is_setup_token(getattr(request, "auth", None))


class IsInstitutionSetupAdmin(BasePermission):
    """Institution setup belongs to administrators, not credential signers."""
    def has_permission(self, request, view):
        if _reject_setup_token(request):
            return False
        return request.user.is_authenticated and request.user.role in (
            Role.INSTITUTIONAL_ADMIN, Role.SUPER_ADMIN
        )


class IsSuperAdmin(BasePermission):
    def has_permission(self, request, view):
        if _reject_setup_token(request):
            return False
        return request.user.is_authenticated and request.user.role == Role.SUPER_ADMIN


class IsInstitutionalAdmin(BasePermission):
    """Legacy name — institution head (Registrar)."""
    def has_permission(self, request, view):
        if _reject_setup_token(request):
            return False
        return request.user.is_authenticated and request.user.role in INSTITUTION_HEAD


class IsRegistrar(BasePermission):
    """Can prepare/submit certificates (institution head)."""
    def has_permission(self, request, view):
        if _reject_setup_token(request):
            return False
        return request.user.is_authenticated and request.user.role == Role.REGISTRAR


class IsVC(BasePermission):
    def has_permission(self, request, view):
        if _reject_setup_token(request):
            return False
        return request.user.is_authenticated and request.user.role == Role.VC


class IsChancellor(BasePermission):
    def has_permission(self, request, view):
        if _reject_setup_token(request):
            return False
        return request.user.is_authenticated and request.user.role == Role.CHANCELLOR


class IsStudent(BasePermission):
    def has_permission(self, request, view):
        if _reject_setup_token(request):
            return False
        return request.user.is_authenticated and request.user.role == Role.STUDENT


class IsAdminOrAbove(BasePermission):
    """Super Admin or institution Registrar."""
    def has_permission(self, request, view):
        if _reject_setup_token(request):
            return False
        return request.user.is_authenticated and request.user.role in (
            Role.SUPER_ADMIN, *INSTITUTION_HEAD
        )


class IsRegistrarOrAbove(BasePermission):
    """Registrar / legacy admin / Super Admin — certificate list access."""
    def has_permission(self, request, view):
        if _reject_setup_token(request):
            return False
        return request.user.is_authenticated and request.user.role in (
            Role.SUPER_ADMIN, *INSTITUTION_HEAD, Role.VC, Role.CHANCELLOR
        )


class IsInstitutionMember(BasePermission):
    def has_object_permission(self, request, view, obj):
        if _reject_setup_token(request):
            return False
        if not request.user.is_authenticated:
            return False
        if request.user.role == Role.SUPER_ADMIN:
            return True
        institution_id = getattr(obj, "institution_id", None)
        return str(request.user.institution_id) == str(institution_id)


class IsOfficerSetupSession(BasePermission):
    """Authenticated officer holding a limited setup JWT."""

    message = "Officer setup session required."

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if not getattr(user, "is_officer", False):
            return False
        if not is_setup_token(getattr(request, "auth", None)):
            return False
        return True


class IsFullSession(BasePermission):
    """Authenticated user with a full (non-setup) JWT."""

    message = "Complete officer setup before accessing this resource."

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if _reject_setup_token(request):
            return False
        return True
