"""
certify/ipfs.py

Pinata IPFS pinning service for CREDENCE.
Uses the Pinata JWT for all requests.
Spec §8 steps 6-7.
"""

import json
import requests
from django.conf import settings

PINATA_PIN_FILE_URL = "https://api.pinata.cloud/pinning/pinFileToIPFS"
PINATA_PIN_JSON_URL = "https://api.pinata.cloud/pinning/pinJSONToIPFS"


def _auth_headers() -> dict:
    jwt = getattr(settings, "PINATA_JWT", "")
    if not jwt:
        raise ValueError("PINATA_JWT is not configured in settings.")
    return {"Authorization": f"Bearer {jwt}"}


def pin_file_to_ipfs(file_obj, filename: str, certificate_id: str) -> dict:
    """Pin a PDF file to IPFS. Returns {cid, ipfs_url}."""
    headers  = _auth_headers()
    metadata = json.dumps({
        "name":      f"CREDENCE-{certificate_id}-{filename}",
        "keyvalues": {"certificate_id": certificate_id, "type": "document"},
    })
    try:
        res = requests.post(
            PINATA_PIN_FILE_URL,
            headers=headers,
            files={
                "file":          (filename, file_obj, "application/pdf"),
                "pinataMetadata": (None, metadata),
                "pinataOptions":  (None, json.dumps({"cidVersion": 1})),
            },
            timeout=60,
        )
        res.raise_for_status()
        cid = res.json()["IpfsHash"]
        url = f"{settings.PINATA_GATEWAY}/ipfs/{cid}"
        return {"cid": cid, "ipfs_url": url}
    except requests.RequestException as e:
        raise RuntimeError(f"Pinata file upload failed: {e}") from e


def pin_json_to_ipfs(data: dict, certificate_id: str) -> dict:
    """Pin a JSON dict to IPFS. Returns {cid, ipfs_url}."""
    headers = _auth_headers()
    payload = {
        "pinataContent":  data,
        "pinataMetadata": {
            "name":      f"CREDENCE-{certificate_id}-metadata.json",
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
