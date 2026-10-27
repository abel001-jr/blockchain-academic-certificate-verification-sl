"""Deterministic certificate-form detection from native text and OCR evidence."""
import re


def detect_design_mode(analysis):
    pages = analysis.get("pages", [])
    reliable, low_confidence, methods = [], 0, set()
    for page in pages:
        method = page.get("method", "unknown")
        methods.add(method)
        lines = page.get("lines", [])
        if lines:
            for line in lines:
                if method == "ocr" and line.get("confidence", 0) < 60:
                    low_confidence += 1
                    continue
                reliable.append(str(line.get("text", "")))
        elif method != "ocr":
            reliable.append(str(page.get("text", "")))
    text = " ".join(reliable)
    words = re.findall(r"[A-Za-z]{2,}", text)
    placeholders = len(re.findall(r"\[[^\[\]]+\]|\{\{[^{}]+\}\}|<[^<>]+>", text))
    anchors = len(re.findall(r"certif(?:icate|ies|y)|awarded|conferred|degree|registrar|chancellor|successfully completed|course of study", text, re.I))
    evidence = {"word_count": len(words), "placeholder_count": placeholders, "certificate_anchor_count": anchors,
                "low_confidence_lines": low_confidence, "sources": sorted(methods)}
    if placeholders or anchors or len(words) >= 8:
        form = "placeholder_template" if placeholders else "prewritten_certificate"
        return {"recommended": "existing", "form": form, "confidence": "high" if placeholders or anchors >= 2 else "medium",
                "detail": "Existing certificate wording or editable placeholders detected. Preserve the background and configure variable fields.", "evidence": evidence}
    if low_confidence or not pages or analysis.get("warning"):
        return {"recommended": "existing", "form": "uncertain", "confidence": "low",
                "detail": "Text could not be read reliably. Existing-text mode is selected to preserve the master; inspect the preview before switching to blank design.", "evidence": evidence}
    return {"recommended": "blank", "form": "blank_design", "confidence": "medium",
            "detail": "Little or no readable certificate wording detected. Blank-design composition is selected. Check the preview because flattened or unreadable text can be missed.", "evidence": evidence}
