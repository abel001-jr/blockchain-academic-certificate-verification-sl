> 10 October 2026: Institutional template setup now supports uploaded masters, manually labelled fields, asset uploads/extraction, and fixed approved template revisions. PyMuPDF/Tesseract provide reading evidence; ReportLab/PyMuPDF render labelled content. This does not implement automatic transcript table reconstruction or inference-based mark detection. See [INSTITUTION_TEMPLATE_SETUP.md](INSTITUTION_TEMPLATE_SETUP.md).

# Transcript Handling and Document Review — Current Implementation

**Status: rewritten.** The previous version of this file was a pre-implementation gap
review. It described what was missing before transcripts, OCR and document review
existed, and it has been superseded by the code. It is kept as a record of the design
questions, with the answers the code now gives.

For the ordered backlog see [`REMAINING_WORK.md`](REMAINING_WORK.md); for the target
design see [`CREDENTIAL_ISSUANCE_PIPELINE_DESIGN.md`](CREDENTIAL_ISSUANCE_PIPELINE_DESIGN.md).

---

## 1. There is one transcript path

A transcript is part of a `Certificate`. There is no standalone transcript record, no
separate transcript lifecycle, and no second approval model. An earlier version of this
codebase had both; see §1a for what was removed and why.

```
POST /api/certificates/<id>/upload-transcript/      certify/views.py:1092
  → encrypt, hash, review gate, status → PENDING_VC
  → VC approves on-chain → Dean approves on-chain
  → Registrar final anchor commits BOTH hashes
```

The transcript's `transcript_hash` and the certificate's `doc_hash` are paired on-chain
by `submitCredentialForApproval` / `finalizeCredential`
(`chain/contracts/CertificateRegistry.sol:353`, `:624`). The Registrar reviews both
documents through the same `DocumentReview` machinery before either hash is committed.
Both upload workflows write the same columns on `Certificate`
(`transcript_hash`, `ipfs_cid_transcript`, `ipfs_url_transcript`), so presence is a
question about the credential row and not about a second table.

Every client uses this path. `ExternalUploadFlow.js` and
`certificates/[id]/page.js:230` are the callers, and both call
`/api/certificates/<id>/upload-transcript/`. The graduate receives both documents from
`GET /api/my-certificates/<id>/documents/`.

### 1a. What was removed, and why it is worth knowing

`certify/models.py` used to define a `Transcript` model with a **parallel** lifecycle: its
own status enum (`draft` / `pending_vc` / `pending_dean` / `approved` / `rejected`), its
own plaintext `ipfs_cid` / `ipfs_url`, seven dedicated endpoints, and a `StudentTranscriptsView`.
`certify/transcript_views.py` implemented all of it. All of it is now deleted, along with
migration `0014_delete_transcript`.

Three things about it are worth recording, because each was a way for the code to be wrong
without anyone noticing:

- **Every one of its endpoints returned 500.** All six `log_action` calls in
  `transcript_views.py` passed `user=`, `details=` and `ip=`, but the helper's signature
  (`audit/utils.py:6`) is `log_action(actor, action, target_type, target_id, detail,
  ip_address)`. Each raised `TypeError` on a keyword that does not exist — *after* the state
  change had already been saved. This surfaced from the tests in `AttestationNoticeTests`,
  not from reading: nothing had ever called these endpoints, so nothing had ever failed.
  The other 50 `log_action` call sites in the backend were checked and were already correct.
- **It could be "fully approved" with no on-chain record at all.** A standalone transcript
  never reached the chain, so a VC and a Dean could each pass an arbitrary `tx_hash` string
  and mark it approved. That is the weaker security model described in §5, and it was live
  in the sense that a crafted request would have satisfied it — had the `TypeError` above
  not stopped the request first. Two defects cancelled out.
