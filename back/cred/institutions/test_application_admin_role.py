from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate
from accounts.models import Role, User
from .models import InstitutionApplication
from .views import ReviewApplicationView


class ApplicationAdminRoleTests(TestCase):
    def test_approval_creates_verified_institution_admin(self):
        owner = User.objects.create_superuser(email='owner@role.test', password='test-password', wallet_address='0x'+'1'*40, wallet_verified=True)
        application = InstitutionApplication.objects.create(institution_name='Role Institute', contact_email='contact@role.test', admin_email='applicant@role.test', admin_first_name='Institute', admin_last_name='Admin', wallet_address='0x'+'2'*40, wallet_verified=True)
        request = APIRequestFactory().post('/review/', {'action':'approve','institution_id':'ROLE-INST'}, format='json')
        force_authenticate(request, owner)
        response = ReviewApplicationView.as_view()(request, pk=application.pk)
        self.assertEqual(response.status_code, 200)
        admin = User.objects.get(email=application.admin_email)
        self.assertEqual(admin.role, Role.INSTITUTIONAL_ADMIN)
        self.assertTrue(admin.wallet_verified)
        self.assertFalse(admin.is_officer)
