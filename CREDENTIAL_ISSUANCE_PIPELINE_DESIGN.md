# INTELLIGENT ACADEMIC CREDENTIALING Credential Issuance Pipeline Design

## Purpose

This document describes the intended certificate and transcript lifecycle across the three Registrar workflows. Each workflow has a different intake path, then joins one shared review, approval, and blockchain anchoring pipeline. It is a product and implementation design; items marked **Planned** are not claims about current behavior.

## Core rules

- A credential belongs to one graduate and contains a certificate and transcript as separate documents.
- The certificate and transcript are each hashed independently after their content and signatures are final. Their hashes are paired with the same credential/student record for registration.
- Finalize both PDFs and fix their hashes before VC and Dean review. Each officer then approves the exact bytes that will be anchored; the Registrar's final transaction completes issuance without changing either document.
- Encrypt each final PDF with authenticated encryption before pinning it to public IPFS. The backend retains the encryption key and decrypts only after validating graduate ownership or an active verification share. Store hashes in public chain state, but keep CIDs off-chain and out of public responses.
- Student and award information is collected at intake and compared with information extracted from the uploaded documents. Mismatches must be shown to the Registrar for resolution before submission.
- The Registrar attests to the submitted credential. The VC reviews the full documents and approves on-chain first; the Dean reviews and approves on-chain next; the Registrar performs the final anchoring transaction.
- Officer identity and signature assets are configured once and reused. Routine issuance must not ask an officer to invent or upload a new signature each time. Institutional details are configured once; institutional status upgrades are future scope.
- AI and document analysis provide evidence and suggestions. The Registrar remains responsible for review, placement adjustments, and attestation.
- Public verification does not reveal either PDF. Full document verification is available only through a graduate-controlled, time-limited share.

## Document reading: text layer first, OCR fallback

Text extraction and layout analysis are distinct, complementary tasks:

1. Use PyMuPDF or pdfplumber to extract embedded text and bounding boxes from text-based PDFs. This is the default path for system-generated certificates and transcripts with a text layer.
2. Check whether extraction returned enough usable text. If the PDF is scanned/image-only or its text layer is absent or insufficient, run OCR as a fallback and retain the OCR text coordinates/confidence where available.
3. Do not require Tesseract in the pipeline until representative source transcripts have been checked and shown to require OCR. Keep OCR behind a replaceable service boundary so it can be added without changing the issuance workflow.

Extracted text supports identity/award matching and locating labels such as Registrar, Vice Chancellor, and Dean. Bounding boxes support layout review and candidate signature placement. Neither text extraction nor OCR authenticates a document or proves that a stamp, seal, or signature is genuine.

## Shared pipeline

```text
Flow-specific intake
        |
        v
Collect student/award details + upload or generate documents
        |
        v
PDF validation -> text extraction -> OCR fallback when needed
        |
        v
Compare extracted identity/award data with entered data
        |
        v
Registrar reviews mismatches and attests to the record
        |
        v
Review institutional marks / signature fields; adjust placements if needed
        |
        v
Apply configured officer signatures (for unsigned-document flow)
        |
        v
Finalize certificate PDF and transcript PDF before officer review
        |
        v
Compute certificate SHA-256 and transcript SHA-256 independently
        |
        v
Encrypt each PDF -> Pin encrypted blobs; retain CIDs privately
        |
        v
VC reviews both full documents and approves on-chain
        |
        v
Dean reviews both full documents and approves on-chain
        |
        v
Registrar anchors one credential record containing the paired hashes
        |
        v
Issue graduate claim access -> graduate receives both documents together
```

Hashing is tied to final bytes. If a PDF changes after hashing (including a signature being applied), its hash must be recomputed before anchoring. The chain registration design must preserve both independent hashes and their association with the credential identifier and student record; a single certificate-only document hash is not sufficient for this requirement.

## Flow 1 — Upload completed documents

### Purpose

The certificate and transcript have already been produced, signed, stamped, and approved outside INTELLIGENT ACADEMIC CREDENTIALING.

### Intake and processing

1. Registrar enters/selects the student and award details.
2. Registrar uploads the completed certificate and transcript PDFs.
3. Validate PDF format and size, then extract text and layout. Run OCR only for image-only/insufficient text PDFs.
4. Compare extracted student name, award, institution, and other configured fields with the intake data. Flag mismatches for Registrar review; do not silently bind a document to the entered student.
5. Inspect for expected institutional marks (seal, stamp, and signature evidence). Automated checks are advisory; Registrar attestation is required.
6. Registrar attests. Continue through the shared VC -> Dean -> Registrar anchoring pipeline.
7. Compute and register each finalized document hash separately, paired to the same credential record.

