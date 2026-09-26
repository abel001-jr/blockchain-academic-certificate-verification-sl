"""certificates/serializers.py"""

from rest_framework import serializers
from .models import Certificate, CertificateStatus, Transcript
from institutions.models import Department, Program, GradeClassification


class CertificateListSerializer(serializers.ModelSerializer):
    """Lightweight — for table views."""
    institution_name = serializers.CharField(source="institution.name", read_only=True)
    issued_by_name   = serializers.CharField(source="issued_by.full_name", read_only=True)
    # Upload workflows store the transcript on the certificate itself.  These
    # fields let the unified Credentials list represent that attachment.
    has_transcript = serializers.SerializerMethodField()
    transcript_id = serializers.SerializerMethodField()

    def get_has_transcript(self, obj):
        return bool(obj.transcript_hash or obj.ipfs_cid_transcript or obj.ipfs_url_transcript)

    def get_transcript_id(self, obj):
        try:
            return obj.transcript.transcript_id
        except Transcript.DoesNotExist:
            return ""

    class Meta:
        model  = Certificate
        fields = [
            "id", "certificate_id", "student_name", "degree_title",
            "graduation_year", "status", "flow_type", "institution_name",
            "issued_by_name", "chain_issued_at", "created_at", "tx_hash",
            "has_transcript", "transcript_id",
        ]


class CertificateDetailSerializer(serializers.ModelSerializer):
    """Full detail — for certificate page / verification / live preview."""
    institution_name = serializers.CharField(source="institution.name", read_only=True)
    issued_by_name   = serializers.CharField(source="issued_by.full_name", read_only=True)
    verification_url = serializers.ReadOnlyField()
    is_on_chain      = serializers.ReadOnlyField()
    flow_type        = serializers.CharField(read_only=True)
    logo_url         = serializers.SerializerMethodField()
    registrar_signature_url = serializers.SerializerMethodField()
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
            "registrar_signature_image",
            "finalize_tx_hash",
            # Read-only on this serializer on purpose: `student_email` is folded
            # into the on-chain data hash by `build_certificate_json()`, so it is
            # only ever written through the dedicated, immutability-guarded
            # endpoint `POST /certificates/<id>/update-student-email/`. Leaving it
            # writable here would let any future view that reuses this serializer
            # for writes bypass both the hash guard and the audit log.
            "student_email",
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

    def get_registrar_signature_url(self, obj):
        return self._media_url(obj.registrar_signature_image)

    def get_chancellor_signature_url(self, obj):
        return self._media_url(obj.chancellor_signature_image)


class CertificateUpdateStudentEmailSerializer(serializers.Serializer):
    """
    Payload for `POST /certificates/<id>/update-student-email/`.

    The address is only correctable while the credential is still a draft,
    because `build_certificate_json()` folds `student_email` into the
    `dataHash` that gets committed to Ethereum at `prepare` /
    `upload-and-anchor`. Changing it afterwards would leave the stored
    `cert_hash` unreproducible and the IPFS-pinned JSON stale, so the view
    refuses the change outright once a hash exists.

    `reassign_student` lets a registrar move the linked student account to the
    new address in the same call. It is opt-in because re-pointing the FK
    changes who can see the certificate in their portal.
    """

    student_email = serializers.EmailField(max_length=254)
    reassign_student = serializers.BooleanField(required=False, default=False)

    def validate_student_email(self, value):
        return value.strip().lower()


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


# ── Upload flow ───────────────────────────────────────────────────────────────

class CertificateUploadAnchorSerializer(serializers.Serializer):
    """
    Used by the external-upload flow.
    Accepts the pre-signed PDF file, hashes it, and pins to IPFS.
    Returns payload for MetaMask finalizeCertificate().
    
    For full_upload flow: also accepts an optional transcript_file.
    """
    document_file = serializers.FileField(
        required=True,
        help_text="Pre-signed certificate PDF to anchor on-chain.",
    )
    
    transcript_file = serializers.FileField(
        required=False,
        help_text="Optional transcript PDF for full_upload flow.",
    )

    def validate_document_file(self, value):
        if value.content_type not in ("application/pdf",):
            # Also allow octet-stream in case browser sends it
            if not value.name.lower().endswith(".pdf"):
                raise serializers.ValidationError("Only PDF files are accepted.")
        max_mb = 20
        if value.size > max_mb * 1024 * 1024:
            raise serializers.ValidationError(f"File must be under {max_mb} MB.")
        return value
    
    def validate_transcript_file(self, value):
        if value is None:
            return value
        if value.content_type not in ("application/pdf",):
            if not value.name.lower().endswith(".pdf"):
                raise serializers.ValidationError("Only PDF files are accepted for transcript.")
        max_mb = 20
        if value.size > max_mb * 1024 * 1024:
            raise serializers.ValidationError(f"Transcript file must be under {max_mb} MB.")
        return value



