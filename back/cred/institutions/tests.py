"""Tests for the properties the review-then-seal issuance flow depends on.

The system-designed flow commits the review document's hash on-chain before any
officer approves it, and the officers are meant to be approving exactly the
bytes they were shown. That guarantee collapses if rendering is not
deterministic, so the invariance of the renderer is asserted here rather than
left to be discovered during issuance.
"""

import datetime
import hashlib
import sys
import types
from io import StringIO
from unittest import mock

from django.core.management import call_command
from django.db import IntegrityError, transaction
from django.test import SimpleTestCase, TestCase
from rest_framework.test import APIClient

from accounts.models import Role, User
from audit.models import AuditLog
from certify.models import Certificate
from institutions.models import ChainConfig, Institution
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


class ChainConfigTests(TestCase):
    """GET/PATCH /api/chain-config/ — the runtime-editable chain coordinates.

    These values used to be NEXT_PUBLIC_* build-time constants, which meant moving
    to another network required a frontend rebuild. Two properties matter most and
    are easy to get wrong: only a Super Admin may change where the whole app reads
    from, and no field may ever hold key material.
    """

    def setUp(self):
        self.client = APIClient()
        self.institution = Institution.objects.create(
            institution_id="CUSL-004", name="Northern University SL"
        )
        self.super_admin = User.objects.create_user(
            email="root@example.edu", password="pw",
            role=Role.SUPER_ADMIN, is_staff=True, is_superuser=True,
        )
        self.registrar = User.objects.create_user(
            email="reg@example.edu", password="pw",
            role=Role.REGISTRAR, institution=self.institution,
        )

    def test_it_is_created_from_settings_on_first_read(self):
        with self.settings(
            ETH_RPC_URL="http://127.0.0.1:9999",
            ETH_CHAIN_ID=11155111,
            ISSUER_REGISTRY_ADDRESS="0x" + "11" * 20,
            CERTIFICATE_REGISTRY_ADDRESS="0x" + "22" * 20,
        ):
            self.client.force_authenticate(self.registrar)
            data = self.client.get("/api/chain-config/").json()

        self.assertEqual(data["rpc_url"], "http://127.0.0.1:9999")
        self.assertEqual(data["issuer_registry_address"], "0x" + "11" * 20)
        self.assertEqual(data["certificate_registry_address"], "0x" + "22" * 20)
        self.assertEqual(data["chain_id"], 11155111)

    def test_chain_id_is_seeded_so_the_network_check_is_not_inert(self):
        # The anchor page warns on a chain mismatch by comparing against this. A null
        # seed would leave that check doing nothing on every fresh install until an
        # admin happened to open the settings form, which is the kind of gap that
        # looks like a working feature.
        with self.settings(ETH_CHAIN_ID=31337):
            self.assertEqual(ChainConfig.load().chain_id, 31337)

    def test_a_super_admin_can_change_the_coordinates(self):
        self.client.force_authenticate(self.super_admin)
        res = self.client.patch(
            "/api/chain-config/",
            {
                "chain_id": 11155111,
                "issuer_registry_address": "0x" + "ab" * 20,
                "expected_owner_address": "0x" + "cd" * 20,
            },
            format="json",
        )
        self.assertEqual(res.status_code, 200, res.content)
        config = ChainConfig.load()
        self.assertEqual(config.chain_id, 11155111)
        self.assertEqual(config.expected_owner_address, "0x" + "cd" * 20)
        self.assertEqual(config.updated_by, self.super_admin)

    def test_a_patch_is_partial_and_leaves_other_fields_alone(self):
        self.client.force_authenticate(self.super_admin)
        self.client.patch("/api/chain-config/", {"rpc_url": "http://a.example"}, format="json")
        self.client.patch("/api/chain-config/", {"chain_id": 5}, format="json")

        config = ChainConfig.load()
        self.assertEqual(config.rpc_url, "http://a.example")
        self.assertEqual(config.chain_id, 5)

    def test_a_registrar_cannot_change_it(self):
        before = ChainConfig.load().chain_id
        self.client.force_authenticate(self.registrar)
        res = self.client.patch(
            "/api/chain-config/", {"chain_id": 4}, format="json"
        )
        self.assertEqual(res.status_code, 403)
        self.assertEqual(ChainConfig.load().chain_id, before)

    def test_any_authenticated_user_can_read_it(self):
        self.client.force_authenticate(self.registrar)
        self.assertEqual(self.client.get("/api/chain-config/").status_code, 200)

    def test_anonymous_is_refused(self):
        self.assertEqual(self.client.get("/api/chain-config/").status_code, 401)

    def test_a_malformed_address_is_rejected(self):
        self.client.force_authenticate(self.super_admin)
        for bad in ["0x123", "not-an-address", "0x" + "zz" * 20, "11" * 20]:
            res = self.client.patch(
                "/api/chain-config/", {"issuer_registry_address": bad}, format="json"
            )
            self.assertEqual(res.status_code, 400, f"{bad!r} was accepted")

    def test_a_non_http_rpc_url_is_rejected(self):
        self.client.force_authenticate(self.super_admin)
        res = self.client.patch(
            "/api/chain-config/", {"rpc_url": "ws://127.0.0.1:8546"}, format="json"
        )
        self.assertEqual(res.status_code, 400)

    def test_a_blank_expected_owner_is_allowed(self):
        self.client.force_authenticate(self.super_admin)
        res = self.client.patch(
            "/api/chain-config/", {"expected_owner_address": ""}, format="json"
        )
        self.assertEqual(res.status_code, 200, res.content)

    def test_the_change_is_audited(self):
        self.client.force_authenticate(self.super_admin)
        self.client.patch("/api/chain-config/", {"chain_id": 8453}, format="json")
        self.assertTrue(
            AuditLog.objects.filter(action="chain_config.updated").exists()
        )

    def test_the_model_holds_no_key_field(self):
        """A guard, not a description: nobody should add key material here."""
        field_names = {f.name for f in ChainConfig._meta.get_fields()}
        for forbidden in ("private_key", "deployer_key", "mnemonic", "seed", "secret"):
            self.assertNotIn(forbidden, field_names)

    def test_only_one_row_can_exist(self):
        ChainConfig.load()
        # Nested atomic: without it the IntegrityError marks the surrounding
        # transaction broken and every later query fails.
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                ChainConfig.objects.create()


