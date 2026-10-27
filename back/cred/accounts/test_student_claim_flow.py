from unittest.mock import patch

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User, Role
from certify.models import Certificate, StudentInviteToken
from institutions.models import Institution


class StudentClaimFlowTests(TestCase):
    def setUp(self):
        institution = Institution.objects.create(institution_id="CLAIM", name="Claim Institute")
        self.student = User.objects.create_user(email="student@claim.test", role=Role.STUDENT)
        self.cert = Certificate.objects.create(
            certificate_id="CLAIM-1", institution=institution, student=self.student,
            student_name="Student", degree_title="BSc", graduation_year=2026, status="issued",
        )
        self.invite, self.raw = StudentInviteToken.create_for_certificate(self.cert)
        self.client = APIClient()

    def claim(self, token=None):
        return self.client.post("/api/auth/student-invite/claim/", {"token": self.raw if token is None else token}, format="json")

    def test_claim_grants_owner_access_and_cannot_be_reused(self):
        response = self.claim()
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["certificate_id"], self.cert.certificate_id)
        self.client.credentials(HTTP_AUTHORIZATION="Bearer " + response.data["access"])
        credentials = self.client.get("/api/my-certificates/")
        self.assertEqual(credentials.status_code, 200)
        records = credentials.data if isinstance(credentials.data, list) else credentials.data["results"]
        self.assertIn(self.cert.certificate_id, [record["certificate_id"] for record in records])
        self.assertEqual(self.claim().status_code, 403)

    def test_expired_and_malformed_invites_do_not_consume_token(self):
        for value in [123, ["token"], {"token": "value"}, ""]:
            self.assertEqual(self.claim(value).status_code, 400)
        StudentInviteToken.objects.filter(pk=self.invite.pk).update(expires_at=timezone.now())
        self.assertEqual(self.claim().status_code, 403)
        self.invite.refresh_from_db()
        self.assertFalse(self.invite.used)

    def test_claim_session_can_be_refreshed(self):
        claimed = self.claim()
        refreshed = self.client.post("/api/auth/refresh/", {"refresh": claimed.data["refresh"]}, format="json")
        self.assertEqual(refreshed.status_code, 200)
        self.client.credentials(HTTP_AUTHORIZATION="Bearer " + refreshed.data["access"])
        self.assertEqual(self.client.get("/api/my-certificates/").status_code, 200)

    @override_settings(HCAPTCHA_ENABLED=False)
    @patch("verification.integrity.verify_record")
    def test_public_verification_distinguishes_issued_revoked_and_missing(self, verify):
        verify.return_value = {"verification_outcome": "valid", "checks": {}}
        url = f"/api/verify/{self.cert.certificate_id}/"
        issued = self.client.get(url)
        self.assertEqual(issued.status_code, 200)
        self.assertEqual(issued.data["verification_outcome"], "valid")
        self.cert.status = "revoked"
        self.cert.save(update_fields=["status"])
        verify.return_value = {"verification_outcome": "revoked", "checks": {}}
        self.assertEqual(self.client.get(url).data["verification_outcome"], "revoked")
        with patch("verification.integrity.read_chain_record", return_value={"exists": False}):
            missing = self.client.get("/api/verify/DOES-NOT-EXIST/")
        self.assertEqual(missing.status_code, 404)
        self.assertEqual(missing.data["verification_outcome"], "not_found")

    @patch("accounts.student_invite_views.issue_full_tokens", side_effect=RuntimeError("token service failed"))
    def test_server_failure_rolls_back_consumption(self, _issue):
        with self.assertRaises(RuntimeError):
            self.claim()
        self.invite.refresh_from_db()
        self.assertFalse(self.invite.used)
