"""Manual institutional template setup and private preview APIs."""
import json
from types import SimpleNamespace

import fitz
from django.conf import settings
from django.core.files.base import ContentFile
from django.db import transaction
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsFullSession, IsRegistrar, IsRegistrarOrAbove
from audit.utils import log_action
from certify.document_analysis import analyze_pdf, DocumentAnalysisError
from certify.document_intake import prepare_document
from certify.models import Certificate
from certify.encrypted_documents import fetch_verified_document
from .branding_views import _get_or_create_template
from .models import CertificateTemplateRevision, CertificateTemplate, Institution
from .template_rendering import render_uploaded_template, validate_layout
from .credential_validation import template_preflight, validate_certificate_data
from .models import Program
from .template_suggestions import suggest_fields
from .ai_suggestions import suggest_with_groq, AssistanceError
from rest_framework.throttling import UserRateThrottle


class AIAssistanceThrottle(UserRateThrottle):
    rate = "5/min"


class TemplateEditView(APIView):
    permission_classes = [IsFullSession, IsRegistrar]

    @transaction.atomic
    def post(self, request, pk):
        if not request.user.institution_id:
            return Response({"detail": "No institution linked."}, status=400)
        Institution.objects.select_for_update().get(pk=request.user.institution_id)
        source = get_object_or_404(CertificateTemplateRevision.objects.select_for_update(), pk=pk, institution=request.user.institution)
        template = get_object_or_404(CertificateTemplate.objects.select_for_update(), institution=request.user.institution)
        template.active_revision = None
        template.save(update_fields=["active_revision", "updated_at"])
        source.approved_at = None
        source.save(update_fields=["approved_at"])
        log_action(actor=request.user, action="certificate_template.edit_started", target_type="CertificateTemplateRevision", target_id=str(source.pk), detail="Disabled branding and reopened this version for editing.")
        return Response(metadata(source))


class TemplateEnableView(APIView):
    permission_classes = [IsFullSession, IsRegistrar]

    def post(self, request):
        if not request.user.institution_id:
            return Response({"detail": "No institution linked."}, status=400)
        with transaction.atomic():
            template = get_object_or_404(CertificateTemplate.objects.select_for_update(), institution=request.user.institution)
            revision = get_object_or_404(CertificateTemplateRevision, pk=request.data.get("revision_id"), institution=request.user.institution, approved_at__isnull=False)
            template.active_revision = revision
            template.save(update_fields=["active_revision", "updated_at"])
            log_action(actor=request.user, action="certificate_branding.enabled", target_type="CertificateTemplate", target_id=str(template.pk), detail=f"Enabled approved revision {revision.pk} for new issuance.")
        return Response({"active_id": str(revision.pk), "detail": "Certificate branding enabled for new issuance."})


class TemplateDisableView(APIView):
    permission_classes = [IsFullSession, IsRegistrar]

    def post(self, request):
        if not request.user.institution_id:
            return Response({"detail": "No institution linked."}, status=400)
        if request.data.get("confirm") is not True:
            return Response({"detail": "Confirm disabling certificate branding."}, status=400)
        with transaction.atomic():
            template = get_object_or_404(CertificateTemplate.objects.select_for_update(), institution=request.user.institution)
            previous = template.active_revision_id
            template.active_revision = None
            template.save(update_fields=["active_revision", "updated_at"])
            if previous:
                log_action(actor=request.user, action="certificate_branding.disabled", target_type="CertificateTemplate", target_id=str(template.pk), detail=f"Disabled active revision {previous}; saved templates and credential references retained.")
        return Response({"active_id": None, "detail": "Certificate branding disabled for new issuance. Saved templates and existing credentials are preserved."})


class TemplateAISuggestionsView(APIView):
    permission_classes = [IsFullSession, IsRegistrar]
    throttle_classes = [AIAssistanceThrottle]

    def post(self, request, pk):
        revision = get_object_or_404(CertificateTemplateRevision, pk=pk, institution=request.user.institution)
        if revision.approved_at:
            return Response({"detail": "Approved templates are fixed."}, status=400)
        try:
            result = suggest_with_groq(revision.analysis)
        except AssistanceError as exc:
            return Response({"detail": str(exc)}, status=503)
        return Response(result)


def metadata(revision):
    try:
        warnings = template_preflight(sample_certificate(revision.institution), revision) if revision.fields else []
    except ValueError as exc:
        warnings = [str(exc)]
    return {"id": str(revision.id), "name": revision.name, "fields": revision.fields,
            "validation_warnings": warnings,
            "analysis": revision.analysis, "approved_at": revision.approved_at,
            "can_replace": not revision.approved_at and not revision.credentials.exists() and not revision.active_for.exists(),
            "has_logo": bool(revision.logo), "has_seal": bool(revision.seal)}


