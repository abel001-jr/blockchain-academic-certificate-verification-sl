# Workflow for Enhancing Chapters One and Three

Working guide | 24 October 2026

## 1. Purpose and authority

This workflow aligns Chap1.docx and Chap3.docx with the Central University Final Year Project Requirements & Submission Guidelines 2026 supplied in this folder. It also guides the companion rewritten drafts, Chap1_enhanced.docx and Chap3_enhanced.docx. The originals remain the historical drafts.

The handbook requires six chapters: Introduction; Literature Review and Related Systems; Methodology, Requirements and System Analysis; System Design and Implementation; Testing, Results and Evaluation; and Conclusion and Recommendations (page 3). Its Chapter One requirements appear on pages 4–5, Chapter Three requirements on pages 6–7, formatting on page 13, and evidence and integrity expectations on pages 10–14. Follow this structure unless a documented supervisor instruction changes it.

The rewritten documents are working drafts, not verified reports of completed fieldwork. They deliberately distinguish repository observations, proposed procedures, and claims awaiting evidence. Bracketed evidence markers are editorial tasks to resolve before submission; they are not bibliographic citations.

## 2. Stage 1: Establish the evidence baseline

Create an evidence register before finalizing either chapter. Record an identifier, the claim supported, source owner, date, file location, access restrictions, and verification status. Store participant information separately from public dissertation material.

| Marker | Evidence to obtain | Consequence for writing |
| --- | --- | --- |
| E1 | Registry-approved description of issuance, transcript preparation, signatures, storage and verification | Confirm the existing process and institutional problem without assuming every step is manual. |
| E2 | Authorized cohort totals, department/faculty counts and eligible staff list | Confirm the draft figure of 350 graduates and remove overlaps between staff roles. |
| E3 | Permission letters, ethics decision where required, participant information and consent materials | Describe approvals as obtained only when records exist. |
| E4 | Interview guide, consented recordings or notes, transcripts and coding records | Support administrative findings and the requirements derived from them. |
| E5 | Questionnaire, recruitment log, anonymized export, inclusion rules and cleaning log | Establish actual response counts and denominators. |
| E6 | UAT task sheets, participant roles, SUS forms and scoring workbook | Establish actual usability results without inventing attendance or scores. |
| E7 | Test cases, raw execution logs, environment details, deployment coordinates and code revision | Support functional, security, integrity and performance claims. |
| E8 | Full bibliographic records and source-to-claim checks | Replace broad novelty claims and unsupported institutional or statistical citations. |

The original Chapter Three reports three interviews, 205 survey responses, 24 usability participants, a 15-person pilot and 100 successful integrity trials. These are unverified legacy draft claims, not accepted findings. Retain them in the evidence audit until their records are checked; do not silently convert them into new facts or dates. If corroborated, restore the actual procedures and results with the corresponding evidence references.

## 3. Stage 2: Resolve scope and architecture

Use one project description across both chapters: a blockchain-backed certificate and transcript issuance and verification prototype for a Central University SL case study. Describe the case as context-specific rather than statistically representative of all universities.

The repository documents a Next.js/React frontend, Django backend, Solidity/Hardhat tooling, a persistent local Anvil environment and IPFS/Pinata integration. Its verification notes describe server-side chain checks and encrypted document retrieval. These observations establish design context; they do not prove successful deployment, testing, field use or security.

Keep the local prototype distinct from a possible future consortium deployment. Application authorization does not establish multi-institution validator governance. Document participating institutions, validator ownership, consensus configuration and network access before claiming a deployed consortium. Do not describe Sepolia as a permissioned consortium network.

Define the trust boundary: issuer authorization, configured RPC and contract, backend enforcement, encryption-key custody, IPFS availability and student sharing. Public status lookup and confidential PDF verification have different scopes. Treat a QR code as a lookup mechanism, not proof that the carrying document is unchanged. Avoid claims of complete self-sovereign identity unless the implemented identity and key-control model establishes them.

## 4. Stage 3: Rewrite Chapter One

| Section | Enhancement action | Completion check |
| --- | --- | --- |
| 1.1 Background | Move from credential verification generally to the university context and proposed approach. Reduce repeated technology promotion. | Each factual institutional or literature claim has a traceable source. |
| 1.2 Problem statement | Separate the reported workflow, its observed consequences and the problem to solve. | Delays and fraud incidents are supported or clearly identified as matters to investigate. |
| 1.3 Aim | State one design-and-development aim. | The aim describes the actual project deliverable. |
| 1.4 Objectives | Use four measurable objectives covering investigation, requirements, development and evaluation. | Each objective maps to one question and evidence. |
| 1.5 Questions | Mirror the four objectives. | No question promises an outcome the evaluation cannot assess. |
| 1.6 Significance | Describe intended benefits for registry staff, graduates, verifiers and researchers. | Expected benefits are not written as measured achievements. |
| 1.7 Scope | Define actors, certificate/transcript functions, web prototype and institutional boundaries. | Consortium ambitions and optional mobile features are not confused with evaluated scope. |
| 1.8 Limitations | State genuine evidence, sampling, infrastructure, trust and time constraints. | The placeholder and incorrect deferral to Chapter Five are removed. |
| 1.9 Key terms | Define terms according to the system's actual use. | Definitions avoid absolute security guarantees and fixed CID-length assumptions. |
| 1.10 Organization | Explain all six chapters in the handbook's order. | Later chapter titles match the guide. |

## 5. Stage 4: Rewrite Chapter Three

Updated planning direction, 24 October 2026: use Chap3_Requirements_Guide.md and Chap3_Workflow.md for the next Chapter Three revision. They replace the twelve-section plan below with eight main sections that place the handbook's six content areas in order: Introduction; Development Methodology; Requirements Gathering; Functional Requirements; Non-Functional Requirements; Existing System Analysis; Proposed System; Summary. The table below records the earlier plan and is retained for migration context, not as the current required outline. The original supervisor handbook remains unchanged.

