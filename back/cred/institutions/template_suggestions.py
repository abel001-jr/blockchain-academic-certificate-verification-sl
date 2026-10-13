"""Conservative placeholder rules; no model, inferred identities or approval."""
import re
from .template_rendering import FONTS

ALIASES = {
    "INSTITUTION NAME": "institution_name", "UNIVERSITY NAME": "institution_name",
    "GRADUATE FULL NAME": "student_name", "STUDENT NAME": "student_name", "FULL NAME": "student_name",
    "DEGREE AWARD TITLE": "degree_title", "DEGREE TITLE": "degree_title", "AWARD TITLE": "degree_title",
    "DEPARTMENT": "department", "DEPARTMENT NAME": "department",
    "CLASSIFICATION HONOURS": "grade", "CLASSIFICATION": "grade", "GRADE": "grade",
    "GRADUATION YEAR": "graduation_year", "CERTIFICATE ID": "certificate_id",
    "LOGO": "logo", "CREST": "logo", "SEAL": "seal",
    "REGISTRAR SIGNATURE": "registrar_signature", "VICE CHANCELLOR SIGNATURE": "vc_signature",
    "CHANCELLOR SIGNATURE": "chancellor_signature", "DEAN SIGNATURE": "chancellor_signature",
}

def font_choice(name):
    if name in FONTS:
        return name, False
    normalized = name.lower()
    serif = "serif" in normalized or "times" in normalized
    italic = "italic" in normalized or "oblique" in normalized
    bold = "bold" in normalized
    return ("Times-Italic" if serif and italic else "Times-Bold" if serif and bold else "Times-Roman" if serif else "Helvetica-Bold" if bold else "Helvetica"), True

def suggest_fields(analysis):
    suggestions, warnings = [], []
    for page in analysis.get("pages", []):
        width, height = page.get("width", 0), page.get("height", 0)
        if not width or not height:
            continue
        for line in page.get("lines", []):
            text = line["text"]
            placeholders = list(re.finditer(r"\[([^\[\]]+)\]", text))
            if not placeholders:
                continue
            for match in placeholders:
                name = " ".join(re.sub(r"[^A-Z0-9 ]", " ", match[1].upper()).split())
                key = ALIASES.get(name)
                if not key:
                    warnings.append(f"Page {page['page']}: {match[0]} needs manual mapping; programme and full dates are not automatically treated as department or graduation year.")
                    continue
                # A substring in a sentence needs its actual word/span rectangle.
                # Whole-line boxes would erase surrounding fixed wording.
                if text.strip() != match[0]:
                    warnings.append(f"Page {page['page']}: {match[0]} is within fixed wording. Select its exact area manually.")
                    continue
                confidence = line.get("confidence", 100)
                if page.get("method") == "ocr" and confidence < 60:
                    warnings.append(f"Page {page['page']}: low-confidence OCR for {match[0]}; inspect and label manually.")
                    continue
                x0, y0, x1, y1 = line["bbox"]
                x0, y0, x1, y1 = max(0, x0-3), max(0, y0-2), min(width, x1+3), min(height, y1+2)
                if x1 <= x0 or y1 <= y0:
                    continue
                font, substituted = font_choice(line.get("font", "Times-Roman"))
                size = max(6, min(72, line.get("font_size", (y1-y0)*.7)))
                field = dict(key=key, page=page["page"], x=x0/width, y=y0/height,
                    width=(x1-x0)/width, height=(y1-y0)/height, font=font,
                    font_size=round(size, 1), min_font_size=6, color=line.get("color", "#000000"),
                    align="center", clear=True)
                suggestions.append({"field": field, "source_text": match[0],
                    "method": page.get("method"), "confidence": confidence,
                    "note": "Approximate font; original embedded font is not supported." if substituted else "OCR font size is estimated; font and color need review." if page.get("method") == "ocr" else "PDF text position and formatting extracted directly."})
    if not suggestions:
        warnings.append("No unambiguous supported placeholders found. Blank areas and unlabelled artwork need manual placement.")
    return {"items": suggestions[:60], "warnings": list(dict.fromkeys(warnings))[:60]}
