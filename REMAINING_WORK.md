# Remaining Work

Ordered backlog derived from `CREDENTIAL_ISSUANCE_PIPELINE_DESIGN.md`, reconciled against the current code.

Read the design doc first, then this. Each item keeps its original brief, followed by what is actually in place and what is still outstanding.

Status legend: **Done** · **Partial** · **Not started**

Item 3 required a design decision before it could be implemented: the issued
document embeds the officers' own signatures, so its bytes cannot be fixed
before they approve. The review-then-seal two-document model was chosen over
making the hashed document signature-free. See item 3.

Work top to bottom. Item 1 is a prerequisite for item 7; item 2 is a prerequisite for item 3.

---

## 1. Choose the document access model

**Status: Done — encrypt-before-pin is implemented and the contract no longer accepts or stores a document location.**

> The current contract exposes IPFS CIDs, and public verification returns PDF URLs. A time-limited share cannot revoke access to a publicly reachable PDF. To enforce expiry, keep document retrieval behind access control, or define another storage approach. Anchor the hashes publicly, but don't expose retrievable document locations publicly.

**In place**

- `certify/encrypted_documents.py` — AES-256-GCM with a versioned `CREDENCE-ENC-V1` envelope, 12-byte nonce, and AAD bound to `credence:v1:{certificate_id}:{document_kind}`. `document_sha256` hashes the original bytes, so the on-chain value stays the plaintext hash.
- `encrypt_document` is called in all six write paths: `certify/views.py:350, 634, 810, 836, 938` and `certify/transcript_views.py:108, 227`.
- Pins go up as `.enc` with `application/octet-stream`. `certify/ipfs.py:56` `fetch_file_from_ipfs` is server-side only and documented as never exposed.
- `verification/document_views.py:30` re-hashes the decrypted bytes against the anchored hash before serving, so a decrypted document can never drift from what was anchored.
- Single backend key `CREDENTIAL_DOCUMENT_ENCRYPTION_KEY` (`cred/settings.py:190`). Note this is one global key, not per-document — key compromise exposes every credential.
- `CertificateRegistry.sol` no longer accepts or stores a CID anywhere. Removed from the `Certificate` struct, from the `CertificateFinalized` event, and from the parameters and `require` guards of `submitCertificate`, `registerCertificate`, `_submitLegacy`, and `finalizeCertificate`. The only remaining mentions of "CID" in `chain/contracts/` are prose in comments.
- `finalizeCertificate(certificateId, docHash)` is now hash-only. The registrar's backend keeps the encrypted-blob reference.
- Client updated: `walletActions.js` `CERT_ABI` inputs trimmed for all three functions, and `finalizeCertificateOnChain` no longer passes `ipfs_cid_json` / `ipfs_cid_pdf`.
- `CertificateVerifyPanel.js` no longer renders an "IPFS CID" row in the verification result.
- 5 new tests cover the paired path in `chain/test/CertificateRegistry.test.ts`, including a regression guard that Chancellor approval does **not** auto-issue a paired credential. 55 tests pass.

**Outstanding**

- **The contract must be redeployed and the addresses updated** before this is live. The ABI changed, so `NEXT_PUBLIC_CERTIFICATE_REGISTRY_ADDRESS` and `back/cred/.env` both need the new address, and `chain/scripts/redeploy-local.sh` keeps the local address stable.
- Already-published CIDs cannot be un-published. Records issued under the old ABI still have a public CID in chain state and need reissue.
- `approveAsChancellor` now auto-issues only when `docHash != 0 && transcriptDocHash == 0`, which uniquely identifies the legacy full-submit path. This was deliberately **not** changed to "both hashes present", because that would have made the paired path auto-issue on Chancellor approval and silently skip the registrar's final anchoring transaction — a core design guarantee. The paired path now has an explicit test pinning this.

---

## 2. Define the paired credential record and chain data

**Status: Done.**

