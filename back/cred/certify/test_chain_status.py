from unittest.mock import patch
from django.test import TestCase
from rest_framework.test import APIClient
from accounts.models import User, Role
from institutions.models import Institution
from .models import Certificate
from verification.integrity import VerificationUnavailable

class ChainStatusTests(TestCase):
    def setUp(self):
        self.institution = Institution.objects.create(institution_id="RECOVERY", name="Recovery University")
        self.user = User.objects.create_user(email="registrar@recovery.test", role=Role.REGISTRAR, institution=self.institution)
        self.cert = Certificate.objects.create(certificate_id="RECOVERY-1", institution=self.institution, student_name="Student", degree_title="BSc", graduation_year=2026, status="pending_vc", tx_hash="0x" + "1" * 64,
            chain_config_snapshot={"rpc_url": "http://saved-rpc.test", "chain_id": 31337, "certificate_registry_address": "0x" + "2" * 40})
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.url = f"/api/certificates/{self.cert.pk}/chain-status/"

    @patch("certify.chain_status_views.read_chain_record", return_value={"exists": False, "chain_id": 31337, "block_number": 6})
    def test_missing_chain_record_checks_saved_deployment_without_changing_database(self, read):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["exists"])
        self.assertEqual(read.call_args.kwargs["config"].rpc_url, "http://saved-rpc.test")
        self.cert.refresh_from_db()
        self.assertEqual(self.cert.tx_hash, "0x" + "1" * 64)
        self.assertEqual(response["Cache-Control"], "private, no-store")

    @patch("certify.chain_status_views.read_chain_record", side_effect=VerificationUnavailable("Blockchain unavailable"))
    def test_rpc_outage_does_not_claim_record_is_missing(self, read):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 503)
        self.assertNotIn("exists", response.data)

    @patch("certify.chain_status_views.read_chain_record")
    def test_other_institution_cannot_inspect_record(self, read):
        other = Institution.objects.create(institution_id="OTHER-RECOVERY", name="Other")
        self.user.institution = other
        self.user.save(update_fields=["institution"])
        self.assertEqual(self.client.get(self.url).status_code, 404)
        read.assert_not_called()

    @patch("certify.views.notify_officer_pending_attestation")
    def test_new_submission_confirmation_clears_prior_chain_approvals(self, notify):
        from django.utils import timezone
        self.cert.vc_approved_at = timezone.now()
        self.cert.vc_approval_tx_hash = "0x" + "3" * 64
        self.cert.chancellor_approved_at = timezone.now()
        self.cert.chancellor_approval_tx_hash = "0x" + "4" * 64
        self.cert.save()
        response = self.client.post(f"/api/certificates/{self.cert.pk}/confirm-chain/", {"tx_hash": "0x" + "5" * 64, "block_number": 7}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.cert.refresh_from_db()
        self.assertEqual(self.cert.tx_hash, "0x" + "5" * 64)
        self.assertIsNone(self.cert.vc_approved_at)
        self.assertIsNone(self.cert.chancellor_approved_at)
        self.assertEqual(self.cert.status, "pending_vc")
