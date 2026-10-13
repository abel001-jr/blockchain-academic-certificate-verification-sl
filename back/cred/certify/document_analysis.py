"""Text and layout extraction for credential PDFs.

Text-based pages use their embedded text layer. OCR is used only for pages
whose text layer is absent or effectively empty. Results are advisory and must
be reviewed by the Registrar.
"""

from io import BytesIO
from django.conf import settings

import fitz
from PIL import Image, ImageOps
import pytesseract
from pytesseract import Output


OCR_DPI = 200
MIN_TEXT_CHARS = 20
MAX_PAGES = 50

if settings.TESSERACT_CMD:
    pytesseract.pytesseract.tesseract_cmd = settings.TESSERACT_CMD


class DocumentAnalysisError(ValueError):
    """Raised when a PDF cannot be analyzed safely or OCR is unavailable."""


def analyze_pdf(file_bytes: bytes, *, language: str = "eng", force_ocr: bool = False) -> dict:
    """Extract text and bounding boxes, falling back to Tesseract per page."""
    try:
        document = fitz.open(stream=file_bytes, filetype="pdf")
    except (fitz.FileDataError, RuntimeError) as exc:
        raise DocumentAnalysisError("The uploaded file is not a readable PDF.") from exc

    if document.page_count == 0:
        raise DocumentAnalysisError("The PDF contains no pages.")
    if document.page_count > MAX_PAGES:
        raise DocumentAnalysisError(f"PDFs may contain no more than {MAX_PAGES} pages.")

    pages = []
    try:
        for page_number, page in enumerate(document, start=1):
            words = page.get_text("words", sort=True)
            embedded_text = " ".join(word[4] for word in words).strip()

            if len(embedded_text) >= MIN_TEXT_CHARS and not force_ocr:
                pages.append({
                    "page": page_number,
                    "method": "text_layer",
                    "text": embedded_text,
                    "items": [
                        {"text": word[4], "bbox": [word[0], word[1], word[2], word[3]]}
                        for word in words
                    ],
                    "lines": [
                        {"text": "".join(span["text"] for span in line["spans"]),
                         "bbox": list(line["bbox"]),
                         "font": line["spans"][0]["font"],
                         "font_size": line["spans"][0]["size"],
                         "color": "#%06x" % line["spans"][0]["color"]}
                        for block in page.get_text("dict")["blocks"]
                        for line in block.get("lines", []) if line["spans"]
                    ],
                })
                continue

            try:
                pixmap = page.get_pixmap(dpi=OCR_DPI, alpha=False)
                image = ImageOps.autocontrast(Image.open(BytesIO(pixmap.tobytes("png"))).convert("L"))
                data = pytesseract.image_to_data(
                    image,
                    lang=language,
                    output_type=Output.DICT,
                    timeout=45,
                )
            except pytesseract.TesseractNotFoundError as exc:
                raise DocumentAnalysisError(
                    "This PDF page needs OCR, but Tesseract was not found. "
                    "Set TESSERACT_CMD to the full executable path in the backend .env "
                    "or ensure tesseract.exe is on PATH, then restart the backend."
                ) from exc
            except pytesseract.TesseractError as exc:
                raise DocumentAnalysisError(
                    f"Tesseract could not process page {page_number}: {exc}"
                ) from exc
            except RuntimeError as exc:
                raise DocumentAnalysisError(
                    f"OCR timed out on page {page_number}. Use a clearer, smaller scan and try again."
                ) from exc

            scale = 72 / OCR_DPI
            items = []
            grouped = {}
            for index, raw_text in enumerate(data["text"]):
                text = raw_text.strip()
                if not text:
                    continue
                try:
                    confidence = float(data["conf"][index])
                except (TypeError, ValueError):
                    confidence = -1
                x, y = data["left"][index], data["top"][index]
                right = x + data["width"][index]
                bottom = y + data["height"][index]
                items.append({
                    "text": text,
                    "bbox": [x * scale, y * scale, right * scale, bottom * scale],
                    "confidence": confidence,
                })
                group = tuple(data.get(key, [0] * len(data["text"]))[index] for key in ("block_num", "par_num", "line_num"))
                grouped.setdefault(group, []).append(items[-1])

            pages.append({
                "page": page_number,
                "method": "ocr",
                "text": " ".join(item["text"] for item in items),
                "items": items,
                "lines": [
                    {"text": " ".join(item["text"] for item in row),
                     "bbox": [min(i["bbox"][0] for i in row), min(i["bbox"][1] for i in row), max(i["bbox"][2] for i in row), max(i["bbox"][3] for i in row)],
                     "confidence": min(i["confidence"] for i in row)}
                    for row in grouped.values()
                ],
            })
    finally:
        document.close()

    return {
        "page_count": len(pages),
        "ocr_used": any(page["method"] == "ocr" for page in pages),
        "pages": pages,
    }
