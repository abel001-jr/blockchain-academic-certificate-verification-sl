from types import SimpleNamespace
from django.test import TestCase
from rest_framework.test import APIClient
from accounts.models import User, Role
from accounts.serializers import UserCreateSerializer
from institutions.models import Institution


class InstitutionEmailOwnerTests(TestCase):
    def test_only_admin_can_save_domain_and_officer_uses_it(self):
        institution = Institution.objects.create(institution_id='DOMAIN', name='Domain Institute')
        admin = User.objects.create_user(email='admin@domain.test', role=Role.INSTITUTIONAL_ADMIN, institution=institution)
        registrar = User.objects.create_user(email='registrar@domain.test', role=Role.REGISTRAR, institution=institution)
        client = APIClient()
        client.force_authenticate(registrar)
        self.assertEqual(client.patch('/api/institution-email-settings/', {'email_domain':'college.edu.sl'}).status_code, 403)
        client.force_authenticate(admin)
        response = client.patch('/api/institution-email-settings/', {'email_domain':'college.edu.sl'})
        self.assertEqual(response.status_code, 200)
        institution.refresh_from_db()
        self.assertEqual(institution.email_domain, 'college.edu.sl')
        admin.institution = institution
        data = {'email':'officer@other.test', 'first_name':'mary jane', 'last_name':'kamara', 'role':'vc'}
        serializer = UserCreateSerializer(data=data, context={'request': SimpleNamespace(user=admin)})
        self.assertFalse(serializer.is_valid())
        self.assertIn('email', serializer.errors)
        data['email'] = 'officer@college.edu.sl'
        serializer = UserCreateSerializer(data=data, context={'request': SimpleNamespace(user=admin)})
        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(serializer.validated_data['first_name'], 'Mary Jane')
        data['first_name'] = 'Mary123'
        serializer = UserCreateSerializer(data=data, context={'request': SimpleNamespace(user=admin)})
        self.assertFalse(serializer.is_valid())
        self.assertIn('first_name', serializer.errors)

    def test_missing_domain_blocks_officer_creation_and_legacy_invite(self):
        institution = Institution.objects.create(institution_id="NO-DOMAIN", name="Unconfigured")
        admin = User.objects.create_user(email="admin@unconfigured.test", role=Role.INSTITUTIONAL_ADMIN, institution=institution)
        client = APIClient()
        client.force_authenticate(admin)
        for role in ("registrar", "vc", "chancellor"):
            response = client.post("/api/users/", {"first_name": "Mary", "last_name": "Kamara", "email": "mary@unconfigured.test", "role": role})
            self.assertEqual(response.status_code, 400)
            self.assertIn("email", response.data)
        response = client.post("/api/institutions/registrars/invite/", {"email": "mary@unconfigured.test"})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(User.objects.filter(institution=institution).count(), 1)
