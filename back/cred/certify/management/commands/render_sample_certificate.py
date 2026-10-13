"""
render_sample_certificate.py

Write a certificate PDF rendered by our own ReportLab code, for testing the
PyMuPDF text extractor against text that needs no OCR.

Why this exists: the only real certificates available during development were
scans that required OCR and came with a watermark, so tuning the extractor
against them would have baked in layout assumptions that nobody had agreed to.
A system-generated certificate is the other end of the range — vector text, no
OCR, and field values known exactly, so anything the extractor gets wrong is a
fault in the extraction logic rather than in the input.

That makes it a clean test of one specific thing: whether the extractor can
find labelled fields in a document whose layout we know, and how it handles the
three signature blocks that share a baseline. It is not evidence about scanned
documents.

Usage:
    python manage.py render_sample_certificate
    python manage.py render_sample_certificate --variant both
    python manage.py render_sample_certificate path/to/out.pdf --variant issued

Then inspect the result:
    python manage.py diagnose_extraction <path> --lines \
        --expected-student-name "Amara Sesay"
"""

import os
import tempfile
from datetime import datetime

from django.core.management.base import BaseCommand, CommandError

from certify.models import Certificate
from institutions.models import Institution
from institutions.pdf_certificate import generate_certificate_pdf

# Deliberately awkward values: a two-word name, a compound surname, a long
# multi-word degree title and a department that is not a prefix of the degree.
# Easy inputs would not tell us whether the extractor is working.
SAMPLE = {
    "certificate_id": "CR-2026-CUSL-9001",
    "student_name": "Amara Sesay",
    "degree_title": "Bachelor of Science in Computer Science",
    "qualification_type": "bachelors",
    "department": "Computer Science and Engineering",
    "graduation_year": 2026,
    "grade": "First Class Honours",
    "branding_preset": "classic_navy",
    "institution_id": "CUSL-01",
    "institution_name": "Cavendish University Sierra Leone",
    "registrar_signer_name": "Adaeze Kamara",
    "vc_approver_name": "Josephus K. Yumpha",
    "chancellor_approver_name": "Elizabeth K. Conteh",
    "registrar_signed_at": datetime(2026, 7, 14, 9, 30),
    "vc_approved_at": datetime(2026, 7, 15, 11, 5),
    "chancellor_approved_at": datetime(2026, 7, 16, 15, 45),
    "vc_approval_tx_hash": "0x" + "a1" * 32,
    "chancellor_approval_tx_hash": "0x" + "b2" * 32,
}


def build_sample_certificate():
    """An unsaved Certificate carrying the sample values.

    Deliberately built from the real model rather than a stub, so that a
    renderer attribute which the model does not actually have fails loudly
    here instead of only failing in production. Nothing is written to the
    database: the renderer only reads attributes.
    """
    institution = Institution(
        institution_id=SAMPLE["institution_id"],
        name=SAMPLE["institution_name"],
        short_name="Cavendish",
    )
    return Certificate(
        certificate_id=SAMPLE["certificate_id"],
        institution=institution,
        student_name=SAMPLE["student_name"],
        student_email="amara.sesay@example.com",
        degree_title=SAMPLE["degree_title"],
        qualification_type=SAMPLE["qualification_type"],
        department=SAMPLE["department"],
        graduation_year=SAMPLE["graduation_year"],
        grade=SAMPLE["grade"],
        branding_preset=SAMPLE["branding_preset"],
        registrar_signer_name=SAMPLE["registrar_signer_name"],
        registrar_signed_at=SAMPLE["registrar_signed_at"],
        vc_approver_name=SAMPLE["vc_approver_name"],
        vc_approved_at=SAMPLE["vc_approved_at"],
        vc_approval_tx_hash=SAMPLE["vc_approval_tx_hash"],
        chancellor_approver_name=SAMPLE["chancellor_approver_name"],
        chancellor_approved_at=SAMPLE["chancellor_approved_at"],
        chancellor_approval_tx_hash=SAMPLE["chancellor_approval_tx_hash"],
    )


class Command(BaseCommand):
    help = "Render a sample certificate PDF for testing text extraction (no OCR)."

    def add_arguments(self, parser):
        parser.add_argument(
            "path",
            nargs="?",
            default="",
            help="Output path. Defaults to a stable directory in the system temp dir.",
        )
        parser.add_argument(
            "--variant",
            choices=["review", "issued", "both"],
            default="both",
            help=(
                "review = include_attestations False (the copy officers see). "
                "issued = include_attestations True. Default: both."
            ),
        )
        parser.add_argument(
            "--verification-base-url",
            default="http://localhost:3000",
            help="Base URL baked into the QR code.",
        )

    def _target(self, path, variant):
        if path:
            return path
        directory = os.path.join(tempfile.gettempdir(), "credence-sample-certificates")
        return os.path.join(directory, f"sample-certificate-{variant}.pdf")

    def handle(self, *args, **options):
        certificate = build_sample_certificate()
        variants = (
            ["review", "issued"] if options["variant"] == "both" else [options["variant"]]
        )
        written = []

        for variant in variants:
            data = generate_certificate_pdf(
                certificate,
                template=None,  # falls back to certificate.branding_preset
                verification_base_url=options["verification_base_url"],
                include_attestations=(variant == "issued"),
            )
            target = self._target(options["path"], variant)
            parent = os.path.dirname(os.path.abspath(target))
            try:
                os.makedirs(parent, exist_ok=True)
                with open(target, "wb") as handle:
                    handle.write(data)
            except OSError as exc:
                raise CommandError("Could not write %s: %s" % (target, exc)) from exc
            written.append((variant, target, len(data)))

        self.stdout.write(
            self.style.SUCCESS("Rendered %d sample certificate(s)." % len(written))
        )
        for variant, target, size in written:
            self.stdout.write("  %-7s %s  (%d bytes)" % (variant, target, size))

        self.stdout.write("")
        self.stdout.write("Known values, for --expected-* on diagnose_extraction:")
        for key in (
            "student_name",
            "degree_title",
            "department",
            "grade",
            "graduation_year",
        ):
            self.stdout.write("  %-17s %s" % (key, SAMPLE[key]))
        self.stdout.write("  %-17s %s" % ("institution", SAMPLE["institution_name"]))

        review = next((t for v, t, _ in written if v == "review"), None)
        if review:
            self.stdout.write("")
            self.stdout.write("Inspect the review copy:")
            self.stdout.write(
                '  python manage.py diagnose_extraction "%s" --lines' % review
            )