- **It was the only reason three live files imported the model.** `CertificateListSerializer`
  dereferenced the reverse one-to-one to produce a `transcript_id` field; the graduate
  document endpoint and the share-code document endpoint both fell back to querying it when
  `Certificate.ipfs_cid_transcript` was empty. Those three references are gone. The two
  document fallbacks were not merely unused, they were **incoherent**: the legacy row's
  `transcript_id` is a different associated-data string from the `certificate_id` used to
  encrypt transcripts, so if such a fallback had ever fired, decryption would have failed.
  The legacy model and its consumers were not describing a working alternative path.

`TopHeader.js` also mapped `/dashboard/transcripts` to a page title for a route that has
never existed. Removed.

---

## 2. Document analysis — PyMuPDF with a Tesseract fallback

Implemented in `certify/document_analysis.py`. The module docstring states the intent:
results are advisory and must be reviewed by the Registrar.

`analyze_pdf(file_bytes, language="eng")`:

- Opens the PDF with **PyMuPDF** (`fitz`) from a byte stream.
- Per page, reads the embedded text layer with `page.get_text("words", sort=True)`.
- If the page yields **≥ `MIN_TEXT_CHARS` (20)** characters, that text layer is used and
  the page is tagged `method: "text_layer"`. No OCR runs.
- Otherwise the page is rasterised at **`OCR_DPI` (200)** and passed to **Tesseract**
  (`pytesseract.image_to_data`) for words plus bounding boxes, tagged `method: "ocr"`.
- Returns per-page `text` and `items` (`{text, bbox}`), plus aggregate OCR usage.
- Bounds: `MAX_PAGES = 50`; a page count over that, an unreadable file, or a zero-page
  file raises `DocumentAnalysisError` (a `ValueError`), which the view layer turns into a
  400 rather than a 500.

So the design doc's requirement is met: a text-based PDF is processed without OCR, and an
image-only or near-empty page falls back to OCR rather than silently returning nothing.

Two endpoints expose it:

- `POST /api/documents/analyze/` (`urls.py:37`, `document_analysis_views.py:36`) — raw
  analysis of an uploaded file, no persistence. The design doc's description of this
  endpoint as "returns analysis only" is now out of date; see §3.
- `POST /api/certificates/<id>/analyze-document/` (`urls.py:58`) — the one the product
  uses. It analyses and stores a pending `DocumentReview`.

**PyMuPDF is now a hard dependency of the analysis path.** There is no stub: if PyMuPDF
or Tesseract is missing, `analyze-document` fails. The design doc asks for OCR to sit
behind "a replaceable service boundary so it can be added without changing the issuance
workflow" — that boundary exists at the module level (`document_analysis.py` is imported
in exactly two places, `document_analysis_views.py:9` and `document_review_views.py:35`),
but the function signature, not a configurable provider, is the boundary.

---

## 3. Field extraction, comparison, and the Registrar's decision

Implemented in `certify/field_extraction.py`, which consumes the output of `analyze_pdf`.
The module docstring records the two properties that matter:

- **A field that could not be found is reported as unverified, never as a match.** A
  silent pass is the dangerous failure — the Registrar would see "all fields agree" for a
  document the extractor did not understand, and attest to it.
- **Comparison is a similarity judgement, so it reports its own confidence.** A field
  just above threshold is presented the same way as one far above it, because that
  difference is a Registrar's call.

`compare_fields` emits one of four verdicts per field:

| Verdict | Meaning | Gates submission |
|---|---|---|
| `match` | Extracted value agrees with the intake record | No |
| `mismatch` | Extracted value disagrees | Yes, until resolved or overridden |
| `not_found` | The label was not present, or no value followed it | Yes — surfaced as work, never folded into "fine" |
| `not_compared` | No intake value was recorded for that field | No |

The compared fields are `student_name`, `degree_title`, `institution`, `graduation_year`.