> The database has certificate and transcript hash fields, but the contract currently records only a certificate document hash. Update the registration design and contract/client calls to pair independent certificate and transcript hashes with one credential ID. Store any private retrieval references off-chain.

**In place**

- `chain/contracts/CertificateRegistry.sol:40` — `transcriptDocHash` in the `Certificate` struct.
- `:278` `submitCredentialForApproval(certificateId, dataHash, certificateDocHash, transcriptDocHash)`, with `:287` rejecting an empty transcript hash.
- `:419` `finalizeCredential` requires both `docHash` and `transcriptDocHash` non-zero (`:427`) before setting `Issued`, and emits `CredentialAnchored(certificateId, docHash, transcriptDocHash, timestamp)`.
- Client: `front/app-next/src/lib/walletActions.js:334` `submitCredentialForApprovalOnChain`, `:364` `finalizeCredentialOnChain`.
- Database: `certify/models.py:145-147` `transcript_hash`, `ipfs_cid_transcript`, `ipfs_url_transcript` on `Certificate`; `:560-568` the standalone `Transcript` model with its own `transcript_hash` / `ipfs_cid` / `ipfs_url`.
- CIDs are stored off-chain only. The paired chain path never writes them.

**Outstanding**

- Nothing. This item is complete.

---

## 3. Unify the backend lifecycle across all three flows

**Status: Done for document-hash timing on every path. Still no shared state machine.**

> Flow-specific intake should converge on: Registrar attestation → VC review and on-chain approval → Dean review and on-chain approval → Registrar final anchor. Require both final documents before officer review, and prevent anchoring until both approvals and both document hashes are present. The current generated-certificate path creates and hashes its PDF after officer approvals, so its timing needs to change.

**The constraint that shaped the fix**

`generate_certificate_pdf` embedded the officers' own signature images, approver names, approval dates and approval transaction hashes. All of those are populated *after* review, so the document's bytes were not stable before approval. Committing a document hash before officer review was therefore not merely unimplemented — it was incompatible with signing the document.

The chosen resolution is a **review-then-seal** two-document model, which was explicitly selected over making the hashed document signature-free:

| | Review copy | Issued (sealed) copy |
|---|---|---|
| Rendered | `/prepare/`, before any approval | `/finalize/`, after both approvals |
| Contains | Content and branding, no signature block | Same rendering plus the signature block, dates and approval tx hashes |
| Hash | `doc_hash`, committed on-chain at submit | `sealed_doc_hash`, committed on-chain at seal |
| Mutable | Never | Never |

Both hashes are immutable once set and are stored side by side, so the link between what was reviewed and what was issued stays auditable on-chain.

**In place**

- The paired path matches the design exactly: `submitCredentialForApproval` fixes both hashes → `approveAsVC` → `approveAsChancellor` → `finalizeCredential`.
- `certify/views.py:872` — the upload-and-anchor path hashes and pins both documents, then sets `PENDING_VC`, so officers review fixed bytes.
- `chain/contracts/CertificateRegistry.sol` — added `submitForSealedReview(certId, dataHash, reviewDocHash)`, `finalizeWithSealedDocument(certId, sealedDocHash)`, the `CredentialSealed` event (carrying both hashes), and `getAuthoritativeDocHash`.
- A `sealRequired` flag on the struct distinguishes this path from the legacy submit, which would otherwise be indistinguishable from it — both carry a document hash and no transcript hash. Without it, `approveAsChancellor` would have auto-issued on Chancellor approval and silently skipped the sealing step. Covered by a test.
- `finalizeCertificate` and `finalizeCredential` both reject a credential with `sealRequired`, so the seal cannot be bypassed by calling the other finalizer. Two tests pin this.
- `pdf_certificate.py` — `generate_certificate_pdf(..., include_attestations=False)` renders the review copy, omitting the signature block and marking the page *"Review copy — unsigned, not yet issued"* so it cannot be mistaken for a diploma.
- `CertificatePrepareView` now renders, hashes, encrypts and pins the review copy, and returns it for `submitForSealedReview`. It no longer generates the document at the end.
- `CertificateConfirmVCView` and `CertificateConfirmChancellorView` both refuse to record an approval when no review document exists, so an approval can never be a bare acknowledgement of data with no document behind it.
- `CertificateFinalizeView` renders the issued document, refuses to proceed if it comes out byte-identical to the review copy, and pins it under a separate reference. It no longer rewrites `doc_hash`.
- `CertificateConfirmFinalizeView` requires `sealed_doc_hash` for system-designed credentials and the ordinary document hash for upload-based ones.
- `Certificate.requires_sealed_document`, `authoritative_doc_hash` and `issued_pdf_cid` give one definition of "the issued document". Public verification (`verification/views.py:110`) and the share-gated bundle (`verification/document_views.py`) both use them, so a graduate's PDF still matches the hash reported publicly. Without this the whole system would have failed verification for every system-designed credential.
- 12 new chain tests (68 at that point), including that sealing never mutates the reviewed hash and that a non-issuer cannot seal.

