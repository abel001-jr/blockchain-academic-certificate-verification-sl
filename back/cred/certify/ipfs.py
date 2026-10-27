"""
certify/ipfs.py

Pinata IPFS pinning service for INTELLIGENT ACADEMIC CREDENTIALING.
Uses the Pinata JWT for all requests.
Spec §8 steps 6-7.
"""

import json
import hashlib
import threading
from email.utils import parsedate_to_datetime
from datetime import datetime, timezone
import requests
from django.conf import settings
from django.core.cache import cache


_FETCH_LOCKS = [threading.Lock() for _ in range(32)]


def _payload_cache_key(cid):
    return "encrypted-ipfs:" + hashlib.sha256(cid.encode()).hexdigest()

PINATA_PIN_FILE_URL = "https://api.pinata.cloud/pinning/pinFileToIPFS"
PINATA_PIN_JSON_URL = "https://api.pinata.cloud/pinning/pinJSONToIPFS"


class PinningError(RuntimeError):
    def __init__(self, detail, code="storage_unavailable", retryable=True):
        super().__init__(detail)
        self.code = code
        self.retryable = retryable


def pinning_failure(exc):
    """Safe API error: never expose provider responses, credentials or URLs."""
    return {"detail": str(exc) if isinstance(exc, PinningError) else
            "Document storage is unavailable. Your saved record has been kept. Try the upload again.",
            "code": getattr(exc, "code", "storage_unavailable"),
            "retryable": getattr(exc, "retryable", True)}


def _upload_error(exc):
    if isinstance(exc, requests.Timeout):
        return PinningError("Document storage took too long to respond. Your saved record has been kept. Try the upload again. The provider may have received the file; issuance has not advanced.", "storage_timeout")
    response = getattr(exc, "response", None)
    code = response.status_code if response is not None else None
    if code in (401, 403):
        return PinningError("Document storage authorization failed. Ask the system administrator to check the storage configuration.", "storage_authorization", False)
    if code == 429:
        return PinningError("Document storage is busy or its upload limit has been reached. Wait before retrying; contact the administrator if this continues.", "storage_rate_limited")
    return PinningError("Document storage could not complete the upload. Your saved record has been kept. Try again; contact the administrator if this continues.")


def _auth_headers() -> dict:
    jwt = getattr(settings, "PINATA_JWT", "")
    if not jwt:
        raise PinningError("Document storage is not configured. Contact the system administrator.", "storage_not_configured", False)
    return {"Authorization": f"Bearer {jwt}"}


def pin_file_to_ipfs(
    file_obj,
    filename: str,
    certificate_id: str,
    *,
    content_type: str = "application/pdf",
) -> dict:
    """Pin a file to IPFS. Credential payloads should be encrypted bytes."""
    headers  = _auth_headers()
    metadata = json.dumps({
        "name":      f"INTELLIGENT ACADEMIC CREDENTIALING-{certificate_id}-{filename}",
        "keyvalues": {"certificate_id": certificate_id, "type": "document"},
    })
    try:
        res = requests.post(
            PINATA_PIN_FILE_URL,
            headers=headers,
            files={
                "file":          (filename, file_obj, content_type),
                "pinataMetadata": (None, metadata),
                "pinataOptions":  (None, json.dumps({"cidVersion": 1})),
            },
            timeout=(10, 60),
        )
        res.raise_for_status()
        cid = res.json()["IpfsHash"]
        if not isinstance(cid, str) or not cid.strip():
            raise ValueError("Missing storage identifier")
        # Keep only encrypted document envelopes, never a plaintext upload.
        from .encrypted_documents import is_encrypted_document
        file_obj.seek(0)
        payload = file_obj.read()
        if is_encrypted_document(payload):
            cache.set(_payload_cache_key(cid), payload, timeout=86400)
        url = f"{settings.PINATA_GATEWAY}/ipfs/{cid}"
        return {"cid": cid, "ipfs_url": url}
    except requests.RequestException as e:
        raise _upload_error(e) from e
    except (ValueError, KeyError, TypeError) as e:
        raise PinningError("Document storage returned an invalid upload confirmation. Retry the upload before continuing.", "storage_invalid_response") from e


def _gateway_key(gateway):
    return "ipfs-gateway-cooldown:" + hashlib.sha256(gateway.encode()).hexdigest()


def _cooldown_seconds(response):
    from collections.abc import Mapping
    header = response.headers.get("Retry-After") if isinstance(response.headers, Mapping) else None
    try:
        return max(1, int(header))
    except (ValueError, TypeError):
        try:
            date = parsedate_to_datetime(header)
            return max(1, int((date - datetime.now(timezone.utc)).total_seconds()))
        except (ValueError, TypeError, OverflowError):
            return int(getattr(settings, "IPFS_RATE_LIMIT_COOLDOWN_SECONDS", 60))


