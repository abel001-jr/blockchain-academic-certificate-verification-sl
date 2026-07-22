"""Serializers for Department / Program / GradeClassification catalog."""

from rest_framework import serializers

from .models import Department, Program, GradeClassification


class DepartmentSerializer(serializers.ModelSerializer):
    program_count = serializers.SerializerMethodField()

    class Meta:
        model = Department
        fields = [
            "id", "institution", "name", "active",
            "program_count", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "institution", "created_at", "updated_at", "program_count"]

    def get_program_count(self, obj):
        return obj.programs.filter(active=True).count()


class ProgramSerializer(serializers.ModelSerializer):
    department_name = serializers.CharField(source="department.name", read_only=True)
    institution = serializers.UUIDField(source="department.institution_id", read_only=True)

    class Meta:
        model = Program
        fields = [
            "id", "department", "department_name", "institution",
            "title", "qualification_type", "active", "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "department_name", "institution", "created_at", "updated_at",
        ]


class GradeClassificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = GradeClassification
        fields = [
            "id", "institution", "label", "sort_order", "active",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "institution", "created_at", "updated_at"]


class GradeReorderSerializer(serializers.Serializer):
    """Body: { "order": ["uuid1", "uuid2", ...] } — assigns sort_order 1..n."""
    order = serializers.ListField(
        child=serializers.UUIDField(),
        allow_empty=False,
    )
