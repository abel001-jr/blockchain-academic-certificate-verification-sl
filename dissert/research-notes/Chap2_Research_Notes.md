# Chapter Two research and evidence record

Research date: 24 October 2026. This file is supporting documentation, not dissertation prose.

## Review scope and search log

Focused narrative review for the approved four-system shortlist and the Chapter Two workflow. Search-engine discovery was followed by direct access to primary sources. No systematic-review claim, exhaustive geographic gap claim or independent external-system test is made.

Queries used in this drafting pass: blockchain academic certificate verification IPFS implementation evaluation paper; BlockMEDC blockchain certificates Fartitchou; Ifeyemi Celo academic certificate verification. Direct source access covered the four shortlisted systems, W3C, NIST and IPFS. Earlier shortlist searches included EduCTX higher education credits and official Blockcerts, OpenCerts and EBSI documentation.

Selection favored original research with inspectable methods or implementation sections, official technical documentation and university deployment instructions. The selected research spans 2018–2025, with a 2024 preprint explicitly identified. No result count or sampling frame is invented for the search.

## Source and extraction register

| ID | Source and type | Material inspected | Use and limitation |
| --- | --- | --- | --- |
| S01 | Yaga et al., 2018, NISTIR 8202; technical report | Official publication record and abstract; DOI 10.6028/NIST.IR.8202. | Narrow blockchain characterization; not a full report-level security analysis. |
| S02 | W3C, 2025, Verifiable Credentials Data Model v2.0; standard | Dated recommendation, introduction, ecosystem and trust-model material. | Roles and verification boundary; no claim of prototype conformance. |
| S03 | IPFS Docs, Privacy and encryption; official documentation | Content addressing, public metadata and encryption discussion. | Separate confidentiality from storage; no regulatory conclusion. |
| S04 | Turkanović et al., 2018, EduCTX; research article | Accessible author manuscript at https://arxiv.org/html/1710.09918v1; prototype, consortium adaptation and student verification sections. Publication DOI linked from author record. | Historical prototype evidence. |
| S05 | Ifeyemi et al., 2024; research article | Seven-page publisher PDF, including methods, architecture, deployment, verification and user-evaluation sections. | Celo/MongoDB example and ten-user evaluation; no conversion of ratings into measured security. |
| S06 | Fartitchou et al., 2024, BlockMEDC; preprint | https://arxiv.org/html/2410.07258v1; contract architecture, TranscriptCert and implementation setup. | Transcript support and Sepolia implementation; not cited as an established journal publication. |
| S07 | Fernández-Blanco et al., 2025; research article | Publisher-indexed text of abstract, implementation and conclusion material; direct full-page fetch returned HTTP 429. | Limited qualitative discussion of hardware/energy evaluation; no numerical targets extracted. |
| S08 | Blockcerts Introduction; official documentation | Open-source ecosystem and components. | System model rather than controlled benchmark. |
| S09 | Blockcerts FAQ; official documentation | Hash anchoring, issuer checking, expiry and revocation discussion. | Avoid absolute tamper-proof claims from promotional wording. |
| S10 | MIT Registrar, Digital diploma verification; institutional evidence | Credential delivery, URL/JSON verification and portal instructions. | Documented institutional service; no independent transaction performed. |
| S11 | OpenCerts Getting started v2; versioned official documentation | OpenAttestation relationship, identity, issuance and revocation links. | Version-specific architecture only. |
| S12 | OpenCerts Transcripts v2; versioned official documentation | Transcript-schema documentation page. | Confirms technical transcript coverage; no claim about full production deployments from schema alone. |
| S13 | NTU, OpenCerts digital certificates and transcripts; institutional evidence | Issuance, combined certificate/transcript file and verification FAQ. | Operational documentation; no independent performance evidence. |
| S14 | OpenCerts FAQ; official documentation | Integrity, issuer and status checks; TrustVC migration and legacy acceptance statements. | Distinguish new framework from v2; migration claims may change and need recheck at submission. |
| S15 | EBSI Hub; official technical portal | API, identity, issuance, trust-chain and validator resources. | Infrastructure capabilities, not a university registry deployment claim. |
| S16 | EQAR DEQAR EBSI documentation; integration evidence | Accreditation credentials and identity prerequisites. | Institutional trust integration; not proof of broad production deployment. |

All online sources were accessed on 24 October 2026. Full URLs and publication details appear in the chapter reference list; the author manuscripts are access copies, not extra studies counted separately.

## Corrections established by primary sources

BlockMEDC explicitly contains TranscriptCert in Section IV-B5. The preprint implementation setup in Section V-A uses Sepolia and Remix. It must not be described as only static diplomas or as a demonstrated permissioned consortium. The manuscript contains a revocation discussion involving selfdestruct; the chapter does not endorse or transplant that version-sensitive mechanism.

OpenCerts v2 includes transcript documentation, and NTU describes combined certificate/transcript credentials. The reviewed FAQ also reports a TrustVC transition. Therefore neither transcript absence nor an unqualified claim that all current OpenCerts issuance uses the legacy blockchain model is defensible.

Ifeyemi et al. report ten users; the paper's abstract and table differ on one maintainability percentage, so the draft deliberately avoids repeating that disputed figure.

## Exclusions and retrieval limits

The QualiChain/Fenix.edu case-study publisher page returned HTTP 403. It was not incorporated as a fully reviewed study. Several IEEE abstract-only results and recent unverified journal results were excluded from substantive comparison. They may be investigated in a later expanded literature search.

The low-power-node paper is retained with an explicit limited-access statement because substantial publisher-indexed material was retrievable, but the draft does not claim to reproduce its complete experimental analysis. A follow-up should obtain the full article and inspect methods, workload and figures before expanding its discussion.

