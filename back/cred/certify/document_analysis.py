"""Text and layout extraction for credential PDFs.

Text-based pages use their embedded text layer. OCR is used only for pages
whose text layer is absent or effectively empty. Results are advisory and must
be reviewed by the Registrar.
"""

from io import BytesIO

import fitz
from PIL import Image
import pytesseract
from pytesseract import Output


OCR_DPI = 200
MIN_TEXT_CHARS = 20
MAX_PAGES = 50


class DocumentAnalysisError(ValueError):
    """Raised when a PDF cannot be analyzed safely or OCR is unavailable."""


def analyze_pdf(file_bytes: bytes, *, language: str = "eng") -> dict:
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

            if len(embedded_text) >= MIN_TEXT_CHARS:
                pages.append({
                    "page": page_number,
                    "method": "text_layer",
                    "text": embedded_text,
                    "items": [
                        {"text": word[4], "bbox": [word[0], word[1], word[2], word[3]]}
                        for word in words
                    ],
                })
                continue

            try:
                pixmap = page.get_pixmap(dpi=OCR_DPI, alpha=False)
                image = Image.open(BytesIO(pixmap.tobytes("png")))
                data = pytesseract.image_to_data(
                    image,
                    lang=language,
                    output_type=Output.DICT,
                )
            except pytesseract.TesseractNotFoundError as exc:
                raise DocumentAnalysisError(
                    "This PDF page needs OCR, but Tesseract was not found. "
                    "Install Tesseract OCR and ensure tesseract.exe is on PATH."
                ) from exc
            except pytesseract.TesseractError as exc:
                raise DocumentAnalysisError(
                    f"Tesseract could not process page {page_number}: {exc}"
                ) from exc

            scale = 72 / OCR_DPI
            items = []
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

            pages.append({
                "page": page_number,
                "method": "ocr",
                "text": " ".join(item["text"] for item in items),
                "items": items,
            })
    finally:
        document.close()

    return {
        "page_count": len(pages),
        "ocr_used": any(page["method"] == "ocr" for page in pages),
        "pages": pages,
    }
