from django.test import TestCase
from rest_framework.test import APIClient
from accounts.models import User, Role
from audit.models import AuditLog
from certify.models import Certificate
from .models import Institution
from django.utils import timezone
from certify.models import StudentInviteToken


class InstitutionAnalyticsTests(TestCase):
    def setUp(self):
        self.institution = Institution.objects.create(institution_id="ANALYTICS", name="Analytics University")
        self.admin = User.objects.create_user(email="analytics@example.edu", role=Role.INSTITUTIONAL_ADMIN, institution=self.institution)
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def test_aggregates_all_records_and_excludes_other_institutions(self):
        registrar = User.objects.create_user(email="ready@example.edu", role=Role.REGISTRAR, institution=self.institution, wallet_verified=True, on_chain_authorized=True, must_change_password=False)
        certificates = [Certificate.objects.create(institution=self.institution, issued_by=registrar, certificate_id=f"AN-{i}", student_name="Student", student_email="student@example.edu", degree_title="Science", graduation_year=2026, status="issued", tx_hash="0x123") for i in range(25)]
        other = Institution.objects.create(institution_id="OTHER-AN", name="Other University")
        other_cert = Certificate.objects.create(institution=other, certificate_id="OTHER-AN", student_name="Other", student_email="other@example.edu", degree_title="Other", graduation_year=2026)
        for cert in [certificates[0], other_cert]:
            AuditLog.objects.create(action="certificate.verified", target_type="Certificate", target_id=str(cert.pk))
        response = self.client.get("/api/institution-analytics/")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["total"], 25)
        self.assertEqual(response.data["statuses"]["issued"], 25)
        self.assertEqual(response.data["anchored"], 25)
        self.assertEqual(response.data["verifications"], 1)
        self.assertEqual(response.data["officers"], {"total": 1, "ready": 1})
        self.assertEqual(response.data["programmes"], [{"degree_title": "Science", "count": 25}])
        self.assertEqual(len(response.data["monthly"]), 6)
        self.assertEqual(sum(item["count"] for item in response.data["monthly"]), 25)

    def test_registrar_cannot_access_administration_analytics(self):
        registrar = User.objects.create_user(email="blocked@example.edu", role=Role.REGISTRAR, institution=self.institution)
        self.client.force_authenticate(registrar)
        self.assertEqual(self.client.get("/api/institution-analytics/").status_code, 403)

    def test_empty_institution_returns_zero_counts(self):
        data = self.client.get("/api/institution-analytics/").data
        self.assertEqual(data["total"], 0)
        self.assertEqual(data["verifications"], 0)
        self.assertEqual(data["officers"], {"total": 0, "ready": 0})

    def test_activity_counts_actual_events_and_zero_fills_months(self):
        now = timezone.now()
        cert = Certificate.objects.create(institution=self.institution, certificate_id="ACTIVITY", student_name="Student", student_email="student@example.edu", degree_title="Science", department="Engineering", graduation_year=now.year, chain_issued_at=now, status="issued")
        StudentInviteToken.objects.create(certificate=cert, student=self.admin, token_hash="a" * 64, expires_at=now, used=True, claimed_at=now)
        AuditLog.objects.create(action="certificate.verified", target_type="Certificate", target_id=str(cert.pk))
        data = self.client.get("/api/institution-analytics/").data
        self.assertEqual(len(data["activity"]), 12)
        self.assertEqual([sum(month[key] for month in data["activity"]) for key in ["issued", "claims", "verifications"]], [1, 1, 1])
        self.assertEqual(data["departments"], [{"department": "Engineering", "count": 1}])
        self.assertEqual(data["stages"], [{"status": "issued", "count": 1}])