**Renderer determinism — a silent failure that would have broken the design**

`generate_certificate_pdf` used a plain `reportlab` `canvas.Canvas`. ReportLab writes the current time and a random document ID into the PDF trailer, so two renders of identical content produced different bytes and different SHA-256 hashes (verified: `be4c814c…` vs `9bea0703…` for the same review document).

That defeats the entire item. The review hash committed on-chain could never be reproduced, so the officers' approval would not have referred to any document they could be shown, and re-running `prepare` would have produced a different hash each time. It fails silently — every render succeeds, the PDF looks right, and nothing surfaces until someone tries to match a hash against a document.

Fixed with `canvas.Canvas(buf, pagesize=page, invariant=1)`, which pins the timestamp and document ID. The renderer now produces identical bytes for identical input, and `institutions/tests.py` asserts the invariance the flow depends on: the review copy is byte-stable, the issued copy differs from it, the issued copy changes when approval state changes, and the review copy does *not* depend on approval state. That last one is what makes the ordering work — the review document has to be renderable before the approvals it precedes. Verified non-vacuous: without `invariant=1` the stability test fails.

**The upload flows now commit their hashes before review too**

This was the item's outstanding blocker. The upload-based flows submitted only the data hash, so both officers signed on-chain state in which `docHash` was still zero, and the document hash only landed at finalize — after both signatures. Their approval was not an approval of a document.

`submitDocumentForApproval(certId, dataHash, docHash)` was already on the contract but had no caller, and the `finalizeRequired` flag that keeps it off the legacy auto-issue branch was already being set. What was missing was the wiring, and the immutability that makes committing a hash up front mean anything.

- `chain/contracts/CertificateRegistry.sol` — `finalizeCertificate` rejects a `docHash` that differs from one already committed, instead of overwriting it unconditionally. The contract's own header comment claimed this refusal existed; the code did not do it. This is what makes the officers' approval binding rather than decorative: a document swapped between review and issuance is now impossible on any path, not merely discouraged.
- `walletActions.js` — `submitDocumentForApproval` added to `CERT_ABI`, plus `submitDocumentForApprovalOnChain`, `submitUploadedCredentialForApprovalOnChain` and `finalizeUploadedCredentialOnChain`. The two dispatchers exist so the upload wizard and the recovery path on the detail page cannot pick different functions for the same credential.
- The dispatchers split on what the credential actually has: certificate plus transcript takes the paired path (`submitCredentialForApproval` → `finalizeCredential`), certificate alone takes the single-document path (`submitDocumentForApproval` → `finalizeCertificate`). So `full_upload` now uses the paired path it always should have, and `transcript_then_cert` the single-document one.
- `ExternalUploadFlow.js` and `certificates/[id]/page.js` (`handleResubmit`, `handleAnchorApprovedUpload`) go through those dispatchers. The wizard names the function it actually calls and shows the transcript hash.
- `CertificateUploadAndAnchorView` returns `transcript_hash`. Without it the client had no way to commit the pair, which is why the wizard could only ever submit a single hash.
- `CertificateUploadTranscriptView` refuses to attach a transcript once `tx_hash` is set. It previously allowed it as late as `pending_finalize`, which would have issued a credential carrying a document no officer reviewed and whose hash was never anchored — the same defect one step earlier in the lifecycle. The detail page no longer offers the action once the certificate is submitted.
- 12 new chain tests (80 total). The load-bearing one is *"rejects a finalize that substitutes a different document"*, verified non-vacuous: with the guard removed the transaction succeeds and the credential issues against the substituted hash. Also covered: Chancellor approval does not auto-issue, re-sending the same hash at finalize succeeds, the committed hash is what `getAuthoritativeDocHash` reports, and the credential can be neither issued through `finalizeCredential` nor sealed through `finalizeWithSealedDocument`.
- 4 new backend tests in `certify/tests.py` covering the transcript gate, also verified non-vacuous.

