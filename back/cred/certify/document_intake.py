"""Convert ordered scan pages into the PDF that will be reviewed and anchored."""
from io import BytesIO

import fitz
from PIL import Image, ImageOps, UnidentifiedImageError

MAX_BYTES = 20 * 1024 * 1024
MAX_PAGES = 50


def prepare_document(files, rotation=0, rotation_page=None):
    """Preserve PDF bytes for a single unmodified PDF; combine images/PDFs in order.

    Rotation is explicitly chosen by the Registrar. No OCR or content changes
    happen here, and every result must pass the existing document review gate.
    """
    if not files or len(files) > MAX_PAGES:
        raise ValueError("Select between 1 and 50 PDF, JPEG, or PNG files.")
    if rotation not in (0, 90, 180, 270):
        raise ValueError("Rotation must be 0, 90, 180, or 270 degrees clockwise.")
    if sum(file.size for file in files) > MAX_BYTES:
        raise ValueError("The combined document must be no larger than 20 MB.")
    with fitz.open() as result:
        original_pdf = None
        for file in files:
            raw = file.read()
            suffix = file.name.lower().rsplit(".", 1)[-1]
            try:
                if suffix == "pdf":
                    with fitz.open(stream=raw, filetype="pdf") as source:
                        if source.is_encrypted or not source.page_count:
                            raise ValueError("Use an unencrypted PDF with at least one page.")
                        if source.page_count + result.page_count > MAX_PAGES:
                            raise ValueError("A credential document may contain at most 50 pages.")
                        result.insert_pdf(source)
                    if len(files) == 1 and not rotation:
                        original_pdf = raw
                elif suffix in ("jpg", "jpeg", "png"):
                    with Image.open(BytesIO(raw)) as source:
                        if source.format not in ("JPEG", "PNG"):
                            raise ValueError("The image content must be JPEG or PNG.")
                        if source.width * source.height > 20_000_000:
                            raise ValueError("Use images with no more than 20 million pixels per page.")
                        source.load()
                        image = ImageOps.exif_transpose(source).convert("RGB")
                        width, height = image.size
                        encoded = BytesIO()
                        image.save(encoded, format="PNG")
                        # 150 pixels per inch keeps photo text legible at OCR DPI.
                        page = result.new_page(width=width * 72 / 150, height=height * 72 / 150)
                        page.insert_image(page.rect, stream=encoded.getvalue())
                else:
                    raise ValueError("Only PDF, JPEG, and PNG files are accepted.")
            except (fitz.FileDataError, RuntimeError, UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
                raise ValueError("One of the selected files is damaged or unreadable.") from exc
        if rotation_page is not None and not 1 <= rotation_page <= result.page_count:
            raise ValueError("The page to rotate must exist in the document.")
        for index, page in enumerate(result, start=1):
            if rotation_page is None or index == rotation_page:
                page.set_rotation((page.rotation + rotation) % 360)
        output = original_pdf if original_pdf is not None else result.tobytes(garbage=4, deflate=True)
    if len(output) > MAX_BYTES:
        raise ValueError("The prepared PDF exceeds 20 MB. Use smaller scans.")
    return output