class ChainConfigIndexerTests(TestCase):
    """sync_chain_events must read the same row the dashboard writes.

    The indexer used to read ISSUER_REGISTRY_ADDRESS and ETH_RPC_URL straight from
    settings. Once the chain became runtime-configurable through the UI, that split
    meant re-pointing the deployment moved the signing UI and left the indexer
    polling the previous chain — still activating and deactivating institutions and
    registrars, from a chain the app no longer treated as authoritative.

    web3 is pinned against a conflicting eth-account (see requirements.txt) and may
    not import in a given environment, so a stub is injected when it is missing.
    The behaviour under test is the command's own guard, which never touches real
    web3 — skipping instead would have left the guard unverified, which is worse.
    """

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        try:
            import web3  # noqa: F401
            cls.used_stub = False
        except ImportError:
            stub = types.ModuleType("web3")
            stub.Web3 = mock.MagicMock()
            sys.modules["web3"] = stub
            cls.used_stub = True

    def setUp(self):
        config = ChainConfig.load()
        config.rpc_url = "http://127.0.0.1:8545"
        config.issuer_registry_address = "0x" + "11" * 20
        config.chain_id = 31337
        config.save()

    def _run(self):
        out, err = StringIO(), StringIO()
        call_command("sync_chain_events", stdout=out, stderr=err)
        return out.getvalue() + err.getvalue()

    def test_it_refuses_to_sync_when_the_rpc_is_on_another_chain(self):
        fake_contract = mock.MagicMock()
        with mock.patch("web3.Web3") as w3_cls:
            w3_cls.return_value.is_connected.return_value = True
            w3_cls.return_value.eth.chain_id = 1  # mainnet, not the configured 31337
            w3_cls.return_value.eth.contract.return_value = fake_contract
            output = self._run()

        self.assertIn("Chain mismatch", output)
        # The point is that nothing was written, not merely that a message appeared.
        fake_contract.events.IssuerRegistered.get_logs.assert_not_called()
        fake_contract.events.RegistrarAuthorized.get_logs.assert_not_called()

    def test_it_proceeds_when_the_chain_matches(self):
        fake_contract = mock.MagicMock()
        for event in (
            "IssuerRegistered",
            "IssuerRevoked",
            "RegistrarAuthorized",
            "RegistrarRevoked",
        ):
            getattr(fake_contract.events, event).get_logs.return_value = []

        with mock.patch("web3.Web3") as w3_cls:
            w3_cls.return_value.is_connected.return_value = True
            w3_cls.return_value.eth.chain_id = 31337
            w3_cls.return_value.eth.block_number = 100
            w3_cls.return_value.eth.contract.return_value = fake_contract
            output = self._run()

        self.assertIn("Connected to chain 31337", output)
        self.assertNotIn("Chain mismatch", output)
        fake_contract.events.IssuerRegistered.get_logs.assert_called()

    def test_it_warns_rather_than_guessing_when_no_chain_id_is_configured(self):
        config = ChainConfig.load()
        config.chain_id = None
        config.save()

        fake_contract = mock.MagicMock()
        for event in (
            "IssuerRegistered",
            "IssuerRevoked",
            "RegistrarAuthorized",
            "RegistrarRevoked",
        ):
            getattr(fake_contract.events, event).get_logs.return_value = []

        with mock.patch("web3.Web3") as w3_cls:
            w3_cls.return_value.is_connected.return_value = True
            w3_cls.return_value.eth.block_number = 100
            w3_cls.return_value.eth.contract.return_value = fake_contract
            output = self._run()

        self.assertIn("no expected chain id", output)
        fake_contract.events.IssuerRegistered.get_logs.assert_called()
        self.assertEqual(ChainConfig.objects.count(), 1)
