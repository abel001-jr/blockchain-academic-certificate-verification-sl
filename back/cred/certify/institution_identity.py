"""Conservative visual reference comparison; never an authenticity verdict."""
from io import BytesIO
import base64
import pymupdf as fitz
from PIL import Image, ImageChops, ImageStat, ImageOps, ImageFilter
import math
from .vision_comparison import compare_images


def normalized(image):
    image = image.convert("RGBA")
    background = Image.new("RGBA", image.size, "white")
    background.alpha_composite(image)
    rgb = background.convert("RGB")
    bounds = ImageChops.difference(rgb, Image.new("RGB", rgb.size, "white")).getbbox()
    if not bounds:
        raise ValueError("Blank reference image")
    rgb = rgb.crop(bounds)
    return rgb.resize((96, 96)), rgb.width / rgb.height


def compare_reference(reference_bytes, candidates):
    reference, ratio = normalized(Image.open(BytesIO(reference_bytes)))
    best = None
    for page, image in candidates:
        try:
            candidate, candidate_ratio = normalized(image)
            if abs(candidate_ratio / ratio - 1) > .08:
                continue
            difference = sum(ImageStat.Stat(ImageChops.difference(reference, candidate)).mean) / (3 * 255)
            if difference <= .025 and (best is None or difference < best[0]):
                best = (difference, page)
        except (ValueError, OSError):
            continue
    return best