Extraction is **label-driven rather than positional**: transcripts and certificates vary
enormously in layout but are consistent about labels ("Name:", "Degree:"), so a label is
matched and the value read beside it, falling back to the following line for two-column
and underlined-label layouts. `FIELD_LABELS` holds the ordered label patterns per field.
Matching folds accents, case and punctuation, then compares by `difflib.SequenceMatcher`
ratio against per-field thresholds, with a generic-token disjointness cap so "University
of Mines" cannot match "University of Ghana".

Two guards keep that label matching honest, and both were added because a real certificate
broke it:

- **A label separator is required.** A heading such as `Faculty of Science` is not an
  institution called "of Science". A field only reads a value from a line that actually
  separates the label from the value (`Name: Ada`, `Name — Ada`, an underline), so a
  department heading is left to be a heading.
- **An unlabelled certificate falls back to a verbatim text search, and says so.** Real
  certificates are frequently laid out as centred display text with no labels at all, so
  label extraction found nothing and every field reported `not_found`, which is safe but
  unusable. The fallback confirms a field by finding its expected value somewhere in the
  document text and marks it `status: "verbatim_match"`, which `DocumentReviewPanel` shows
  explicitly as an amber **Found in text** chip, plus a note that these fields should be
  checked to appear where a credential would put them, because a name appearing
  *somewhere* is not the same as the name being the recipient.

  **`verbatim_match` is a status of its own, not `match` with extra evidence.** Reporting a
  substring search as an ordinary match made the two indistinguishable in the places that
  matter: `summary.counts.match` claimed "4 agree" for a document where nothing had been
  read, the chip said *Agrees* next to an empty extracted cell, and the stored comparisons
  recorded agreement the extractor could not support. The status is now counted separately,
  the summary reports it as *"found in text rather than a labelled field"*, and a resolved
  review of a label-less certificate reads **Checked, values found in text** rather than
  *Checked*.

  It does not block. A legible certificate must not be stranded, and an override with a
  written reason for every field would be noise that trains people to approve without
  reading. The one place it is not a routine click is where it matters most: when *no* field
  was parsed at all, `approve` requires a reason, because the Registrar is then asserting
  that each value sits in the position a credential would put it while having been shown no
  field whatsoever. A document with a few parsed fields and one disclosed text hit keeps the
  optional note.

  This is the one place the module can read a value it did not read *from a field*, so the
  limit is worth stating plainly: **the fallback confirms presence, not role.** It cannot
  distinguish a recipient block from a footer, a reference list or an unrelated mention. It
  is switchable (`EXTRACTION_ALLOW_VERBATIM_FALLBACK`), and it never overrides a real
  disagreement — a certificate for a different student stays `not_found` and still blocks
  submission. `python manage.py diagnose_extraction "<file.pdf>" --lines` shows exactly which
  fields came from labels and which from the text.

  **Verified against the real test certificate** (`research/certificate_isha_test_TEST-WATERMARKED.pdf`,
  a rasterised scan — the page is `method=ocr`, 491 characters over 15 reconstructed lines).
  Label extraction returns nothing for it, which is correct: the document has no labels at all,
  only display lines ("This is to certify that" / "Isha Test" / "…awarded the degree of" /
  "Bachelor of Science in Computer Science"). With the intake values supplied, all four fields
  resolve to `verbatim_match` on text evidence — the recipient, the degree, the institution and
  the year are each present in the OCR text, and none of them was read from a labelled field.
  Without the intake values the same file reports four `not_found`, because the fallback
  confirms a value the record already has and cannot invent one: **the diagnosis only becomes
  meaningful once the expected values are passed in**, which is the situation the review panel
  is always in.

**The decision is persisted, not transient** — `DocumentReview`
(`models.py:682`, migration `0013_documentreview.py`), one row per
`(certificate, document_kind)` with a unique constraint. It stores `extracted`,
`comparisons`, `summary`, `ocr_used`, `page_count`, `document_sha256`, `state`
(`pending` / `resolved` / `overridden` / `rejected`), `resolution_note`,
`overridden_fields`, `reviewed_by` and `reviewed_at`.