# ── Transcript Serializers ────────────────────────────────────────────────────

class TranscriptListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for transcript list views."""
    institution_name = serializers.CharField(source="institution.name", read_only=True)
    uploaded_by_name = serializers.CharField(source="uploaded_by.full_name", read_only=True)
    certificate_id = serializers.CharField(
        source="certificate.certificate_id", 
        read_only=True, 
        allow_null=True
    )
    is_approved = serializers.ReadOnlyField()

    class Meta:
        model = Transcript
        fields = [
            "id", "transcript_id", "student_name", "student_email",
            "student_id_number", "status", "institution_name",
            "uploaded_by_name", "certificate_id", "is_approved",
            "uploaded_at", "updated_at",
        ]


class TranscriptDetailSerializer(serializers.ModelSerializer):
    """Full detail serializer for transcript view and verification."""
    institution_name = serializers.CharField(source="institution.name", read_only=True)
    uploaded_by_name = serializers.CharField(source="uploaded_by.full_name", read_only=True)
    verification_url = serializers.ReadOnlyField()
    is_approved = serializers.ReadOnlyField()
    certificate_id = serializers.CharField(
        source="certificate.certificate_id",
        read_only=True,
        allow_null=True
    )
    transcript_url = serializers.SerializerMethodField()

    class Meta:
        model = Transcript
        fields = "__all__"
        read_only_fields = [
            "id", "transcript_id", "transcript_hash",
            "ipfs_cid", "ipfs_url",
            "vc_approved_at", "vc_approval_tx_hash", "vc_approver_name",
            "dean_approved_at", "dean_approval_tx_hash", "dean_approver_name",
            "uploaded_at", "updated_at",
        ]

    def get_transcript_url(self, obj):
        """Return absolute URL to transcript file."""
        if not obj.transcript_file:
            return ""
        request = self.context.get("request")
        url = obj.transcript_file.url
        if request:
            return request.build_absolute_uri(url)
        return url


class TranscriptUploadSerializer(serializers.ModelSerializer):
    """
    Serializer for uploading a new transcript.
    Registrar uploads PDF and provides student details.
    """
    
    class Meta:
        model = Transcript
        fields = [
            "student_name", "student_email", "student_id_number",
            "transcript_file", "student",
        ]
        extra_kwargs = {
            "student": {"required": False},
            "student_id_number": {"required": False},
        }

    def validate_transcript_file(self, value):
        """Validate uploaded file is PDF and under size limit."""
        if value.content_type not in ("application/pdf",):
            if not value.name.lower().endswith(".pdf"):
                raise serializers.ValidationError("Only PDF files are accepted.")
        max_mb = 20
        if value.size > max_mb * 1024 * 1024:
            raise serializers.ValidationError(f"File must be under {max_mb} MB.")
        return value

    def validate(self, attrs):
        """Ensure registrar belongs to an institution."""
        request = self.context.get("request")
        user = getattr(request, "user", None)
        institution = getattr(user, "institution", None) if user else None
        
        if not institution:
            raise serializers.ValidationError(
                "Your account must belong to an institution to upload transcripts."
            )
        
        attrs["institution"] = institution
        attrs["uploaded_by"] = user
        return attrs


class TranscriptLinkCertificateSerializer(serializers.Serializer):
    """
    Link an existing transcript to a certificate.
    Used in TRANSCRIPT_THEN_CERT flow.
    """
    certificate_id = serializers.UUIDField(
        required=True,
        help_text="UUID of the certificate to link"
    )

    def validate_certificate_id(self, value):
        """Ensure certificate exists and belongs to same institution."""
        request = self.context.get("request")
        user = getattr(request, "user", None)
        institution = getattr(user, "institution", None) if user else None
        
        try:
            from .models import Certificate
            cert = Certificate.objects.get(pk=value, institution=institution)
        except Certificate.DoesNotExist:
            raise serializers.ValidationError(
                "Certificate not found or does not belong to your institution."
            )
        
        # Check if certificate already has a transcript
        if hasattr(cert, "transcript"):
            raise serializers.ValidationError(
                "This certificate is already linked to a transcript."
            )
        
        return cert


class TranscriptApprovalSerializer(serializers.Serializer):
    """
    Serializer for VC/Dean approval of transcript.
    Requires MetaMask transaction hash.
    """
    tx_hash = serializers.CharField(
        max_length=66,
        required=True,
        help_text="Ethereum transaction hash from MetaMask attestation"
    )
    approver_name = serializers.CharField(
        max_length=200,
        required=True,
        help_text="Full name of the approving officer"
    )

    def validate_tx_hash(self, value):
        """Validate transaction hash format."""
        if not value.startswith("0x") or len(value) != 66:
            raise serializers.ValidationError(
                "Invalid transaction hash format. Must be 0x followed by 64 hex characters."
            )
        return value
