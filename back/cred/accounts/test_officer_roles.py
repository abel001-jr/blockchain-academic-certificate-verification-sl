from types import SimpleNamespace
from unittest.mock import patch
from django.test import TestCase
from .models import User, Role
from .serializers import UserCreateSerializer
from institutions.models import Institution


class OfficerRoleTests(TestCase):
    def setUp(self):
        self.inst = Institution.objects.create(institution_id="ROLE-TEST", name="Role Test")
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