Both the extracted values **and** the per-field verdicts are kept, because "the extractor
said X, the record said Y, and the Registrar accepted that" is the audit trail the
feature exists to produce. Storing only a final boolean would make an override
indistinguishable from a match.

- `POST /api/certificates/<id>/analyze-document/` accepts `expected_*` overrides so a
  pre-submit check runs against the values the Registrar actually typed, and **re-analysis
  resets any prior decision** — a sign-off only ever applied to what was shown.
- `POST /api/certificates/<id>/document-reviews/<kind>/resolve/` — `approve` is refused
  while anything is unresolved, and also when no field was parsed at all (all four
  `verbatim_match`) unless a reason is given; `override` and `reject` both require a
  reason and are recorded against the actor; `fields` must cover every unresolved
  comparison; and `rejected` blocks and cannot be overridden back to resolved.
- `document_review_gate` (`document_review_views.py:74`) refuses on-chain submission
  while a required review is missing, blocking, or **stale**, where staleness is
  `review.document_sha256` compared against the SHA-256 of the bytes about to be
  committed. That comparison is what stops a review being inherited by different content.
- The gate runs **before** encryption and IPFS pinning in
  `CertificateUploadAndAnchorView` (`views.py:978`) and
  `CertificateUploadTranscriptView` (`views.py:1146`), so a blocked credential costs
  nothing and leaves no orphan blob.
- System-designed credentials are deliberately **not** gated: a certificate rendered
  *from* the intake data would only ever agree with itself.

Tests: `certify/test_field_extraction.py` (26 standalone checks, including four heading
regressions and five verbatim-fallback regressions, one of which pins that
`verbatim_match` is counted apart from `match`) and `certify/tests.py`
`DocumentReviewTests` (27), which cover both `document_kind` values —
`tests.py:96` and the `kind="transcript"` cases from `:940` onward.

---

## 4. Officer limit — enforced, and the ambiguity is settled

The previous review said this was unenforced. It is enforced, in
`accounts/serializers.py:80-94` (and again in `accounts/views.py:125`): before a
Registrar creates a `VC` or `CHANCELLOR` account, the serializer counts active officers at
that institution and refuses at two or more.

**The code settles one of the stakeholder questions**: it enforces *two officers total per
institution*, not "one VC and one Dean". A second Dean cannot be added while a VC exists.
The error message says so and tells the Registrar to deactivate an existing officer first.

*Nit:* the message is built with `"...".format(officer_count)` on a concatenated literal
rather than an f-string, so it renders the literal text `Current count: {}.` instead of
the count.

The optional database constraint the old review proposed was never added, and is not
needed: the count is checked inside the serializer that performs the create, in the same
request.

---

## 5. Attestation — where the enforcement actually lives

This is the part the previous review got wrong in both directions, so it is worth stating
precisely.

**On the live certificate path, attestation is enforced by the contract, not by the
backend.** `CertificateRegistry.sol:506` requires `issuerRegistry.isAuthorizedVC(msg.sender)`
and `:529` requires `isAuthorizedChancellor(msg.sender)`, each additionally requiring the
caller's institution to match the certificate's, and `:537` requires VC approval before
Dean. A call from an unauthorized wallet reverts.

The backend's `tx_hash` field is **corroborating evidence, not the enforcement point**:
`CertificateConfirmVCView` (`views.py:589`) only checks the string is `0x` + 64 hex
(`:624`). It does not verify the transaction exists on-chain. That is acceptable, because
the state transition the backend is recording could not have happened unless the contract
accepted it — but it does mean the stored hash is an audit record, and a fabricated hash
would be recorded without being detected by the backend.

The backend does add the guards the contract cannot:

- `views.py:599` — VC cannot confirm before the Registrar has submitted on-chain.
- `views.py:610` — VC cannot confirm when no review document exists, so an approval can
  never be a bare acknowledgement of data with no document behind it.