def sample_certificate(institution):
    return SimpleNamespace(institution=institution, student_name="Sample Graduate",
        degree_title="Bachelor of Science in Computer Science", graduation_year=2026,
        department="Computer Science", grade="First Class", certificate_id="TEMPLATE-SAMPLE")


def asset(value):
    if value.size > 5 * 1024 * 1024:
        raise ValueError("Each asset must be no larger than 5 MB.")
    field = serializers.ImageField()
    try:
        validated = field.run_validation(value)
    except serializers.ValidationError as exc:
        raise ValueError("Upload a valid crest/seal image.") from exc
    if validated.image.width * validated.image.height > 20_000_000:
        raise ValueError("Assets may contain at most 20 million pixels.")
    return validated


class TemplateSuggestionsView(APIView):
    permission_classes = [IsFullSession, IsRegistrar]

    def post(self, request, pk):
        revision = get_object_or_404(CertificateTemplateRevision, pk=pk, institution=request.user.institution)
        try:
            with revision.master.open("rb") as source:
                raw = source.read()
            analysis = analyze_pdf(raw)
            with fitz.open(stream=raw, filetype="pdf") as doc:
                for page, info in zip(doc, analysis["pages"]):
                    info.update(width=page.rect.width, height=page.rect.height)
                    if info.get("method") == "text_layer" and page.rotation:
                        for item in info["items"] + info.get("lines", []):
                            item["bbox"] = list(fitz.Rect(item["bbox"]) * page.rotation_matrix)
            return Response(suggest_fields(analysis))
        except DocumentAnalysisError as exc:
            return Response({"detail": str(exc)}, status=400)


class TemplateSetupView(APIView):
    permission_classes = [IsFullSession, IsRegistrar]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request):
        if not request.user.institution_id:
            return Response({"detail": "No institution linked."}, status=400)
        template = _get_or_create_template(request.user.institution)
        revisions = CertificateTemplateRevision.objects.filter(institution=request.user.institution).order_by("-created_at")
        return Response({"institution_id": str(request.user.institution_id), "active_id": str(template.active_revision_id) if template.active_revision_id else None,
                         "revisions": [metadata(r) for r in revisions]})

    @transaction.atomic
    def post(self, request):
        if not request.user.institution_id:
            return Response({"detail": "No institution linked."}, status=400)
        # Serialize uploads for this institution, including its first template.
        Institution.objects.select_for_update().get(pk=request.user.institution_id)
        replacement = request.data.get("replace_id")
        revision = None
        if replacement:
            revision = get_object_or_404(CertificateTemplateRevision.objects.select_for_update(), pk=replacement, institution=request.user.institution)
            if revision.approved_at or revision.credentials.exists():
                return Response({"detail": "This template is approved or used by a credential and cannot be replaced. Select an unused draft."}, status=409)
        if not revision and CertificateTemplateRevision.objects.filter(institution=request.user.institution).count() >= 2:
            return Response({"detail": "An institution can have a maximum of two template versions, including drafts and approved templates."}, status=409)
        try:
            output = prepare_document(request.FILES.getlist("master"), int(request.data.get("rotation", 0)))
            analysis_error = ""
            try:
                analysis = analyze_pdf(output)
            except DocumentAnalysisError as exc:
                analysis = {"pages": []}
                analysis_error = str(exc)
            with fitz.open(stream=output, filetype="pdf") as doc:
                if not analysis["pages"]:
                    analysis["pages"] = [{"page": i + 1, "text": "", "items": []} for i in range(doc.page_count)]
                for page, info in zip(doc, analysis["pages"]):
                    info.update({"width": page.rect.width, "height": page.rect.height})
                    if info.get("method") == "text_layer" and page.rotation:
                        for item in info["items"]:
                            item["bbox"] = list(fitz.Rect(item["bbox"]) * page.rotation_matrix)
                        for line in info.get("lines", []):
                            line["bbox"] = list(fitz.Rect(line["bbox"]) * page.rotation_matrix)
            analysis["warning"] = analysis_error
            analysis["suggestions"] = suggest_fields(analysis)
            previous_files = [(file.storage, file.name) for file in (revision.master, revision.logo, revision.seal) if file] if revision else []
            revision = revision or CertificateTemplateRevision(institution=request.user.institution)
            revision.name = str(request.data.get("name", "Institutional certificate"))[:120]
            revision.fields = []
            revision.logo = None
            revision.seal = None
            revision.analysis = analysis
            revision.master.save("master.pdf", ContentFile(output), save=False)
            revision.save()
            for storage, path in previous_files:
                transaction.on_commit(lambda storage=storage, path=path: storage.delete(path))
            log_action(actor=request.user, action="certificate_template.replaced" if replacement else "certificate_template.created", target_type="CertificateTemplateRevision", target_id=str(revision.id), detail="Replaced unused draft and reset its fields/assets" if replacement else "Uploaded institutional master")
            return Response(metadata(revision), status=200 if replacement else 201)
        except (ValueError, TypeError) as exc:
            return Response({"detail": str(exc)}, status=400)