## Interpretation and remaining work

In the revised chapter, Table 2.1 summarizes research evidence, Table 2.2 compares the four systems and Table 2.3 records the project's analytical implications. Unknown functionality is not coded as absent. No ranking, universal superiority, national research-absence claim or measured CUSL improvement is asserted.

Before submission, broaden the search as appropriate to supervisor feedback, retrieve the limited-access article in full, recheck changing documentation and confirm the institution's reference style. The references are a chapter working list to merge with the report bibliography. Visual review in Word remains necessary for pagination and the five-column comparison table. No screenshots are fabricated, and no external-system demonstration is claimed.

## Revision against the supervisor's handbook and agreed workflow

The revision preserves the eight-section plan while replacing disconnected study summaries with themes covering representation, authorization, privacy and evaluation. Research methods and evidence limitations are compared explicitly. The system reviews follow the same sequence: purpose and users, implementation evidence, architecture and credential scope, verification and sharing, strengths, evaluation boundaries and relevance to the case.

Operational retrieval errors are retained here rather than in dissertation paragraphs. The partial-access status of the low-power-node study remains disclosed in the chapter and Table 2.1; no detailed benchmark is inferred. New retrieval attempts to the publisher HTML/XML, PDF endpoint and institutional handle did not provide an accessible complete article through the tool. The original partial-access classification remains unchanged.

The Blockcerts FAQ was rechecked for separate high-level and detailed credentials, revocation and issuer verification. The revision therefore acknowledges existing differentiated-disclosure approaches rather than presenting student control as an unaddressed concern. OpenCerts FAQ and EQAR documentation were also rechecked. The OpenCerts transcript page failed on a repeat direct fetch, but the previously retrieved version and independent NTU deployment documentation remain the stated evidence; no new claim is based on the failed retrieval.

Table R2.1: Handbook and workflow alignment record

| Requirement | Revised location | Review outcome |
| --- | --- | --- |
| Concepts linked to the project, handbook 7.1 | 2.3 | Explains trust, representation, status, storage and disclosure decisions. |
| Compare research approaches and findings, handbook 7.1 | 2.4 and Table 2.1 | Thematic comparison replaces individual summary structure. |
| Explain useful features, strengths and limitations, handbook 7.2 | 2.5 | Four comparable assessments; no external trial claimed. |
| Required five-column system table, handbook 7.3 | Table 2.2 | Uses system, features, strengths, limitations and project response. |
| Establish an opportunity, handbook 7.1 | 2.7 | Bounded CUSL application and integration; no worldwide novelty claim. |
| Avoid invented or unused sources, handbook 7.4 and references guidance | In-text citations and reference list | Sixteen entries retained, with same-author undated suffixes reconciled. |
| Separate detailed extraction from main table, workflow Stage 5 | Table R2.2 below | Unknowns remain explicitly unresolved. |
| Link to subsequent methodology, workflow Stage 6 | 2.7.3 and 2.8 | Candidate requirements require later institutional confirmation. |
| Formatting, handbook Section 18 | Generated Word document | Base formatting and package checks; final visual review pending. |

## Detailed system-feature extraction

Table R2.2 is an evidence map, not a new independent test. 'Not established' means the selected material did not substantiate an equivalent feature. It must not be read as 'unsupported by the product'. Sources S01–S16 are identified above and their bibliographic entries are in the chapter.

Table R2.2: Evidence categories for the selected system comparison

| Criterion | Blockcerts | OpenCerts | EBSI | EduCTX |
| --- | --- | --- | --- | --- |
| Primary evidence | Official components and MIT instructions, S08–S10. | Versioned documentation and NTU instructions, S11–S14. | Developer and accreditation integration documentation, S15–S16. | Original research prototype, S04. |
| Credential representation | Academic diploma example; wider standard. | Certificate and transcript documentation. | Credential ecosystem; diploma/accreditation context. | Academic-credit model. |
| Issuer authority | Issuer-verification discussion. | Issuer identity checks. | Institutional trust and accreditation layer. | Institutional participation. |
| File or content integrity | Documented verification reference. | Document integrity check. | Credential validation resources; implementation-specific details not extracted. | Credit-record evidence; equivalent PDF comparison not established. |
| Confidential sharing | Recipient presentation; separate detailed credentials discussed. | Recipient file sharing documented. | Equivalent temporary-code document service not established. | Student participation documented; equivalent PDF sharing not established. |
| Encryption and key custody | Full deployment-specific key/storage model not extracted. | Full deployment-specific key/storage model not extracted. | Wallet/service-specific model not established here. | Full equivalent document-encryption model not established. |
| Permission expiry | Equivalent application share-code expiry not established. | Equivalent application share-code expiry not established. | Equivalent application share-code expiry not established. | Equivalent application share-code expiry not established. |
| Credential status | Revocation and expiry discussed in S09. | Status and revocation discussed in S14. | Per-component status behavior not extracted. | Equivalent full credential-status behavior not established here. |
| Deployment evidence | Institutional service instructions, not independent testing. | Institutional service instructions, not independent testing. | Integration resources, not one registry application. | Historical implementation, not current endpoint confirmation. |
| Evaluation and cost | No directly comparable benchmark extracted. | No directly comparable benchmark extracted. | No directly comparable benchmark extracted. | Prototype evidence; no cross-system cost ranking. |

The comparison's limits are deliberate: a shared feature name does not establish equivalent semantics or assurance. Additional full-text retrieval and actual authorized testing would be required to fill unresolved implementation cells. The chapter uses only the established evidence to motivate requirements, rather than inventing negative findings to make the proposed system appear stronger.