**There is no second path with weaker attestation, because there is no second path.** An
earlier version carried a standalone transcript approval chain that read `tx_hash` from
the request body, verified nothing, and called no contract function — a caller with the
right role could have marked a transcript VC-approved and Dean-approved with two strings of
their choosing. That was the "Missing MetaMask attestation — CRITICAL" risk the previous
version of this document named. It is resolved by deletion, not by repair: the code is
gone, and the "Missing MetaMask attestation" risk that remains is the one described in
`REMAINING_WORK.md` — the chain is not yet redeployed with the current guards.

The role naming is as the old review described, and deliberate: `Role.CHANCELLOR` in the
code, "Dean" in the UI, with `accounts/email_utils.py:52` mapping for email. The old
review's Phase 4 item to rename everything was completed in the UI while leaving the
identifiers alone, which is what it asked for in the same breath
(`walletActions.js` still has `approveAsChancellor`).

---

## 6. Still open

Transcripts and document review specifically:

1. **Design item 6 — Flow 2's transcript is not connected to the generated certificate.**
   In `transcript_then_cert`, the certificate is rendered from the intake data, and the
   transcript is attached separately, but nothing carries the transcript's extracted or
   reviewed values into the certificate's generation. This appears in **no** backlog item.
2. ~~The legacy transcript path~~ — **done.** Deleted: model, seven endpoints, six
   serializers, the `transcript_id` serializer field, and the two document-endpoint
   fallbacks that referenced it (§1a). Migration `0014_delete_transcript`. The three live
   references that a naive deletion would have broken are gone too, and the share-code and
   graduate-download endpoints are covered by their existing tests.
3. **OCR thresholds are untuned against real scans**, and representative transcript
   coverage is unverified. The thresholds in `field_extraction.py` are a documented
   starting point, not a measured value.
4. **No institutional mark or seal detection.** Text extraction does not authenticate a
   document and cannot tell a stamp from a logo. This is `REMAINING_WORK.md` item 5 and is
   deliberately parked until a model is supplied.
5. **No shared state machine.** The certificate and transcript intakes converge on
   Registrar → VC → Dean → Registrar by convention rather than by an enforced rule.
   `REMAINING_WORK.md` item 3. (This got materially better when the second, unsound
   lifecycle was deleted; the remaining gap is between the *intakes*, not between two
   transcript models.)
6. **Officers are told when a credential is waiting on them.** Officer notices are sent at
   every hand-off, including `CertificateUploadTranscriptView` → VC and VC approval → Dean,
   via `certify/attestation_notices.py`. See
   [`NOTIFICATION_IMPLEMENTATION.md`](NOTIFICATION_IMPLEMENTATION.md) §4.2.
7. **The gate has not been driven end to end in a browser** against a real scanned PDF. It
   was verified by disabling enforcement and confirming the tests fail.
8. **Nothing notifies the Registrar after Dean approval**, so the credential can sit
   waiting for a final anchor with nobody alerted. The same helper would cover it.
9. **The verbatim fallback confirms presence, not role.** For a certificate laid out as
   centred display text with no labels, a field is confirmed by finding its value
   somewhere in the document — which cannot distinguish the recipient block from a footer,
   a reference list or an unrelated mention. It is reported as its own `verbatim_match`
   status, counted apart from parsed matches, shown as an amber *Found in text* chip, and
   never overrides a real disagreement; where nothing at all was parsed, accepting the
   document requires a written reason. But it is a search, not a reading.
   Reading layout properly needs positional or model-based extraction, which is the same
   missing capability as items 4 and 5.
10. **Table layouts defeat label/value extraction outright.** Two-column and multi-pair
    table transcripts are mis-read in both directions — real labels rejected, and the next
    field on the same row swallowed into the previous field's value. Diagnosed in detail,
    with the two observed panels and the proposed three-pass fix, in §9. **Deferred
    deliberately**: no fix is to be written until a real CUSL transcript is captured, so
    the fix is tuned against the actual layout instead of a synthetic guess.

