from django.test import SimpleTestCase
from rest_framework.exceptions import ValidationError
from .serializers import InstitutionApplicationSerializer


class ApplicationPhoneTests(SimpleTestCase):
    def test_phone_length_excludes_calling_code_for_minimum(self):
        serializer = InstitutionApplicationSerializer(data={"contact_calling_code": "232"})
        self.assertTrue(serializer.validate({"contact_phone": "23276000000"}))
        self.assertTrue(serializer.validate({"contact_phone": "232" + "1" * 12}))
        for phone in ("2321234567", "232" + "1" * 13):
            with self.assertRaises(ValidationError):
                serializer.validate({"contact_phone": phone})