**Outstanding**

- There is still no shared state machine. The paths are separate views with separate endpoints and separate status transitions, so the three intakes converge by convention rather than by enforced rule. The guards added here narrow that gap but do not remove it.
- `finalizeCertificate` remains on the contract for the legacy path, where the document genuinely does not exist until after approval, so `docHash` is legitimately still zero at submit and is set for the first time at finalize.
- The committed `chain/ignition/deployments/chain-31337/` artifact predates both `submitDocumentForApproval` and the new `finalizeCertificate` guard, so this item needs the same redeploy as item 1. Both are covered by one step: `bash scripts/redeploy-local.sh` keeps the local address stable.

**Verification note**

`chain/hardhat.config.ts` now enables the optimizer in the `default` profile, not just `production`. Unoptimized, this contract exceeds the 24576-byte EIP-170 limit (28479 bytes) and would fail to deploy; optimized it is 16263 bytes. Previously `compile`, `test` and `deploy` could run under different profiles and produce artifacts that disagreed, so a deploy could fail only at the point of on-chain submission. The registry is called a handful of times per credential with no hot loops, so favouring code size costs nothing.

---

## 4. Complete document analysis and mismatch handling

**Status: Partial — extraction is done, comparison is not started.**

> `POST /api/documents/analyze/` extracts text and bounding boxes, with Tesseract as a fallback. It doesn't yet compare extracted student/award details against intake data, flag discrepancies, or block submission until the Registrar resolves them. Define the fields to compare and the review outcome to persist.

**In place**

- `certify/document_analysis.py:25` `analyze_pdf` — text layer first via PyMuPDF `get_text("words", sort=True)`, OCR fallback per page only when the embedded text is under `MIN_TEXT_CHARS = 20` (`:43`), 200 DPI, bounding boxes scaled back to 72-DPI points (`:73`), OCR confidence retained per word (`:84`). `MAX_PAGES = 50` guard.
- `POST /api/documents/analyze/` accepts a PDF without storing it and returns analysis only.
- Raises a clear, actionable error when a page needs OCR but Tesseract is absent (`:63`).

**Outstanding**

- No field extraction, no comparison against intake data, no mismatch flagging, no gate blocking submission, no persisted Registrar review outcome.
- The set of fields to compare and the shape of the stored review decision are both still undefined.
- OCR threshold tuning and representative transcript coverage remain unverified.

---

## 5. Add the signing and finalization backend for Flow 3

**Status: Not started.**

> The analysis endpoint doesn't detect institutional marks or infer signature locations. There's also no backend workflow to apply configured officer signatures, finalize edited PDFs, and only then compute hashes. Signature placement and the Registrar's adjustments are still future work.

**Outstanding — all of it**

- No institutional mark / seal / stamp detection.
- No signature location inference from role keywords near a line plus geometry.
- No endpoint to apply configured officer signature assets at Registrar-approved placements.
- No finalize-then-hash ordering for Flow 3. Editing a document after hashing must invalidate the hash; nothing enforces that yet.
- No movable-field or manual-placement support.

