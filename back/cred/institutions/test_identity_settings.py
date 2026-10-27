import tempfile
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import patch
import fitz
from PIL import Image
from django.test import TestCase, override_settings
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient
from accounts.models import User, Role
from institutions.models import Institution
from certify.institution_identity import institutional_identity


def image_file(name):
    stream = BytesIO()
    Image.new('RGB', (24, 24), 'navy').save(stream, format='PNG')
    return SimpleUploadedFile(name, stream.getvalue(), content_type='image/png')


class InstitutionIdentitySettingsTests(TestCase):
    def test_admin_uploads_references_without_any_certificate_template(self):
        with override_settings(STORAGES={"default": {"BACKEND": "django.core.files.storage.InMemoryStorage"}}):
            institution = Institution.objects.create(institution_id='IDENTITY', name='Identity Institute')
            admin = User.objects.create_user(email='admin@identity.test', role=Role.INSTITUTIONAL_ADMIN, institution=institution)
            registrar = User.objects.create_user(email='registrar@identity.test', role=Role.REGISTRAR, institution=institution)
            client = APIClient()
            client.force_authenticate(registrar)
            self.assertEqual(client.patch('/api/institution-identity-settings/', {'reference_logo': image_file('denied.png')}, format='multipart').status_code, 403)
            client.force_authenticate(admin)
            response = client.patch('/api/institution-identity-settings/', {'reference_logo': image_file('logo.png'), 'reference_seal': image_file('seal.png'), 'reference_transcript_seal': image_file('blind.png')}, format='multipart')
            self.assertEqual(response.status_code, 200)
            institution.refresh_from_db()
            self.assertTrue(institution.reference_logo)
            self.assertTrue(institution.reference_seal)
            cert = SimpleNamespace(institution=institution, template_revision=None, registrar_signature_image=None, vc_signature_image=None, chancellor_signature_image=None)
            with fitz.open() as document:
                document.new_page()
                pdf = document.tobytes()
            with patch('certify.institution_identity.document_regions', return_value={}):
                result = institutional_identity(pdf, cert)
            references = {item['category']: item for item in result['items'] if item['category'] != 'signatures'}
            self.assertEqual(references['logo']['reference_url'], institution.reference_logo.url)
            self.assertEqual(references['seal']['reference_url'], institution.reference_seal.url)
            self.assertEqual(references['seal']['status'], 'manual_review')
            with patch('certify.institution_identity.document_regions', return_value={}):
                transcript_result = institutional_identity(pdf, cert, document_kind="transcript")
            transcript_seal = next(item for item in transcript_result["items"] if item["category"] == "seal")
            self.assertEqual(transcript_seal["reference_url"], institution.reference_transcript_seal.url)
            self.assertNotEqual(transcript_seal["reference_url"], institution.reference_seal.url)
            institution.reference_transcript_seal = None
            with patch('certify.institution_identity.document_regions', return_value={}):
                missing = institutional_identity(pdf, cert, document_kind="transcript")
            self.assertEqual(next(item for item in missing["items"] if item["category"] == "seal")["status"], "reference_missing")
            client.force_authenticate(registrar)
            self.assertEqual(client.get('/api/institution-identity-settings/').status_code, 200)
            institution.refresh_from_db()
            for role in (Role.VC, Role.CHANCELLOR):
                officer = User.objects.create_user(email=f"{role}@identity.test", role=role, institution=institution)
                client.force_authenticate(officer)
                view = client.get('/api/institution-identity-settings/')
                self.assertEqual(view.status_code, 200)
                self.assertTrue(view.data['reference_logo'])
                self.assertTrue(view.data['reference_seal'])
                self.assertTrue(view.data['reference_transcript_seal'])
                denied = client.patch('/api/institution-identity-settings/', {'reference_logo': image_file(f'{role}.png')}, format='multipart')
                self.assertEqual(denied.status_code, 403)

            client.force_authenticate(admin)
            response = client.patch('/api/institution-identity-settings/', {'reference_seal': SimpleUploadedFile('bad.png', b'not an image', content_type='image/png')}, format='multipart')
            self.assertEqual(response.status_code, 400)