---

## 7. Stakeholder questions — answered where the code answers them

| # | Question | Answer |
|---|---|---|
| 1 | Is transcript upload mandatory? Can a certificate exist without one? | Optional. `Certificate.transcript_file` is nullable and `transcript_hash` is optional; the credential is anchored with whichever hashes exist. A certificate with no transcript goes down the single-document path. |
| 1 | Should the transcript be anchored separately or with the certificate? | With it, as an independent hash on the same on-chain record. `submitCredentialForApproval` **rejects an empty transcript hash** (`CertificateRegistry.sol:362`), and `finalizeCredential` refuses to issue unless both hashes are non-zero (`:636`), so the pair is atomic — this was the answer to "single on-chain record vs separate records". |
| 2 | Is the officer limit strictly 2 (one VC + one Dean), or 2 total? | 2 total per institution, enforced in the serializer (§4). Not per-institution configurable. |
| 3 | Should transcript + certificate be one on-chain record or separate linked records? | One record, two independent hashes (§7 row 2). |
| 3 | How should verification QR codes work? | Public verification reveals existence and certification only. Documents are reachable only through a share code or the graduate's own claim, both time-bounded (`REMAINING_WORK.md` item 7). |
| 4 | What happens if VC approves but Dean rejects? | **Unanswered.** `Certificate` has no rejected state; the only way back is `CertificateRevokeView`, and `DocumentReview` rejection applies to the *document*, not the credential. There is no return-to-Registrar and no appeals process. |
| 4 | Is there an appeals/override process? | Overrides exist, but only for **document review mismatches** by a Registrar — not for officer decisions. |

---

## 8. Superseded claims from the previous version

Kept so the old document is not read as current.

| Previous claim | Reality |
|---|---|
| "No `Transcript` model" | It existed, was unreachable, and has now been deleted (`0014_delete_transcript`). A transcript is part of a `Certificate`. |
| "No transcript file field in `Certificate`" | `models.py` `transcript_file`; `ipfs_cid_transcript` |
| "No API endpoints for transcript upload" | `certify/urls.py` `upload-transcript` on the certificate |
| "No frontend UI for transcript handling" | `ExternalUploadFlow.js` and `certificates/[id]/page.js:230` |
| "`EXTERNAL_UPLOAD` may skip officer approval ❌" | `views.py:844` refuses finalize without both attestations; `CertificateRegistry.sol:537` requires VC before Dean on-chain |
| "No enforcement of max 2 officers" | `accounts/serializers.py:80-94` |
| "IPFS pinning for transcripts" (roadmap) | Done, and now encrypt-before-pin on the certificate's own transcript columns |
| "Analysis returns only analysis" | The paired endpoint persists a `DocumentReview` and gates submission |
| Phase 1–4 roadmap, all unticked | Phases 1, 2, 3 and 4 are implemented; the items in §6 are what is left |
| "Extraction is label-driven rather than positional" (§3), which reads as a robustness claim | True, and it is also the defect. Label matching assumes a value *follows* its label on the same line and that a label is marked by punctuation. Both assumptions fail on table layouts. See §9. |
| "All approvals require on-chain transactions ✅" | True, and now true of the only path that exists. The counter-example that made this claim false has been deleted. |
| "Email/WhatsApp notifications: 'Certificate awaiting your attestation'" (Phase 3) | Implemented as email at every hand-off. WhatsApp was not viable: officers are not asked for a phone number, so it would silently no-op. |

---

## 9. Table layouts defeat label/value extraction — deferred pending a real CUSL transcript

**Status: diagnosed, deliberately not fixed.** The plan is to reproduce the actual
transcript problem at CUSL, capture the real documents, pick the valid field/label pairs
from them, and only then write the fix against real layout instead of a synthetic guess.
Everything below is what is known now and what must be decided then.

### 9a. The two observed panels

