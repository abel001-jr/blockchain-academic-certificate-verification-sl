"""Database-only dashboard reads; a separate worker synchronizes Pinata usage."""
from datetime import timedelta
import requests
from django.conf import settings
from django.db.models import Q
from django.utils import timezone
from .models import PinataStorageSnapshot


def get_pinata_storage_usage():
    row = PinataStorageSnapshot.objects.filter(pk=1).first()
    stale = not row or not row.synced_at or row.synced_at < timezone.now() - timedelta(minutes=5)
    return {"count": row.size_bytes if row else None,
            "total": settings.PINATA_STORAGE_QUOTA_BYTES, "source": "pinata",
            "unavailable": not row or row.unavailable or stale,
            "stale": stale or bool(row and row.unavailable),
            "synced_at": row.synced_at.isoformat() if row and row.synced_at else None}


def sync_pinata_storage_usage():
    """Lease and retry schedule shared across processes, including duplicate workers."""
    now = timezone.now()
    PinataStorageSnapshot.objects.get_or_create(pk=1)
    ready = PinataStorageSnapshot.objects.filter(pk=1).filter(
        Q(lease_until__isnull=True) | Q(lease_until__lte=now)).filter(
        Q(next_attempt_at__isnull=True) | Q(next_attempt_at__lte=now))
    if not ready.update(lease_until=now + timedelta(seconds=30)):
        return False
    row = PinataStorageSnapshot.objects.get(pk=1)
    jwt = settings.PINATA_JWT
    headers = {"Authorization": f"Bearer {jwt}"} if jwt else {
        "pinata_api_key": settings.PINATA_API_KEY,
        "pinata_secret_api_key": settings.PINATA_SECRET_API_KEY}
    response = None
    try:
        if not jwt and not (settings.PINATA_API_KEY and settings.PINATA_SECRET_API_KEY):
            raise ValueError("Storage credentials not configured")
        response = requests.get("https://api.pinata.cloud/data/userPinnedDataTotal", headers=headers, timeout=5)
        response.raise_for_status()
        size = response.json()["pin_size_total"]
        if isinstance(size, bool) or not isinstance(size, int) or size < 0:
            raise ValueError("Invalid storage total")
        PinataStorageSnapshot.objects.filter(pk=1).update(size_bytes=size, synced_at=timezone.now(),
            failures=0, unavailable=False, lease_until=None,
            next_attempt_at=timezone.now() + timedelta(seconds=60))
    except (requests.RequestException, ValueError, KeyError, TypeError):
        failures = row.failures + 1
        wait = min(3600, 60 * 2 ** min(failures - 1, 6))
        if response is not None and response.status_code == 429:
            from .ipfs import _cooldown_seconds
            wait = max(wait, _cooldown_seconds(response))
        PinataStorageSnapshot.objects.filter(pk=1).update(failures=failures, unavailable=True,
            lease_until=None, next_attempt_at=timezone.now() + timedelta(seconds=wait))
    return True
