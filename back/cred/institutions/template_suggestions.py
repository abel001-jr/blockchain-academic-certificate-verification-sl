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
    "STUDENT FULL NAME": "student_name", "RECIPIENT NAME": "student_name",
    "QUALIFICATION": "degree_title", "PROGRAMME": "degree_title", "PROGRAM": "degree_title",
    "CERTIFICATE NUMBER": "certificate_id", "CREDENTIAL ID": "certificate_id",
    "YEAR OF GRADUATION": "graduation_year", "QR CODE": "qr",
    "LOGO": "logo", "CREST": "logo", "SEAL": "seal",
    "REGISTRAR SIGNATURE": "registrar_signature", "VICE CHANCELLOR SIGNATURE": "vc_signature",
    "CHANCELLOR SIGNATURE": "chancellor_signature", "DEAN SIGNATURE": "chancellor_signature",
}

def font_choice(name):
    if name in FONTS:
        return name, False
    normalized = re.sub(r"^[A-Z]{6}\+", "", name).lower()
    italic = "italic" in normalized or "oblique" in normalized
    bold = "bold" in normalized or "semibold" in normalized
    if "cormorant" in normalized:
        base = "CormorantGaramond"
    elif "cinzel" in normalized:
        return "Cinzel-Bold" if bold else "Cinzel", True
    elif "greatvibes" in re.sub(r"[\s-]", "", normalized):
        return "GreatVibes", True
    elif "vera" in normalized:
        base = "Vera"
    elif "courier" in normalized:
        base = "Courier"
    elif "sans" not in normalized and any(word in normalized for word in ("serif", "times", "garamond", "baskerville", "georgia", "palatino")):
        base = "Times"
    else:
        base = "Helvetica"
    if not bold and not italic:
        return "Times-Roman" if base == "Times" else base, True
    slant = "Oblique" if base in {"Helvetica", "Courier"} else "Italic"
    return base + "-" + ("Bold" if bold else "") + (slant if italic else ""), True


def blank_field_suggestions(analysis):
    """Propose review-only boxes in text-free gaps beside familiar certificate anchors."""
    suggestions = []
    for page in analysis.get("pages", []):
        w, h = page.get("width", 0), page.get("height", 0)
        if not w or not h:
            continue
        lines = [line for line in page.get("lines", []) if len(line.get("bbox", [])) == 4]
        # OCR often groups all three horizontally aligned officer captions into
        # one line. Recover their individual positions from word-level evidence.
        role_names = {"registrar", "vice chancellor", "chancellor"}
        role_items = [item for item in page.get("items", [])
            if len(item.get("bbox", [])) == 4
            and " ".join(re.sub(r"[^a-z ]", " ", item.get("text", "").lower()).split()) in role_names
            and item.get("confidence", 100) >= 60]
        recovered = []
        for line in lines:
            box = line["bbox"]
            members = [item for item in role_items if item["bbox"][0] >= box[0]-2
                and item["bbox"][2] <= box[2]+2 and abs(item["bbox"][1]-box[1]) < 12]
            if len(members) >= 2:
                recovered.extend(members)
            else:
                recovered.append(line)
        lines = recovered
        for line in lines:
            if page.get("method") == "ocr" and line.get("confidence", 0) < 60:
                continue
            text = " ".join(re.sub(r"[^a-z0-9 ]", " ", line.get("text", "").lower()).split())
            x0, y0, x1, y1 = line["bbox"]
            above = False
            side_label = False
            if "upon the recommendation of" in text and "senate" in text:
                key = "student_name"
            elif re.search(r"(?:awarded|conferred) (?:the )?degree of$", text):
                key = "degree_title"
            elif text in {"registrar", "signature of registrar", "registrar signature", "vice chancellor", "vice chancellor signature", "vc", "chancellor", "chancellor signature"}:
                key = "vc_signature" if "vice" in text or text == "vc" else "registrar_signature" if "registrar" in text else "chancellor_signature"
                above = True
            elif text.upper() in ALIASES and ALIASES[text.upper()] not in {"logo", "seal"}:
                key = ALIASES[text.upper()]
                side_label = True
            elif text == "given under the authority of":
                key = "institution_name"
            else:
                continue
            box_width = min(w * (.22 if above else .65), w - 16)
            left = max(8, min((x0 + x1 - box_width) / 2, w - box_width - 8))
            right = left + box_width
            other_lines = [other["bbox"] for other in lines if other is not line and other["bbox"][0] < right and other["bbox"][2] > left]
            if above:
                rules = [rule for rule in page.get("horizontal_rules", [])
                    if 0 < y0 - rule[1] < h * .1 and rule[0] <= (x0+x1)/2 <= rule[2] and rule[2]-rule[0] < w * .45]
                if rules:
                    rule = max(rules, key=lambda candidate: candidate[1])
                    left, right = rule[0], rule[2]
                    box_width = right - left
                    other_lines = [other["bbox"] for other in lines if other is not line and other["bbox"][0] < right and other["bbox"][2] > left]
                    bottom = rule[1] - 3
                else:
                    bottom = y0 - max(8, h * .015)
                top = max([8, bottom - h * .065] + [box[3] + 6 for box in other_lines if box[3] <= bottom])
            elif side_label:
                left = x1 + 8
                right = min(w - 8, left + w * .45)
                box_width = right - left
                top, bottom = y0, max(y1, y0 + 24)
            else:
                padding = 1 if key == "institution_name" else max(6, h * .01)
                gap_top = y1 + padding
                gap_bottom = min([h - 8] + [box[1] - padding for box in other_lines if box[1] >= y1])
                height = min(h * .065, gap_bottom - gap_top)
                top = gap_top + (gap_bottom - gap_top - height) / 2
                bottom = top + height
            minimum_height = 8 if key == "institution_name" else 16
            if bottom - top < minimum_height or box_width < 25 or left < 0 or right > w or bottom > h:
                continue
            if any(box[0] < right and box[2] > left and box[1] < bottom and box[3] > top for box in [other["bbox"] for other in lines]):
                continue
            field = dict(key=key, page=page["page"], x=left/w, y=top/h,
                width=box_width/w, height=(bottom-top)/h, font="Times-Roman",
                font_size=min(18, max(6, (bottom-top) * .75)), min_font_size=6, align="center", clear=False)
            suggestions.append({"field": field, "source_text": line["text"], "method": "layout",
                "note": ("Narrow institution-name gap: review readability and enlarge or move this box if needed. " if bottom-top < 16 else "") + "Estimated blank area near this wording. Check artwork, position and size before adding; existing content will not be cleared."})
    return suggestions


