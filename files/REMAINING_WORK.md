# Remaining Work

## Branding restart and consent ? 10 October 2026

Added **Start branding from scratch** above the upload workflow. Its consent dialog lists the number of unused drafts to discard and explains that uploaded masters, fields and crest/seal assets are removed. After confirmation the institution-scoped restart API deletes only the explicitly supplied unused drafts, removes their referenced files after commit, and returns the UI to initial file selection. Approved, active and credential-linked templates are protected; configured officer signatures and issued credentials are unchanged.

Separate amber actions clear field configuration (local/undoable) or reset a draft's fields and branding assets (saved, master retained). Consent is also required before replacement, field removal and approval. Native modal dialogs support Cancel/Escape and prevent interacting with the underlying editor while awaiting consent. Success and error notices are dismissible fixed notifications at the top-right rather than inline paragraphs. Buttons distinguish primary save/upload, green approval, amber reset/replacement and red full restart/removal.

Verification: 28 backend template tests and frontend ESLint passed. No destructive restart was performed against real institution records during implementation; interactive browser verification remains outstanding.


## Template editor navigation ? 10 October 2026

Upload guidance is now visible before file selection. A placeholder certificate is suitable as a layout reference, but printed placeholders must be removed in the source or explicitly cleared over their full area. Clean, upright, text-based blank masters are preferred; scans need clear full-page imagery. Unsupported date/other placeholders require deliberate treatment rather than being silently interpreted as graduation data.

The document editor now has select/move, drag-to-draw, eight resize handles, zoom, fit-to-width, scrolling, pan, keyboard arrows with larger Shift steps, right-click/X/Delete removal, double-click/Enter editing, and undo/redo with keyboard shortcuts. Labels are outside field boxes and can be hidden. Field overlaps produce warnings; new fields choose an area free of existing field boxes when available (not a semantic assessment of the master). Coordinates remain normalized and page-bound at any zoom. History resets when switching template versions.

Verification: all five geometry tests and ESLint for the changed components passed. Interactive browser verification remains outstanding.


## Certificate input validation ? 10 October 2026

Implemented shared backend validation before PDF generation, including preset rendering, plus field configuration and issuance form controls. Names allow 2?200 characters with letters/combining marks, spaces, initials, apostrophes and hyphens; digits, control characters and hidden formatting are refused. Official capitalization is retained. Graduation year is an integer from 1900 through the current year plus one, optionally narrowed by the template. Text fields have configurable minimum/maximum lengths within the database's capacities; graduation year uses numeric input, while textual labels use text input. Minimum readable font size is configurable from 6pt up to the selected font size.

Programs remain selected from active institutional catalog entries with department ownership checks. Catalog titles/classifications reject invalid text and lengths. New program titles are checked against the active template, and approving a template checks existing active programs. Credential creation validates catalog snapshots and template constraints before storing the record. A preflight endpoint checks actual credential values and measures configured text boxes without generating a PDF. Invalid data/overflow blocks generation; font reduction yields actionable warnings to widen the field or adjust typography, rather than shorten official names or award titles. Required signature snapshots remain enforced for final template rendering.

Validation: 31 focused data/template tests passed, the earlier 48 renderer/preparation regression checks passed, and ESLint passed for all four changed frontend files. Browser interaction and full wallet/IPFS issuance were not exercised.


## Uploaded institutional templates ? 10 October 2026

Certificate Branding now starts with an uploaded institutional master and manually labelled fields. PDF/JPEG/PNG sources, text/OCR evidence, page selection, draw-to-place rectangles, coordinate editing, font/size/alignment/color controls, crest/seal uploads and manual artwork extraction, sample PDF rendering, approval and fixed template revisions are implemented. Generated credentials capture the active approved revision; later template changes do not switch existing credentials. Prepared previews serve hash-verified original review/sealed bytes. The preset renderer remains a fallback for old records and institutions without an approved uploaded master.

The renderer preserves the master and populates approved field areas, with explicit region clearing and overflow errors. Officer signature areas use the existing approval-captured assets. This implements institutional template setup; automatic layout suggestions and the separate unsigned-document issuance flow remain future work. See [INSTITUTION_TEMPLATE_SETUP.md](INSTITUTION_TEMPLATE_SETUP.md) for configuration and limits.


**Flow 1 scan intake update:** PDF/JPEG/PNG pages can now be combined per document and manually rotated before review. Ten supplied photos exercised conversion and OCR. Clear unmasked identity details are still required for meaningful comparison. Automatic orientation/perspective correction, dense transcript table parsing and model-backed mark detection remain outstanding.

