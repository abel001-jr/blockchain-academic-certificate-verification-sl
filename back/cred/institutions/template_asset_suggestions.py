"""AI sizing advice with locally enforced proportions and placement constraints."""
import json
import math
from PIL import Image
from .ai_suggestions import request_classification
from .template_rendering import validate_layout


def suggest_asset_size(image, key, analysis, fields, page_number=1, local=False):
    if key not in {"logo", "seal"}:
        raise ValueError("Choose a logo or seal.")
    pages = analysis.get("pages", [])
    if not 1 <= page_number <= len(pages):
        raise ValueError("Choose an existing page.")
    page = pages[page_number - 1]
    w, h = page["width"], page["height"]
    image.seek(0)
    with Image.open(image) as artwork:
        iw, ih = artwork.size
    image.seek(0)
    metadata = {"asset": key, "image_width": iw, "image_height": ih,
        "page_width": w, "page_height": h}
    width = .18 if key == "logo" else .16
    if not local:
        result = request_classification(
            'Recommend a legible institutional logo/seal size on a certificate. '
            'Return JSON {"items":[{"width_fraction":0.18}]}. '
            'Width must be between 0.12 and 0.30 of page width. '
            'Use only the supplied dimensions. Do not infer artwork or return coordinates.',
            [(page, {"text": json.dumps(metadata)})])
        items = result.get("items", [])
        width = items[0].get("width_fraction") if items and isinstance(items[0], dict) else None
        if isinstance(width, bool) or not isinstance(width, (int, float)) or not math.isfinite(width) or not .12 <= width <= .30:
            raise ValueError("AI did not return a usable image size. Set the width and height manually or retry.")
    height = width * w * ih / iw / h
    if height > .25:
        width *= .25 / height
        height = .25
    if width * w < 48 or height * h < 32:
        raise ValueError("This image is unusually narrow or tall. Trim excessive margins or choose its size manually.")
    occupied = [line["bbox"] for line in page.get("lines", []) if "bbox" in line]
    occupied += [[f["x"]*w, f["y"]*h, (f["x"]+f["width"])*w, (f["y"]+f["height"])*h]
        for f in fields if f.get("page", 1) == page_number and f.get("key") != key]
    previous = next((f for f in fields if f.get("key") == key and f.get("page", 1) == page_number), None)
    positions = [(previous["x"] + previous["width"]/2 - width/2, previous["y"] + previous["height"]/2 - height/2)] if previous else []
    positions += [(x, y) for y in ([.04, .12, .24, .64, .75] if key == "logo" else [.64, .75, .12, .24, .04])
        for x in [.5-width/2, .07, .93-width]]
    for x, y in positions:
        if x < .02 or y < .02 or x+width > .98 or y+height > .98:
            continue
        if any(x*w < box[2]+4 and (x+width)*w > box[0]-4 and y*h < box[3]+4 and (y+height)*h > box[1]-4 for box in occupied):
            continue
        field = {"key": key, "page": page_number, "x": x, "y": y,
            "width": width, "height": height, "clear": False}
        validate_layout([field], analysis)
        return {"field": field, "width_points": round(width*w, 1), "height_points": round(height*h, 1),
            "note": ("Local estimated size" if local else "AI size") + " with original image proportions. Review against background artwork; trim large image margins if the visible artwork is still small."}
    raise ValueError("No clear area fits this image size. Move existing fields or place and resize the image manually.")