def _cache_payload(cid, payload):
    from .encrypted_documents import is_encrypted_document
    if is_encrypted_document(payload):
        cache.set(_payload_cache_key(cid), payload, timeout=86400)
    elif payload.lstrip().startswith(b"{"):
        try:
            if isinstance(json.loads(payload), dict):
                # Metadata is still re-hashed against the live commitment on use.
                cache.set(_payload_cache_key(cid), payload, timeout=300)
        except (ValueError, UnicodeError):
            pass


def fetch_file_from_ipfs(cid: str, *, fast=False) -> bytes:
    """Share concurrent CID fetches; skip gateways until Retry-After expires."""
    if not cid:
        raise ValueError("An IPFS CID is required.")
    lock = _FETCH_LOCKS[int(hashlib.sha256(cid.encode()).hexdigest()[:8], 16) % len(_FETCH_LOCKS)]
    if not lock.acquire(timeout=0.2 if fast else -1):
        raise RuntimeError("IPFS retrieval is already in progress. Use the saved preview copy.")
    try:
        cached = cache.get(_payload_cache_key(cid))
        if cached is not None:
            return cached
        gateways = [settings.PINATA_GATEWAY.rstrip("/"), *getattr(settings, "IPFS_FALLBACK_GATEWAYS", [])]
        failures = []
        with requests.Session() as session:
            session.trust_env = getattr(settings, "IPFS_TRUST_ENV", True)
            for gateway in dict.fromkeys(gateways):
                if cache.get(_gateway_key(gateway)):
                    failures.append("rate limited (gateway cooldown)")
                    continue
                url = f"{gateway}/ipfs/{cid}"
                try:
                    timeout = (1, 2) if fast else (5, 20)
                    res = requests.get(url, timeout=timeout) if session.trust_env else session.get(url, timeout=timeout)
                    res.raise_for_status()
                    cache.delete(_gateway_key(gateway) + ":failures")
                    _cache_payload(cid, res.content)
                    return res.content
                except requests.HTTPError as exc:
                    code = exc.response.status_code if exc.response is not None else None
                    if code == 429:
                        failure_key = _gateway_key(gateway) + ":failures"
                        failures_so_far = cache.get(failure_key, 0) + 1
                        cache.set(failure_key, failures_so_far, timeout=86400)
                        delay = max(_cooldown_seconds(exc.response), min(3600, 60 * 2 ** min(failures_so_far - 1, 6)))
                        cache.set(_gateway_key(gateway), True, timeout=delay)
                    failures.append("rate limited" if code == 429 else f"HTTP {code}")
                except requests.exceptions.ProxyError:
                    failures.append("proxy connection failed")
                except requests.RequestException:
                    failures.append("connection failed")
                if fast:
                    break  # A saved preview is available; avoid a long gateway cascade.
        raise RuntimeError("IPFS retrieval failed: " + ", ".join(failures))
    finally:
        lock.release()


def pin_json_to_ipfs(data: dict, certificate_id: str) -> dict:
    """Pin a JSON dict to IPFS. Returns {cid, ipfs_url}."""
    headers = _auth_headers()
    payload = {
        "pinataContent":  data,
        "pinataMetadata": {
            "name":      f"INTELLIGENT ACADEMIC CREDENTIALING-{certificate_id}-metadata.json",
            "keyvalues": {"certificate_id": certificate_id, "type": "metadata"},
        },
        "pinataOptions": {"cidVersion": 1},
    }
    try:
        res = requests.post(
            PINATA_PIN_JSON_URL,
            headers={**headers, "Content-Type": "application/json"},
            json=payload,
            timeout=30,
        )
        res.raise_for_status()
        cid = res.json()["IpfsHash"]
        url = f"{settings.PINATA_GATEWAY}/ipfs/{cid}"
        return {"cid": cid, "ipfs_url": url}
    except requests.RequestException as e:
        raise _upload_error(e) from e
    except (ValueError, KeyError, TypeError) as e:
        raise PinningError("Document storage returned an invalid metadata confirmation. Retry before continuing.", "storage_invalid_response") from e


def test_connection() -> bool:
    """Returns True if the Pinata JWT is valid and the API is reachable."""
    try:
        res = requests.get(
            "https://api.pinata.cloud/data/testAuthentication",
            headers=_auth_headers(),
            timeout=10,
        )
        return res.status_code == 200
    except Exception:
        return False
