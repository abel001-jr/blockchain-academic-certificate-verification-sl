from django.test import TestCase, override_settings
from django.core.files.base import ContentFile
from rest_framework.test import APIClient
from accounts.models import User, Role
from institutions.models import Institution
from .models import Certificate
from .signature_readiness import signature_readiness


@override_settings(STORAGES={'default': {'BACKEND': 'django.core.files.storage.InMemoryStorage'}})
class SignatureReadinessTests(TestCase):
    def setUp(self):
        self.institution = Institution.objects.create(institution_id='SIGNATURES', name='Signature Institute')
        self.registrar = User.objects.create_user(email='registrar@signature.test', role=Role.REGISTRAR, institution=self.institution)
        self.vc = User.objects.create_user(email='vc@signature.test', role=Role.VC, institution=self.institution)
        self.chancellor = User.objects.create_user(email='chancellor@signature.test', role=Role.CHANCELLOR, institution=self.institution)
        self.client = APIClient()
        self.client.force_authenticate(self.registrar)
        self.cert = Certificate.objects.create(certificate_id='SIG-TEST', institution=self.institution, issued_by=self.registrar, student_name='Mary Kamara', degree_title='Degree', graduation_year=2026)

    def test_all_three_saved_files_are_required_and_survive_reloading_users(self):
        self.assertFalse(signature_readiness(self.registrar)['ready'])
        for officer in [self.registrar, self.vc, self.chancellor]:
            officer.signature_image.save(f'{officer.role}.png', ContentFile(b'stored-signature'), save=True)
        registrar = User.objects.get(pk=self.registrar.pk)
        self.assertTrue(signature_readiness(registrar)['ready'])
        response = self.client.get('/api/issuance/signature-readiness/')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['ready'])
        self.vc.signature_image.storage.delete(self.vc.signature_image.name)
        self.assertFalse(signature_readiness(registrar)['ready'])

    def test_upload_and_prepare_paths_block_before_any_external_work(self):
        for action in ['prepare', 'upload-and-anchor', 'upload-transcript', 'save-draft-document', 'upload-document']:
            response = self.client.post(f'/api/certificates/{self.cert.pk}/{action}/', {}, format='multipart')
            self.assertEqual(response.status_code, 400, action)
            self.assertIn('Configure all officer signatures', str(response.data), action)
        self.cert.refresh_from_db()
        self.assertEqual(self.cert.status, 'draft')

    def test_another_institution_signatures_do_not_satisfy_readiness(self):
        other = Institution.objects.create(institution_id='OTHER-SIG', name='Other')
        for role in [Role.REGISTRAR, Role.VC, Role.CHANCELLOR]:
            officer = User.objects.create_user(email=f'{role}@other.test', role=role, institution=other)
            officer.signature_image.save(f'other-{role}.png', ContentFile(b'signature'), save=True)
        self.assertFalse(signature_readiness(self.registrar)['ready'])
