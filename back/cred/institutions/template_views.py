"""Manual institutional template setup and private preview APIs."""
import json
from types import SimpleNamespace

import pymupdf as fitz
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
from .certificate_profiles import selected_profile, annotate_profile
from rest_framework.throttling import UserRateThrottle


class AIAssistanceThrottle(UserRateThrottle):
    scope = "template_ai"

    def get_rate(self):
        return settings.TEMPLATE_AI_RATE


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


def extract_template_analysis(revision):
    """Read the current master for either suggestion method without changing fields."""
    with revision.master.open("rb") as source:
        raw = source.read()
    analysis = analyze_pdf(raw)
    with fitz.open(stream=raw, filetype="pdf") as doc:
        for page, info in zip(doc, analysis["pages"]):
            info.update(width=page.rect.width, height=page.rect.height)
            rules = []
            for drawing in page.get_drawings():
                for segment in drawing["items"]:
                    if segment[0] == "l":
                        first, last = segment[1], segment[2]
                        if page.rotation:
                            first, last = first * page.rotation_matrix, last * page.rotation_matrix
                        if abs(first.y - last.y) < 2 and abs(first.x - last.x) > 25:
                            rules.append([min(first.x, last.x), first.y, max(first.x, last.x), last.y])
            info["horizontal_rules"] = rules
            if info.get("method") == "text_layer" and page.rotation:
                for item in info.get("items", []) + info.get("lines", []):
                    item["bbox"] = list(fitz.Rect(item["bbox"]) * page.rotation_matrix)
    return analysis


class TemplateAISuggestionsView(APIView):
    permission_classes = [IsFullSession, IsRegistrar]
    throttle_classes = [AIAssistanceThrottle]

    def post(self, request, pk):
        revision = get_object_or_404(CertificateTemplateRevision, pk=pk, institution=request.user.institution)
        if revision.approved_at:
            return Response({"detail": "Approved templates are fixed."}, status=400)
        try:
            try:
                analysis = extract_template_analysis(revision)
            except DocumentAnalysisError:
                if str(request.data.get("visual", "")).lower() != "true":
                    raise
                analysis = {**revision.analysis, "warning": "Text reading unavailable. Review AI positions against the page."}
                if not analysis.get("pages"):
                    raise DocumentAnalysisError("Page information is unavailable. Upload the design again.")
            profile = selected_profile(request.data.get("certificate_type", revision.analysis.get("certificate_type", "bsc")))
            analysis["certificate_profile"] = profile
            local = suggest_fields(analysis)
            try:
                if str(request.data.get("visual", "")).lower() == "true":
                    from .template_vision import suggest_visual_layout
                    uploads = {key: asset(request.FILES[key]) for key in ("logo", "seal") if key in request.FILES}
                    fields = json.loads(request.data.get("fields", "[]"))
                    if str(request.data.get("full_design", "")).lower() == "true":
                        result = suggest_visual_layout(revision, analysis, uploads, fields, int(request.data.get("page", 1)), full_design=True)
                    else:
                        result = suggest_visual_layout(revision, analysis, uploads, fields, int(request.data.get("page", 1)))
                else:
                    result = suggest_with_groq(analysis)
                result["ai_status"] = "completed"
            except AssistanceError:
                if not local["items"]:
                    raise
                result = {"items": [], "ai_status": "unavailable", "warnings": ["AI assistance is unavailable. Showing PDF/OCR and estimated layout suggestions instead."]}
            # Keep local blank-area detection; AI only classifies explicit text markers.
            items = list(result["items"])
            seen = {(item["field"]["page"], item["field"]["key"]) for item in items}
            for item in local["items"]:
                identity = (item["field"]["page"], item["field"]["key"])
                if identity not in seen:
                    items.append(item)
                    seen.add(identity)
            result = {**local, "ai_status": result["ai_status"], "items": items[:60],
                "warnings": list(dict.fromkeys(result.get("warnings", []) + local["warnings"]))}
            found = {item["field"]["key"] for item in result["items"]}
            result["missing_fields"] = [key for key in local["checked_fields"] if key not in found]
            annotate_profile(result, profile, analysis)
        except DocumentAnalysisError as exc:
            return Response({"detail": str(exc)}, status=400)
        except AssistanceError as exc:
            return Response({"detail": str(exc)}, status=503)
        except (ValueError, TypeError) as exc:
            return Response({"detail": str(exc)}, status=400)
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


