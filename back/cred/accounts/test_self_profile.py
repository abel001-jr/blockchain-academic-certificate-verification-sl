from django.test import TestCase
from rest_framework.test import APIClient
from .models import User, Role
from io import BytesIO
from tempfile import TemporaryDirectory
from PIL import Image
from django.core.files.uploadedfile import SimpleUploadedFile


class SelfProfileTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="profile@example.edu", role=Role.INSTITUTIONAL_ADMIN, wallet_address="0x" + "1" * 40)
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_profile_saves_without_changing_role_wallet_or_account_status(self):
        response = self.client.patch("/api/auth/me/", {
            "first_name": "Sam", "last_name": "Bah", "email": "sam@example.edu", "phone_number": "+23212345678",
            "role": Role.SUPER_ADMIN, "wallet_address": "0x" + "2" * 40, "is_active": False,
        }, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.user.refresh_from_db()
        self.assertEqual(self.user.first_name, "Sam")
        self.assertEqual(self.user.email, "sam@example.edu")
        self.assertEqual(self.user.phone_number, "+23212345678")
        self.assertEqual(self.user.role, Role.INSTITUTIONAL_ADMIN)
        self.assertEqual(self.user.wallet_address, "0x" + "1" * 40)
        self.assertTrue(self.user.is_active)

    def test_duplicate_email_rejected(self):
        User.objects.create_user(email="taken@example.edu")
        response = self.client.patch("/api/auth/me/", {"email": "taken@example.edu"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.user.refresh_from_db()
        self.assertEqual(self.user.email, "profile@example.edu")

    def test_profile_photo_upload_and_invalid_image(self):
        with TemporaryDirectory() as media, self.settings(MEDIA_ROOT=media):
            buffer = BytesIO()
            Image.new("RGB", (32, 32), "navy").save(buffer, format="PNG")
            response = self.client.patch("/api/auth/me/", {"profile_photo": SimpleUploadedFile("photo.png", buffer.getvalue(), content_type="image/png")}, format="multipart")
            self.assertEqual(response.status_code, 200, response.data)
            self.assertTrue(response.data["profile_photo"])
            self.user.refresh_from_db()
            self.assertTrue(self.user.profile_photo.name.startswith("profiles/"))
            response = self.client.patch("/api/auth/me/", {"profile_photo": SimpleUploadedFile("fake.png", b"invalid image", content_type="image/png")}, format="multipart")
            self.assertEqual(response.status_code, 400)
