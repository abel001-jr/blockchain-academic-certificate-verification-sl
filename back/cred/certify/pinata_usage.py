"""Account IPFS usage reported by Pinata, with a short cache for dashboards."""

import hashlib

import requests
from django.conf import settings
from django.core.cache import cache


def get_pinata_storage_usage():
    # The usage endpoint reports bytes, but does not report the plan quota.
    quota = settings.PINATA_STORAGE_QUOTA_BYTES
    unavailable = {"count": None, "total": quota, "source": "pinata"}
    jwt = settings.PINATA_JWT
    key = settings.PINATA_API_KEY
    secret = settings.PINATA_SECRET_API_KEY
    if jwt:
        headers = {"Authorization": f"Bearer {jwt}"}
    elif key and secret:
        headers = {"pinata_api_key": key, "pinata_secret_api_key": secret}
    else:
        return unavailable

    cache_key = "pinata-storage:" + hashlib.sha256(
        f"{jwt}:{key}:{secret}:{quota}".encode()
    ).hexdigest()
    cached = cache.get(cache_key)
    if cached is not None:
        return cached
    try:
        response = requests.get(
            "https://api.pinata.cloud/data/userPinnedDataTotal",
            headers=headers,
            timeout=5,
        )
        response.raise_for_status()
        size = response.json()["pin_size_total"]
        if isinstance(size, bool) or not isinstance(size, int) or size < 0:
            raise ValueError("Invalid storage total")
        result = {"count": size, "total": quota, "source": "pinata"}
    except (requests.RequestException, ValueError, KeyError, TypeError):
        result = unavailable
    cache.set(cache_key, result, timeout=60)
    return result
