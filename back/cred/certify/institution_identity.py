"""Conservative visual reference comparison; never an authenticity verdict."""
from io import BytesIO
import base64
import fitz
from PIL import Image, ImageChops, ImageStat


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


def preview_data(image):
    image = image.convert("RGB")
    image.thumbnail((320, 240))
    buffer = BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


def document_regions(document):
    """Show actual document pixels. Region proposals are explicitly unconfirmed."""
    page = document[0]
    width, height = page.rect.width, page.rect.height
    regions = {}
    for category, left, right in [("logo", 0, .27), ("seal", .73, 1)]:
        region = fitz.Rect(width * left, 0, width * right, height * .27)
        # Prefer a discrete image in the header over an entire corner crop.
        images = [entry for entry in page.get_image_info() if region.contains(fitz.Rect(entry["bbox"]))
                  and fitz.Rect(entry["bbox"]).width > 12 and fitz.Rect(entry["bbox"]).height > 12]
        if images:
            region = fitz.Rect(max(images, key=lambda entry: fitz.Rect(entry["bbox"]).get_area())["bbox"])
        pixmap = page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5), clip=region, alpha=False)
        regions[category] = {"document_image": preview_data(Image.open(BytesIO(pixmap.tobytes("png")))),
                             "document_image_label": "Document header region (confirm identification)", "document_page": 1}
    for label, terms in [("Registrar signature", ["Registrar"]),
                         ("Vice-Chancellor signature", ["Vice-Chancellor", "Vice Chancellor"]),
                         ("Chancellor signature", ["Chancellor"])]:
        hits = [rect for term in terms for rect in page.search_for(term) if rect.y0 > height * .45]
        if label == "Chancellor signature":
            hits = [rect for rect in hits if not any(rect.intersects(vc) for term in ["Vice-Chancellor", "Vice Chancellor"] for vc in page.search_for(term))]
        if hits:
            rect = hits[-1]
            region = fitz.Rect(max(0, rect.x0 - 35), max(0, rect.y0 - 65), min(width, rect.x1 + 35), min(height, rect.y1 + 5))
            pixmap = page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5), clip=region, alpha=False)
            regions[label] = {"document_image": preview_data(Image.open(BytesIO(pixmap.tobytes("png")))),
                              "document_image_label": "Region above officer title (confirm signature)", "document_page": 1}
    return regions


def institutional_identity(pdf_bytes, cert):
    candidates = []
    with fitz.open(stream=pdf_bytes, filetype="pdf") as document:
        regions = document_regions(document)
        seen = set()
        for number, page in enumerate(document, 1):
            for item in page.get_images(full=True):
                xref = item[0]
                if xref in seen or len(seen) >= 150:
                    continue
                seen.add(xref)
                try:
                    data = document.extract_image(xref)["image"]
                    image = Image.open(BytesIO(data))
                    if image.width * image.height <= 12_000_000:
                        candidates.append((number, image.copy()))
                except (ValueError, OSError, KeyError):
                    continue
    template = getattr(cert.institution, "certificate_template", None)
    revision = cert.template_revision or (template.active_revision if template else None)
    assets = [("logo", "Institution logo", (revision.logo if revision and revision.logo else (template.logo if template else None))),
              ("seal", "Institution seal", revision.seal if revision else None)]
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
                with asset.open("rb") as source:
                    match = compare_reference(source.read(), candidates)
                if match:
                    result.update(status="visual_match", page=match[1], detail=f"Close visual match to the stored reference on page {match[1]}. This does not prove authenticity or a valid signature.")
            except (OSError, ValueError):
                result.update(status="reference_unavailable", detail="Stored reference could not be read. Manual review is required.")
        result.update(regions.get(category if category != "signatures" else label, {}))
        results.append(result)
    return {"method": "Embedded image comparison", "items": results}
