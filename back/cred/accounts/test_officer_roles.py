from types import SimpleNamespace
from unittest.mock import patch
from django.test import TestCase
from .models import User, Role
from .serializers import UserCreateSerializer
from institutions.models import Institution


class OfficerRoleTests(TestCase):
    def setUp(self):
        self.inst = Institution.objects.create(institution_id="ROLE-TEST", name="Role Test", email_domain="role.test")
        self.admin = User.objects.create_user(email="admin@role.test", role=Role.INSTITUTIONAL_ADMIN, institution=self.inst)

    @patch("accounts.serializers.send_officer_temp_password", return_value=False)
    def test_admin_adds_registrar_with_self_service_wallet_setup(self, send):
        serializer = UserCreateSerializer(data={"email": "new@role.test", "first_name": "New", "last_name": "Officer",
            "role": "registrar", "wallet_address": "0x" + "1" * 40}, context={"request": SimpleNamespace(user=self.admin)})
        self.assertTrue(serializer.is_valid(), serializer.errors)
        user = serializer.save()
        self.assertEqual(user.institution, self.inst)
        self.assertEqual(user.wallet_address, "")
        self.assertTrue(user.must_change_password)
        self.assertTrue(user.needs_officer_setup)
        self.assertFalse(user.wallet_verified)
        self.assertFalse(user.on_chain_authorized)

    def test_registrar_cannot_add_another_registrar(self):
        self.admin.role = Role.REGISTRAR
        serializer = UserCreateSerializer(data={"email": "another@role.test", "first_name": "New", "last_name": "Officer", "role": "registrar"},
            context={"request": SimpleNamespace(user=self.admin)})
        self.assertFalse(serializer.is_valid())
        self.assertIn("role", serializer.errors)

    @patch("accounts.email_utils.send_officer_temp_password", return_value=False)
    def test_admin_regenerates_migrated_officer_credentials(self, send):
        from rest_framework.test import APIRequestFactory, force_authenticate
        from .views import ResendOfficerInviteView
        officer = User.objects.create_user(email="migrated@role.test", password="old-password", role=Role.REGISTRAR, institution=self.inst, wallet_verified=True, must_change_password=False)
        request = APIRequestFactory().post("/resend-invite/", {})
        force_authenticate(request, self.admin)
        response = ResendOfficerInviteView.as_view()(request, pk=officer.pk)
        self.assertEqual(response.status_code, 200)
        officer.refresh_from_db()
        self.assertTrue(officer.must_change_password)
        self.assertFalse(officer.check_password("old-password"))
        self.assertTrue(officer.wallet_verified)
        self.assertFalse(officer.on_chain_authorized)

    def test_authorized_officer_cannot_regenerate_setup_credentials(self):
        from rest_framework.test import APIRequestFactory, force_authenticate
        from .views import ResendOfficerInviteView
        officer = User.objects.create_user(email="authorized@role.test", password="old-password", role=Role.REGISTRAR, institution=self.inst, on_chain_authorized=True)
        request = APIRequestFactory().post("/resend-invite/", {})
        force_authenticate(request, self.admin)
        response = ResendOfficerInviteView.as_view()(request, pk=officer.pk)
        self.assertEqual(response.status_code, 400)
        officer.refresh_from_db()
        self.assertTrue(officer.check_password("old-password"))

    def test_user_filters_and_role_hierarchy(self):
        from .views import UserListCreateView
        admin = User.objects.create_user(email="system@role.test", role=Role.SUPER_ADMIN)
        registrar = User.objects.create_user(email="registrar@role.test", role=Role.REGISTRAR, institution=self.inst, is_active=False)
        User.objects.create_user(email="student@role.test", role=Role.STUDENT, institution=self.inst)
        view = UserListCreateView()
        view.request = SimpleNamespace(user=admin, query_params={"institution": str(self.inst.pk), "is_active": "false", "role": "registrar"})
        self.assertEqual(list(view.get_queryset()), [registrar])
        view.request.query_params = {}
        roles = list(view.get_queryset().values_list("role", flat=True))
        self.assertEqual(roles, [Role.SUPER_ADMIN, Role.INSTITUTIONAL_ADMIN, Role.REGISTRAR, Role.STUDENT])

    def test_authorization_filter_distinguishes_password_setup(self):
        from .views import UserListCreateView
        ready = User.objects.create_user(email="ready@role.test", role=Role.REGISTRAR, institution=self.inst, wallet_verified=True, must_change_password=False)
        password_pending = User.objects.create_user(email="password@role.test", role=Role.VC, institution=self.inst, wallet_verified=True, must_change_password=True)
        view = UserListCreateView()
        view.request = SimpleNamespace(user=self.admin, query_params={"setup_status": "pending_authorization"})
        self.assertEqual(list(view.get_queryset()), [ready])
        view.request.query_params = {"setup_status": "password_pending"}
        self.assertEqual(list(view.get_queryset()), [password_pending])

    def test_completed_setup_grants_full_session_without_chain_authorization(self):
        from .officer_setup import OfficerSetupCompleteView
        from rest_framework_simplejwt.tokens import AccessToken
        officer = User.objects.create_user(email="complete@role.test", role=Role.REGISTRAR, institution=self.inst, wallet_verified=True, wallet_address="0x" + "1" * 40, must_change_password=False, on_chain_authorized=False)
        response = OfficerSetupCompleteView().post(SimpleNamespace(user=officer))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(AccessToken(response.data["access"])["token_use"], "full")
        officer.refresh_from_db()
        self.assertFalse(officer.on_chain_authorized)

    def test_incomplete_setup_cannot_exchange_for_full_session(self):
        from .officer_setup import OfficerSetupCompleteView
        officer = User.objects.create_user(email="incomplete@role.test", role=Role.REGISTRAR, institution=self.inst, wallet_verified=False, must_change_password=True)
        response = OfficerSetupCompleteView().post(SimpleNamespace(user=officer))
        self.assertEqual(response.status_code, 403)