**10 October 2026 update:** Tesseract was verified through the backend against an image-only PDF. Optional `TESSERACT_CMD` configuration now complements PATH discovery. The issuance selector reflects the three intended flows; unsigned-document placement is a planned preview, while existing certificate-only draft routes remain supported. Model integration, editable signature placements, and final PDF composition for Flow 3 remain outstanding. Historical test totals below are not new verification claims.

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
- `encrypt_document` is called in all five write paths: `certify/views.py:350, 634, 810, 836, 938`. It used to be called in two more, in the now-deleted `certify/transcript_views.py`.
- Pins go up as `.enc` with `application/octet-stream`. `certify/ipfs.py:56` `fetch_file_from_ipfs` is server-side only and documented as never exposed.
- `verification/document_views.py:30` re-hashes the decrypted bytes against the anchored hash before serving, so a decrypted document can never drift from what was anchored.
- Single backend key `CREDENTIAL_DOCUMENT_ENCRYPTION_KEY` (`cred/settings.py:190`). Note this is one global key, not per-document — key compromise exposes every credential.
- `CertificateRegistry.sol` no longer accepts or stores a CID anywhere. Removed from the `Certificate` struct, from the `CertificateFinalized` event, and from the parameters and `require` guards of `submitCertificate`, `registerCertificate`, `_submitLegacy`, and `finalizeCertificate`. The only remaining mentions of "CID" in `chain/contracts/` are prose in comments.
- `finalizeCertificate(certificateId, docHash)` is now hash-only. The registrar's backend keeps the encrypted-blob reference.
- Client updated: `walletActions.js` `CERT_ABI` inputs trimmed for all three functions, and `finalizeCertificateOnChain` no longer passes `ipfs_cid_json` / `ipfs_cid_pdf`.
- `CertificateVerifyPanel.js` no longer renders an "IPFS CID" row in the verification result.
- 5 new tests cover the paired path in `chain/test/CertificateRegistry.test.ts`, including a regression guard that Chancellor approval does **not** auto-issue a paired credential. The chain suite has since grown further; see Verification for the current total.

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
- Database: `certify/models.py` `transcript_hash`, `ipfs_cid_transcript`, `ipfs_url_transcript` on `Certificate`. There is no standalone `Transcript` model — that existed, was unreachable, and has been deleted (`0014_delete_transcript`; see `TRANSCRIPT_IMPLEMENTATION_REVIEW.md` §1a).
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

**`prepare/` had never been executed — it was broken in two ways**

`CertificatePrepareView` is the endpoint every system-designed credential must pass through, and it had no test at all. Both faults were found only when it was called for real, on a certificate that had been sitting in draft:

1. `POST /api/certificates/<id>/prepare/` returned 500 with `CREDENTIAL_DOCUMENT_ENCRYPTION_KEY must be configured as 64 hex characters.` The key was absent from the local `.env`. A development key was generated; it is ignored and untracked, and must never be committed or shared.
2. The view sealed the review copy as `encrypt_document(..., "certificate-review")`, but `_AAD_DOMAINS` permitted only `certificate` and `transcript`. So even with a valid key the request would have failed on the next line. The view's `document_kind` and the module's allowlist had drifted apart with no shared test.

The second is the more serious one, and it is a property of the design rather than of the missing key: the review copy is a *different document* from the certificate the student eventually receives, and it is stored under a different reference. Sealing both under the `certificate` domain would mean AES-GCM authenticates them identically, so the review blob would be openable as the issued document — a reviewer could approve one set of bytes and the graduate be handed another. `certificate-review` is now its own AAD domain, and `CertificatePrepareTests` asserts the review blob cannot be decrypted as `certificate`, as `transcript`, or against another credential, while still opening in its own domain.

`DocumentEncryptionError` is a bare `ValueError`, so the unconfigured key surfaced as a 500 traceback that told the Registrar nothing. All six sealing call sites now go through `_seal()`, which converts a key fault into a single actionable `detail` naming the setting — still a 500, because it is a deployment fault and not the caller's — and, importantly, fails *before* anything is pinned, so the fault cannot leave an orphan IPFS blob or a credential marked `PENDING_VC` with no document behind it. A missing key, a short key, a non-hex key and an unknown AAD domain are each covered, and both faults were verified non-vacuous: reverting the allowlist or the `_seal` wrapper makes the new tests fail.

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
- **The second, divergent transcript lifecycle has been deleted.** `certify/transcript_views.py` implemented an approval chain over a standalone `Transcript` model with its own status enum and its own CIDs. It never touched the contract, so a standalone transcript could be "fully approved" with no on-chain record whatsoever. It also held the only six broken `log_action` calls in the backend — every one of its endpoints was returning 500, unnoticed precisely because no client called it. Removed: the model, seven endpoints, six serializers, the `transcript_id` serializer field, and the two document-endpoint fallbacks that queried it (migration `0014_delete_transcript`). The three live references that a naive deletion would have broken are gone too. Flow 2 already creates a certificate from an existing transcript, which is what the standalone model was reaching for.
- **Flow 2's linkage is not tracked as its own item in the design doc.** `CREDENTIAL_ISSUANCE_PIPELINE_DESIGN.md:92` describes creating a certificate in INTELLIGENT ACADEMIC CREDENTIALING and uploading an existing transcript, but no item owns making transcript data actually populate the generated certificate. The endpoint exists (`/api/certificates/from-transcript/`) and the flow runs, so the gap is not visible from either document alone.
- `finalizeCertificate` remains on the contract for the legacy path, where the document genuinely does not exist until after approval, so `docHash` is legitimately still zero at submit and is set for the first time at finalize.
- The committed `chain/ignition/deployments/chain-31337/` artifact predates both `submitDocumentForApproval` and the new `finalizeCertificate` guard, so this item needs the same redeploy as item 1. Both are covered by one step: `bash scripts/redeploy-local.sh` keeps the local address stable.