def suggest_fields(analysis, expected_values=None):
    suggestions, warnings = [], []
    for page in analysis.get("pages", []):
        width, height = page.get("width", 0), page.get("height", 0)
        if not width or not height:
            continue
        for line in page.get("lines", []):
            text = line["text"]
            placeholders = list(re.finditer(r"\[([^\[\]]+)\]", text))
            if not placeholders:
                for key, values in (expected_values or {}).items():
                    if key not in {"institution_name", "degree_title", "department", "grade", "student_name", "graduation_year", "certificate_id"}:
                        continue
                    if any(" ".join(str(value).casefold().split()) == " ".join(text.casefold().split()) for value in values if str(value).strip()):
                        if page.get("method") == "ocr" and line.get("confidence", 0) < 60:
                            continue
                        x0, y0, x1, y1 = line["bbox"]
                        field = dict(key=key, page=page["page"], x=max(0, x0)/width, y=max(0, y0)/height,
                            width=(min(width,x1)-max(0,x0))/width, height=(min(height,y1)-max(0,y0))/height,
                            font=font_choice(line.get("font", "Times-Roman"))[0],
                            font_size=max(6, min(72, line.get("font_size", 18))),
                            min_font_size=6, align="center", clear=True)
                        suggestions.append({"field": field, "source_text": text, "method": "matched_value",
                            "note": "Exact match to institution/input data. Review the replacement area before adding."})
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
    existing = {(item["field"]["page"], item["field"]["key"]) for item in suggestions}
    suggestions.extend(item for item in blank_field_suggestions(analysis)
        if (item["field"]["page"], item["field"]["key"]) not in existing)
    if any(item["method"] == "layout" for item in suggestions):
        warnings.append("Blank-area suggestions are estimates from nearby wording, not detected placeholders. Review every box against the master artwork.")
    if not suggestions:
        warnings.append("No unambiguous supported placeholders found. Blank areas and unlabelled artwork need manual placement.")
    checked = ["student_name", "degree_title", "institution_name", "graduation_year", "department", "grade", "certificate_id", "registrar_signature", "vc_signature", "chancellor_signature", "qr"]
    found = {item["field"]["key"] for item in suggestions[:60]}
    return {"items": suggestions[:60], "warnings": list(dict.fromkeys(warnings))[:60],
        "checked_fields": checked, "missing_fields": [key for key in checked if key not in found]}
