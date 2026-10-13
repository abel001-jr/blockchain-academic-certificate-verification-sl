"""
diagnose_extraction.py

Print what `field_extraction` actually sees in a supplied PDF.

Extraction failures and comparison failures look identical in the UI — both render
as "not verified" — but they have nothing in common and need opposite fixes. A
document whose fields cannot be found needs better label handling or OCR; a
document whose fields are found and then disagree needs a threshold or a data
entry fix. This command separates them and shows the evidence for each.

Usage:
    python manage.py diagnose_extraction path/to/cert.pdf
    python manage.py diagnose_extraction cert.pdf --expected-name "Jane Doe"
    python manage.py diagnose_extraction cert.pdf --lines
"""

import json

from django.core.management.base import BaseCommand, CommandError

from certify.document_analysis import analyze_pdf
from certify.field_extraction import (
    DEFAULT_FIELDS,
    FIELD_LABELS,
    compare_fields,
    extract_fields,
    _lines_from_pages,
)


class Command(BaseCommand):
    help = "Show what the field extractor reads from a PDF, field by field."

    def add_arguments(self, parser):
        parser.add_argument("path", help="Path to the PDF to inspect")
        parser.add_argument(
            "--field", action="append", default=None,
            help="Limit to one field (repeatable). Default: all configured fields.",
        )
        parser.add_argument(
            "--lines", action="store_true",
            help="Also print the reconstructed lines, which is what label matching runs on.",
        )
        parser.add_argument(
            "--json", action="store_true", help="Emit the comparison result as JSON."
        )
        for field in DEFAULT_FIELDS:
            parser.add_argument(
                "--expected-%s" % field.replace("_", "-"), default="", dest="expected_%s" % field
            )

    def handle(self, *args, **options):
        path = options["path"]
        fields = tuple(options["field"]) if options["field"] else DEFAULT_FIELDS

        unknown = [f for f in fields if f not in FIELD_LABELS]
        if unknown:
            raise CommandError(
                "Unknown field(s): %s. Configured: %s" % (", ".join(unknown), ", ".join(FIELD_LABELS))
            )

        try:
            with open(path, "rb") as fh:
                data = fh.read()
        except OSError as exc:
            raise CommandError("Could not read %s: %s" % (path, exc)) from exc

        try:
            analysis = analyze_pdf(data)
        except Exception as exc:  # noqa: BLE001 - surface the analysis failure verbatim
            raise CommandError("Analysis failed: %s" % exc) from exc

        pages = analysis["pages"]

        if options["lines"]:
            self.stdout.write("--- reconstructed lines ---")
            for number, line in enumerate(_lines_from_pages(pages), start=1):
                self.stdout.write("%3d| %s" % (number, line))
            self.stdout.write("")

        self.stdout.write("--- per page ---")
        for page in pages:
            chars = len(page.get("text", ""))
            self.stdout.write(
                "  page %s  method=%s  items=%d  text_chars=%d"
                % (page.get("page"), page.get("method"), len(page.get("items", [])), chars)
            )
        self.stdout.write("")
        extracted = extract_fields(pages, fields)
        expected = {
            field: options.get("expected_%s" % field, "") or "" for field in fields
        }
        comparisons = compare_fields(expected, extracted, fields, pages=pages)

        if options["json"]:
            self.stdout.write(json.dumps(comparisons, indent=2))
            return

        self.stdout.write("--- field results ---")
        for item in comparisons:
            self.stdout.write("")
            self.stdout.write(
                "  %-16s %s" % (item["field"], item["status"].upper())
            )
            self.stdout.write("      expected : %r" % item["expected"])
            self.stdout.write("      extracted: %r" % item["extracted"])
            self.stdout.write("      score    : %s (threshold %s)" % (item["similarity"], item["threshold"]))
            if item.get("evidence") == "verbatim_text":
                self.stdout.write("      evidence : value found as text, not read from a label")
            if item["detail"]:
                self.stdout.write("      detail   : %s" % item["detail"])

        not_found = [i["field"] for i in comparisons if i["status"] == "not_found"]
        mismatch = [i["field"] for i in comparisons if i["status"] == "mismatch"]
        self.stdout.write("")
        if not_found:
            self.stdout.write(
                self.style.WARNING(
                    "Extraction produced nothing for: %s" % ", ".join(not_found)
                )
            )
            self.stdout.write(
                "  -> the document's layout does not match a label this extractor knows. "
                "Check the lines above, or `--lines`, to see what the text actually looks like."
            )
        if mismatch:
            self.stdout.write(
                self.style.WARNING(
                    "Extracted but disagreeing: %s" % ", ".join(mismatch)
                )
            )
            self.stdout.write(
                "  -> the values were found, so this is a comparison or data-entry "
                "question, not an extraction one."
            )
        if not not_found and not mismatch:
            self.stdout.write(self.style.SUCCESS("All configured fields agree."))
