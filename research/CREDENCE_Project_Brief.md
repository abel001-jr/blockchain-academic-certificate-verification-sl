# CREDENCE: Project Brief (status as of 10 October 2026)

Paste this at the start of a new chat. It is a status overview, not a research paper.

## 0. How to work with me
- I am Abel Morie Sam ("Sam"), final-year BSc Computer Science student, Central University Sierra Leone (CUSL), Department of Technology and Engineering, Faculty of Science and Technology. Student ID 2023042. Expected graduation December 2026.
- You are the thinking partner ("the brain"), not the builder. I do not need to share code. Treat this as a peer technical discussion, not a tutorial.
- I push back. Justify every technology choice in a way that is academically defensible, tied to a real system requirement.
- Settle design decisions before implementation.
- Ask me to confirm institutional details (names, roles, faculty, department) instead of assuming they are current.

## 1. What CREDENCE is
A dissertation proof-of-concept for **issuing and verifying academic certificates (and transcripts)** at CUSL, using blockchain to prove documents are genuine. The data model is designed to generalize to other institutions, but multi-tenancy is deliberately left for future work.

**Branch:** hybrid Web2 + Web3 system, in the **education** sector. Case study: CUSL.

## 2. Hybrid split (the simple idea)
| Web2 (conventional) | Web3 (blockchain) |
|---|---|
| Django REST backend, SQLite database | Solidity smart contracts, Hardhat (local) |
| Users, roles, records, audit logs | On-chain approvals and anchored hashes |
| Google Sign-In, WhatsApp (Twilio), SMTP email | MetaMask, used only for on-chain signing |
| Next.js admin PWA, React Native student app | IPFS via Pinata for document storage |

Design logic: documents and personal data stay off-chain. Hashes and approvals go on-chain so tampering is detectable.

## 3. Tech stack and status
| Layer | Technology | Status |
|---|---|---|
| Backend | Django + DRF, SQLite | Built, 91/91 tests passing |
| Admin web | Next.js PWA | Built, compiles across 30 routes |
| Student app | React Native + Expo (Android) | UI only so far |
| Contracts | Solidity, Hardhat | Local only |
| Storage | IPFS / Pinata | Integrated |
| Auth | Google Sign-In + MetaMask (signing only) | Direction decided |
| OCR / PDF reading | PyMuPDF, Tesseract | First slice only (`POST /api/documents/analyze/`), not connected to issuance |
| Notifications | In-page, WhatsApp (Twilio), SMTP | No push notifications exist |
| Deployment | None beyond local | |

## 4. Roles
- **Public / verifier:** checks credentials, no login.
- **Graduate (student):** claims and shares credentials in the mobile app.
- **Registrar:** attests documents, handles final anchoring, issues claim tokens.
- **Vice-Chancellor and Chancellor:** the two approvers who review and sign on-chain. **Dean is NOT a CUSL signatory.** (Earlier design used VC + Dean; the rename to Chancellor applies across the database, contract and UI. The last template I saw still showed Dean.)
- **Institution Admin:** manages registrar accounts and audit logs. **Super Admin:** Django superuser for bootstrapping only.
- Confirmed signatories: Registrar Maligi Sesay, VC Prof. Bob Karankay Conteh, Chancellor Muckson Sesay Sr.

## 5. The flow
1. **One-time setup:** institution details and officer signatures.
2. **Registrar enters student details and the documents.**
   - Flow 1: upload completed, signed PDFs.
   - Flow 2: upload an existing transcript and generate a CREDENCE certificate from the institution's badge/stamp/signature setup.
   - Flow 3: upload unsigned PDFs and an AI model proposes signature positions, which the registrar can move.
   - Certificates may be system-generated. Transcripts are always uploaded, never generated.
3. **Checks:** side-by-side review (entered data vs document) to catch mismatches. AI checks for stamp, seal and signatures are an optional extra.
4. **Approval:** Registrar attests → VC reviews and signs on-chain → Chancellor reviews and signs on-chain → Registrar anchors.
5. **Hashing:** certificate and transcript hashed separately, paired under one credential on-chain.
6. **Claim:** the registrar shares a one-time claim token (24-hour window, via WhatsApp). The graduate signs in with Google and receives both documents as one credential.
7. **Verification:** public tier only confirms the ID exists and the named person is certified. Employer tier shows the documents, and only if the student approves, within a time window.

## 6. Status snapshot
**Built:** certificate and transcript models, upload paths, hashing and IPFS, approval actions, invite tokens, share codes, some officer signature setup, notification fixes.

**In progress:** adding the transcript to the anchoring pipeline; the Dean → Chancellor rename.

**Open backlog (in order):**
1. **Document access model** (the key decision): public IPFS URLs cannot support revocable, time-limited sharing.
2. Pair certificate and transcript hashes under one credential ID on-chain.
3. Unify the approval lifecycle across all three flows.
4. Finish mismatch handling between entered data and document content.
5. Build signing/finalization for Flow 3.
6. Fix claim rules (24-hour tokens, not 48).
7. Separate public from shared verification responses (public currently leaks details and the PDF URL).
8. Apply officer signature setup consistently.

**Known issues:** nothing notifies the Registrar after the final approval; a hardcoded API base in `api.js`; a hardcoded Hardhat private key in `admin/anchor/page.js`; 3 pre-existing lint errors; undecided whether to delete the unused legacy Transcript API.

**AI layer:** design done (signature placement, mark validation, mismatch detection), model training paused. Principle: AI only enhances, and the pipeline must work without it.

## 7. Research side
- **Method:** mixed methods, using a case study (CUSL) with purposive sampling, because signatories are a specific stakeholder group.
- **Interviews (up to 2 per office):** Registry, Exams, HR (1 person). VC and Chancellor are excluded because they are hard to reach, so the Registrar acts as proxy.
- **Survey:** graduates and alumni, batch 2025/2026, about 350 across two faculties and 10+ departments, distributed through the registry secretary.
- **Status:** Chapter 3 drafted as planned procedure. No data collected yet as of my last update. Chapter 1 is being refined in APA 7 (global → regional → local → gap).
- **Supervisor asks:** be able to answer who signs up users, what auth is used, and what the case study is. Answers: the registrar issues claim tokens, the institution admin manages registrar accounts; auth is Google Sign-In plus MetaMask for signing; case study is CUSL.

## 8. Branding
Issued certificates use CUSL's real identity: maroon/brick-red lion crest on cream. This is separate from CREDENCE's own platform UI theme (navy and gold so far). I want a full colour picker rather than 5 presets, so any institution can match its own branding.

## 9. Recently done
A 15-slide presentation on Website, Web App, Web Portal, Mobile App and PWA (general concepts, then CREDENCE), in navy, gold and maroon.
