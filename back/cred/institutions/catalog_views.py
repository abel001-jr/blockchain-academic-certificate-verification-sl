"""
Academic catalog API — Departments, Programs, Grade Classifications.
Off-chain only (session auth). Soft-delete via active=False — never hard-delete.
"""

from django.db import transaction
from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError, PermissionDenied

from accounts.models import Role
from accounts.permissions import IsRegistrar, IsRegistrarOrAbove, IsFullSession
from .models import Department, Program, GradeClassification
from .catalog_serializers import (
    DepartmentSerializer,
    ProgramSerializer,
    GradeClassificationSerializer,
    GradeReorderSerializer,
)
from .catalog_seed import seed_default_grade_classifications


def _institution_for(user):
    if not user.institution_id:
        raise ValidationError("Your account is not linked to an institution.")
    return user.institution


def _ensure_own_department(user, department: Department):
    if user.role == Role.SUPER_ADMIN:
        return
    if department.institution_id != user.institution_id:
        raise PermissionDenied("Department belongs to another institution.")


class DepartmentListCreateView(generics.ListCreateAPIView):
    """
    GET  — officers / registrar: list departments
    POST — registrar: create
    """
    serializer_class = DepartmentSerializer

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsFullSession(), IsRegistrar()]
        return [IsFullSession(), IsRegistrarOrAbove()]

    def get_queryset(self):
        user = self.request.user
        qs = Department.objects.filter(institution=user.institution)
        show_inactive = self.request.query_params.get("include_inactive") == "1"
        if not show_inactive:
            qs = qs.filter(active=True)
        return qs.select_related("institution")

    def perform_create(self, serializer):
        serializer.save(institution=_institution_for(self.request.user))


class DepartmentDetailView(generics.RetrieveUpdateAPIView):
    """GET / PATCH — no destroy; use active=False."""
    serializer_class = DepartmentSerializer
    http_method_names = ["get", "patch", "head", "options"]

    def get_permissions(self):
        if self.request.method == "PATCH":
            return [IsFullSession(), IsRegistrar()]
        return [IsFullSession(), IsRegistrarOrAbove()]

    def get_queryset(self):
        return Department.objects.filter(institution=self.request.user.institution)

    def perform_update(self, serializer):
        # Never allow hard-delete via this API; only toggle active / rename
        serializer.save()


class ProgramListCreateView(generics.ListCreateAPIView):
    serializer_class = ProgramSerializer

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsFullSession(), IsRegistrar()]
        return [IsFullSession(), IsRegistrarOrAbove()]

    def get_queryset(self):
        user = self.request.user
        qs = Program.objects.filter(department__institution=user.institution)
        dept = self.request.query_params.get("department")
        if dept:
            qs = qs.filter(department_id=dept)
        show_inactive = self.request.query_params.get("include_inactive") == "1"
        if not show_inactive:
            qs = qs.filter(active=True)
        return qs.select_related("department", "department__institution")

    def perform_create(self, serializer):
        department = serializer.validated_data["department"]
        _ensure_own_department(self.request.user, department)
        serializer.save()


class ProgramDetailView(generics.RetrieveUpdateAPIView):
    serializer_class = ProgramSerializer
    http_method_names = ["get", "patch", "head", "options"]

    def get_permissions(self):
        if self.request.method == "PATCH":
            return [IsFullSession(), IsRegistrar()]
        return [IsFullSession(), IsRegistrarOrAbove()]

    def get_queryset(self):
        return Program.objects.filter(
            department__institution=self.request.user.institution
        ).select_related("department")

    def perform_update(self, serializer):
        department = serializer.validated_data.get("department")
        if department is not None:
            _ensure_own_department(self.request.user, department)
        serializer.save()


class GradeClassificationListCreateView(generics.ListCreateAPIView):
    serializer_class = GradeClassificationSerializer

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsFullSession(), IsRegistrar()]
        return [IsFullSession(), IsRegistrarOrAbove()]

    def get_queryset(self):
        user = self.request.user
        # Ensure defaults exist for already-anchored institutions
        if user.institution_id and user.institution.is_chain_active:
            seed_default_grade_classifications(user.institution)
        qs = GradeClassification.objects.filter(institution=user.institution)
        show_inactive = self.request.query_params.get("include_inactive") == "1"
        if not show_inactive:
            qs = qs.filter(active=True)
        return qs.order_by("sort_order", "label")

    def perform_create(self, serializer):
        inst = _institution_for(self.request.user)
        max_order = (
            GradeClassification.objects.filter(institution=inst)
            .order_by("-sort_order")
            .values_list("sort_order", flat=True)
            .first()
        ) or 0
        serializer.save(institution=inst, sort_order=max_order + 1)


class GradeClassificationDetailView(generics.RetrieveUpdateAPIView):
    serializer_class = GradeClassificationSerializer
    http_method_names = ["get", "patch", "head", "options"]

    def get_permissions(self):
        if self.request.method == "PATCH":
            return [IsFullSession(), IsRegistrar()]
        return [IsFullSession(), IsRegistrarOrAbove()]

    def get_queryset(self):
        return GradeClassification.objects.filter(
            institution=self.request.user.institution
        )


class GradeClassificationReorderView(APIView):
    """POST /api/catalog/grades/reorder/  { "order": [uuid, ...] }"""
    permission_classes = [IsFullSession, IsRegistrar]

    def post(self, request):
        ser = GradeReorderSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        ids = ser.validated_data["order"]
        inst = _institution_for(request.user)

        grades = list(
            GradeClassification.objects.filter(institution=inst, id__in=ids)
        )
        by_id = {str(g.id): g for g in grades}
        if len(by_id) != len(ids):
            raise ValidationError("One or more grade IDs are invalid for this institution.")

        with transaction.atomic():
            for index, gid in enumerate(ids, start=1):
                g = by_id[str(gid)]
                if g.sort_order != index:
                    g.sort_order = index
                    g.save(update_fields=["sort_order", "updated_at"])

        qs = GradeClassification.objects.filter(institution=inst).order_by("sort_order")
        return Response(GradeClassificationSerializer(qs, many=True).data)
