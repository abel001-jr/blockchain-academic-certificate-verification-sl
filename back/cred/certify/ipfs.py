"""
certify/ipfs.py

Pinata IPFS pinning service for INTELLIGENT ACADEMIC CREDENTIALING.
Uses the Pinata JWT for all requests.
Spec §8 steps 6-7.
"""

import json
import hashlib
import requests
from django.conf import settings
from django.core.cache import cache


def _payload_cache_key(cid):
    return "encrypted-ipfs:" + hashlib.sha256(cid.encode()).hexdigest()

PINATA_PIN_FILE_URL = "https://api.pinata.cloud/pinning/pinFileToIPFS"
PINATA_PIN_JSON_URL = "https://api.pinata.cloud/pinning/pinJSONToIPFS"


def _auth_headers() -> dict:
    jwt = getattr(settings, "PINATA_JWT", "")
    if not jwt:
        raise ValueError("PINATA_JWT is not configured in settings.")
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
            timeout=60,
        )
        res.raise_for_status()
        cid = res.json()["IpfsHash"]
        # Keep only encrypted document envelopes, never a plaintext upload.
        from .encrypted_documents import is_encrypted_document
        file_obj.seek(0)
        payload = file_obj.read()
        if is_encrypted_document(payload):
            cache.set(_payload_cache_key(cid), payload, timeout=86400)
        url = f"{settings.PINATA_GATEWAY}/ipfs/{cid}"
        return {"cid": cid, "ipfs_url": url}
    except requests.RequestException as e:
        raise RuntimeError(f"Pinata file upload failed: {e}") from e


def fetch_file_from_ipfs(cid: str) -> bytes:
    """Fetch a pinned payload for server-side decryption; never expose this URL."""
    if not cid:
        raise ValueError("An IPFS CID is required.")
    cached = cache.get(_payload_cache_key(cid))
    if cached is not None:
        return cached
    url = f"{settings.PINATA_GATEWAY.rstrip('/')}/ipfs/{cid}"
    try:
        res = requests.get(url, timeout=60)
        res.raise_for_status()
        from .encrypted_documents import is_encrypted_document
        if is_encrypted_document(res.content):
            cache.set(_payload_cache_key(cid), res.content, timeout=86400)
        return res.content
    except requests.RequestException as e:
        raise RuntimeError(f"IPFS document retrieval failed: {e}") from e


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
        raise RuntimeError(f"Pinata JSON upload failed: {e}") from e


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
