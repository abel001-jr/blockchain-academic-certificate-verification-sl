"""Render labelled fields over an institution's uploaded master without inference."""
from io import BytesIO
import math
import re

import fitz
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase.pdfmetrics import stringWidth

TEXT_FIELDS = {"student_name", "degree_title", "institution_name", "graduation_year", "department", "grade", "certificate_id", "static_text"}
ASSET_FIELDS = {"logo", "seal", "registrar_signature", "vc_signature", "chancellor_signature", "qr"}
FONTS = {"Times-Roman", "Times-Bold", "Helvetica", "Helvetica-Bold", "Times-Italic"}
from .credential_validation import LIMITS, template_preflight, clean_text


def validate_layout(fields, analysis):
    if not isinstance(fields, list) or len(fields) > 60:
        raise ValueError("Configure at most 60 labelled fields.")
    pages = analysis.get("pages", [])
    for field in fields:
        if not isinstance(field, dict) or field.get("key") not in TEXT_FIELDS | ASSET_FIELDS:
            raise ValueError("Choose a supported text or asset field.")
        page = field.get("page", 1)
        if not isinstance(page, int) or isinstance(page, bool) or not 1 <= page <= len(pages):
            raise ValueError("Every field must refer to an existing page.")
        for name in ("x", "y", "width", "height"):
            value = field.get(name)
            if not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value) or not 0 <= value <= 1:
                raise ValueError("Field coordinates must be finite proportions between 0 and 1.")
        if field["width"] <= 0 or field["height"] <= 0 or field["x"] + field["width"] > 1.000001 or field["y"] + field["height"] > 1.000001:
            raise ValueError("Every field must fit inside its page.")
        if field.get("font", "Times-Roman") not in FONTS:
            raise ValueError("Choose a supported PDF font.")
        size = field.get("font_size", 18)
        if not isinstance(size, (int, float)) or isinstance(size, bool) or not math.isfinite(size) or not 6 <= size <= 72:
            raise ValueError("Font size must be between 6 and 72 points.")
        if field.get("align", "center") not in ("left", "center", "right"):
            raise ValueError("Choose left, center, or right alignment.")
        if not isinstance(field.get("color", "#000000"), str) or not re.fullmatch(r"#[0-9a-fA-F]{6}", field.get("color", "#000000")):
            raise ValueError("Text color must be a six-digit hexadecimal color.")
        if not isinstance(field.get("clear", False), bool):
            raise ValueError("Clear area must be true or false.")
        if not isinstance(field.get("text", ""), str) or len(field.get("text", "")) > 1000:
            raise ValueError("Static text must be at most 1000 characters.")
        key = field["key"]
        expected_type = "number" if key == "graduation_year" else "text"
        if field.get("input_type", expected_type) != expected_type:
            raise ValueError(f"{key} must use {expected_type} input.")
        if not isinstance(field.get("required", key in {"student_name", "degree_title", "graduation_year"}), bool):
            raise ValueError("Required must be true or false.")
        if key in LIMITS:
            lower, upper = field.get("min_length", 2 if key == "student_name" else 0), field.get("max_length", LIMITS[key])
            if any(isinstance(v, bool) or not isinstance(v, int) for v in (lower, upper)) or not 0 <= lower <= upper <= LIMITS[key]:
                raise ValueError(f"{key} length limits must be whole numbers within 0–{LIMITS[key]}.")
        if key == "graduation_year":
            lower, upper = field.get("min_value", 1900), field.get("max_value", 9999)
            if any(isinstance(v, bool) or not isinstance(v, int) for v in (lower, upper)) or not 1900 <= lower <= upper <= 9999:
                raise ValueError("Graduation year limits must be whole numbers from 1900 to 9999. Issuance also enforces current year plus one.")
        minimum = field.get("min_font_size", 6)
        if isinstance(minimum, bool) or not isinstance(minimum, (int, float)) or not math.isfinite(minimum) or not 6 <= minimum <= size:
            raise ValueError("Minimum readable font size must be at least 6pt and no larger than the selected font size.")
    return fields


