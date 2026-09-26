"""Tests for the properties the review-then-seal issuance flow depends on.

The system-designed flow commits the review document's hash on-chain before any
officer approves it, and the officers are meant to be approving exactly the
bytes they were shown. That guarantee collapses if rendering is not
deterministic, so the invariance of the renderer is asserted here rather than
left to be discovered during issuance.
"""

import datetime
import hashlib

from django.test import SimpleTestCase

from certify.models import Certificate
from institutions.models import Institution
from institutions.pdf_certificate import generate_certificate_pdf


def _certificate(**overrides):
    """An unsaved certificate with its institution relation populated."""
    cert = Certificate(
        certificate_id="CR-2026-CUSL-0001",
        student_name="Ada Lovelace",
        student_email="ada@example.edu",
        degree_title="BSc Computer Science",
        department="Computing",
        graduation_year=2026,
        grade="First Class",
        branding_preset="classic_navy",
        institution_id=1,
    )
    cert._state.fields_cache["institution"] = Institution(
        id=1, name="Central University SL"
    )
    for key, value in overrides.items():
        setattr(cert, key, value)
    return cert


def _sha(data):
    return hashlib.sha256(data).hexdigest()


class ReviewDocumentInvarianceTests(SimpleTestCase):
    """The review document must hash identically every time it is rendered."""

    def test_review_document_is_byte_stable_across_renders(self):
        first = generate_certificate_pdf(_certificate(), include_attestations=False)
        second = generate_certificate_pdf(_certificate(), include_attestations=False)
        self.assertEqual(
            _sha(first),
            _sha(second),
            "Review document hash is not reproducible. ReportLab must be built "
            "with invariant=1, otherwise the hash committed on-chain can never "
            "be reproduced and officer approval no longer refers to fixed bytes.",
        )

    def test_sealed_document_is_byte_stable_across_renders(self):
        first = generate_certificate_pdf(_certificate(), include_attestations=True)
        second = generate_certificate_pdf(_certificate(), include_attestations=True)
        self.assertEqual(_sha(first), _sha(second))

    def test_issued_document_differs_from_review_document(self):
        review = generate_certificate_pdf(_certificate(), include_attestations=False)
        sealed = generate_certificate_pdf(_certificate(), include_attestations=True)
        self.assertNotEqual(
            _sha(review),
            _sha(sealed),
            "The issued document must differ from the review copy. Equal hashes "
            "would mean the signature block was never added.",
        )

    def test_issued_document_reflects_approval_state(self):
        unsigned = generate_certificate_pdf(_certificate(), include_attestations=True)
        approved = generate_certificate_pdf(
            _certificate(registrar_signed_at=datetime.datetime(2026, 1, 2, 3, 4, 5)),
            include_attestations=True,
        )
        self.assertNotEqual(
            _sha(unsigned),
            _sha(approved),
            "Approval state must be reflected in the issued document, otherwise "
            "the seal cannot be distinguished from an unapproved rendering.",
        )

    def test_review_document_omits_approval_state(self):
        """The review copy must not shift when approval fields change.

        This is what keeps the review hash stable: if it tracked approval state
        the document could not be rendered until the approvals it is supposed to
        precede had already happened.
        """
        baseline = generate_certificate_pdf(_certificate(), include_attestations=False)
        after_approval = generate_certificate_pdf(
            _certificate(
                registrar_signed_at=datetime.datetime(2026, 1, 2, 3, 4, 5),
                vc_approved_at=datetime.datetime(2026, 1, 3, 3, 4, 5),
                chancellor_approved_at=datetime.datetime(2026, 1, 4, 3, 4, 5),
                vc_approver_name="Prof VC",
                chancellor_approver_name="Prof Dean",
                vc_approval_tx_hash="0x" + "a" * 64,
                chancellor_approval_tx_hash="0x" + "b" * 64,
            ),
            include_attestations=False,
        )
        self.assertEqual(
            _sha(baseline),
            _sha(after_approval),
            "Review document must not depend on approval state.",
        )

    def test_content_changes_still_change_the_review_hash(self):
        """Determinism must not have flattened real content differences."""
        first = _sha(generate_certificate_pdf(_certificate(), include_attestations=False))
        second = _sha(
            generate_certificate_pdf(
                _certificate(student_name="Grace Hopper"), include_attestations=False
            )
        )
        self.assertNotEqual(first, second)
