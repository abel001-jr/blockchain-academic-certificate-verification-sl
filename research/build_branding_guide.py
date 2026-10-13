"""Build public guide examples from the supplied PDFs using the actual renderer.

Run from the repository root: python research/build_branding_guide.py
The inputs are examples, not instructions or institution records.
"""
import json
import os
from pathlib import Path
import sys
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "back" / "cred"))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "cred.settings")
import django
django.setup()
import fitz
from institutions.template_rendering import render_uploaded_template

DEST = ROOT / "front" / "app-next" / "public" / "branding-guide"
DEST.mkdir(parents=True, exist_ok=True)
live = ROOT / "research" / "CREDENCE_Certificate_Draft_Live_Text.pdf"
with fitz.open(live) as document:
    page = document[0]
    width, height = page.rect.width, page.rect.height
    fields = []
    def add(placeholder, key, size, font="Times-Roman", occurrence=0, text=None):
        box = page.search_for(placeholder)[occurrence] + (-4, -2, 4, 2)
        field = dict(key=key, page=1, x=box.x0/width, y=box.y0/height,
                     width=box.width/width, height=box.height/height,
                     font=font, font_size=size, clear=False, align="center")
        if key == "degree_title" or (key == "institution_name" and occurrence == 0):
            field["color"] = "#7D3C3C"
        if text is not None:
            field["text"] = text
        fields.append(field)
    add("[INSTITUTION NAME]", "institution_name", 28, "Times-Bold")
    add("[GRADUATE FULL NAME]", "student_name", 23, "Times-Bold")
    add("[DEGREE / AWARD TITLE]", "degree_title", 22, "Times-Italic")
    add("[PROGRAMME / FIELD OF STUDY]", "static_text", 15, text="Computer Science")
    add("[CLASSIFICATION / HONOURS]", "grade", 12, "Times-Italic")
    add("[INSTITUTION NAME]", "institution_name", 12, occurrence=1)
    add("[DAY] [MONTH]", "static_text", 12, text="12 October")
    add("[YEAR]", "graduation_year", 12)

sample = SimpleNamespace(student_name="Amina Kamara", degree_title="Bachelor of Science",
    institution=SimpleNamespace(name="Example University"), graduation_year=2026,
    department="Computer Science", grade="Second Class Honours", certificate_id="EXAMPLE-2026-001")
for variant, filename in [("live", "CREDENCE_Certificate_Draft_Live_Text.pdf"),
                          ("flattened", "CREDENCE_Certificate_Draft_Flattened.pdf")]:
    source = ROOT / "research" / filename
    clean_master = DEST / f"{variant}-draft.pdf"
    with fitz.open(source) as document:
        page = document[0]
        # Prepare the example master once, rather than erasing background each
        # time a credential is generated. Match the original cream paper color.
        color = tuple(value / 255 for value in page.get_pixmap().pixel(10, 10)[:3])
        for field in fields:
            rect = fitz.Rect(field["x"] * page.rect.width, field["y"] * page.rect.height,
                (field["x"] + field["width"]) * page.rect.width,
                (field["y"] + field["height"]) * page.rect.height)
            page.add_redact_annot(rect, fill=color)
        page.apply_redactions(images=2, graphics=1)
        assert "[" not in page.get_text()
        # Flatten the prepared flattened example into a single page image so
        # its input still represents the OCR path rather than live text.
        if variant == "flattened":
            with fitz.open() as flattened:
                target = flattened.new_page(width=page.rect.width, height=page.rect.height)
                target.insert_image(target.rect, stream=page.get_pixmap(matrix=fitz.Matrix(2, 2)).tobytes("png"))
                flattened.save(clean_master)
        else:
            document.save(clean_master, garbage=4, deflate=True)
    with fitz.open(clean_master) as document:
        page = document[0]
        page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5)).save(DEST / f"{variant}-source.png")
        analysis = {"pages": [{"width": page.rect.width, "height": page.rect.height}]}
        assert (len(page.get_text().strip()) > 0) == (variant == "live")
    revision = SimpleNamespace(master=clean_master, fields=fields, analysis=analysis)
    preview = render_uploaded_template(sample, revision, include_attestations=False)
    (DEST / f"{variant}-preview.pdf").write_bytes(preview)
    with fitz.open(stream=preview, filetype="pdf") as document:
        document[0].get_pixmap(matrix=fitz.Matrix(1.5, 1.5)).save(DEST / f"{variant}-preview.png")
        extracted = document[0].get_text()
        assert "Amina Kamara" in extracted and "2026" in extracted
        assert "[GRADUATE FULL NAME]" not in extracted
(DEST / "fields.json").write_text(json.dumps(fields, indent=2), encoding="utf-8")
print("Built clean live-text/flattened masters and unsigned previews using the production renderer.")