These are the regression cases to encode as tests. They are reported verbatim from
`DocumentReviewPanel`, for the same student and the same transcript, and they fail in two
*different* directions — which is the diagnostic point.

**Case A — label and value in the same row, two columns.** The labels are present and
correct; the values are present and correct.

```
Transcript checked against the record
Awaiting your review
Read from 2 pages · 2 agree, 2 found in text rather than a labelled field

Field             Record says                         Document says                      Result
Student name      Eren Yeagar                         Eren Yeagar                        Agrees
Award / degree    Business Information Technology(BIT) no labelled field — value in text Found in text
Institution       Central university Sierra Leone      no labelled field — value in text Found in text
Graduation year   2026                                2026                               Agrees
```

The award *is* a labelled field in the PDF — the label reads
`Business Information Technology(BIT)` as a genuine cell label. It is nevertheless reported
as *found in text*, meaning label parsing rejected it and `find_verbatim` rescued it by
substring search. Two fields that should be `match` are being reported by the weakest
possible evidence path.

**Case B — two label/value pairs in one row.** Same transcript, four-column layout.

```
Field             Record says                         Document says                                        Result
Student name      Eren Yeagar                         Eren Yeagar Student Email erenyeagar@central.edu.sl     Differs 37%
Award / degree    Business Information Technology(BIT) not labelled on the document                          Not found
Institution       Central university Sierra Leone      not labelled on the document                          Not found
Graduation year   2026                                2026 Classification                                    Differs 42%
```

Here the extractor produced a *false disagreement* on two fields. The student name and the
graduation year are both correct on the document. They fail only because the extractor
consumed the **next field's label and value** as part of their own value. A Registrar shown
this is told the document contradicts the record when it does not — the most damaging
possible failure for a check whose purpose is to catch real mismatches, because it trains
the reader to dismiss differences as extractor noise.

### 9b. Root cause

Two independent defects, both in `field_extraction.py`, and neither is a threshold problem.

**Defect 1 — a value is defined as everything after its label on one reconstructed line.**

`_lines_from_pages` (`:199`) groups words by vertical position alone, within a `±3.0` pt
y-band (`:218`), and joins them with a single space. It has no concept of horizontal
position, column boundaries, or cell boundaries. A table row

```
Student Name      Eren Yeagar          Student Email   erenyeagar@central.edu.sl
```

is reconstructed as one line:

```
Student Name Eren Yeagar Student Email erenyeagar@central.edu.sl
```

`_split_label` (`:230`) matches `student name` and returns **the entire remainder** of the
line as the value — `Eren Yeagar Student Email erenyeagar@central.edu.sl`. Against
`Eren Yeagar` that scores ~37%, below the 0.82 threshold, so the field is reported
`mismatch`. Identically, `Graduation Year 2026 Classification` → `2026 Classification`
scores ~42% → `mismatch`. This is the whole of Case B's two `Differs` results.

**Defect 2 — a label is required to be marked by punctuation, so table-cell labels are
rejected outright.**

`_REQUIRES_SEPARATOR` (`:108`) lists `award`, `degree`, `institution`, `program`, `programme`,
`course`, `qualification`, `graduation`, `year`, `name`, `student`, `faculty`, `school`,
`college`, `institute`, `university`. For any of these, `_split_label` only accepts a value
if `_EXPLICIT_SEPARATOR` (`:92`, `:`/`-`/`–`/`—`) matches the remainder, or the remainder is
empty. That guard exists for a good reason — it stops a heading like `Faculty of Science`
being read as an institution named "of Science", a real regression recorded in §3 — but it
assumes a label announces itself with punctuation. **In a table, structure *is* the
geometry**: the label sits in one cell and its value in the next, with no colon anywhere.
So the label is rejected, `extract_fields` omits the field, and `find_verbatim` (`:297`)
finds the expected value somewhere in the text and returns `verbatim_match`.