def prepare_shape(image):
    """Preserve aspect ratio; suppress pale backgrounds and scan noise."""
    rgba = image.convert("RGBA")
    white = Image.new("RGBA", rgba.size, "white")
    white.alpha_composite(rgba)
    grey = ImageOps.grayscale(white.convert("RGB"))
    grey.thumbnail((800, 800))
    grey = ImageOps.autocontrast(grey, cutoff=1)
    ink = ImageOps.invert(grey)
    bounds = ink.point(lambda value: 255 if value > 60 else 0).getbbox()
    if not bounds:
        raise ValueError("No usable visual content")
    ink = ink.crop(bounds)
    if ink.width < 12 or ink.height < 12:
        raise ValueError("Image has insufficient resolution")
    scale = 112 / max(ink.size)
    ink = ink.resize((max(1, round(ink.width * scale)), max(1, round(ink.height * scale))), Image.Resampling.LANCZOS)
    canvas = Image.new("L", (128, 128), 0)
    canvas.paste(ink, ((128 - ink.width) // 2, (128 - ink.height) // 2))
    return canvas.filter(ImageFilter.GaussianBlur(1.5))


def compare_crop(reference_bytes, crop):
    reference = prepare_shape(Image.open(BytesIO(reference_bytes)))
    candidate = prepare_shape(crop)
    reference_values = list(reference.getdata())
    reference_energy = sum(value * value for value in reference_values)
    best = 0
    for angle in (-10, -5, 0, 5, 10):
        rotated = candidate.rotate(angle, resample=Image.Resampling.BICUBIC)
        for dx, dy in ((0, 0), (-2, 0), (2, 0), (0, -2), (0, 2)):
            shifted = Image.new("L", rotated.size)
            shifted.paste(rotated, (dx, dy))
            values = list(shifted.getdata())
            denominator = math.sqrt(reference_energy * sum(value * value for value in values))
            if denominator:
                best = max(best, sum(a * b for a, b in zip(reference_values, values)) / denominator)
    return round(best * 100, 1)


def preview_data(image):
    image = image.convert("RGB")
    image.thumbnail((320, 240))
    buffer = BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


def isolate_rendered_signature(image):
    """Select the largest substantial ink band above the officer title."""
    rgb = image.convert("RGB")
    grey = ImageOps.grayscale(rgb)
    width, height = grey.size
    rows = []
    for y in range(height):
        count = sum(grey.getpixel((x, y)) < 170 for x in range(width))
        # Ignore full-width rules and borders, rather than scoring them as strokes.
        if count > width * .65:
            for x in range(width):
                rgb.putpixel((x, y), (255, 255, 255))
            count = 0
        rows.append(count > 1)
    bands = []
    start = None
    for y, occupied in enumerate(rows + [False]):
        if occupied and start is None:
            start = y
        elif not occupied and start is not None:
            if y - start >= 8:
                bands.append((start, y))
            start = None
    if not bands:
        return None
    top, bottom = max(bands, key=lambda band: band[1] - band[0])
    selected = rgb.crop((0, max(0, top - 2), width, min(height, bottom + 2)))
    bounds = ImageOps.invert(ImageOps.grayscale(selected)).point(lambda value: 255 if value > 60 else 0).getbbox()
    return selected.crop(bounds) if bounds else None


def document_regions(document):
    """Show actual document pixels. Region proposals are explicitly unconfirmed."""
    page = document[0]
    width, height = page.rect.width, page.rect.height
    regions = {}
    for page_number, page in enumerate(document, 1):
        width, height = page.rect.width, page.rect.height
        for label, terms in [("Registrar signature", ["Registrar"]),
                             ("Vice-Chancellor signature", ["Vice-Chancellor", "Vice Chancellor"]),
                             ("Chancellor signature", ["Chancellor"])]:
            hits = [rect for term in terms for rect in page.search_for(term) if rect.y0 > 0]
            if label == "Chancellor signature":
                hits = [rect for rect in hits if not any(rect.intersects(vc) for term in ["Vice-Chancellor", "Vice Chancellor"] for vc in page.search_for(term))]
            if hits and not regions.get(label, {}).get("comparison_image"):
                rect = hits[-1]
                region = fitz.Rect(max(0, rect.x0 - 35), max(0, rect.y0 - 65), min(width, rect.x1 + 35), min(height, rect.y1 + 5))
                pixmap = page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5), clip=region, alpha=False)
                regions[label] = {"document_image": preview_data(Image.open(BytesIO(pixmap.tobytes("png")))),
                                  "document_image_label": "Officer title retained for role identification", "document_page": page_number}
                signing_lines = []
                center = (rect.x0 + rect.x1) / 2
                for drawing in page.get_drawings():
                    for item in drawing["items"]:
                        if item[0] == "l":
                            start, end = item[1:3]
                            if abs(start.y - end.y) < 2 and abs(end.x - start.x) > 35 and min(start.x, end.x) <= center <= max(start.x, end.x) and 0 < rect.y0 - start.y < 45:
                                signing_lines.append(start.y)
                signing_y = max(signing_lines) if signing_lines else rect.y0 - 7
                # Limit comparison to the nearest graphic above this officer's title.
                # Do not compare an image from another officer or a full scanned page.
                candidates = []
                for entry in page.get_image_info():
                    box = fitz.Rect(entry["bbox"])
                    if box.width > 12 and box.height > 5 and box.width / box.height > 1.2 and box.y1 <= signing_y + 1 and rect.y0 - box.y1 < 55 and abs((box.x0 + box.x1) / 2 - (rect.x0 + rect.x1) / 2) < 75 and box.height < 80:
                        candidates.append(box)
                if candidates:
                    box = min(candidates, key=lambda box: rect.y0 - box.y1)
                    signature_pixmap = page.get_pixmap(matrix=fitz.Matrix(3, 3), clip=box, alpha=False)
                    regions[label]["comparison_image"] = preview_data(Image.open(BytesIO(signature_pixmap.tobytes("png"))))
                    regions[label]["signature_extraction"] = "Embedded graphic located above officer title; surrounding text excluded"
                else:
                    # Rasterize only the area immediately above the title; this also
                    # works when signatures are drawn as vectors rather than images.
                    band = fitz.Rect(max(0, (rect.x0 + rect.x1) / 2 - 90), max(0, signing_y - 45), min(width, (rect.x0 + rect.x1) / 2 + 90), max(0, signing_y - 2))
                    rendered = page.get_pixmap(matrix=fitz.Matrix(3, 3), clip=band, alpha=False)
                    isolated = isolate_rendered_signature(Image.open(BytesIO(rendered.tobytes("png"))))
                    if isolated:
                        regions[label]["comparison_image"] = preview_data(isolated)
                        regions[label]["signature_extraction"] = "Rendered stroke region above officer title; horizontal rules and separate upper text bands excluded. Confirm the isolated region."
                    else:
                        regions[label]["signature_extraction"] = "No usable signature strokes located above the officer title; manual review required"
    return regions


def locate_identity_image(document, reference_bytes):
    """Rank discrete artwork across all pages; never treat a page corner as an asset."""
    best = None
    reference = Image.open(BytesIO(reference_bytes))
    ratio = reference.width / reference.height
    for page_number, page in enumerate(document, 1):
        for entry in page.get_image_info():
            box = fitz.Rect(entry["bbox"])
            if (box.width < 12 or box.height < 12
                    or box.get_area() > page.rect.get_area() * .25
                    or not page.rect.contains(box)
                    or not .65 < (box.width / box.height) / ratio < 1.5):
                continue
            pixmap = page.get_pixmap(matrix=fitz.Matrix(3, 3), clip=box, alpha=False)
            crop = Image.open(BytesIO(pixmap.tobytes("png")))
            try:
                score = compare_crop(reference_bytes, crop)
            except ValueError:
                continue
            if best is None or score > best[0]:
                best = (score, {"document_image": preview_data(crop),
                               "similarity_score": score,
                               "document_image_label": "Located document artwork (confirm identification)",
                               "document_page": page_number})
    return best[1] if best else {}


