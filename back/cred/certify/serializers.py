"""certificates/serializers.py"""

from rest_framework import serializers
from .models import Certificate, CertificateStatus
from institutions.models import Department, Program, GradeClassification


class CertificateListSerializer(serializers.ModelSerializer):
    """Lightweight — for table views."""
    institution_name = serializers.CharField(source="institution.name", read_only=True)
    issued_by_name   = serializers.CharField(source="issued_by.full_name", read_only=True)
    # Both upload workflows store the transcript on the certificate itself, so
    # presence is a question about this row and not about a separate record.
    has_transcript = serializers.SerializerMethodField()
    # Where the owner downloads the pair. Public verification serves no document
    # (item 1), so a client that wants the PDFs has to be told which
    # owner-authenticated route to use rather than assuming a gateway URL.
    documents_path = serializers.SerializerMethodField()

    def get_has_transcript(self, obj):
        return bool(obj.transcript_hash or obj.ipfs_cid_transcript or obj.ipfs_url_transcript)

    def get_documents_path(self, obj):
        from django.urls import reverse
        return reverse(
            "my-certificate-documents",
            kwargs={"certificate_id": obj.certificate_id},
        )

    class Meta:
        model  = Certificate
        fields = [
            "id", "certificate_id", "student_name", "degree_title",
            "graduation_year", "status", "flow_type", "institution_name",
            "issued_by_name", "chain_issued_at", "created_at", "tx_hash",
            "has_transcript", "documents_path",
        ]


class CertificateDetailSerializer(serializers.ModelSerializer):
    """Full detail — for certificate page / verification / live preview."""
    institution_name = serializers.CharField(source="institution.name", read_only=True)
    required_signers = serializers.SerializerMethodField()

    def get_required_signers(self, obj):
        return ["registrar", "vc", "chancellor"]
    issued_by_name   = serializers.CharField(source="issued_by.full_name", read_only=True)
    verification_url = serializers.ReadOnlyField()
    is_on_chain      = serializers.ReadOnlyField()
    flow_type        = serializers.CharField(read_only=True)
    logo_url         = serializers.SerializerMethodField()
    registrar_signature_url = serializers.SerializerMethodField()
    vc_signature_url = serializers.SerializerMethodField()
    chancellor_signature_url = serializers.SerializerMethodField()
    document_reviews = serializers.SerializerMethodField()
    # Whether a resumable draft has a document saved against it. Exposed
    # explicitly rather than inferred from the file field's media URL, because
    # the upload wizard uses this to decide what to restore when a Registrar
    # reopens a draft, and "the row has a name" is not the same question as
    # "this URL serves something".
    has_draft_certificate = serializers.SerializerMethodField()
    has_draft_transcript  = serializers.SerializerMethodField()

    class Meta:
        model  = Certificate
        fields = "__all__"
        read_only_fields = [
            "id", "certificate_id", "cert_hash", "doc_hash",
            "chain_config_snapshot",
            "ipfs_cid_json", "ipfs_cid_pdf", "ipfs_url_json", "ipfs_url_pdf",
            "tx_hash", "block_number", "chain_issued_at",
            "revoked_by", "revoked_at", "revocation_tx_hash",
            "created_at", "updated_at",
            "branding_preset", "registrar_signer_name", "registrar_signed_at", "template_revision",
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

    def get_has_draft_certificate(self, obj):
        return bool(obj.document_file and obj.document_file.name)

    def get_has_draft_transcript(self, obj):
        return bool(obj.transcript_file and obj.transcript_file.name)

    def get_document_reviews(self, obj):
        """Registrar document-review state, for the flows that require it.

        Read through a single query rather than per-review, and never raises if
        the reviews are absent — the certificate detail page reads this on every
        load, including for system-designed credentials that have no reviews.
        """
        from .document_review_views import (
            _serialize_review,
            required_review_kinds,
        )

        reviews = {r.document_kind: r for r in obj.document_reviews.all()}
        required = required_review_kinds(obj)
        return {
            "required_kinds": required,
            "all_resolved": all(
                reviews[kind].is_resolved for kind in required if kind in reviews
            ) and all(kind in reviews for kind in required),
            "reviews": [
                _serialize_review(reviews[kind])
                for kind in sorted(reviews)
            ],
        }


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
        from institutions.credential_validation import validate_graduate_email
        institution = self.context.get("institution")
        try:
            return validate_graduate_email(value, institution) if institution else value.strip().lower()
        except ValueError as exc:
            raise serializers.ValidationError(str(exc)) from exc


class CertificateCreateSerializer(serializers.ModelSerializer):
    """
    Registrar creates a Draft from the academic catalog.
    Accepts department_id / program_id / grade_classification_id,
    snapshots labels into CharFields for on-chain hashing.
    """
    draft_id = serializers.UUIDField(write_only=True, required=False)
    department_id = serializers.UUIDField(write_only=True)
    def validate_student_name(self, value):
        from institutions.credential_validation import validate_name
        try:
            return validate_name(value)
        except ValueError as exc:
            raise serializers.ValidationError(str(exc)) from exc

    def validate_graduation_year(self, value):
        from institutions.credential_validation import validate_year
        try:
            return validate_year(value)
        except ValueError as exc:
            raise serializers.ValidationError(str(exc)) from exc
    program_id = serializers.UUIDField(write_only=True)
    grade_classification_id = serializers.UUIDField(
        write_only=True, required=False, allow_null=True,
    )

    class Meta:
        model  = Certificate
        fields = [
            "institution", "student", "student_name", "student_email",
            "degree_title", "department", "graduation_year", "grade",
            "department_id", "program_id", "grade_classification_id", "draft_id",
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

        from institutions.credential_validation import validate_graduate_email
        try:
            attrs["student_email"] = validate_graduate_email(attrs["student_email"], institution)
        except ValueError as exc:
            raise serializers.ValidationError({"student_email": str(exc)}) from exc

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
        attrs["degree_title"] = program.full_title
        attrs["qualification_type"] = program.qualification_type
        attrs["grade"] = grade_label
        from types import SimpleNamespace
        from institutions.credential_validation import validate_certificate_data, template_preflight
        from institutions.models import CertificateTemplate
        candidate = SimpleNamespace(institution=institution, certificate_id="DRAFT", **{
            key: attrs.get(key, "") for key in ("student_name", "degree_title", "graduation_year", "department", "grade")
        })
        try:
            validate_certificate_data(candidate)
            template = CertificateTemplate.objects.filter(institution=institution).first()
            if template and template.active_revision_id and request.data.get("flow_type", "system_designed") != "system_designed":
                raise serializers.ValidationError({"flow_type": "An approved institutional template is active. Use Generate certificate + upload transcript."})
            if template and template.active_revision_id and request.data.get("flow_type", "system_designed") == "system_designed":
                template_preflight(candidate, template.active_revision)
        except ValueError as exc:
            raise serializers.ValidationError({"detail": str(exc)}) from exc
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
