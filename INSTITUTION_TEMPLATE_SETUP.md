# Institutional certificate template setup

Implemented on 10 October 2026. This is a manual, library-based workflow; it does not require model inference.

## Configure the institution's actual style

### Saved preview and field categories

**Edit draft** now opens a dedicated page at `/dashboard/settings/certificate-branding/<revision-id>`. Field controls are visible on the left and the interactive document canvas is on the right; smaller screens stack them. Settings always presents the selected draft's saved preview, including inactive drafts. New uploads go to the editor to begin configuration. Save keeps the user in the editor; **Return to saved preview** returns to the Certificate Branding tab and the same selected version, asking before discarding unsaved changes. Approved versions remain read-only. Upload/restart/version-selection controls are kept on the settings page rather than repeated in the editor.

Saved drafts reopen in preview mode with **Edit draft** and **Open preview PDF** actions. The private sample endpoint regenerates the preview from the saved layout/assets on each visit; this is a review sample, not an issued credential. The introductory guide remains available but does not automatically obscure a populated saved draft. Approved versions remain fixed. Unsaved changes disable approval until saved and previewed.

Field choices and configured-field lists are grouped with required graduate fields and required signature images first, followed by institutional details, optional graduate details, institutional images, verification and fixed wording. Labels use readable names instead of raw database keys. Save notifications are brief; persistent layout checks appear beside the saved preview. Font fitting adjustments are presented as a table of field, configured size and actual preview size, with other validation messages listed separately. These checks are returned on initial template loading as well as save.

### Library-based field suggestions

New uploads include rule-based suggestions in their analysis. For an existing draft, use **Read and suggest fields** to re-analyze its saved master. Embedded PDF text supplies line rectangles, font size, font name and color. Tesseract supplies grouped text rectangles and OCR confidence; fonts and sizes are approximate. Supported standalone bracketed placeholders are mapped to candidate field types without a model. Unsupported embedded fonts receive a supported-font approximation warning. Low-confidence OCR, full dates, programme/field-of-study labels and placeholders inside fixed sentences require manual mapping. Blank spaces are not guessed automatically.

Use **Add this suggestion** for each reviewed candidate. Overlaps and the 60-field limit are checked before adding. Suggested areas enable clearing because they contain printed placeholders; inspect that setting on colored masters. Added suggestions remain unsaved until **Save draft & preview**, with the existing input/fit validation and approval checks still enforced. The re-analysis endpoint is scoped to the registrar's own institution and does not alter the saved layout or activate a revision. No OCR reading is treated as verified credential data.

The **Read before you start** guide includes three visual stages adapted from `research/CREDENCE_Certificate_Draft_Live_Text.pdf` and `research/CREDENCE_Certificate_Draft_Flattened.pdf`: a prepared clean master with blank variable areas, clickable field-box examples, and an actual generated unsigned preview. Printed placeholders are removed while preparing the public example masters, matching the cream background. The original research PDFs remain unchanged. Field configurations use `clear: false`, so generated values are placed without white patches. Live-text and flattened examples remain available at each stage, with downloadable clean-master and preview PDFs. Examples use fictional data and do not create an institution template. Programme and day/month use deliberate fixed text; graduation year is separate. Officer signature positions/assets still need configuration in the real workflow before approval.

Rebuild these public sample assets from the repository root with `python research/build_branding_guide.py`. The script invokes the production template renderer, checks the resulting sample name/year and placeholder removal, and writes assets to `front/app-next/public/branding-guide/`.

Each institution may have a maximum of **two template versions**, counting drafts and approved versions together. The UI shows the count and switches to **Replace selected draft** at the limit. Select an unused draft, choose a new master, and replace it in the same slot. Replacement resets that draft's fields, crest and seal; it does not create another version. Approved templates and templates used by credentials cannot be replaced. The API enforces these rules under institution/revision locks. Existing versions remain available for selection and draft configuration.

1. Open **Settings → Certificate Branding** as the Registrar.
2. Upload a clean institutional master: a live-text PDF, scanned/flattened PDF, JPEG or PNG. Name the version and choose clockwise rotation if the source is sideways.
3. Add labelled fields. Choose the field type and draw its rectangle on the page, or enter its normalized coordinates. For multi-page masters, select the relevant page. Extracted words can also seed a rectangle; resize it to fit a complete name or award.
4. Set text font, size, alignment and color. Supported fonts are Times Roman/Bold/Italic and Helvetica/Bold. Text shrinks to a minimum of six points; content that still does not fit produces an actionable error rather than being clipped.
5. Upload crest/logo and seal images and label their placement areas. Alternatively, label existing artwork as `logo` or `seal` and choose **Extract boxed artwork**. This copies the selected region; it does not identify or authenticate the artwork automatically.
6. Label Registrar, VC and Chancellor/Dean signature areas. Signature images come from the existing officer signature configuration and approval snapshots, not from arbitrary per-issuance uploads. Configure signatures before submitting credentials; final rendering refuses a missing required signature snapshot.
7. Use **Save draft & preview**. Inspect the generated sample, including cleared areas and assets. Then **Approve template** to activate this fixed version for new generated credentials.

