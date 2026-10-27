from unittest.mock import patch

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User, Role
from accounts.tokens import issue_full_tokens, issue_setup_tokens
from certify.models import Certificate
from institutions.models import Institution


@override_settings(GOOGLE_CLIENT_ID="web-client", GOOGLE_CLIENT_IDS=["android-client"])
class StudentGoogleLinkTests(TestCase):
    def setUp(self):
        self.student = User.objects.create_user(email="institution@example.test", first_name="Tobio", last_name="Kageyama", role=Role.STUDENT)
        institution = Institution.objects.create(institution_id="GOOGLE", name="Google Test Institute")
        self.cert = Certificate.objects.create(certificate_id="GOOGLE-1", institution=institution,
            student=self.student, student_name="Tobio Kageyama", degree_title="BSc", graduation_year=2026, status="issued")
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION="Bearer " + issue_full_tokens(self.student)["access"])
        self.payload = {"aud": "android-client", "iss": "https://accounts.google.com", "sub": "google-subject",
            "email": "personal@gmail.com", "email_verified": "true", "exp": int(timezone.now().timestamp()) + 3600}
        self.verify = patch("accounts.google_auth_views._verify_google_id_token", side_effect=lambda _: self.payload)
        self.verify.start()
        self.addCleanup(self.verify.stop)

    def link(self):
        return self.client.post("/api/auth/google/link/", {"id_token": "verified-token"}, format="json")

    def test_personal_google_account_links_without_changing_owner_or_institution_email(self):
        linked = self.link()
        self.assertEqual(linked.status_code, 200, linked.data)
        self.assertTrue(linked.data["user"]["google_linked"])
        self.assertEqual(linked.data["user"]["google_email"], "personal@gmail.com")
        self.student.refresh_from_db()
        self.assertEqual(self.student.email, "institution@example.test")
        self.assertEqual(self.student.google_subject, "google-subject")
        self.cert.refresh_from_db()
        self.assertEqual(self.cert.student_id, self.student.pk)
        self.client.credentials()
        login = self.client.post("/api/auth/google/", {"id_token": "verified-token"})
        self.assertEqual(login.status_code, 200, login.data)
        self.assertEqual(str(login.data["user"]["id"]), str(self.student.pk))
        self.assertFalse(login.data["created"])
        self.client.credentials(HTTP_AUTHORIZATION="Bearer " + login.data["access"])
        records = self.client.get("/api/my-certificates/").data
        records = records if isinstance(records, list) else records["results"]
        self.assertEqual(records[0]["certificate_id"], "GOOGLE-1")

    def test_google_subject_remains_identity_after_google_email_changes(self):
        self.assertEqual(self.link().status_code, 200)
        self.payload["email"] = "changed@gmail.com"
        self.client.credentials()
        login = self.client.post("/api/auth/google/", {"id_token": "verified-token"})
        self.assertEqual(str(login.data["user"]["id"]), str(self.student.pk))

    def test_link_is_idempotent_but_different_google_account_is_rejected(self):
        self.assertEqual(self.link().status_code, 200)
        self.assertEqual(self.link().status_code, 200)
        self.payload["sub"] = "another-google-subject"
        self.assertEqual(self.link().status_code, 409)

    def test_cannot_link_google_identity_or_email_owned_by_another_user(self):
        other = User.objects.create_user(email="other@example.test", google_subject="google-subject")
        self.assertEqual(self.link().status_code, 409)
        other.google_subject = None
        other.email = "personal@gmail.com"
        other.save()
        self.assertEqual(self.link().status_code, 409)
        self.student.refresh_from_db()
        self.assertIsNone(self.student.google_subject)

    def test_rejects_unverified_wrong_audience_expired_or_malformed_identity(self):
        for field, value in [("email_verified", "false"), ("aud", "attacker-client"), ("exp", 0), ("iss", "attacker"), ("sub", "")]:
            original = self.payload[field]
            self.payload[field] = value
            self.assertIn(self.link().status_code, (401, 403), field)
            self.payload[field] = original
        self.student.refresh_from_db()
        self.assertFalse(self.student.google_linked)

    def test_authentication_and_student_role_are_required(self):
        self.client.credentials()
        self.assertIn(self.link().status_code, (401, 403))
        self.client.force_authenticate(User.objects.create_user(email="admin@example.test", role=Role.INSTITUTIONAL_ADMIN))
        self.assertEqual(self.link().status_code, 403)

    def test_setup_session_cannot_link(self):
        self.client.credentials(HTTP_AUTHORIZATION="Bearer " + issue_setup_tokens(self.student)["access"])
        self.assertEqual(self.link().status_code, 403)

    def test_profile_fields_and_link_status_cannot_be_forged(self):
        response = self.client.patch("/api/auth/me/", {"first_name": "Tobio", "last_name": "Kageyama", "phone_number": "+23276123456", "google_email": "forged@gmail.com", "google_subject": "forged", "role": "super_admin"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.student.refresh_from_db()
        self.assertEqual(self.student.phone_number, "+23276123456")
        self.assertIsNone(self.student.google_subject)
        self.assertEqual(self.student.role, Role.STUDENT)

    def test_new_google_login_cannot_access_staff_account(self):
        self.payload["email"] = "admin@example.test"
        User.objects.create_user(email="admin@example.test", role=Role.SUPER_ADMIN)
        self.client.credentials()
        self.assertEqual(self.client.post("/api/auth/google/", {"id_token": "verified-token"}).status_code, 403)