**Verification note**

`chain/hardhat.config.ts` now enables the optimizer in the `default` profile, not just `production`. Unoptimized, this contract exceeds the 24576-byte EIP-170 limit (28479 bytes) and would fail to deploy; optimized it is 16263 bytes. Previously `compile`, `test` and `deploy` could run under different profiles and produce artifacts that disagreed, so a deploy could fail only at the point of on-chain submission. The registry is called a handful of times per credential with no hot loops, so favouring code size costs nothing.

---

## 4. Complete document analysis and mismatch handling

**Status: Partial — extraction, comparison, the persisted review decision, the submission gate and the browser UI are all in place and tested. OCR threshold tuning against real scans is still unverified.**

> Fields compared: `student_name`, `degree_title`, `institution`, `graduation_year`. The design doc's two requirements pull in opposite directions — automated checks must stay advisory, and a document must never be bound to a student without human review — so they are separated rather than averaged. A mismatch may be cleared by a person with a stated reason, but *the absence of a decision blocks submission*. There is no path by which a document reaches the chain unreviewed.

**In place**

- `certify/field_extraction.py` — label-anchored extraction (same-line and next-line), accent/case/punctuation folding, per-field similarity thresholds, and a generic-token disjointness cap so "University of Mines" cannot match "University of Ghana". `compare_fields` emits `match` / `mismatch` / `not_found` / `not_compared`; `not_compared` (no intake value recorded) does not gate. 16 standalone checks in `certify/test_field_extraction.py`.
- `certify/models.py` `DocumentReview` (+ migration `0013_documentreview.py`) — persists `extracted`, `comparisons`, `summary`, `ocr_used`, `page_count`, `document_sha256`, `state` (`pending` / `resolved` / `overridden` / `rejected`), `resolution_note`, `overridden_fields`, `reviewed_by`, `reviewed_at`.
- `POST /api/certificates/<id>/analyze-document/` — analyses a PDF without storing it, accepts `expected_*` overrides so a pre-submit check runs against the values the Registrar actually typed, and stores the result as a pending review. Re-analysis resets any prior decision: a sign-off only ever applied to what was shown.
- `POST /api/certificates/<id>/document-reviews/<kind>/resolve/` — `approve` is refused while anything is unresolved; `override` and `reject` both require a reason and are recorded against the actor. `rejected` blocks and cannot be overridden back to resolved.
- `certify/document_review_views.py:74` `document_review_gate` — refuses on-chain submission while a required review is missing, blocking or stale. Staleness is checked by comparing the review's `document_sha256` against the SHA-256 of the bytes about to be committed, which is what stops a review being inherited by different content.
- Gate applied before encryption/IPFS pinning in `CertificateUploadAndAnchorView` and `CertificateUploadTranscriptView`, so a blocked credential costs nothing and leaves no orphan blobs.
- `document_reviews` exposed on `CertificateDetailSerializer`; analysis and every decision written to the audit log.
- System-designed credentials are not gated: a certificate rendered *from* the intake data would only ever agree with itself.
- `front/app-next/src/components/DocumentReviewPanel.js` — one panel serving both entry points. Passed a `File` it offers "Read and compare document" and the approve/override/reject controls; passed no `File` it is a read-only display of a review the record already carries. Shows the extracted value next to the record value per field, with the similarity percentage and a plain-language reason for anything unresolved.
- Wired into `ExternalUploadFlow.js` (Flow 1 and 2) and `certificates/[id]/page.js` (Flow 2's transcript attach, plus a review record). The *same* `File` object is sent to `/analyze-document/` and then to the anchor call, which is what makes the hash comparison meaningful. Changing or clearing a file drops the verdict client-side rather than leaving a resolved review next to an unread document; the hash check remains the authority.

**Outstanding**

- OCR threshold tuning and representative transcript coverage remain unverified against real scans. **Deferred by decision** — the requirements are being discussed with the registry office, and the only real scans currently available came with a watermark and required OCR, so tuning thresholds against them would bake in assumptions that have not been agreed.
- **Extraction is being tested against system-generated certificates instead** (vector text, PyMuPDF only, no OCR), via `render_sample_certificate` feeding `diagnose_extraction`. A generated certificate is a fixture we control end to end: the field values are known, the renderer is deterministic, and the text needs no OCR — so a failure there is unambiguously a geometry or line-grouping fault rather than an OCR fault. Four characterisation tests in `certify/test_field_extraction.py` pin the results below (26 → 30 checks). **The extraction logic has not been changed.**
- **Result 1 — every field is right, but every field is decided by the weaker route.** All four configured fields come back `verbatim_match` at similarity `1.0`. `extract_fields` returns `{}` — *nothing* is read from a label. The certificate says "This is to certify that", "has been awarded the", "degree of Bachelor of Science in Computer Science"; none of "This is to certify that", "has been awarded the" or "degree of" is in `FIELD_LABELS`, and the word "University" in "Cavendish University Sierra Leone" is *part of the value*, not a label preceding it. So label matching contributes nothing on our own documents.
  **Why that matters beyond tidiness:** a verbatim fallback can only answer "does this string appear anywhere in the document". It cannot distinguish a name read from the name field from the same string appearing in a reference number, a footer or a signature. Every field passing here is a true positive for this fixture, but the mechanism would equally accept a document where the name appears once, in the wrong place, and nowhere else.
- **Result 2 — the column-merge defect reproduces exactly, with no OCR involved.** `_lines_from_pages()` groups on Y within a `3.0` tolerance, so the three signature blocks merge. On the review copy the signature row comes back as one line, in X order:
  ```
  Registrar Vice Review Chancellor copy — unsigned, not yet issued Dean
  ```
  The centred review-copy marker (`sig_y - 9mm`) lands in the same band as the three role labels (`sig_y - 9mm`) and is interleaved between them. On the issued copy the same grouping produces `Adaeze Kamara Josephus K. Yumpha Elizabeth K. Conteh` as a single line, collapses all three `Digitally Verified — …` lines into one, and merges the two `Tx:` lines. A value sitting in any of those positions cannot be attributed to its label. This is the same defect seen bleeding two columns on the scanned research document, now reproduced on a document whose layout we fully control — which is what makes it a safe place to fix it.
- **Result 3 — no encoding damage.** The `·` separator renders as `?` in the console, which is a `cp1252` stdout artifact, not an extraction fault: the extracted text holds `U+00B7 MIDDLE DOT` and there are no `U+FFFD` replacement characters anywhere. Worth stating because a replacement character would silently break every similarity score.
- **What this does not prove:** that the extractor survives registry-issued scans. Generated certificates are laid out by our own renderer, so they are the easy case — no skew, no noise, no watermark, and labels that match our own wording because we wrote both sides. A real certificate is none of those things. This run isolates the line-grouping layer and shows it is broken; it says nothing about the OCR layer, and nothing about real documents should be concluded from it.
- `approve` does not require the listed `fields` to cover every unresolved comparison; a caller can override with a partial list. Harmless in practice because `overridden` clears the whole review, but the audit record can understate what was accepted.
- The gate was verified by disabling enforcement and confirming its tests fail, not by driving the browser end-to-end against a real scanned PDF.

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

**Status: Done.**

> Invite tokens currently default to a 48-hour lifetime, not 24 hours. Confirm that an active claim link isn't unnecessarily replaced, expiry requires Registrar resend, and a successful claim gives the graduate both documents as one credential in the mobile app.

**Fixed this pass**

- 24-hour TTL in all seven locations: `cred/settings.py:227`, `.env.example:50`, `certify/models.py:201` and `:255`, `certify/views.py:142` and `:1020`, plus the student-facing error text at `mobile-app/src/screens/StudentWelcomeScreen.js:139`. `STUDENT_INVITE_TTL_HOURS` is the only place the default now lives.
- An active claim link is no longer silently replaced. `certify/views.py:100` `notify_student_issued` gained `force=False` and returns early when an unexpired, unused token exists. It also no longer re-sends WhatsApp in that case, so a retried finalize cannot spam the student. Return value gained `invite_created` and `invite_expires_at`.
- Rotation is now explicit. `CertificateResendInviteView` (`:1072`) passes `force=True`, which is the deliberate "student missed it / link did not arrive / window expired" path.
- The raw token exists only at creation time, so reuse means the registrar is not handed a fresh `claim_url` in that case. That is intentional — a new link would invalidate the one the student holds.
- A successful claim delivers the pair as one credential. `GET /api/my-certificates/<certificate_id>/documents/` is owner-scoped, returns a zip of both decrypted PDFs with re-verified hashes, and is reached from `mobile-app/src/services/certificates.js` `downloadMyDocuments` via the share sheet on `CertificateDetailScreen`. This is the only route by which a student can obtain the PDFs at all, since public verification deliberately serves no documents (item 7).

**Outstanding**

- The 24h window applies to the invite token only. Any re-notification path outside `notify_student_issued` still needs checking.
- Mobile delivery is verified by `mobile-app/scripts/parse-check.js` and by review, not by running the app: `mobile-app` has no ESLint config and no test runner, and no Expo/Metro build has been executed.

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

## 10. Restore on-chain roles after a local chain reset

`submitForSealedReview` reverted with `caller is not an active registrar/issuer`. The
account was correct; the chain had no roles at all:

```
institutionCount = 0
isActiveIssuer / isAuthorizedRegistrar = false for every account
blockNumber = 2        (only the two deployment transactions)
```

`onlyActiveRegistrar` accepts `isActiveIssuer(msg.sender) || isAuthorizedRegistrar(msg.sender)`,
so with nothing registered *no* account could submit. The node had been restarted, which
wipes all state in memory, while Django still held `CUSL-SL-01 | is_chain_active=True`.

`is_chain_active` records that a `registerIssuer` transaction was confirmed *at some
point*. It is not "this institution is registered right now", and nothing kept the two
in step. The consequence was that the anchor page — the one screen whose job is exactly
this repair — loaded `?is_chain_active=false`, so an institution the database believed
was anchored was filtered out of it. The registrar's transaction reverted, and no page
in the app could re-register the institution. Recovery was a manual DB edit plus raw
contract calls.

A redeploy could not repair it either: the Ignition module deploys the two registries
and stops, so every fresh chain was a chain on which nothing could be issued.

- `chain/scripts/seed-local-roles.mjs` — idempotent. Reads current state and sends only
  what is missing, so it is safe against an already-seeded chain. Reads the compiled
  artifact ABI rather than re-typing signatures, because these functions return a
  Solidity struct and a hand-written copy is precisely the drift it exists to prevent.
  Run order is forced by the contract: only the `IssuerRegistry` owner may register an
  institution, and only an active institution may authorize anybody. Refuses to proceed
  when an already-registered `institutionId` disagrees with the supplied one, because
  the contract stores that string and `sync_chain_events` joins on it — seeding anyway
  would produce credentials that never resolve to a Django institution. Wired into
  `redeploy-local.sh` as a non-fatal step, so a wrong `SEED_INSTITUTION_ID` cannot throw
  away a deploy that already succeeded.
- `chain/test/seed-local-roles.test.ts` — 6 tests (chain suite 80 → 86) covering a fresh
  chain becoming able to accept a submission, a second run sending nothing, partial
  states being repaired rather than assumed, and the `institutionId` mismatch being
  refused without disturbing the existing registration. The idempotency assertions were
  verified non-vacuous: with the `isSet()` guard removed, two of them fail.
- `front/.../admin/anchor/page.js` — reconciles against the chain instead of trusting
  the flag. It loads every institution that has a wallet and asks
  `isActiveIssuer(wallet)`, then distinguishes three states: `pending` (never anchored),
  `registered` (confirmed on-chain, shown as a confirmation rather than a card to act
  on), and `drifted` — the database says anchored but the contract disagrees, rendered
  with the revert reason spelled out and a **Re-Register On-Chain** action. A failure to
  read chain state is reported as its own state rather than being rendered as "not
  registered", which would send `registerIssuer` for already-active institutions and
  revert on `already active`. `registerIssuer` re-uses the existing anchor endpoint, so
  the stale `anchor_tx_hash` is overwritten with the transaction that is actually on the
  current chain.

**Outstanding**

- The registrar's submit path still fails at the wallet with a raw revert string. The
  registrar has no on-chain role precheck, so the first signal that an institution is
  unregistered is a failed transaction. The anchor page now makes the cause recoverable,
  but a preflight `isActiveIssuer` check on the submit button would be better than
  either.
- `sync_chain_events` flips `is_chain_active` from chain events, but nothing detects the
  inverse: a chain that lost state while the database kept the flag. The anchor page
  detects it per institution on demand; a scheduled reconciliation would catch an
  institution nobody visits.

---

## 11. Institutional marks — seal / stamp. Not started

The branding settings cannot configure a seal or stamp, and neither can the renderer draw
one. This is a straight gap rather than a bug, recorded here so it is not rediscovered as
one. **Deliberately not implemented**: the requirements are being discussed with the
registry office, and the layout decision (where the mark goes, whether it appears on the
review copy, whether it is uploaded artwork or generated) should not be guessed here.

**What exists today**

- `institutions.CertificateTemplate` has exactly four columns: `institution`, `preset`,
  `logo`, `updated_at`. There is no seal, stamp, emboss, watermark or QR field.
- `CertificateBrandingPanel.js` sends exactly `preset`, `logo`, `clear_logo`. No seal
  control, no position control, no colour or font control.
- `generate_certificate_pdf` takes four arguments — `certificate`, `template`,
  `verification_base_url`, `include_attestations`. Every coordinate in the file is a
  hardcoded local (`pdf_certificate.py:76-79` frames, `:158-162` signature slots, `:244`
  QR). There is no layout data on the template and no mechanism to override a position.
- The only images the renderer places are the logo (`:90`) and up to three officer
  signature images (`:169`). A repository-wide search for `seal_image|stamp_image|
  seal_position|emboss|watermark_image` returns nothing.
- The QR code is drawn unconditionally at one hardcoded spot (`:234-244`) with no
  parameter to disable, resize, reposition or restyle it.

**Two things that are not what they look like**

- The contract's `sealRequired` / `sealedDocHash` / `finalizeWithSealedDocument`
  (`CertificateRegistry.sol:155-170`, `:406`, `:656`) are a *hash commitment and
  lifecycle routing* concept. `sealRequired` is what stops `approveAsChancellor`
  auto-issuing, and what routes the credential to `finalizeWithSealedDocument`. There is
  no graphical counterpart anywhere in the repository.
- `_seal()` in `certify/views.py:86` "seals" bytes in the AES-GCM sense. It has nothing to
  do with a rubber stamp.
- `include_attestations=True` draws a *visual* signature block, but it is text plus
  signature images plus a literal `"Digitally Verified"` string and a truncated on-chain
  tx hash printed as text. There is no cryptographic PDF signature — no PKCS#7, no PAdES,
  no `pypdf`/`endesive` dependency. `reportlab` is the only rendering dependency.

**Also absent, and listed here so the mark is not the only gap:** the "Digital Seal" in
`globals.css` and `CertificateHeroSvg.js` belong to the marketing landing page
(`CertificateHero.js` is used only by `HeroSection.js` and `CallToAction.js`), and
`CertificateHeroSvg.js` is dead code — nothing imports it. Neither is a certificate.

**Where the renderer leaves free space**, for whoever implements this: the bottom-left
region inside the frame is empty. The QR sits at `width - 42mm, 18mm` (bottom-right), the
signature slots begin at `32mm` and span `55mm` each, and both footer lines are centred.
A mark at roughly `(24mm, 20mm)` at `26mm` square would collide with nothing. Overlapping
the Registrar signature is the traditional placement but permanently covers part of it,
and would overlap differently between the review and issued renderings.

**Design questions that must be answered before implementing, not guessed**

1. Uploaded artwork, a seal generated from the institution name and id, or an upload with
   a generated fallback? An institution with no configured asset currently gets a plain
   certificate with no mark and no warning.
2. Where does it sit, and does the position vary per institution or is it fixed?
   Bottom-right currently holds the QR, so choosing it forces a decision about the QR.
3. Does it appear on the review copy or only on the issued document? It is institutional
   identity rather than an approval, so putting it on both is defensible; but the
   review copy is explicitly the document the officers are asked to approve
   (`include_attestations=False`, `pdf_certificate.py:23-30`), so a mark that appears only
   at issuance is a document they were not shown.
4. Does the mark need to be *verifiable* rather than decorative — i.e. carry the
   verification URL in machine-readable form — or is it purely institutional artwork?
   A decorative seal asserts authenticity that nothing on the page substantiates.

**A pre-existing inconsistency this would multiply.** The logo is read live from the
template at render time, not snapshotted onto the certificate the way `branding_preset`
is (`certify/views.py:486`). Nothing re-renders the review copy, so the committed
`doc_hash` still refers to bytes that were pinned once — but if branding is edited
between `prepare` and `finalize`, the issued document will carry a *different* crest than
the officers approved. A seal is far more conspicuous than a header logo, so the window
for that inconsistency to be noticed is smaller. Snapshotting the mark (and the logo) onto
the certificate at `prepare`, as `branding_preset` already is, would close it.

---

## Verification

The `cryptography` dependency that previously blocked every Django command is installed, and the backend has been run for real rather than only compiled:

```bash
cd back/cred
pip install -r requirements.txt
python manage.py check                              # 0 issues
python manage.py makemigrations --check --dry-run   # No changes detected
python manage.py test certify                       # 114 passed
python manage.py test institutions accounts audit verification notifications   # 22 passed
python certify/test_field_extraction.py             # 26/26 passed
```

```bash
cd chain
npm test                                             # 86 passing
```

The full Django suite is 136 tests, run per-app above only because the runner
exceeds a single command timeout; `python manage.py test` reports the same 136
as `OK`.

```bash
cd front/app-next
npm run build                                       # compiled, 30 routes
npx eslint src                                     # 35 errors, 1 warning, see below
```

```bash
cd mobile-app
node scripts/parse-check.js                         # all sources parse
```

```bash
cd chain
npx hardhat compile                                 # solc 0.8.28
npx hardhat test                                    # 80 passing
```

Migrations `0011`–`0015` are applied and Django reports no model drift. `0014` drops the
deleted legacy `Transcript` table; `0008`, which created it, is left untouched because it is
mid-chain and already applied in existing databases. `0015` adds `Certificate.transcript_file`,
the local draft copy of the paired transcript (see item 9).

**The ESLint debt is a codebase-wide pattern, not a handful of files.** `npx eslint src` reports
**35 errors and 1 warning across 32 files**, and 31 of the 35 are a single rule:
`react-hooks/set-state-in-effect`. The shape is always the same — a `useEffect` that calls an
async `load()` which sets state on entry. This is how the whole app fetches data.

An earlier version of this file claimed "3 pre-existing errors", citing
`approvals/page.js:45`, `certificates/[id]/page.js:163` and `officers/page.js:68`. That count
came from linting only the files this work had touched. It understated the debt by more than
ten times and should not be read as "three errors exist".

The remaining four: 3 × `react/no-unescaped-entities` (a literal apostrophe in JSX text), 1 ×
`react-hooks/exhaustive-deps` (a missing `verify` dependency, warning), 1 × `react-hooks/purity`
(`Date.now()` during render, `certificates/new/ExternalUploadFlow.js:306`).

None are regressions from the notification or chain-config work, and none block a build —
`npm run build` succeeds because these are lint rules, not compile errors. But "the build
passes" and "the code is clean" are different claims, and only the first one is true here.
Fixing the 31 means restructuring data loading across the app (a fetch-on-render or
data-library approach), not a one-line change, so it is called out rather than quietly
suppressed file by file. `ChainConfigPanel` carries a targeted disable with a comment
explaining why, rather than adding another bare error to the pile.

`manage.py test` is still thin relative to the surface area. The 136 tests cover the transcript gate, field extraction, document review, review-document sealing, resumable draft storage and discard, invite TTL and token reuse, encrypted delivery, share codes, chain config permissions, the indexer's chain-id guard, and officer attestation notices; they do **not** walk a certificate from draft to issued through every actor, and there is no integration test covering the contract boundary. The lifecycle is verified by reading, by chain unit tests, by renderer invariance tests and by these view guards.

The browser notification path is unverified. Its argument-order bugs were exactly what a browser check would have caught.

`chain/ignition/deployments/chain-31337/` still holds the pre-item-1, pre-item-3 ABI. Nothing in the app can work against the chain until that redeploy happens; see item 1.

## 9. Make the upload drafts resumable — done

The full-upload and transcript-first flows had no way out of a half-finished record. Both
documents were only ever sent inside the single `upload-and-anchor/` request that pins them
and moves the record to `pending_vc`, so a refresh, a closed tab or a failed request lost the
selection outright, and a Registrar who started a record by mistake had no way to discard it —
it just sat in the list as a dead "Draft".

What changed:

- **Documents are saved to the draft the moment they are chosen**, encrypted, in ordinary
  Django media storage (`POST /api/certificates/<id>/save-draft-document/`). This is the part
  worth being explicit about: **no IPFS write happens here.** Pinata is a metered, rate-limited
  service and autosave fires on every file selection, so pinning a draft that may be abandoned
  would spend quota to store bytes nobody will ever verify. The anchored fields —
  `doc_hash`, `transcript_hash`, `ipfs_cid_pdf`, `ipfs_cid_transcript` — stay blank for the
  whole drafting phase, so "this document is on the chain" is never true for a record no officer
  has seen. A file is pinned exactly once, by the unchanged `upload-and-anchor/`.
- **A reopened draft is fully restored**: student details, the saved PDFs (fetched decrypted
  through `GET /api/certificates/<id>/draft-document/`), and the review decisions already
  recorded against them. A banner states plainly what came back.
- **Clearing a file clears it on the server too** (`DELETE` on the same route), including the
  `DocumentReview` row made against it. Without this, "no document" would mean different things
  in the browser and on disk, and the next reopen would resurrect a file whose decision was
  still attached.
- **Discarding a draft hard-deletes it** (`POST /api/certificates/<id>/abandon/`), with the
  document files and reviews going with it via cascade. Guarded to `DRAFT` with no `tx_hash` and
  no `cert_hash`, so anything that reached the chain has to be revoked rather than deleted. The
  audit entry is written first and outlives the row, so "this was created and then abandoned"
  stays answerable.
- **"Back" no longer destroys the documents.** It used to call both clear handlers, so going
  back to check a detail threw away the files the Registrar had just chosen.
- **The upload flows were unreachable.** `certificates/page.js` and `certificates/[id]/page.js`
  only rendered a "Continue" link for `flow_type === "system_designed"`, so an upload-flow draft
  had no button to resume it — which made the whole feature unusable. Both now offer
  "Continue upload" for `full_upload` and `transcript_then_cert`.
- **Side-by-side review.** Each document is now one workbench: the PDF on the left, the "Read and
  compare document" action and the extracted field table on the right. Checking a document is a
  comparison, and the previous stacked layout made every field a hunt.

The integrity of this rests on properties that already existed and were not weakened:
`DocumentReview.document_sha256` binds a decision to the exact bytes analysed, and
`upload-and-anchor/` re-hashes what it receives and re-runs the review gate, so a document
changed in local storage is caught at submit time rather than assumed to be what was reviewed.
The AES-GCM associated data binds each stored file to its certificate id and document kind, so a
blob lifted out of one draft and dropped into another fails to decrypt rather than rendering as
the wrong student's document — there is a test for exactly that.

One bug was found and fixed on the way in: `DocumentReviewPanel.js` called `api.post()` without
importing `api`, so **every** review decision (approve / override / reject) threw
`ReferenceError: api is not defined` at runtime. The panel looked correct and the button did
nothing.

Still unverified: this has been exercised through the test suite and a production build, not
through a browser. The PDF-in-an-iframe rendering on both sides of the workbench in particular
wants a real look.

## Known issues outside this list

Found during review, not part of the nine items. Fixed items are kept here so the reasoning is not lost.

- ~~`front/app-next/src/lib/api.js` hardcodes `http://127.0.0.1:8000/api`~~ — **fixed.** Now `process.env.NEXT_PUBLIC_API_BASE` with the old value as fallback, so a missing env var degrades to previous behaviour rather than requesting `/api` on the wrong origin.
- ~~Three components pinned the API origin outright, ignoring the env var~~ — **fixed.** `app/setup/page.js`, `dashboard/OfficerSignaturePanel.js` and `dashboard/CertificateBrandingPanel.js` each had a bare `const API_BASE = "http://127.0.0.1:8000/api"`, which is worse than `api.js` was: on any deployment that was not localhost those three would have called the developer's own machine. All three now read the env var with the same fallback. Nine other files had already been doing this correctly, and one (`certificates/[id]/page.js:230`) inlines the expression at the call site instead of using the `api` helper — consistent, but it means the constant is duplicated rather than centralized.
- ~~`admin/anchor/page.js` hardcodes the Hardhat Account #0 private key~~ — **fixed, by removing the need for it.** The page signs through MetaMask, so the key was never a signing input; it was a *printed hint* telling the admin which account to import. Both the key and the hardcoded account address are gone. What replaced them is the chain configuration being editable at runtime:
  - `institutions.models.ChainConfig` — a single-row model holding RPC URL, chain id, both registry addresses, and an optional expected registry owner. Seeded from settings on first read. Deliberately has no key field; there is a test asserting none is ever added.
  - `GET/PATCH /api/chain-config/` — readable by any authenticated user, writable by a Super Admin only, audited.
  - `front/app-next/src/components/dashboard/ChainConfigPanel.js` — the read-only Settings → Blockchain tab is now an editable form for Super Admins.
  - The anchor page now reads its registry address and expected chain from that config instead of `NEXT_PUBLIC_*` (which is baked in at build time, so changing network previously required a frontend rebuild), and it **checks** two things it never checked before: that the connected wallet is on the configured chain, and that the contract's `owner()` matches the configured expectation. Both are surfaced as warnings before any transaction is sent.
  - `chain_id` is seeded from a new `ETH_CHAIN_ID` setting (default `31337`, the Hardhat chain id) rather than left null. A null seed would have left the wrong-network warning inert on every fresh install until a Super Admin happened to open the settings form — a check that looks present and does nothing. The seed only runs on first creation, so it never overwrites a value an admin has since set.
- `mobile-app/src/screens/WalletSignInScreen.js` is dead code: missing the `ethers` dependency, imports two functions that no longer exist in `services/auth.js`, and is not registered in the navigator.
- `back/cred/certificates/` is an orphan directory holding a duplicate of `certify/ipfs.py` and is not in `INSTALLED_APPS`. Safe to delete after confirming nothing imports it. **Do not extend that to `back/cred/notifications/`, which is a live package**: it has no `urls.py` and no views, but `notifications/whatsapp.py` is imported by `certify/views.py` and `verification/consent_views.py` and is the transport for student issuance invites and consent requests. Its lack of `urls.py` is correct — it is a service, not an endpoint.
- `admin/anchor` and `registrars/authorize` each maintain a separate copy of `REGISTRY_ABI`. The `registrars/authorize` copy is also stale: it declares `authorizeRegistrar` / `revokeRegistrar` where `walletActions.js` uses `authorizeVC` / `authorizeChancellor`.
- `CERTIFICATE_REGISTRY_ADDRESS` is declared in `settings.py` and `.env.example` and read by zero lines of Python. Now also surfaced in the chain config, which is where it is actually used. Same for the two new `ETH_RPC_URL` / `ETH_CHAIN_ID` settings: they are a first-run seed for the `ChainConfig` row, not live configuration.
- ~~`manage.py sync_chain_events` silently no-ops on a clean install, and has no chain-id check~~ — **partly fixed, and the pin conflict behind it is real.** The command read `settings.ETH_RPC_URL` / `ISSUER_REGISTRY_ADDRESS`, so once the chain became UI-configurable it would keep indexing the *old* chain while the signing UI moved — still flipping `is_chain_active` and officer activation from a chain the app no longer considered authoritative. It now reads the same `ChainConfig` row, and refuses to sync if the RPC reports a different chain id than the configured one (an unreachable URL is not the same as the right network). Covered by `ChainConfigIndexerTests`, which injects a `web3` stub rather than skipping, because a skipped test would leave the guard unverified.
  - **The underlying dependency conflict is not fixed, because it cannot be fixed without touching authentication.** `web3` and `eth-account` are in direct conflict: `eth-account==0.13.4` is pinned and load-bearing (`institutions/wallet_auth.py` recovers a signer address for every wallet login), `web3` 6.x requires `eth-account<0.13`, and `web3` >=7.13 requires `eth-account>=0.13.6`. `web3==7.0.0` is the newest release whose declared constraint the existing pin satisfies, so that is what `requirements.txt` now pins — but **that pin is unverified by installation**, and the version currently installed in this workspace is `web3 7.16.0`, which does not import at all. The indexer has therefore never successfully run here. Reconciling this properly means testing an `eth-account` upgrade against wallet auth, which is a separate piece of work.
  - The command's `ImportError` path used to say "web3 is not installed. Run: pip install web3" — which is what an operator sees when web3 *is* installed and broken. It now reports the underlying import error and the actual pin.