class TemplateRevisionView(APIView):
    permission_classes = [IsFullSession, IsRegistrar]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    @transaction.atomic
    def patch(self, request, pk):
        Institution.objects.select_for_update().get(pk=request.user.institution_id)
        revision = get_object_or_404(CertificateTemplateRevision.objects.select_for_update(), pk=pk, institution=request.user.institution)
        if revision.approved_at:
            return Response({"detail": "Disable branding and open this template for editing before saving changes."}, status=409)
        try:
            fields = request.data.get("fields", revision.fields)
            if isinstance(fields, str):
                fields = json.loads(fields)
            validate_layout(fields, revision.analysis)
            logo = asset(request.FILES["logo"]) if "logo" in request.FILES else revision.logo
            seal = asset(request.FILES["seal"]) if "seal" in request.FILES else revision.seal
            if str(request.data.get("clear_assets", "")).lower() in ("true", "1"):
                logo = None
                seal = None
            crop = request.data.get("extract_asset")
            if crop:
                if isinstance(crop, str):
                    crop = json.loads(crop)
                validate_layout([crop], revision.analysis)
                if crop["key"] not in ("logo", "seal"):
                    raise ValueError("Only a crest or seal region can be extracted as a template asset.")
                with revision.master.open("rb") as source, fitz.open(stream=source.read(), filetype="pdf") as doc:
                    page = doc[crop.get("page", 1) - 1]
                    page.remove_rotation()
                    w, h = page.rect.width, page.rect.height
                    rect = fitz.Rect(crop["x"] * w, crop["y"] * h, (crop["x"] + crop["width"]) * w, (crop["y"] + crop["height"]) * h)
                    scale = min(2, 1600 / max(rect.width, rect.height))
                    png = page.get_pixmap(matrix=fitz.Matrix(scale, scale), clip=rect, alpha=False).tobytes("png")
                extracted = ContentFile(png, name=f"{crop['key']}.png")
                if crop["key"] == "logo":
                    logo = extracted
                else:
                    seal = extracted
            approve = str(request.data.get("approve", "")).lower() in ("true", "1")
            if approve:
                required = {"student_name", "degree_title", "graduation_year", "registrar_signature", "vc_signature", "chancellor_signature"}
                if not required <= {f["key"] for f in fields}:
                    raise ValueError("Label student name, degree, graduation year, and all three officer signature areas before approval.")
                if any(f["key"] == "logo" for f in fields) and not logo:
                    raise ValueError("Upload the crest used by the logo field.")
                if any(f["key"] == "seal" for f in fields) and not seal:
                    raise ValueError("Upload the seal used by the seal field.")
            revision.fields, revision.logo, revision.seal = fields, logo, seal
            if approve:
                revision.approved_at = timezone.now()
            revision.save()
            if approve:
                render_uploaded_template(sample_certificate(request.user.institution), revision,
                    verification_base_url=settings.FRONTEND_URL)
                for program in Program.objects.filter(department__institution=request.user.institution, active=True):
                    sample = sample_certificate(request.user.institution)
                    sample.degree_title = program.full_title
                    sample.department = program.department.name
                    template_preflight(sample, revision)
                template = _get_or_create_template(request.user.institution)
                template.active_revision = revision
                template.save(update_fields=["active_revision", "updated_at"])
            log_action(actor=request.user, action="certificate_template.approved" if approve else "certificate_template.updated", target_type="CertificateTemplateRevision", target_id=str(revision.id), detail="Manual field and asset configuration")
            data = metadata(revision)
            try:
                data["validation_warnings"] = template_preflight(sample_certificate(request.user.institution), revision)
            except ValueError as exc:
                data["validation_warnings"] = [str(exc)]
            return Response(data)
        except (ValueError, TypeError) as exc:
            transaction.set_rollback(True)
            return Response({"detail": str(exc)}, status=400)