That is Case A exactly, and it explains the panel's wording: "no labelled field — the value
is in the text". The label *is* labelled. The extractor could not see that the label and
its value were adjacent.

### 9c. The two assumptions, stated plainly

§3 currently presents label-driven extraction as a robustness property. It is true, and it
is also the defect. The assumptions that fail on tabular documents are:

1. **A value is what follows its label on the same line.** True for prose forms. False for
   tables, where the value sits *to the right* of the label and the *next row's* label
   follows on the same visual line. Case B.
2. **A label is delimited by punctuation.** True for `Name:`. False for table cells, where
   the cell boundary is the only delimiter. Case A.

Neither assumption is about credentials specifically. They are assumptions about *layout*,
and transcripts are laid out as tables far more often than certificates are.

### 9d. Proposed fix — three passes, not yet written

Staged so the diagnosis can be re-verified independently of the repair.

**Pass 1 — reconstruct rows *and* columns.** Use the `bbox` already present in every `items`
entry (`document_analysis.py:49`, `:86`). Within each y-band, detect horizontal gaps and
split into segments. The Case B row becomes
`["Student Name", "Eren Yeagar", "Student Email", "erenyeagar@central.edu.sl"]`, and the
graduation row becomes `["Graduation Year", "2026", "Classification", …]`.

**Pass 2 — terminate a value at the next label.** Once a row is segmented, a value stops
where the next known label begins, and also at a cell edge. This alone corrects both
`Differs` results in Case B: the value becomes `Eren Yeagar` and `2026` respectively.

**Pass 3 — drop the separator requirement when the value is in a *different* segment.**
Geometry has already proven the label→value relationship, so no colon is needed. Retain the
separator requirement only for single-segment lines, where a bare `Faculty` may be a heading.

Expected outcome: Case A reports `Agrees` on all four fields from genuinely parsed values
(no `verbatim_match`), and Case B reports `Agrees` for name and year with `Student Email`
and `Classification` correctly not bleeding in.

**Deliberately not chosen yet:** whole-table mode (segment the document into a real table and
show the Registrar the extracted grid) versus label-anchored reading that merely stops
overrunning. The former is the more robust destination for tabular transcripts; the latter is
the smaller change that fixes both observed cases. Real CUSL layouts should decide this.

### 9e. Risks to settle with real documents

- **Gap thresholds are layout-sensitive.** Column detection depends on an x-gap value that
  will need tuning per document, and a wrong value either over-segments prose lines or
  under-segments dense table rows. Sizing it from one real transcript is better than
  guessing now.
- **Existing `verbatim_match` behaviour must survive.** Any fix has to keep §3's guarantees:
  unlabelled display-text certificates still resolve rather than stranding, `verbatim_match`
  stays a distinct status rather than folding into `match`, and the all-verbatim case still
  requires a written reason on approve.
- **The generated-certificate characterisation must not regress.** `extract_fields` returning
  `{}` for generated review/issued PDFs is currently *expected* and pinned by
  `test_field_extraction.py`, because their layout text is merged. If Pass 1 starts
  successfully parsing them, those pinned expectations need revisiting deliberately rather
  than by a test that silently flips.

### 9f. Open questions for the CUSL capture

1. **Should `Student Email` and `Classification` become comparable fields of their own?**
   They are real transcript attributes, but only `student_name`, `degree_title`,
   `institution` and `graduation_year` are compared today (`DEFAULT_FIELDS`, `:71`). Adding
   them changes Pass 2: the extractor would have to *identify* those labels rather than only
   *stop* at them.
2. **Which transcripts, and in what variety?** One exemplar is enough to build against; a
   sample spanning different faculties, years and issuing offices is what would show whether
   the gap threshold generalises or merely fits one document.
3. **Is the transcript a text-layer PDF or a scan?** The observed panels read from 2 pages via
   the text layer. Scanned originals would engage OCR, where bbox quality is poorer and the
   x-gap thresholds matter more.
