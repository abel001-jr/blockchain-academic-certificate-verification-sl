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
    preferred_width, preferred_height = width, height
    minimum_width = max(48 / w, 32 / h * width / height)

    def position_for(bw, bh):
        # Sweep rows formed by obstacle edges and a regular grid. Within each
        # row, interval gaps expose every horizontal space that can fit artwork.
        pw, ph = bw * w, bh * h
        left, right, top, bottom = .02 * w, .98 * w, .02 * h, .98 * h
        preferred_x = (previous["x"] + previous["width"] / 2) * w - pw / 2 if previous else (w - pw) / 2
        preferred_y = (previous["y"] + previous["height"] / 2) * h - ph / 2 if previous else (.04 if key == "logo" else .75) * h
        ys = [preferred_y, *[y * h for y in ([.04, .12, .24, .64, .75] if key == "logo" else [.64, .75, .12, .24, .04])]]
        ys += [top, bottom - ph] + [h * step / 100 for step in range(2, 99, 2)]
        for box in occupied:
            ys.extend([box[3] + 4, box[1] - 4 - ph])
        for y in dict.fromkeys(ys):
            if y < top or y + ph > bottom + 1e-7:
                continue
            blocked = sorted((max(left, box[0] - 4), min(right, box[2] + 4)) for box in occupied
                if y < box[3] + 4 - 1e-7 and y + ph > box[1] - 4 + 1e-7 and box[2] + 4 > left and box[0] - 4 < right)
            cursor, gaps = left, []
            for start, end in blocked:
                if start - cursor >= pw - 1e-7:
                    gaps.append((cursor, start - pw))
                cursor = max(cursor, end)
            if right - cursor >= pw - 1e-7:
                gaps.append((cursor, right - pw))
            if gaps:
                xs = [max(start, min(end, preferred_x)) for start, end in gaps]
                x = min(xs, key=lambda value: abs(value - preferred_x))
                return x / w, y / h
        return None

    widths = [preferred_width]
    while widths[-1] > minimum_width + 1e-7:
        widths.append(max(minimum_width, widths[-1] * .9))
    for width in widths:
        height = preferred_height * width / preferred_width
        position = position_for(width, height)
        if position:
            x, y = position
            field = {"key": key, "page": page_number, "x": x, "y": y,
                "width": width, "height": height, "clear": False}
            validate_layout([field], analysis)
            return {"field": field, "placement_required": False,
                "width_points": round(width*w, 1), "height_points": round(height*h, 1),
                "note": "Size and position suggested. Review against background artwork before applying."}

    # Keep useful sizing advice even when the page has no collision-free space.
    field = {"key": key, "page": page_number, "x": max(.02, min(.98 - preferred_width, previous["x"] if previous else (.5 - preferred_width/2))),
        "y": max(.02, min(.98 - preferred_height, previous["y"] if previous else .04 if key == "logo" else .75)),
        "width": preferred_width, "height": preferred_height, "clear": False}
    validate_layout([field], analysis)
    return {"field": field, "placement_required": True,
        "width_points": round(preferred_width*w, 1), "height_points": round(preferred_height*h, 1),
        "note": "Size suggested. Choose a position on the certificate."}