Required labels for approval: student name, degree title, graduation year, and all three signature areas. Institution wording and artwork already in the master may remain unchanged. Optional labels include institution name, department, grade, credential ID, fixed text and verification QR.

Use a blank master without old student details or pre-applied officer signatures. If replacing existing content, explicitly enable **Clear existing content** for that field. PyMuPDF removes text, scan pixels, and fully enclosed vector artwork in the marked region of generated copies before new content is placed. It does not reconstruct the background underneath; the cleared area is white. Review this carefully for masters with patterned or colored backgrounds.

## What happens during issuance

- A new system-designed credential captures the active approved template revision when it is created. Existing credentials and previously created drafts retain their original rendering choice.
- PyMuPDF retains the master page geometry, fixed wording and artwork. ReportLab overlays the manually configured text, QR, and assets. Built-in fonts currently support Latin text; custom embedded font reproduction is not implemented.
- The transcript remains separately uploaded and reviewed through the existing document-review gate.
- The unsigned review copy excludes configured signature assets and is explicitly marked as unissued. Its exact bytes are encrypted and hashed for review.
- Following approvals, the sealed copy uses the same template revision and adds the captured officer signatures. Existing review/sealed hashes and the encryption/anchoring flow are preserved.
- Submitted certificate previews fetch and verify the stored review or sealed bytes rather than regenerating them from editable institution settings.
- Preset rendering remains the fallback for records without an uploaded-template revision.

## Reading and future assistance

PyMuPDF reads embedded text and coordinates; Tesseract reads pages without sufficient text layers. OCR results are evidence for the person configuring the template, not field labels or proof of authenticity. Failed OCR does not prevent manual template labelling.

Future assistance can suggest field labels, layout, artwork regions and typography using the same saved field schema. Automatic semantic classification, signature/seal authentication, perspective correction and exact reconstruction of custom fonts remain outside the current implementation. The unsigned-document issuance flow is separate from configuring an institutional master.

## Implementation

New database migrations: `institutions/0004` and `certify/0016`. Both are applied locally. On another environment run `python manage.py migrate`.

Template setup, revision changes, sample/page previews and credential PDF previews are authenticated and institution-scoped. Approved revisions are immutable through the API; later style changes require a new uploaded draft.

## Verification

All 18 template tests passed, covering live-text and flattened rendering, deterministic review bytes, field clearing, overflow, signature placement and missing assets, manual artwork extraction, active revision capture, version isolation, institution permissions and hash-verified stored previews. The 30 existing institution-renderer and credential-preparation checks also passed. Frontend ESLint passed and migration drift checks reported no changes. Interactive browser operation and a full wallet/IPFS issuance were not exercised.

## Input validation before generation

Configure character limits, required text fields and minimum readable font size in the field editor. Graduation year is numeric and supports an institution-specific range within the global 1900?current-year-plus-one policy. Other dynamic values are text; program titles come from catalog selection.

Names retain official capitalization and have a 200-character storage limit. Invalid characters, hidden formatting, impossible years, excess field lengths and text that cannot fit its box stop generation before PDF creation. Preview/preflight warnings explain when text will shrink and recommend widening the box or adjusting typography. Do not abbreviate or truncate official student or award information to fit. Approving a new template checks current active programs; configuring a new program checks its compatibility with the active template.

When a draft has no labelled fields, the selector explicitly says ?No fields yet ? click Add field?. Version options include an index and field count to distinguish identically named drafts. Versions created before the cap remain visible; they are not automatically deleted.

## Document navigation

The upload format guide is displayed before selection. Use Select / move to drag a field; drag any of its eight handles to resize it. Draw area replaces the selected rectangle, while Pan drags the viewport. Scroll on the background and use zoom / Fit page width to navigate. Arrow keys nudge a field; Shift uses larger steps. Right-click, X or Delete removes the selected field. Double-click or Enter opens its field settings. Undo/Redo also work with Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z. Escape cancels a gesture. Labels are editor guides outside the boxes; they can be hidden and are never printed. Overlap warnings concern field areas, not automatically detected source text.

## Restarting and consenting to actions

**Start branding from scratch** asks for consent before discarding all explicitly listed unused drafts and returning to master upload. The dialog states the scope and that removed drafts cannot be recovered. Approved, active and credential-linked templates remain protected. **Clear field configuration** is local and undoable; **Reset draft branding** clears and saves fields/crest/seal while keeping the master. Replacement, removal and approval have their own consent prompts. Cancel or Escape leaves the pending action unapplied. Success/error notifications appear at the top-right and can be dismissed.
