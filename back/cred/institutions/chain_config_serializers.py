"""Chain config serializer — validates the public blockchain coordinates."""

import re

from rest_framework import serializers

from .models import ChainConfig

ADDRESS_RE = re.compile(r"^0x[0-9a-fA-F]{40}$")


class ChainConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChainConfig
        fields = [
            "rpc_url",
            "chain_id",
            "issuer_registry_address",
            "certificate_registry_address",
            "expected_owner_address",
            "updated_at",
        ]
        read_only_fields = ["updated_at"]

    def validate_rpc_url(self, value):
        value = (value or "").strip()
        if value and not value.startswith(("http://", "https://")):
            raise serializers.ValidationError("Must be an http:// or https:// URL.")
        return value

    def _check_address(self, value, field_label):
        value = (value or "").strip()
        if value and not ADDRESS_RE.match(value):
            raise serializers.ValidationError(
                f"{field_label} must be a 20-byte hex address starting with 0x."
            )
        return value

    def validate_issuer_registry_address(self, value):
        return self._check_address(value, "Issuer registry address")

    def validate_certificate_registry_address(self, value):
        return self._check_address(value, "Certificate registry address")

    def validate_expected_owner_address(self, value):
        return self._check_address(value, "Expected owner address")

    def validate_chain_id(self, value):
        # 0 is a valid chain id, so the check is on the value itself rather than truthiness.
        if value is not None and value < 0:
            raise serializers.ValidationError("Chain id cannot be negative.")
        return value
