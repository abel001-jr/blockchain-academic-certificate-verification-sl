"""Local, review-only artwork and institution heading placement."""
from .template_asset_suggestions import suggest_asset_size
from .template_rendering import validate_layout
from .template_vision import overlaps


def add_local_artwork(result, revision, analysis, fields, uploads, page_number):
    occupied = list(fields) + [item["field"] for item in result["items"]]
    for key in ("logo", "seal"):
        if any(f["key"] == key and f.get("page", 1) == page_number for f in occupied):
            continue
        upload, saved = uploads.get(key), getattr(revision, key)
        if not upload and not saved:
            continue
        try:
            if upload:
                from .template_views import asset
                proposal = suggest_asset_size(asset(upload), key, analysis, occupied, page_number, local=True)
            else:
                with saved.open("rb") as source:
                    proposal = suggest_asset_size(source, key, analysis, occupied, page_number, local=True)
            result["items"].append({"field": proposal["field"], "method": "layout", "source_text": "Uploaded " + key,
                "note": proposal["note"]})
            occupied.append(proposal["field"])
        except ValueError as exc:
            result["warnings"].append(f"{key.title()}: {exc}")
    # Prefer an exact name match, placeholder or anchored gap from suggest_fields.
    # Otherwise offer a text-free heading area, labelled as an estimate.
    if not any(f["key"] == "institution_name" and f.get("page", 1) == page_number for f in occupied):
        page = analysis["pages"][page_number-1]
        w, h = page["width"], page["height"]
        text = [{"page": page_number, "x": line["bbox"][0]/w, "y": line["bbox"][1]/h,
            "width": (line["bbox"][2]-line["bbox"][0])/w, "height": (line["bbox"][3]-line["bbox"][1])/h}
            for line in page.get("lines", []) if len(line.get("bbox", [])) == 4]
        for y in (.06, .12, .20, .28):
            field = {"key": "institution_name", "page": page_number, "x": .15, "y": y, "width": .7, "height": .045,
                "font": "Times-Bold", "font_size": 20, "align": "center", "clear": False}
            if any(overlaps(field, other) for other in occupied + text):
                continue
            validate_layout([field], analysis)
            result["items"].append({"field": field, "method": "layout", "source_text": revision.institution.name,
                "note": "Estimated institution heading area. Uses your institution name. Check for an existing name or artwork in the master before adding."})
            break
        else:
            result["warnings"].append("No clear institution-name heading area found. Place it manually.")
    result["items"] = result["items"][:60]
    found = {item["field"]["key"] for item in result["items"]}
    result["missing_fields"] = [key for key in result["checked_fields"] if key not in found]
    result["warnings"].append("Local artwork positions avoid extracted text and proposed fields; inspect embedded artwork before adding. No images are sent to AI.")
