"""Serializers for Department / Program / GradeClassification catalog."""

from rest_framework import serializers

from .models import Department, Program, GradeClassification
from .credential_validation import clean_text


def catalog_text(value, label, maximum):
    try:
        return clean_text(value, label, maximum)
    except ValueError as exc:
        raise serializers.ValidationError(str(exc)) from exc


class DepartmentSerializer(serializers.ModelSerializer):
    def validate_name(self, value):
        return catalog_text(value, "Department name", 200)
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
    def validate_title(self, value):
        return catalog_text(value, "Program title", 250)

    def validate(self, attrs):
        from .degree_awards import formal_program_title, canonical_award, AWARDS
        award = attrs.get("degree_award", getattr(self.instance, "degree_award", ""))
        qualification = attrs.get("qualification_type", getattr(self.instance, "qualification_type", "bachelors"))
        if award and qualification != "bachelors":
            raise serializers.ValidationError({"degree_award": "Bachelor awards require Bachelor's Degree as the qualification type."})
        title = attrs.get("title", getattr(self.instance, "title", ""))
        existing_award = next((key for key in sorted(AWARDS, key=lambda key: -len(AWARDS[key])) if canonical_award(title).startswith(AWARDS[key].lower())), None)
        if award and existing_award and award != existing_award:
            raise serializers.ValidationError({"degree_award": "The selected degree award conflicts with the formal programme title."})
        full_title = formal_program_title(attrs.get("title", getattr(self.instance, "title", "")), award)
        if len(full_title) > 250:
            raise serializers.ValidationError({"title": "The complete award title must not exceed 250 characters."})
        department = attrs.get("department") or getattr(self.instance, "department", None)
        if department:
            from .models import CertificateTemplate
            from .template_views import sample_certificate
            from .credential_validation import template_preflight
            template = CertificateTemplate.objects.filter(institution=department.institution).first()
            if template and template.active_revision_id:
                sample = sample_certificate(department.institution)
                sample.degree_title = full_title
                sample.department = department.name
                try:
                    template_preflight(sample, template.active_revision)
                except ValueError as exc:
                    raise serializers.ValidationError({"title": str(exc)}) from exc
        return attrs
    department_name = serializers.CharField(source="department.name", read_only=True)
    institution = serializers.UUIDField(source="department.institution_id", read_only=True)

    class Meta:
        model = Program
        fields = [
            "id", "department", "department_name", "institution",
            "title", "full_title", "qualification_type", "degree_award", "active", "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "department_name", "institution", "full_title", "created_at", "updated_at",
        ]


class GradeClassificationSerializer(serializers.ModelSerializer):
    def validate_label(self, value):
        return catalog_text(value, "Classification label", 50)
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