def render_uploaded_template(certificate, revision, *, include_attestations=False, verification_base_url=""):
    validate_layout(revision.fields, revision.analysis)
    template_preflight(certificate, revision)
    with revision.master.open("rb") as source:
        master = source.read()
    with fitz.open(stream=master, filetype="pdf") as doc:
        # Flatten page rotation before mapping top-left normalized coordinates.
        for page in doc:
            page.remove_rotation()
        for number, page in enumerate(doc, start=1):
            width, height = page.rect.width, page.rect.height
            fields = [f for f in revision.fields if f.get("page", 1) == number]
            for field in fields:
                if field.get("clear"):
                    rect = fitz.Rect(field["x"] * width, field["y"] * height, (field["x"] + field["width"]) * width, (field["y"] + field["height"]) * height)
                    page.add_redact_annot(rect, fill=(1, 1, 1))
            if any(f.get("clear") for f in fields):
                page.apply_redactions(images=2, graphics=1)
            buffer = BytesIO()
            overlay = canvas.Canvas(buffer, pagesize=(width, height), invariant=1)
            for field in fields:
                key = field["key"]
                x, y = field["x"] * width, (1 - field["y"] - field["height"]) * height
                box_width, box_height = field["width"] * width, field["height"] * height
                if key in TEXT_FIELDS:
                    value = field.get("text", "") if key == "static_text" else certificate.institution.name if key == "institution_name" else getattr(certificate, key, "")
                    value = str(value or "") if key == "graduation_year" else clean_text(value, key, LIMITS[key], required=False)
                    font, size = field.get("font", "Times-Roman"), field.get("font_size", 18)
                    minimum = field.get("min_font_size", 6)
                    while size > minimum and (stringWidth(value, font, size) > box_width or size * 1.2 > box_height):
                        size = max(minimum, size - 0.5)
                    if stringWidth(value, font, size) > box_width or size * 1.2 > box_height:
                        raise ValueError(f"The {key} field is too small for its content. Enlarge it in template settings.")
                    if any(ord(char) > 255 for char in value):
                        raise ValueError(f"The {key} field needs a font supporting its characters; built-in fonts currently support Latin text.")
                    overlay.setFont(font, size)
                    from reportlab.lib.colors import HexColor
                    overlay.setFillColor(HexColor(field.get("color", "#000000")))
                    baseline = y + (box_height - size) / 2 + size * 0.2
                    align = field.get("align", "center")
                    if align == "center":
                        overlay.drawCentredString(x + box_width / 2, baseline, value)
                    elif align == "right":
                        overlay.drawRightString(x + box_width, baseline, value)
                    else:
                        overlay.drawString(x, baseline, value)
                elif key == "qr":
                    import qrcode
                    png = BytesIO()
                    qrcode.make(f"{verification_base_url.rstrip('/')}/verify/{certificate.certificate_id}").save(png, format="PNG")
                    overlay.drawImage(ImageReader(BytesIO(png.getvalue())), x, y, box_width, box_height, preserveAspectRatio=True, mask="auto")
                else:
                    if key.endswith("_signature") and not include_attestations:
                        continue
                    asset = getattr(revision, key, None) if key in ("logo", "seal") else getattr(certificate, key + "_image", None)
                    if key.endswith("_signature") and not asset:
                        raise ValueError(f"The {key} asset was not captured during approval. Configure officer signatures before submitting credentials.")
                    if asset:
                        with asset.open("rb") as image:
                            overlay.drawImage(ImageReader(BytesIO(image.read())), x, y, box_width, box_height, preserveAspectRatio=True, mask="auto")
            # The review status is explicit; the final rendering keeps the master style.
            if not include_attestations:
                overlay.setFillColorRGB(0, 0, 0)
                overlay.setFont("Helvetica", 7)
                overlay.drawCentredString(width / 2, 7, "Review copy - unsigned, not yet issued")
            overlay.save()
            with fitz.open(stream=buffer.getvalue(), filetype="pdf") as generated:
                page.show_pdf_page(page.rect, generated, 0)
        return doc.tobytes(garbage=4, deflate=True, no_new_id=True)