Retain useful interview, survey, ethics and evaluation planning, but place it within the software-project structure required by the handbook. Distinguish the research framework from the development method: Design Science can organize the artifact lifecycle while iterative prototyping specifies development work.

| Section | Required output | Evidence or verification |
| --- | --- | --- |
| 3.1 Introduction | Purpose, scope and status of methodology | Consistent with Chapter One. |
| 3.2 Development methodology | Iterations, review points, deliverables and rationale | Requirements revisions, design versions and implementation history. |
| 3.3 Case and participants | Stakeholder roles, eligibility and sampling limitations | E1–E2; unique people counted once. |
| 3.4 Requirements gathering | Interviews, process observation, document review and survey | E3–E5; state how sources inform requirements. |
| 3.5 Existing-system analysis | Current process, responsibilities, pain points and baseline measures | E1 and E4; distinguish reported from observed steps. |
| 3.6 Proposed system | Actors, workflow, components, verification tiers and trust model | Repository evidence plus design documentation. |
| 3.7 Functional requirements | Numbered shall-statements with acceptance checks | Trace each to a source and later test. |
| 3.8 Non-functional requirements | Security, usability, performance, reliability and maintainability targets | Explicit measurement conditions and agreed thresholds. |
| 3.9 Implementation approach | Tools, artifact boundaries and deployment distinction | Package files, code revision and environment record. |
| 3.10 Evaluation and analysis | Test plan, usability method, baseline comparison and analysis | E6–E7; results belong in Chapter Five. |
| 3.11 Ethics and quality | Consent, confidentiality, retention, validity and limitations | E3–E8; avoid claims of guaranteed anonymity or zero risk. |
| 3.12 Summary | Link requirements and methodology to Chapter Four | No conversational drafting instructions remain. |

## 6. Stage 5: Apply a consistent research and evaluation plan

Use purposive interviews for knowledgeable staff. Treat graduate outreach as an invitation to the confirmed eligible cohort with voluntary response unless a genuine probability-sampling procedure is used. Do not attach a population margin of error to convenience responses. If the original 187 target is retained for planning, explain its assumptions and do not treat achieving that count as proof of representativeness.

The actual survey response rate must use a defensible eligible invitation denominator. Record invitations, unreachable contacts, submissions, duplicates, exclusions and final valid responses. The old draft's arithmetic, 205 divided by 350 multiplied by 100, is 58.6%; that calculation alone does not authenticate either count.

Use interview findings to refine survey items and requirements. Retain the mapping from source observation to requirement, design component, test and objective. Explain contradictory feedback and how priorities were resolved. Keep SUS usability data separate from graduate requirements-survey data.

Test ordinary and adverse cases: authorized issuance, unauthorized issuance, final-document hash matching, modified files, expired or revoked sharing, credential revocation, missing commitments, RPC failure, storage failure and chain-state loss. Report unavailable evidence separately from invalid or modified credentials. Record repetitions and conditions before interpreting timing or reliability.

## 7. Stage 6: Complete the source and evidence audit

For each literature claim, open the actual source, verify authorship, publication year and claim relevance, and add the full entry in the institution's required reference style. The rewritten drafts do not preserve uncertain author-year citations simply to appear complete. Add verified literature on credential verification, blockchain trust, content-addressed storage, research design, thematic analysis and SUS before submission.

Replace categorical statements such as 'no prior research exists' with a conclusion supported by a documented search strategy. Describe originality in terms of the demonstrated case application and design combination. Describe cryptographic commitments as supporting tamper detection; they do not establish the truth of grades entered by an authorized issuer.

## 8. Stage 7: Format and verify the documents

Use A4, Times New Roman, 12-point body text, 1.5 line spacing, justified body paragraphs, normal margins and clear 14-point numbered headings, following handbook page 13. Use Word heading styles so the final report can generate a table of contents. Give every table and figure a number and descriptive caption, and refer to it in the text.

The companion Word drafts apply this base formatting. Open them in Word for final pagination, table wrapping, accessibility and visual checks. Their editable Markdown sources accompany them. The handbook's 70–90-page range applies to the full report excluding appendices, not to either chapter in isolation. Assemble the full report, add preliminary pages and references, then export the submission PDF.

## 9. Current rewrite and remaining decisions

The first rewrite implements the new section structures, four-objective alignment, explicit requirements and evaluation planning. It removes duplicate methodology sections, unsupported achieved results, raw LaTeX, ASCII diagrams and conversational conclusions. It explains the local blockchain and server-managed encryption model from repository material.

Before these become final dissertation chapters, resolve E1–E8, confirm the approved title, confirm whether fieldwork has occurred, verify the actual deployment used, agree evaluation thresholds and insert verified academic citations. Replace planned language with past tense only for procedures supported by evidence; keep recommendations and unevaluated architecture in future or conditional language.

## 10. Final acceptance checklist

1. The chapter structure follows the supplied six-chapter handbook.
2. Four objectives correspond to four questions, requirements and evaluation evidence.
3. Every institutional statistic and completed research activity has supporting evidence.
4. Sampling language reflects the actual recruitment procedure and its limitations.
5. The implemented prototype is distinguished from any future consortium deployment.
6. Public metadata, confidential PDFs and verification outcomes have explicit boundaries.
7. Test results are supported by logs and reported in Chapter Five.
8. All editorial evidence markers are resolved and all scholarly citations verified.
9. Tables, headings, page numbers and final PDF appearance are checked in Word.
10. The original files remain preserved and unrelated repository changes remain untouched.
