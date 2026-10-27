from types import SimpleNamespace
from django.test import TestCase
from rest_framework.test import APIClient
from accounts.models import User, Role
from certify.serializers import CertificateCreateSerializer
from .models import Institution, Department, Program, CertificateTemplate, CertificateTemplateRevision


class IssuanceSettingsTests(TestCase):
    def setUp(self):
        self.inst = Institution.objects.create(institution_id="POLICY", name="Policy University")
        self.user = User.objects.create_user(email="registrar@policy.edu", role=Role.REGISTRAR, institution=self.inst)
        self.client = APIClient(); self.client.force_authenticate(self.user)

    def test_domain_normalizes_and_persists_only_own_institution(self):
        other = Institution.objects.create(institution_id="OTHER-POLICY", name="Other")
        response = self.client.patch("/api/institution-email-settings/", {"email_domain": ".Central.edu.sl", "email": "registry@central.edu.sl"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.inst.refresh_from_db(); other.refresh_from_db()
        self.assertEqual(self.inst.email_domain, "central.edu.sl")
        self.assertEqual(other.email_domain, "")
        self.assertEqual(self.client.get("/api/certificate-branding/").data["email_domain"], "central.edu.sl")

    def test_invalid_domain_rejected(self):
        for value in ("https://central.edu.sl", "name@central.edu.sl", "central..edu.sl", "-central.edu.sl"):
            self.assertEqual(self.client.patch("/api/institution-email-settings/", {"email_domain": value}, format="json").status_code, 400)

    def test_student_email_accepts_personal_and_school_domains(self):
        self.inst.email_domain = "policy.edu"
        self.inst.save(update_fields=["email_domain"])
        department = Department.objects.create(institution=self.inst, name="Computing")
        program = Program.objects.create(department=department, title="Science")
        data = {"student_name": "Amina Kamara", "graduation_year": 2026, "department_id": str(department.pk), "program_id": str(program.pk), "flow_type": "system_designed"}
        for email in ["amina@gmail.com", "amina@other.edu", "amina@sub.policy.edu"]:
            serializer = CertificateCreateSerializer(data={**data, "student_email": email}, context={"request": SimpleNamespace(user=self.user)})
            self.assertTrue(serializer.is_valid(), serializer.errors)
        serializer = CertificateCreateSerializer(data={**data, "student_email": "AMINA@POLICY.EDU"}, context={"request": SimpleNamespace(user=self.user)})
        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(serializer.validated_data["student_email"], "amina@policy.edu")
        from certify.serializers import CertificateUpdateStudentEmailSerializer
        correction = CertificateUpdateStudentEmailSerializer(data={"student_email": "amina@gmail.com"}, context={"institution": self.inst})
        self.assertTrue(correction.is_valid(), correction.errors)

    def test_settings_responsibilities_are_separate(self):
        admin = User.objects.create_user(email="settings-admin@policy.edu", role=Role.INSTITUTIONAL_ADMIN, institution=self.inst)
        self.assertEqual(self.client.get("/api/users/").status_code, 403)
        self.assertEqual(self.client.patch(f"/api/institutions/{self.inst.pk}/", {"name": "Changed"}, format="json").status_code, 403)
        self.assertEqual(self.client.patch("/api/chain-config/", {}, format="json").status_code, 403)
        self.client.force_authenticate(admin)
        self.assertEqual(self.client.get("/api/users/").status_code, 200)
        self.assertEqual(self.client.patch("/api/institution-email-settings/", {"email_domain": "policy.edu"}, format="json").status_code, 403)
        self.assertEqual(self.client.post("/api/certificate-templates/", {}, format="json").status_code, 403)
        self.assertEqual(self.client.patch("/api/chain-config/", {}, format="json").status_code, 403)
        system_admin = User.objects.create_user(email="system-admin@policy.edu", role=Role.SUPER_ADMIN)
        self.client.force_authenticate(system_admin)
        self.assertEqual(self.client.patch("/api/chain-config/", {}, format="json").status_code, 200)

    def test_admin_can_save_profile_but_not_registration_fields(self):
        admin = User.objects.create_user(email="profile-admin@policy.edu", role=Role.INSTITUTIONAL_ADMIN, institution=self.inst)
        self.client.force_authenticate(admin)
        response = self.client.patch(f"/api/institutions/{self.inst.pk}/", {
            "website": "https://policy.edu", "name": "Updated University", "short_name": "PU",
            "phone": "+23212345678", "address": "Freetown", "country": "Sierra Leone",
            "institution_id": "CHANGED", "wallet_address": "0x" + "1" * 40,
            "is_chain_active": True, "anchor_tx_hash": "changed", "email_domain": "changed.edu",
        }, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.inst.refresh_from_db()
        self.assertEqual(self.inst.website, "https://policy.edu")
        self.assertEqual(self.inst.name, "Updated University")
        self.assertEqual(self.inst.address, "Freetown")
        self.assertEqual(self.inst.institution_id, "POLICY")
        self.assertEqual(self.inst.wallet_address, "")
        self.assertFalse(self.inst.is_chain_active)
        self.assertEqual(self.inst.anchor_tx_hash, "")
        self.assertEqual(self.inst.email_domain, "")

    def test_admin_cannot_rebind_existing_institution_wallet(self):
        admin = User.objects.create_user(email="wallet-admin@policy.edu", role=Role.INSTITUTIONAL_ADMIN, institution=self.inst)
        self.inst.wallet_address = "0x" + "1" * 40
        self.inst.save(update_fields=["wallet_address"])
        self.client.force_authenticate(admin)
        response = self.client.post(f"/api/institutions/{self.inst.pk}/bind-wallet/", {"wallet_address": "0x" + "2" * 40}, format="json")
        self.assertEqual(response.status_code, 403)
        self.inst.refresh_from_db()
        self.assertEqual(self.inst.wallet_address, "0x" + "1" * 40)

    def test_registrar_can_read_own_signers_but_cannot_manage_users(self):
        own = User.objects.create_user(email="vc@policy.edu", role=Role.VC, institution=self.inst)
        other = Institution.objects.create(institution_id="OTHER-SIGNERS", name="Other")
        User.objects.create_user(email="vc@other.edu", role=Role.VC, institution=other)
        response = self.client.get("/api/users/?role=vc")
        self.assertEqual(response.status_code, 200)
        rows = response.data.get("results", []) if isinstance(response.data, dict) else response.data
        self.assertEqual([str(row["id"]) for row in rows], [str(own.pk)])
        self.assertEqual(self.client.get("/api/users/?role=chancellor").status_code, 200)
        self.assertEqual(self.client.get("/api/users/").status_code, 403)
        self.assertEqual(self.client.post("/api/users/", {}, format="json").status_code, 403)
        self.assertEqual(self.client.patch(f"/api/users/{own.pk}/", {"first_name": "Changed"}, format="json").status_code, 403)

    def test_admin_cannot_issue_or_manage_signer_signature(self):
        admin = User.objects.create_user(email="admin@policy.edu", role=Role.INSTITUTIONAL_ADMIN, institution=self.inst)
        self.client.force_authenticate(admin)
        self.assertEqual(self.client.post("/api/certificates/", {}, format="json").status_code, 403)
        self.assertEqual(self.client.get("/api/auth/signature/").status_code, 403)

    def test_approved_branding_locks_new_external_flow(self):
        department = Department.objects.create(institution=self.inst, name="Computing")
        program = Program.objects.create(department=department, title="Bachelor of Science")
        revision = CertificateTemplateRevision.objects.create(institution=self.inst, name="Active", analysis={}, fields=[])
        CertificateTemplate.objects.create(institution=self.inst, active_revision=revision)
        data = {"student_name": "Amina Kamara", "student_email": "amina@policy.edu", "graduation_year": 2026,
                "department_id": str(department.id), "program_id": str(program.id), "flow_type": "full_upload"}
        serializer = CertificateCreateSerializer(data=data, context={"request": SimpleNamespace(user=self.user, data=data)})
        self.assertFalse(serializer.is_valid())
        self.assertIn("flow_type", serializer.errors)

    def test_three_canonical_signers_are_reported(self):
        response = self.client.get("/api/certificate-branding/")
        self.assertEqual(response.data["required_signers"], ["registrar", "vc", "chancellor"])
        self.assertEqual(Role.CHANCELLOR.label, "Chancellor")

    def test_disable_requires_confirmation_and_preserves_revision(self):
        revision = CertificateTemplateRevision.objects.create(institution=self.inst, name="Saved", analysis={}, fields=[])
        template = CertificateTemplate.objects.create(institution=self.inst, active_revision=revision)
        self.assertEqual(self.client.post("/api/certificate-templates/disable/", {}, format="json").status_code, 400)
        template.refresh_from_db()
        self.assertEqual(template.active_revision_id, revision.id)
        response = self.client.post("/api/certificate-templates/disable/", {"confirm": True}, format="json")
        self.assertEqual(response.status_code, 200)
        template.refresh_from_db()
        self.assertIsNone(template.active_revision_id)
        self.assertTrue(CertificateTemplateRevision.objects.filter(pk=revision.id).exists())