**Exists but is not this item**

- Officer signature *asset capture* works: `User.signature_image` via `POST /api/auth/signature/`, `front/app-next/src/components/dashboard/OfficerSignaturePanel.js`, `src/lib/signatureCanvas.js`.
- `certify/migrations/0007_certificate_registrar_signature.py` adds a per-certificate registrar signature field.

---

## 6. Finish claim and graduate access rules

**Status: Partial — TTL and token-reuse fixed this pass. Paired mobile delivery unverified.**

> Invite tokens currently default to a 48-hour lifetime, not 24 hours. Confirm that an active claim link isn't unnecessarily replaced, expiry requires Registrar resend, and a successful claim gives the graduate both documents as one credential in the mobile app.

**Fixed this pass**

- 24-hour TTL in all seven locations: `cred/settings.py:227`, `.env.example:50`, `certify/models.py:201` and `:255`, `certify/views.py:142` and `:1020`, plus the student-facing error text at `mobile-app/src/screens/StudentWelcomeScreen.js:139`.
- An active claim link is no longer silently replaced. `certify/views.py:100` `notify_student_issued` gained `force=False` and returns early when an unexpired, unused token exists. It also no longer re-sends WhatsApp in that case, so a retried finalize cannot spam the student. Return value gained `invite_created` and `invite_expires_at`.
- Rotation is now explicit. `CertificateResendInviteView` (`:1072`) passes `force=True`, which is the deliberate "student missed it / link did not arrive / window expired" path.
- The raw token exists only at creation time, so reuse means the registrar is not handed a fresh `claim_url` in that case. That is intentional — a new link would invalidate the one the student holds.

**Outstanding**

- A successful claim must deliver the certificate **and** transcript together as one credential in the mobile app. Not yet confirmed — the student portal returns certificates, and the mobile app's `CertificateDetailScreen` presents a single certificate. This is the last unverified piece of the item.
- The 24h window applies to the invite token only. Any re-notification path outside `notify_student_issued` still needs checking.

---

## 7. Enforce public versus shared verification

**Status: Done — subject to the item 1 redeploy.**

> Public verification currently returns identifying credential details and the PDF's IPFS URL. Share codes can have an expiry, but the same verification response is returned publicly and with a code. Separate the limited public response from full shared verification, and make the share expiry actually control access to both documents.

**In place**

- `verification/views.py:89` `_build_payload` returns a `verification_scope` of `public` or `full`. The public branch (`:114`) returns only certificate ID, student name, institution name, and `is_certified` — no CIDs, no PDF URL, no degree or grade.
- The full branch (`:102`) adds degree, department, year, grade, all three hashes, and a `documents_path` pointing at the gated endpoint rather than a raw gateway URL.
- `verification/document_views.py:35` `SharedCredentialDocumentsView` requires a share code, validates it against the certificate, decrypts server-side, re-verifies both hashes, returns a zip of both PDFs with `Cache-Control: private, no-store`. Single-use codes are consumed with a conditional `UPDATE` so two concurrent requests cannot both win.

**Fixed this pass**

- `expires_hours: null` no longer mints a never-expiring share. `certify/share_code_views.py` rejects an explicit null with a 400, defaults an absent value to 24h via `DEFAULT_SHARE_EXPIRY_HOURS`, and bounds it to `MAX_SHARE_EXPIRY_HOURS` (720). The previous code contradicted its own comment, which claimed full-document access always closes.
- `VerificationShareCode.create()` in `certify/models.py` now raises `ValueError` when `expires_at is None`, so no future caller can reopen the hole at the model layer.
- Migration `certify/migrations/0011_alter_verificationsharecode_expires_at.py` updates the field `help_text`, which had documented the now-forbidden "Null = never expires" behaviour.

**Outstanding**

