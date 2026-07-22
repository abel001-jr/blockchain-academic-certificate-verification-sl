"""
certificates/ipfs.py

Pinata IPFS pinning service for CREDENCE.
Uses the Pinata JWT (most flexible auth method) for all requests.

Spec §8 steps 6-7: Pin certificate PDF and JSON to IPFS via Pinata,
return the CID and public gateway URL.
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
    """
    Pin a file (PDF bytes / file-like object) to IPFS via Pinata.

    Returns:
        {
            "cid":         "Qm...",
            "ipfs_url":    "https://gateway.pinata.cloud/ipfs/Qm...",
            "pinata_url":  "https://gateway.pinata.cloud/ipfs/Qm...",
        }
    """
    headers = _auth_headers()
    # metadata to tag the pin in Pinata
    metadata = json.dumps({
        "name": f"CREDENCE-{certificate_id}-{filename}",
        "keyvalues": {"certificate_id": certificate_id, "type": "document"},
    })

    try:
        response = requests.post(
            PINATA_PIN_FILE_URL,
            headers=headers,
            files={
                "file":                    (filename, file_obj, "application/pdf"),
                "pinataMetadata":          (None, metadata),
                "pinataOptions":           (None, json.dumps({"cidVersion": 1})),
            },
            timeout=60,
        )
        response.raise_for_status()
        data = response.json()
        cid  = data["IpfsHash"]
        url  = f"{settings.PINATA_GATEWAY}/ipfs/{cid}"
        return {"cid": cid, "ipfs_url": url, "pinata_url": url}

    except requests.RequestException as e:
        raise RuntimeError(f"Pinata file upload failed: {e}") from e


def pin_json_to_ipfs(data: dict, certificate_id: str) -> dict:
    """
    Pin a JSON object to IPFS via Pinata.

    Returns:
        {
            "cid":      "Qm...",
            "ipfs_url": "https://gateway.pinata.cloud/ipfs/Qm...",
        }
    """
    headers = _auth_headers()
    headers["Content-Type"] = "application/json"

    payload = {
        "pinataContent":  data,
        "pinataMetadata": {
            "name": f"CREDENCE-{certificate_id}-metadata.json",
            "keyvalues": {"certificate_id": certificate_id, "type": "metadata"},
        },
        "pinataOptions": {"cidVersion": 1},
    }

    try:
        response = requests.post(
            PINATA_PIN_JSON_URL,
            headers=headers,
            json=payload,
            timeout=30,
        )
        response.raise_for_status()
        data_resp = response.json()
        cid  = data_resp["IpfsHash"]
        url  = f"{settings.PINATA_GATEWAY}/ipfs/{cid}"
        return {"cid": cid, "ipfs_url": url}

    except requests.RequestException as e:
        raise RuntimeError(f"Pinata JSON upload failed: {e}") from e


def test_connection() -> bool:
    """Quick connectivity check — returns True if Pinata JWT is valid."""
    try:
        res = requests.get(
            "https://api.pinata.cloud/data/testAuthentication",
            headers=_auth_headers(),
            timeout=10,
        )
        return res.status_code == 200
    except Exception:
        return False
