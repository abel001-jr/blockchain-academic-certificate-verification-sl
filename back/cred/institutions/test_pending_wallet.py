from django.test import TestCase
from rest_framework.test import APIClient
from eth_account import Account
from eth_account.messages import encode_defunct
from .models import InstitutionApplication


class PendingApplicationWalletTests(TestCase):
    def test_pending_application_shows_review_notice_only_after_valid_signature(self):
        wallet = Account.create()
        InstitutionApplication.objects.create(
            institution_name='Pending Institute', contact_email='contact@pending.test',
            admin_first_name='Pending', admin_last_name='Admin', admin_email='admin@pending.test',
            wallet_address=wallet.address.lower(), wallet_verified=True,
        )
        client = APIClient()
        challenge = client.post('/api/auth/wallet/challenge/', {'address': wallet.address})
        self.assertEqual(challenge.status_code, 200)
        invalid = client.post('/api/auth/wallet/verify/', {'address': wallet.address, 'signature': 'invalid'})
        self.assertEqual(invalid.status_code, 401)
        self.assertNotIn('code', invalid.data)
        signature = Account.sign_message(encode_defunct(text=challenge.data['message']), wallet.key).signature.hex()
        response = client.post('/api/auth/wallet/verify/', {'address': wallet.address, 'signature': signature})
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data['code'], 'application_pending')
        self.assertIn('2 working days', response.data['detail'])
        self.assertNotIn('access', response.data)
        replay = client.post('/api/auth/wallet/verify/', {'address': wallet.address, 'signature': signature})
        self.assertEqual(replay.status_code, 400)
