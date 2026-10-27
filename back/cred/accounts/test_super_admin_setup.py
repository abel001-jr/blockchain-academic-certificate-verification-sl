from django.test import TestCase
from rest_framework.test import APIClient
from eth_account import Account
from eth_account.messages import encode_defunct
from .models import User


class SuperAdminWalletSetupTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_superuser(email='admin@setup.test', password='test-password-123')
        self.client = APIClient()
        response = self.client.post('/api/auth/login/', {'email': self.user.email, 'password': 'test-password-123'})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['setup_required'])
        self.client.credentials(HTTP_AUTHORIZATION='Bearer ' + response.data['access'])

    def test_setup_blocks_dashboard_and_signed_wallet_unlocks_it(self):
        self.assertEqual(self.client.get('/api/users/').status_code, 403)
        wallet = Account.create()
        challenge = self.client.post('/api/auth/officer-setup/wallet/challenge/', {'address': wallet.address})
        self.assertEqual(challenge.status_code, 200)
        signature = Account.sign_message(encode_defunct(text=challenge.data['message']), wallet.key).signature.hex()
        rejected = self.client.post('/api/auth/officer-setup/wallet/verify/', {'address': wallet.address, 'signature': 'invalid'})
        self.assertEqual(rejected.status_code, 401)
        response = self.client.post('/api/auth/officer-setup/wallet/verify/', {'address': wallet.address, 'signature': signature})
        self.assertEqual(response.status_code, 200)
        self.assertIn('access', response.data)
        self.user.refresh_from_db()
        self.assertTrue(self.user.wallet_verified)
        self.assertEqual(self.user.wallet_address, wallet.address.lower())
        self.assertTrue(self.user.check_password('test-password-123'))
        self.client.credentials(HTTP_AUTHORIZATION='Bearer ' + response.data['access'])
        self.assertEqual(self.client.get('/api/users/').status_code, 200)
        login = self.client.post('/api/auth/login/', {'email': self.user.email, 'password': 'test-password-123'})
        self.assertEqual(login.status_code, 200)
        self.assertFalse(login.data['setup_required'])

    def test_challenge_cannot_be_claimed_by_another_admin(self):
        wallet = Account.create()
        challenge = self.client.post('/api/auth/officer-setup/wallet/challenge/', {'address': wallet.address})
        other = User.objects.create_superuser(email='other@setup.test', password='test-password-123')
        login = self.client.post('/api/auth/login/', {'email': other.email, 'password': 'test-password-123'})
        self.client.credentials(HTTP_AUTHORIZATION='Bearer ' + login.data['access'])
        signature = Account.sign_message(encode_defunct(text=challenge.data['message']), wallet.key).signature.hex()
        response = self.client.post('/api/auth/officer-setup/wallet/verify/', {'address': wallet.address, 'signature': signature})
        self.assertEqual(response.status_code, 400)
        other.refresh_from_db()
        self.assertFalse(other.wallet_verified)
