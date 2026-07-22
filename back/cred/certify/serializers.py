"""certificates/serializers.py"""

from rest_framework import serializers
from .models import Certificate, CertificateStatus
from institutions.models import Department, Program, GradeClassification


class CertificateListSerializer(serializers.ModelSerializer):
    """Lightweight — for table views."""
    institution_name = serializers.CharField(source="institution.name", read_only=True)
    issued_by_name   = serializers.CharField(source="issued_by.full_name", read_only=True)

    class Meta:
        model  = Certificate
        fields = [
            "id", "certificate_id", "student_name", "degree_title",
            "graduation_year", "status", "institution_name",
            "issued_by_name", "chain_issued_at", "created_at",
        ]


class CertificateDetailSerializer(serializers.ModelSerializer):
    """Full detail — for certificate page / verification / live preview."""
    institution_name = serializers.CharField(source="institution.name", read_only=True)
    issued_by_name   = serializers.CharField(source="issued_by.full_name", read_only=True)
    verification_url = serializers.ReadOnlyField()
    is_on_chain      = serializers.ReadOnlyField()
    logo_url         = serializers.SerializerMethodField()
    vc_signature_url = serializers.SerializerMethodField()
    chancellor_signature_url = serializers.SerializerMethodField()

    class Meta:
        model  = Certificate
        fields = "__all__"
        read_only_fields = [
            "id", "certificate_id", "cert_hash", "doc_hash",
            "ipfs_cid_json", "ipfs_cid_pdf", "ipfs_url_json", "ipfs_url_pdf",
            "tx_hash", "block_number", "chain_issued_at",
            "revoked_by", "revoked_at", "revocation_tx_hash",
            "created_at", "updated_at",
            "branding_preset", "registrar_signer_name", "registrar_signed_at",
            "qualification_type",
            "vc_approver_name", "chancellor_approver_name",
            "vc_signature_image", "chancellor_signature_image",
            "finalize_tx_hash",
        ]

    def _media_url(self, field):
        if not field:
            return ""
        request = self.context.get("request")
        url = field.url
        if request:
            return request.build_absolute_uri(url)
        return url

    def get_logo_url(self, obj):
        try:
            template = obj.institution.certificate_template
        except Exception:
            return ""
        if not template or not template.logo:
            return ""
        return self._media_url(template.logo)

    def get_vc_signature_url(self, obj):
        return self._media_url(obj.vc_signature_image)

    def get_chancellor_signature_url(self, obj):
        return self._media_url(obj.chancellor_signature_image)


class CertificateCreateSerializer(serializers.ModelSerializer):
    """
    Registrar creates a Draft from the academic catalog.
    Accepts department_id / program_id / grade_classification_id,
    snapshots labels into CharFields for on-chain hashing.
    """
    department_id = serializers.UUIDField(write_only=True)
    program_id = serializers.UUIDField(write_only=True)
    grade_classification_id = serializers.UUIDField(
        write_only=True, required=False, allow_null=True,
    )

    class Meta:
        model  = Certificate
        fields = [
            "institution", "student", "student_name", "student_email",
            "degree_title", "department", "graduation_year", "grade",
            "department_id", "program_id", "grade_classification_id",
        ]
        read_only_fields = ["degree_title", "department", "grade", "qualification_type"]
        extra_kwargs = {
            "institution": {"required": False},
            "student": {"required": False},
        }

    def validate(self, attrs):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        institution = getattr(user, "institution", None) if user else None
        if not institution:
            raise serializers.ValidationError(
                "Your account must belong to an institution to issue certificates."
            )

        dept_id = attrs.pop("department_id")
        prog_id = attrs.pop("program_id")
        grade_id = attrs.pop("grade_classification_id", None)

        try:
            department = Department.objects.get(
                pk=dept_id, institution=institution, active=True,
            )
        except Department.DoesNotExist:
            raise serializers.ValidationError({
                "department_id": "Select an active department from your catalog.",
            })

        try:
            program = Program.objects.select_related("department").get(
                pk=prog_id, department__institution=institution, active=True,
            )
        except Program.DoesNotExist:
            raise serializers.ValidationError({
                "program_id": "Select an active program from your catalog.",
            })

        if program.department_id != department.id:
            raise serializers.ValidationError({
                "program_id": "Selected program does not belong to the selected department.",
            })

        grade_label = ""
        if grade_id:
            try:
                grade = GradeClassification.objects.get(
                    pk=grade_id, institution=institution, active=True,
                )
                grade_label = grade.label
            except GradeClassification.DoesNotExist:
                raise serializers.ValidationError({
                    "grade_classification_id": "Select an active grade classification.",
                })

        attrs["department"] = department.name
        attrs["degree_title"] = program.title
        attrs["qualification_type"] = program.qualification_type
        attrs["grade"] = grade_label
        attrs["_department_obj"] = department
        attrs["_program_obj"] = program
        return attrs

    def create(self, validated_data):
        validated_data.pop("_department_obj", None)
        validated_data.pop("_program_obj", None)
        return super().create(validated_data)


class CertificateUploadDocumentSerializer(serializers.ModelSerializer):
    """Upload the PDF after draft creation."""

    class Meta:
        model  = Certificate
        fields = ["document_file"]


class CertificateChainUpdateSerializer(serializers.ModelSerializer):
    """Records the registrar's on-chain submit tx (does not issue)."""

    class Meta:
        model  = Certificate
        fields = ["tx_hash", "block_number"]

    def update(self, instance, validated_data):
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        return instance


class CertificateRevokeSerializer(serializers.Serializer):
    reason          = serializers.CharField(max_length=500)
    revocation_tx_hash = serializers.CharField(max_length=66)
