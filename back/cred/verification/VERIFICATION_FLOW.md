# Independent credential verification

The public and mobile verification endpoint now reads a live snapshot from the
network and CertificateRegistry configured in Settings > Blockchain. It checks
that the RPC chain ID matches, that a contract exists at the configured address,
and then reads the credential's status and content commitments at one block.
A database status of issued alone can no longer produce a valid result.

## Checks and access

- Public ID/QR lookup checks chain status and the metadata retrieved from its IPFS
  CID. Both the consistently serialized metadata and the current database record
  must match the on-chain data hash before database details are treated as valid.
- A valid student share code or approved consent also checks the certificate and
  transcript. IPFS payloads are decrypted server-side and hashed against the
  blockchain commitments, not the expected hashes saved in the database.
- System-designed issued certificates use the sealed document hash on-chain.
  Upload flows use the certificate document hash submitted before approval.
- A zero transcript commitment is reported as not applicable. An uploaded file
  cannot be declared matched when there is no corresponding commitment.
- Shared ZIP downloads recheck live issuance/data integrity and compare the
  downloaded documents against the live on-chain hashes before returning bytes.

## Results

The response includes verification_outcome, message, checks, verification_scope,
and blockchain evidence (network, contract, block). Checks are independently
matched, mismatch, unavailable, not_checked, not_found or not_applicable.

A revoked chain record is revoked even when the database still says issued.
An absent on-chain record or pending issuance is not_verified. A content mismatch
is tampered (displayed as Integrity mismatch). RPC/storage outages or missing
storage locations are unavailable, not forgery. Valid means all checks applicable
to the authorized scope completed. Public results explicitly leave PDF checks
not_checked; scanning a QR alone does not verify the file carrying the QR.

## Comparing original PDFs

On the web, open a verification link containing a valid student share code. Select
one or both original PDFs under Optional: compare your original PDF files, then
select Verify. The endpoint accepts multipart POST /api/verify/<id>/?code=<code>
with certificate and/or transcript file fields, maximum 20 MB each. Uploaded
bytes are hashed for that request and not stored. Any omitted document is fetched
from IPFS instead. Scans, screenshots or re-exported PDFs can differ in bytes
from the originals even if they look identical. Mobile verifies stored documents
from share links; original-file comparison is currently available on the web.

## Deployment and limits

No migration or contract redeployment is needed for the current contract ABI.
The reader uses requests plus the ABI/hash helpers already installed through
eth-account, avoiding a dependency on importing web3 for each verification.
The backend must be able to reach the configured RPC and IPFS gateways. This is
server-side blockchain verification, not offline or backend-independent proof.
Trust remains in the configured RPC and contract coordinates. Local Hardhat
resets can erase commitments; an old database record then returns not_verified.
Missing CID references require recovery from backups; hashes cannot restore files.

Useful checks: python manage.py test verification.test_integrity

## Request load and gateway backoff

Dashboard full-history/list subscriptions now refresh on initial load, successful
writes, cross-tab update signals, new notification arrivals, focus and visibility
restoration; they do not download every page on a repeating timer. Lightweight
badges and notifications poll every 30 seconds while visible. Active student
consent requests use the same visible, serialized 30-second refresh mechanism.

The web API shares concurrent identical GETs within a session, reuses successful
results for one second (profile/preferences for 30 seconds), and invalidates reads
before/after writes and on cross-tab changes. Requests are never shared across
sessions and signing/upload mutations are not automatically retried. A GET that
receives 429 respects Retry-After before attempting that URL again.

The IPFS reader shares same-CID fetches across threads, caches encrypted payloads
for up to 24 hours and JSON metadata for five minutes. Integrity is checked again
on use. A gateway's 429 starts a cooldown shared across CIDs in the configured
Django cache. Retry-After seconds and HTTP dates are supported; the fallback is
60 seconds. Healthy gateways may still be used, and officer saved-copy previews
remain available. During cooldown, reopening a viewer does not contact that
blocked gateway. Cache entries can be evicted and are lost on a process restart.

The current LocMem cache and in-process fetch locks coordinate one backend
process. Multiple worker processes require a shared Django cache for consistent
cross-worker cooldowns and throttle counters; fetch locks remain process-local.
These controls reduce traffic but do not guarantee that upstream requests succeed.