class TemplateRestartView(APIView):
    """Discard explicitly confirmed unused drafts; preserve approved/used versions."""
    permission_classes = [IsFullSession, IsRegistrar]

    @transaction.atomic
    def post(self, request):
        if not request.user.institution_id:
            return Response({"detail": "No institution linked."}, status=400)
        Institution.objects.select_for_update().get(pk=request.user.institution_id)
        field = serializers.ListField(child=serializers.UUIDField(), allow_empty=False, max_length=50)
        ids = field.run_validation(request.data.get("draft_ids", []))
        revisions = list(CertificateTemplateRevision.objects.select_for_update().filter(institution=request.user.institution, pk__in=ids))
        if len(revisions) != len(set(ids)) or any(r.approved_at or r.credentials.exists() or r.active_for.exists() for r in revisions):
            return Response({"detail": "The selected drafts changed or are protected. Reload templates before restarting."}, status=409)
        files = [(file.storage, file.name) for revision in revisions for file in (revision.master, revision.logo, revision.seal) if file]
        for revision in revisions:
            revision.delete()
        for storage, path in files:
            transaction.on_commit(lambda storage=storage, path=path: storage.delete(path))
        log_action(actor=request.user, action="certificate_template.restarted", target_type="Institution", target_id=str(request.user.institution_id), detail=f"Discarded {len(revisions)} explicitly selected unused drafts")
        return Response({"removed_ids": [str(id) for id in ids]})


class TemplatePageView(APIView):
    permission_classes = [IsFullSession, IsRegistrar]

    def get(self, request, pk):
        revision = get_object_or_404(CertificateTemplateRevision, pk=pk, institution=request.user.institution)
        try:
            number = int(request.query_params.get("page", 1))
            with revision.master.open("rb") as source, fitz.open(stream=source.read(), filetype="pdf") as doc:
                if not 1 <= number <= doc.page_count:
                    raise ValueError("Choose an existing page.")
                page = doc[number - 1]
                scale = min(1.5, 1400 / max(page.rect.width, page.rect.height))
                png = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False).tobytes("png")
            response = HttpResponse(png, content_type="image/png")
            response["Cache-Control"] = "private, no-store"
            return response
        except (ValueError, TypeError) as exc:
            return Response({"detail": str(exc)}, status=400)


class TemplateSampleView(APIView):
    permission_classes = [IsFullSession, IsRegistrar]

    def get(self, request, pk):
        revision = get_object_or_404(CertificateTemplateRevision, pk=pk, institution=request.user.institution)
        sample = sample_certificate(request.user.institution)
        try:
            output = render_uploaded_template(sample, revision, verification_base_url=settings.FRONTEND_URL)
            response = HttpResponse(output, content_type="application/pdf")
            response["Cache-Control"] = "private, no-store"
            return response
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)


class CredentialTemplatePreviewView(APIView):
    permission_classes = [IsFullSession, IsRegistrarOrAbove]

    def get(self, request, pk):
        certificate = get_object_or_404(Certificate, pk=pk, institution=request.user.institution)
        if not certificate.template_revision_id:
            return Response({"detail": "This credential uses the preset renderer."}, status=400)
        try:
            if certificate.sealed_doc_hash:
                output = fetch_verified_document(certificate.ipfs_cid_sealed_pdf, certificate.certificate_id, "certificate", certificate.sealed_doc_hash)
            elif certificate.doc_hash:
                output = fetch_verified_document(certificate.ipfs_cid_pdf, certificate.certificate_id, "certificate-review", certificate.doc_hash)
            else:
                output = render_uploaded_template(certificate, certificate.template_revision, verification_base_url=settings.FRONTEND_URL)
            response = HttpResponse(output, content_type="application/pdf")
            response["Cache-Control"] = "private, no-store"
            return response
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)
        except RuntimeError as exc:
            return Response({"detail": str(exc)}, status=502)


class CredentialPreflightView(APIView):
    permission_classes = [IsFullSession, IsRegistrarOrAbove]

    def get(self, request, pk):
        certificate = get_object_or_404(Certificate, pk=pk, institution=request.user.institution)
        try:
            validate_certificate_data(certificate)
            warnings = template_preflight(certificate, certificate.template_revision) if certificate.template_revision_id else []
            return Response({"valid": True, "warnings": warnings})
        except ValueError as exc:
            return Response({"valid": False, "detail": str(exc)}, status=400)
