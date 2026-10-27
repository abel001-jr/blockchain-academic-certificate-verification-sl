"""Plain-language explanations based strictly on completed verification checks."""
from django.utils import timezone


def enrich_report(payload):
    payload["verified_at"] = timezone.now().isoformat()
    for kind, check in payload.get("checks", {}).items():
        status = check.get("status")
        if status == "matched":
            if kind == "blockchain":
                explanation = "A record for this credential was found on the configured blockchain. Its issuance or revocation status is reported separately below."
            elif kind == "data":
                explanation = "The application record and stored structured metadata match the blockchain data commitment, including the issuing institution identifier."
            elif check.get("source") == "uploaded_file":
                explanation = "The SHA-256 hash of the exact PDF you uploaded matches the document hash committed on-chain. This file is byte-for-byte consistent with that commitment."
            else:
                explanation = "The retrieved stored document matches its on-chain hash. This check does not compare a separate copy held by the employer."
            action = "No follow-up needed for this check. Review the overall credential status and any remaining checks."
        elif status == "mismatch":
            explanation = "The uploaded or stored document does not match its blockchain commitment." if kind in {"certificate", "transcript"} else "The credential data is inconsistent with the on-chain commitment or issuing institution identifier."
            action = "Request the original issued PDF from the graduate or contact the registrar. Scanning, re-saving or modifying a PDF changes its hash; a mismatch alone does not establish forgery." if kind in {"certificate", "transcript"} else "Contact the issuing institution to investigate the record inconsistency before relying on this credential."
        elif status == "unavailable":
            explanation = "The service could not complete this check. This is not evidence of an invalid document."
            action = "Retry when the blockchain or storage service is available. Incomplete verification does not consume this flow's single-use access."
        elif status == "not_found":
            explanation = "No matching credential record was found on the configured blockchain."
            action = "Confirm the credential ID and network with the registrar. A missing record does not establish document authenticity."
        elif status == "not_applicable":
            explanation = "No applicable document commitment was available for this check."
            action = "Confirm with the institution whether this document should be part of the issued credential."
        else:
            explanation = "This check was not performed. A transcript may have been omitted, access may be public, or verification may have stopped at an earlier status check."
            action = "Do not interpret this as a match. Check the overall status and supplied files; request new student access if another verification is needed."
        check.update(explanation=explanation, next_step=action)
    outcome = payload.get("verification_outcome")
    payload["recommendation"] = {
        "valid": "Completed checks match. Rely only on documents marked as matched; omitted documents remain unverified. This report does not verify the presenter's identity or replace your recruitment checks.",
        "revoked": "The institution's blockchain record marks this credential as revoked. Contact the registrar before relying on it, even if you hold an older copy.",
        "tampered": "An integrity mismatch was detected. Resolve it with the issuing institution before accepting this credential; a changed file is not automatically proof of fraud.",
        "not_verified": "The credential is not confirmed as issued on the configured blockchain. Ask the registrar to confirm approval, finalization and the correct network.",
        "unavailable": "Verification is incomplete. Retry later; do not treat a service outage as a failed authenticity check.",
    }.get(outcome, "Confirm the credential ID and contact the issuing institution if the record cannot be located.")
    return payload