- Share expiry does not fully control access until the item 1 contract change is deployed. On the current deployed contract a CID is still readable from chain state, so a third party could fetch the encrypted blob directly and bypass the share window. Once `finalizeCertificate` is redeployed without CIDs, the only route to the bytes is the share-code-gated endpoint, and expiry genuinely revokes access.
- The verification panel previously rendered an "IPFS CID" row from the public payload. That field was already absent from the response, so the row only ever showed an em dash, but it has been removed.

---

## 8. Confirm institutional setup behavior

**Status: Partial — setup exists, cross-flow consistency is unverified.**

> Reuse the existing officer signature setup where possible, but verify that configured signatures and institutional identity are consistently applied across all flows. Institution status upgrades remain out of scope.

**In place**

- Officer signatures configured once: `User.signature_image` via `POST /api/auth/signature/`, `front/app-next/src/components/dashboard/OfficerSignaturePanel.js`, `src/lib/signatureCanvas.js`.
- Institutional identity and visual assets configured once: `institutions.CertificateTemplate`, `CertificateBrandingPanel.js`, `/api/certificate-branding/`, and the `branding_preset` on each certificate.
- `certify/views.py:867` sets `branding_preset = "external_upload"` for externally supplied documents, which is the correct divergence — those flows bring their own marks and should not have the institution's applied over them.

**Outstanding**

- Nothing asserts that configured signatures and institutional identity are applied consistently across all three flows. The flows deliberately diverge on branding, and no test or check records that the divergence is intended rather than accidental.
- Item 5 is the blocker: until Flow 3 can apply a stored signature asset, "configured once and reused" is only true for asset capture, not for application to a document.

---

## Verification blocked

## Verification

The `cryptography` dependency that previously blocked every Django command is now installed, and the backend has been run for real rather than only compiled:

```bash
cd back/cred
pip install -r requirements.txt
python manage.py check                              # 0 issues
python manage.py makemigrations --check --dry-run   # No changes detected
python manage.py migrate                            # 0011, 0012 applied
python manage.py test                               # 10 passed
```

```bash
cd chain
npx hardhat compile                                 # solc 0.8.28
npx hardhat test                                    # 80 passing
```

Migrations `0011` and `0012` were hand-written and are now confirmed: Django reports no model drift, and both applied cleanly. The item 3 work added no model fields, so the migration set is unchanged.

`manage.py test` is still thin — `institutions/tests.py` (renderer invariance) and `certify/tests.py` (the transcript gate) are the only real test modules in the project. The lifecycle itself is still unexercised end to end; it has been verified by reading, by chain unit tests, by the renderer invariance tests and by these view guards, but not by an integration test that walks a certificate from draft to issued.

Not verified this pass: the frontend. `front/app-next/node_modules` is not installed, so the three changed client files were not linted or built. The changes are small and mechanical — one new ABI entry, two dispatchers, three call sites — but a Next build has not been run against them.

`chain/ignition/deployments/chain-31337/` still holds the pre-item-1, pre-item-3 ABI. Nothing in the app can work against the chain until that redeploy happens; see item 1.

## Known issues outside this list

Found during review, not part of the eight items:

- `front/app-next/src/lib/api.js` hardcodes `http://127.0.0.1:8000/api`, ignoring `NEXT_PUBLIC_API_BASE`, unlike six other pages that read the env var.
- `front/app-next/src/app/dashboard/admin/anchor/page.js` hardcodes the Hardhat Account #0 private key in client code. Local-dev only, but a real footgun if built for a live network.
- `mobile-app/src/screens/WalletSignInScreen.js` is dead code: missing the `ethers` dependency, imports two functions that no longer exist in `services/auth.js`, and is not registered in the navigator.
- `back/cred/certificates/` is an orphan directory holding a duplicate of `certify/ipfs.py` and is not in `INSTALLED_APPS`. `back/cred/notifications/` has no `urls.py` and is not exposed via the API.
- `admin/anchor` and `registrars/authorize` each maintain a separate copy of `REGISTRY_ABI`.