## Flow 2 — Create certificate in INTELLIGENT ACADEMIC CREDENTIALING + upload existing transcript

### Purpose

The transcript originates from the university's academic records. INTELLIGENT ACADEMIC CREDENTIALING creates the certificate and registers both documents together.

### Intake and processing

1. Registrar enters/selects student and award details and uploads the existing transcript.
2. Extract transcript text/layout (OCR fallback only where required) and compare extracted identity/award information with intake data.
3. Registrar reviews the transcript and attests to it. The transcript joins the shared officer review pipeline; VC and Dean receive full-document access and approve in order.
4. In the certificate designer, Registrar selects the certificate information and institution-configured design assets (institution identity, seal/stamp, and configured officer signature assets as applicable).
5. Generate the certificate PDF. Review the generated certificate alongside the transcript and resolve any mismatch.
6. Finalize both files, compute their hashes independently, and pair them to the same student/credential record.
7. Complete the shared VC -> Dean -> Registrar anchoring pipeline. The transcript is an external upload; the certificate is INTELLIGENT ACADEMIC CREDENTIALING-generated.

## Flow 3 — Upload unsigned documents + AI-assisted signature placement

### Purpose

The university has certificate and transcript documents, but one or both still need institutional signatures applied through INTELLIGENT ACADEMIC CREDENTIALING.

### Intake and processing

1. Registrar enters/selects student and award details and uploads unsigned certificate and transcript PDFs.
2. Validate the PDFs and extract text plus coordinates. OCR is a fallback for scanned pages.
3. Compare extracted identity/award details with intake data and show mismatches for Registrar resolution.
4. Analyze layout for text regions, headings, names, award details, signature lines, role labels, blank areas, page structure, and visible institutional elements.
5. Show candidate signature placements in a document preview with a left-side panel of configured fields for Registrar, VC, and Dean. A movable box allows Registrar to accept, drag, reject, rerun analysis, or place a field manually.
6. Analysis may use role keywords near a line and geometry/layout features to infer candidate locations. It must not decide final position or signer identity.
7. Apply the previously configured officer signature assets at Registrar-approved placements. The relevant officers still perform their approval transactions in the shared pipeline.
8. Finalize both documents only after all edits/signatures. Then hash each final PDF independently and proceed through VC -> Dean -> Registrar anchoring.

## Officer and institutional setup

- Configure institution identity and visual assets during institutional setup.
- Each officer configures their signature asset once as part of officer setup. Store its association with the officer and role; reuse it for authorized issuance tasks.
- MetaMask approval is a separate on-chain action and remains required for VC and Dean review/approval. A stored visual signature is not a substitute for a wallet transaction.
- Each hand-off emails the officer whose turn it is. The notice is addressed to a **role**, not to a person, so it lands on the officer who is about to act rather than the one who just acted. Email is used rather than a browser notification or WhatsApp because it is the only channel an officer is guaranteed to have — it is how they received their login — and because a browser notification cannot cross a user boundary. A failed or undelivered notice must never block the credential.
- Institutional status upgrades (for example, college to university) are explicitly future scope and are not part of this pipeline design.

## Claim and sharing lifecycle

### Graduate claim

- After anchoring, Registrar shares a claim token with a 24-hour validity window.
- If the graduate claims within that window, issue/access the paired certificate and transcript in the mobile app without requiring a new OTP.
- If the window expires before claim, the Registrar must resend/refresh claim access; the expired token cannot be used.
- After successful claim, the graduate receives the certificate and transcript together as one credential in the mobile app.

### Full verification share

- The graduate can create a share for an employer or another verifier with a defined expiration/closing time.
- During the active window, the recipient can verify the credential and that the certificate and transcript are paired to the graduate, with full-document access according to the share permissions.
- When the share expires, access to the full documents closes. The graduate can create a new share when needed.

### Public verification

- Public lookup by certificate ID reports whether the ID exists and whether the identified individual is certified.
- Public lookup must not return certificate/transcript PDFs, direct IPFS links, or transcript contents. Full document access requires graduate-controlled, unexpired sharing.

## Data and registration requirements

The credential registration must associate at least:

- Credential/certificate identifier and institution
- Student identity reference (with privacy-aware public representation)
- Certificate SHA-256 hash
- Transcript SHA-256 hash
- No document storage references or CIDs in public chain state. Keep encrypted-blob CIDs in private application storage for authorized retrieval.
- Final approval/anchor transaction references and timestamps

