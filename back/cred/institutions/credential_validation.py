"""Shared data and template fit checks performed before any PDF is generated."""
import unicodedata
from django.utils import timezone
from reportlab.pdfbase.pdfmetrics import stringWidth

LIMITS = {"student_name": 200, "degree_title": 255, "institution_name": 255,
          "department": 255, "grade": 50, "certificate_id": 50, "static_text": 1000}
REQUIRED = {"student_name", "degree_title", "institution_name", "graduation_year", "certificate_id"}


def validate_graduate_email(value, institution):
    value = value.strip().lower()
    from django.core.exceptions import ValidationError
    from django.core.validators import validate_email
    try:
        validate_email(value)
    except ValidationError:
        raise ValueError("Enter a valid student email address.") from None
    return value


def clean_text(value, label, maximum, *, required=True):
    if not isinstance(value, str):
        raise ValueError(f"{label} must be text.")
    if any(unicodedata.category(c).startswith("C") for c in value):
        raise ValueError(f"{label} must not contain control or hidden formatting characters.")
    value = " ".join(value.split())
    if required and not value:
        raise ValueError(f"{label} is required.")
    if len(value) > maximum:
        raise ValueError(f"{label} allows at most {maximum} characters. Correct the source value; do not truncate an official name or award.")
    return value


def validate_name(value):
    value = clean_text(value, "Student name", 200)
    if len(value) < 2 or not any(unicodedata.category(c).startswith("L") for c in value):
        raise ValueError("Student name must contain at least two characters and a letter.")
    if any(not (unicodedata.category(c)[0] in ("L", "M") or c in " '-’.·") for c in value):
        raise ValueError("Student name must use letters, spaces, apostrophes, hyphens or initials; remove digits and unsupported symbols.")
    return value


def validate_year(value):
    ceiling = timezone.now().year
    if isinstance(value, bool) or not isinstance(value, int) or not 1900 <= value <= ceiling:
        raise ValueError(f"Graduation year must be a whole number between 1900 and {ceiling}.")
    return value


def field_value(certificate, field):
    key = field["key"]
    if key == "static_text":
        return field.get("text", "")
    if key == "institution_name":
        return certificate.institution.name
    return getattr(certificate, key, "")


def validate_certificate_data(certificate):
    validate_name(certificate.student_name)
    validate_year(certificate.graduation_year)
    for key, maximum in LIMITS.items():
        if key in ("student_name", "static_text"):
            continue
        value = certificate.institution.name if key == "institution_name" else getattr(certificate, key, "")
        clean_text(value, key.replace("_", " ").capitalize(), maximum, required=key in REQUIRED)


def template_preflight(certificate, revision):
    """Return actionable fit warnings; raise on invalid input before rendering."""
    validate_certificate_data(certificate)
    warnings = []
    for field in revision.fields:
        key = field["key"]
        if key not in LIMITS and key != "graduation_year":
            continue
        value = field_value(certificate, field)
        if key == "graduation_year":
            validate_year(value)
            if not field.get("min_value", 1900) <= value <= field.get("max_value", timezone.now().year):
                raise ValueError("Graduation year is outside the template's configured range. Correct the year or approve a new template with the appropriate range.")
        else:
            value = clean_text(value, key.replace("_", " "), field.get("max_length", LIMITS[key]), required=field.get("required", key in REQUIRED))
            if value and len(value) < field.get("min_length", 2 if key == "student_name" else 0):
                raise ValueError(f"{key.replace('_', ' ')} is shorter than the template's minimum length. Correct the value or adjust the template validation.")
        text = str(value)
        if any(ord(char) > 255 for char in text):
            raise ValueError(f"{key.replace('_', ' ')} contains characters unsupported by the selected built-in font. Configure a supported font before generation; do not alter an official name.")
        info = revision.analysis["pages"][field.get("page", 1) - 1]
        width, height = field["width"] * info["width"], field["height"] * info["height"]
        font, size = field.get("font", "Times-Roman"), field.get("font_size", 18)
        minimum = field.get("min_font_size", 6)
        fitted = size
        while fitted > minimum and (stringWidth(text, font, fitted) > width or fitted * 1.2 > height):
            fitted = max(minimum, fitted - .5)
        if stringWidth(text, font, fitted) > width or fitted * 1.2 > height:
            raise ValueError(f"{key.replace('_', ' ')} does not fit its labelled area. Widen or increase the height of the box, or adjust font size/minimum size in a new template. Do not shorten official data to make it fit.")
        if fitted < size:
            warnings.append(f"{key.replace('_', ' ')} will use {fitted:g}pt instead of {size:g}pt. Widen the field or adjust its configured font size to preserve readability.")
    return warnings
