from django.test import TestCase
from rest_framework.test import APIClient
from accounts.models import User
from .models import InstitutionApplication


class ApplyWalletAvailabilityTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.address = "0x" + "1" * 40

    def test_existing_account_is_reported_before_signing(self):
        User.objects.create_user(email="taken@example.edu", wallet_address=self.address)
        response = self.client.post("/api/institutions/apply/wallet/challenge/", {"address": self.address, "institution_name": "University"})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], "wallet_taken")

    def test_pending_application_reserves_account(self):
        InstitutionApplication.objects.create(institution_name="University", country="Sierra Leone", contact_email="contact@example.edu", admin_email="admin@example.edu", wallet_address=self.address)
        response = self.client.post("/api/institutions/apply/wallet/challenge/", {"address": self.address, "institution_name": "Another University"})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], "wallet_taken")