The two document hashes remain independent values. Pairing means both hashes are recorded against one credential/student record; it does not mean concatenating them into one document hash. Any aggregate commitment used by the contract should be defined in addition to, and not in place of, the independently verifiable hashes.

## Current implementation and planned work

The repository already has certificate and document models/endpoints, PDF upload and IPFS support, hashing, certificate flow selection, a system-designed certificate preview, officer signature setup, wallet-based approval actions, claim/invite-related features, and verification share-code features.

The first document-analysis slice is now present: `POST /api/documents/analyze/` accepts a Registrar PDF upload without storing it, extracts embedded text and word bounding boxes with PyMuPDF, and falls back to Tesseract OCR for pages with little or no extractable text. OCR output includes word boxes and confidence values.

This has since been carried through to issuance. Fields are extracted by label, compared against the intake record, and the comparison is persisted as a `DocumentReview` that must be resolved before the document can be submitted: an approve is refused while anything is unresolved, an override or reject requires a stated reason, and the decision is bound to the SHA-256 of the exact bytes about to be committed, so it cannot be inherited by different content. `DocumentReviewPanel` provides the review and resolution UI. What is **not** implemented is the analysis of institutional marks — seals and signatures are model-dependent and unbuilt, and there is no shared state machine. Representative scan coverage and OCR threshold tuning also remain unverified.

One acceptance criterion below is only partly met: a mismatch is flagged and can be overridden or rejected with a reason, but a Registrar cannot yet correct the intake record itself. Overriding the verdict does not write the corrected value back to the certificate, so the intake data and the document can still disagree after a "resolved" review.

The encryption foundation uses AES-256-GCM with credential/type-bound associated data and a backend-only `CREDENTIAL_DOCUMENT_ENCRYPTION_KEY`. The paired-hash contract path records document hashes, but not CIDs. Finalized hashes are submitted before officer review; the Registrar's post-approval transaction marks the credential issued without changing the hash pair. Existing plaintext pins and deployed legacy contracts require migration/reissue; new code cannot hide CIDs already published on-chain.

The following work is still needed to match this design. The detailed, ordered version of this list is maintained in [`REMAINING_WORK.md`](REMAINING_WORK.md); see it for scope and sequencing.

1. Unify all three intakes with one shared state machine and consistent Registrar -> VC -> Dean -> Registrar approval order.
2. Ensure transcripts enter the same credential approval/anchor lifecycle, and update blockchain registration so both independent hashes are paired on-chain.
3. Connect the initial analysis endpoint to issuance intake; add field extraction/matching and Registrar mismatch resolution. **Done** — extraction, comparison, the persisted decision, the submission gate and the review UI are all in place. The OCR fallback is implemented, while representative transcript coverage and OCR threshold tuning remain.
4. Add checks/review UI for institutional marks, with clear limits on what automation can assert. **Partial** — the review UI and the human decision exist; detecting the marks themselves does not. This is model-dependent, and no inference integration has been supplied.
5. Build Flow 3's layout analysis, candidate signature placement, movable fields, manual placement, and final-document generation/hash timing.
6. Connect Flow 2's existing transcript to the INTELLIGENT ACADEMIC CREDENTIALING-generated certificate before shared approvals and anchoring.
7. Confirm or complete 24-hour claim behavior, resend after expiry, paired document delivery in mobile, graduate-created expiring full-verification shares, and privacy-limited public verification.
8. Ensure no document is considered anchored until hashes correspond to the final PDF bytes and the chain record contains both hashes.
9. ~~Decide what to do about a second, divergent transcript lifecycle~~ — **done.** The standalone `Transcript` model and its approval chain never reached the chain, so it presented a second and unsound approval model. Deleted (`0014_delete_transcript`); a transcript is part of a `Certificate`. See `TRANSCRIPT_IMPLEMENTATION_REVIEW.md` §1a.

## Acceptance criteria

- A mismatched student name or award is visibly flagged before Registrar attestation; a Registrar can correct intake data or reject/replace the document.
- Text-based PDFs are processed without OCR. Image-only/insufficient-text PDFs are routed to OCR fallback or clearly blocked for manual handling.
- Registrar can review full certificate and transcript documents; VC and Dean approve them in that order using their authorized wallets. **The order is enforced and each hand-off notifies the next officer by email.**
- Registrar performs final anchoring only after both approvals.
- Certificate and transcript final hashes are independently reproducible and linked to the same on-chain credential record.
- Flow 3 signatures and other edits are applied before final hash computation; moving a field invalidates any previous final hash.
- Claim access expires after 24 hours; an expired claim requires Registrar resend, while a valid claim delivers both documents together.
- Public verification reveals credential existence/certification only; full document sharing expires at its configured closing time.
