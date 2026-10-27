"""Live blockchain commitments and independent credential integrity checks."""
import json
from datetime import datetime, timezone

import requests
from eth_abi import decode, encode
from eth_utils import keccak

from institutions.models import ChainConfig
from certify.encrypted_documents import DocumentEncryptionError, fetch_verified_document
from certify.ipfs import fetch_file_from_ipfs
from certify.utils import build_certificate_json, compute_sha256_json


class VerificationUnavailable(RuntimeError):
    pass


# Mirrors CertificateRegistry.Certificate, including the finalization flags.
CERTIFICATE_TUPLE = "(string,bytes32,bytes32,bytes32,bytes32,address,string,uint8,bool,bool,address,uint256,address,uint256,uint256,uint256,uint256,string)"


def read_chain_record(certificate_id, *, config=None):
    """Read one block snapshot; never fall back to a database status."""
    config = config or ChainConfig.load()
    address = config.certificate_registry_address
    if not config.rpc_url or not config.chain_id or not address or address.lower() == "0x" + "0" * 40:
        raise VerificationUnavailable("Blockchain verification is not configured. Contact the administrator.")
    try:
        with requests.Session() as session:
            def rpc(method, params):
                response = session.post(config.rpc_url, json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params}, timeout=(3, 8))
                response.raise_for_status()
                body = response.json()
                if body.get("error") or "result" not in body:
                    raise ValueError("RPC request failed")
                return body["result"]

            if int(rpc("eth_chainId", []), 16) != config.chain_id:
                raise VerificationUnavailable("The blockchain endpoint is on the wrong network. Contact the administrator.")
            block = rpc("eth_blockNumber", [])
            if rpc("eth_getCode", [address, block]) in ("0x", "0x0", ""):
                raise VerificationUnavailable("The configured credential contract is unavailable. The local blockchain may have been reset.")

            def call(signature, types, values, outputs):
                data = "0x" + (keccak(text=signature)[:4] + encode(types, values)).hex()
                return decode(outputs, bytes.fromhex(rpc("eth_call", [{"to": address, "data": data}, block]).removeprefix("0x")))

            exists, _, _, _ = call("verifyCertificate(string,bytes32)", ["string", "bytes32"], [certificate_id, bytes(32)], ["bool"] * 4)
            evidence = {"chain_id": config.chain_id, "contract_address": address, "block_number": int(block, 16)}
            if not exists:
                return {**evidence, "exists": False}
            row, = call("getCertificate(string)", ["string"], [certificate_id], [CERTIFICATE_TUPLE])
            if row[0] != certificate_id or row[7] not in range(4):
                raise ValueError("Unexpected contract record")
            return {**evidence, "exists": True, "data_hash": "0x" + row[1].hex(),
                    "certificate_hash": "0x" + (row[4] if any(row[4]) else row[2]).hex(),
                    "transcript_hash": "0x" + row[3].hex(), "issuer": row[5],
                    "institution_id": row[6], "status": ["pending_approval", "pending_finalize", "issued", "revoked"][row[7]],
                    "vc_approved": row[11] > 0, "chancellor_approved": row[13] > 0,
                    "revocation_reason": row[17] if row[7] == 3 else "",
                    "issued_at": datetime.fromtimestamp(row[14], timezone.utc).isoformat() if row[14] else None}
    except VerificationUnavailable:
        raise
    except Exception as exc:
        # Provider messages may contain RPC credentials. Keep them server-side.
        raise VerificationUnavailable("Blockchain verification is temporarily unavailable. Retry shortly.") from exc


def verify_record(cert, *, include_documents=False, supplied_documents=None, supplied_only=False):
    """Return explicit partial results without confusing outages with mismatches."""
    checks = {key: {"status": "not_checked"} for key in ("blockchain", "data", "certificate", "transcript")}
    report = {"verification_outcome": "unavailable", "checks": checks}
    try:
        chain = read_chain_record(cert.certificate_id)
    except VerificationUnavailable as exc:
        report["message"] = str(exc)
        checks["blockchain"] = {"status": "unavailable"}
        return report
    report["blockchain"] = chain
    if not chain["exists"]:
        checks["blockchain"] = {"status": "not_found"}
        report.update(verification_outcome="not_verified", message="This credential has no record on the configured blockchain. It may be unsubmitted or belong to an earlier local-chain deployment.")
        return report
    checks["blockchain"] = {"status": "matched"}
    if chain["status"] == "revoked":
        report.update(verification_outcome="revoked", message="The blockchain reports this credential as revoked.")
        return report
    if chain["status"] != "issued":
        report.update(verification_outcome="not_verified", message="The blockchain reports this credential as awaiting approval or finalization.")
        return report
    try:
        if not cert.ipfs_cid_json:
            raise RuntimeError("Missing metadata location")
        metadata = json.loads(fetch_file_from_ipfs(cert.ipfs_cid_json))
        expected = chain["data_hash"].lower()
        matches = (isinstance(metadata, dict) and compute_sha256_json(metadata).lower() == expected
                   and compute_sha256_json(build_certificate_json(cert)).lower() == expected
                   and chain["institution_id"] == cert.institution.institution_id)
        checks["data"] = {"status": "matched" if matches else "mismatch"}
    except (ValueError, TypeError, UnicodeError):
        checks["data"] = {"status": "mismatch"}
    except (OSError, RuntimeError):
        checks["data"] = {"status": "unavailable"}
    if include_documents:
        for kind, cid, expected in (("certificate", cert.issued_pdf_cid, chain["certificate_hash"]),
                                    ("transcript", cert.ipfs_cid_transcript, chain["transcript_hash"])):
            if supplied_only and kind not in (supplied_documents or {}):
                continue
            if expected == "0x" + "0" * 64:
                checks[kind] = {"status": "mismatch" if kind in (supplied_documents or {}) else "not_applicable"}
                continue
            try:
                supplied = (supplied_documents or {}).get(kind)
                if supplied is not None:
                    from certify.encrypted_documents import document_sha256
                    if document_sha256(supplied).lower() != expected.lower():
                        raise DocumentEncryptionError("File mismatch")
                else:
                    if not cid:
                        raise RuntimeError("Missing document location")
                    fetch_verified_document(cid, cert.certificate_id, kind, expected)
                checks[kind] = {"status": "matched", "source": "uploaded_file" if supplied is not None else "ipfs"}
            except DocumentEncryptionError as exc:
                checks[kind] = {"status": "unavailable" if "must be configured" in str(exc) else "mismatch"}
            except (OSError, RuntimeError, ValueError):
                checks[kind] = {"status": "unavailable"}
    states = {item["status"] for item in checks.values()}
    outcome = "tampered" if "mismatch" in states else "unavailable" if "unavailable" in states else "valid"
    report.update(verification_outcome=outcome, message={
        "tampered": "One or more credential contents do not match the blockchain commitment.",
        "unavailable": "Some verification checks could not complete. Retry shortly; unavailable content is not proof of forgery.",
        "valid": "Blockchain status and structured data match." if not include_documents else "Blockchain status, structured data and supplied documents match; documents not supplied were not checked." if supplied_only else "Blockchain status, structured data and applicable documents match.",
    }[outcome])
    return report