class TemplateAssetSuggestionsView(APIView):
    permission_classes = [IsFullSession, IsRegistrar]
    throttle_classes = [AIAssistanceThrottle]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, pk):
        revision = get_object_or_404(CertificateTemplateRevision, pk=pk, institution=request.user.institution)
        if revision.approved_at or CertificateTemplate.objects.filter(institution=request.user.institution, active_revision__isnull=False).exists():
            return Response({"detail": "Disable branding and open the draft before suggesting image sizes."}, status=409)
        try:
            from .template_asset_suggestions import suggest_asset_size
            key = request.data.get("key")
            if key not in {"logo", "seal"}:
                raise ValueError("Choose a logo or seal.")
            fields = json.loads(request.data.get("fields", "[]"))
            analysis = extract_template_analysis(revision)
            validate_layout(fields, analysis)
            image = request.FILES.get("image")
            if image:
                image = asset(image)
                result = suggest_asset_size(image, key, analysis, fields, int(request.data.get("page", 1)))
            else:
                saved = getattr(revision, key)
                if not saved:
                    raise ValueError("Upload the logo or seal first.")
                with saved.open("rb") as image:
                    result = suggest_asset_size(image, key, analysis, fields, int(request.data.get("page", 1)))
            return Response(result)
        except AssistanceError as exc:
            return Response({"detail": str(exc)}, status=503)
        except (ValueError, TypeError, DocumentAnalysisError) as exc:
            return Response({"detail": str(exc)}, status=400)


class TemplateSuggestionsView(APIView):
    permission_classes = [IsFullSession, IsRegistrar]

    def post(self, request, pk):
        revision = get_object_or_404(CertificateTemplateRevision, pk=pk, institution=request.user.institution)
        if revision.approved_at:
            return Response({"detail": "Approved templates are fixed."}, status=400)
        try:
            expected = {"institution_name": [revision.institution.name],
                "degree_title": list(Program.objects.filter(department__institution=revision.institution, active=True).values_list("title", flat=True)),
                "department": list(revision.institution.departments.filter(active=True).values_list("name", flat=True)),
                "grade": list(revision.institution.grade_classifications.filter(active=True).values_list("label", flat=True))}
            analysis = extract_template_analysis(revision)
            profile = selected_profile(request.data.get("certificate_type", revision.analysis.get("certificate_type", "bsc")))
            expected["degree_title"] = [title for title in expected["degree_title"] if profile["title"].casefold() in title.casefold()]
            result = suggest_fields(analysis, expected_values=expected)
            fields = json.loads(request.data.get("fields", "[]"))
            validate_layout(fields, analysis)
            page_number = int(request.data.get("page", 1))
            if not 1 <= page_number <= len(analysis.get("pages", [])):
                raise ValueError("Choose an existing page.")
            from .template_local_assets import add_local_artwork
            add_local_artwork(result, revision, analysis, fields, request.FILES, page_number)
            return Response(annotate_profile(result, profile, analysis))
        except DocumentAnalysisError as exc:
            return Response({"detail": str(exc)}, status=400)
        except (ValueError, TypeError) as exc:
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
            requested_mode = request.data.get("design_mode", "auto")
            if requested_mode not in {"auto", "blank", "existing"}:
                raise ValueError("Choose automatic detection, blank background or existing certificate.")
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
            from .template_mode import detect_design_mode
            detection = detect_design_mode(analysis)
            analysis["design_detection"] = detection
            analysis["design_mode"] = detection["recommended"] if requested_mode == "auto" else requested_mode
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
            if "certificate_type" in request.data:
                profile = selected_profile(request.data["certificate_type"])
                revision.analysis = {**revision.analysis, "certificate_type": profile["id"]}
            if "design_mode" in request.data:
                mode = request.data["design_mode"]
                if mode not in {"blank", "existing"}:
                    raise ValueError("Choose blank design or existing text.")
                revision.analysis = {**revision.analysis, "design_mode": mode}
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
            elif certificate.tx_hash and certificate.status in ("pending_vc", "pending_chancellor", "pending_finalize"):
                output = render_uploaded_template(certificate, certificate.template_revision, include_attestations=True, allow_partial_signatures=True, verification_base_url=settings.FRONTEND_URL)
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