def institutional_identity(pdf_bytes, cert, document_kind="certificate", *, use_external_ai=False):
    with fitz.open(stream=pdf_bytes, filetype="pdf") as document:
        regions = document_regions(document)
    template = getattr(cert.institution, "certificate_template", None)
    revision = cert.template_revision
    logo = (revision.logo if revision and revision.logo else None) or cert.institution.reference_logo
    seal = (revision.seal if revision and revision.seal else None) or cert.institution.reference_seal
    # Legacy template assets remain usable when no general reference was saved.
    active_revision = template.active_revision if template else None
    logo = logo or (active_revision.logo if active_revision and active_revision.logo else (template.logo if template else None))
    seal = seal or (active_revision.seal if active_revision else None)
    if document_kind == "transcript":
        seal = cert.institution.reference_transcript_seal
    seal_label = "Transcript seal (blind/embossed)" if document_kind == "transcript" else "Certificate seal (gold)"
    assets = [("logo", "Institution logo", logo), ("seal", seal_label, seal)]
    for role, label, field in [("registrar", "Registrar signature", "registrar_signature_image"),
                               ("vc", "Vice-Chancellor signature", "vc_signature_image"),
                               ("chancellor", "Chancellor signature", "chancellor_signature_image")]:
        asset = getattr(cert, field)
        if not asset:
            officers = list(cert.institution.users.filter(role=role, is_active=True).exclude(signature_image="")[:2])
            asset = officers[0].signature_image if len(officers) == 1 else None
        assets.append(("signatures", label, asset))
    results = []
    for category, label, asset in assets:
        result = {"category": category, "label": label, "status": "reference_missing", "detail": "No unique stored reference is available. Check this item manually."}
        if asset:
            result.update(status="manual_review", reference_url=asset.url, detail="No close embedded-image match found. This may be a scan, vector artwork, or a changed image. Inspect the document manually.")
            try:
                if category == "signatures":
                    region = regions.get(label, {})
                    result.update(detail=region.get("signature_extraction", "No officer signature region located. Manual review required."))
                    if region.get("comparison_image"):
                        crop = Image.open(BytesIO(base64.b64decode(region["comparison_image"].split(",", 1)[1])))
                        with asset.open("rb") as source:
                            reference_bytes = source.read()
                        exact = compare_reference(reference_bytes, [(1, crop)])
                        score = compare_crop(reference_bytes, crop)
                        state = "signature_visual_match" if exact or score >= 90 else "signature_possible_difference" if score < 65 else "manual_review"
                        result.update(status=state, similarity_score=score, comparison_method="Officer-associated graphic: pixel and aligned stroke shape comparison", detail="Compared only the signature graphic associated with this officer title. Nearby text and signing lines are excluded. This indicates appearance similarity, not proof of authorship or on-chain approval.")
                else:
                    with asset.open("rb") as source:
                        reference_bytes = source.read()
                    with fitz.open(stream=pdf_bytes, filetype="pdf") as document:
                        region = locate_identity_image(document, reference_bytes)
                    regions[category] = region
                    result["detail"] = "No discrete logo or seal image could be located. For scans or vector artwork, identify the correct region manually; no corner crop was scored."
                    if region.get("document_image"):
                        score = region["similarity_score"]
                        if use_external_ai:
                            result["vision"] = compare_images(region["document_image"], preview_data(Image.open(BytesIO(reference_bytes))), category)
                        state = "likely_visual_match" if score >= 90 else "possible_difference" if score < 65 else "manual_review"
                        result.update(status=state, similarity_score=score, comparison_method="Aligned grayscale shape similarity", detail="Compared the displayed document crop with the stored reference. Score measures visual shape similarity, not authenticity; thresholds are provisional and require registrar confirmation.")
            except (OSError, ValueError):
                result.update(status="reference_unavailable", detail="Stored reference could not be read. Manual review is required.")
        result.update(regions.get(category if category != "signatures" else label, {}))
        results.append(result)
    return {"version": 8, "document_kind": document_kind, "method": "Document crop shape comparison", "items": results}
