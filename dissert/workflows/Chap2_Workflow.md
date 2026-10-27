# CHAPTER TWO DEVELOPMENT WORKFLOW
# LITERATURE REVIEW AND RELATED SYSTEMS

Planning document | 24 October 2026

## 1. Purpose and document template

This workflow defines how Chapter Two will be researched, organized, written and checked. It follows Section 7 of the supplied Central University Final Year Project Requirements & Submission Guidelines 2026, pages 5–6. The handbook requires discussion of relevant concepts, academic studies, existing systems, approaches, strengths, weaknesses and the opportunity addressed by the project. It also requires an existing-system comparison table. The section numbering below is a proposed arrangement for meeting those requirements; it is not a verbatim chapter outline prescribed by the handbook.

The chapter title will be CHAPTER TWO: LITERATURE REVIEW AND RELATED SYSTEMS. Use the same document design as the enhanced Chapter One: A4, normal margins, Times New Roman, 12-point body text, 1.5 spacing, justified body paragraphs and clear 14-point headings. Number and caption tables and figures and introduce them in the surrounding text. These formatting requirements come from handbook page 13. Apply the report's overall page range to the assembled dissertation rather than imposing it on this chapter alone.

This workflow is an authoring plan, not the completed literature review. It does not establish that every source has been read, every system tested or every comparison feature verified.

## 2. Connection to Chapter One

Use the revised Chapter One as the scope baseline: a certificate and transcript issuance and verification prototype for Central University SL, with institutional approval, blockchain verification references, encrypted off-chain storage and two-tier access. Keep the web prototype distinct from any future multi-institution consortium deployment.

The literature review must explain the design choices and existing alternatives relevant to that baseline. It must not assume that using blockchain is necessary simply because the project uses it. Compare trusted centralized verification and digitally signed credentials with blockchain-backed verification, and identify the operational trade-offs relevant to the case.

Table W2.1: Objectives and their Chapter Two coverage

| Chapter One objective | Review coverage | Output for later chapters |
| --- | --- | --- |
| O1: Investigate current procedures | Credential lifecycle, administrative verification and stakeholder needs. | Questions and process issues to investigate in Chapter Three. |
| O2: Specify requirements | Authorization, privacy, integrity, status, availability and sharing. | Evidence-supported candidate requirements. |
| O3: Design and develop | Architecture patterns and the four selected system implementations. | Design alternatives and justified choices for Chapter Four. |
| O4: Evaluate | Published evaluation methods, workloads, metrics and limitations. | Candidate measures and test conditions for Chapters Three and Five. |

## 3. Proposed chapter structure

Table W2.2: Chapter Two writing structure

| Section | Content to develop | Completion condition |
| --- | --- | --- |
| 2.1 Introduction | Purpose, review scope and chapter organization. | Connects the review to the problem and four objectives. |
| 2.2 Review approach | Sources searched, search terms, date range, selection and exclusions. | Describes the search actually conducted without claiming a systematic review unless justified. |
| 2.3 Conceptual and technical foundations | Credentials, verification, trust, blockchain, smart contracts, storage and access. | Concepts explain design decisions rather than repeat dictionary definitions. |
| 2.4 Review of empirical studies | Theme-based analysis of published implementations and evaluations. | Compares methods, findings, evidence quality and applicability. |
| 2.5 Review of existing systems | Blockcerts, OpenCerts, EBSI and EduCTX. | Each system receives the same structured assessment. |
| 2.6 Comparative analysis | Handbook comparison table and supporting discussion. | Every substantive comparison is traceable to a source. |
| 2.7 Synthesis and project opportunity | Supported lessons, unresolved needs and the CUSL application. | Defines a bounded contribution without unsupported novelty claims. |
| 2.8 Chapter summary | Main conclusions and transition to methodology and requirements. | Leads directly to Chapter Three without reporting project results. |

## 4. Stage 1: Prepare the source register

Create a source register before writing the substantive review. Give each source a stable identifier and record full bibliographic details, source type, URL or DOI, publication or version date, access date, relevant pages or sections, claims supported and limitations. Separate academic papers, standards, technical documentation, institutional deployment reports and product descriptions.

Start with foundational sources already checked for Chapter One, then add directly relevant empirical work. Use the W3C credential model to discuss roles and verification boundaries, NISTIR 8202 for blockchain foundations and official IPFS documentation for storage and encryption distinctions. These sources support technical explanation but do not replace empirical studies of implemented systems.

Record whether an item was retrieved in full, screened only or excluded. Do not cite an abstract as though the full method and evaluation had been reviewed. A source can support more than one theme, but its limitations must travel with the claim.

Table W2.3: Source-register fields

| Field | Required entry |
| --- | --- |
| Identity | Source ID, authors or organization, title, year and publication venue. |
| Retrieval | DOI or stable URL, access date and document version. |
| Type | Peer-reviewed paper, preprint, standard, official documentation or deployment report. |
| Evidence | Exact supported claim and relevant page or section. |
| Implementation | Proposed model, tested prototype, pilot or documented operational service. |
| Evaluation | Dataset, participants, environment, measures and reported limitations where available. |
| Use | Intended chapter subsection and related project objective. |

## 5. Stage 2: Conduct and document the literature search

Search academic indexes and publisher records for discovery, then obtain the original papers or author manuscripts. Use official system sites and university publications to establish implementation details and adoption. Maintain a search log containing the platform, query, date and screening decision.

Suggested search combinations include: blockchain academic credential verification; university certificate transcript verification; academic records encrypted IPFS; blockchain credential revocation; student-controlled credential sharing; and verifiable credentials higher education evaluation. Add Sierra Leone and comparable institutional settings to investigate contextual relevance. Do not infer that no local research exists from one unsuccessful search.

Use a documented search period that includes foundational work and recent relevant publications through the actual search date. Include sources that address the credential lifecycle, technical design, working implementation or evaluation. Exclude unrelated blockchain applications, duplicate versions, unverifiable references and promotional claims unsupported by technical or deployment evidence. When a preprint and journal version describe the same study, normally cite the final version and identify the manuscript as an access copy rather than count two studies.

Select enough empirical studies to cover the themes below. The four-system limit applies to the named system reviews, not to the number of supporting academic papers. Avoid adding sources merely to increase the reference count.

## 6. Stage 3: Write the foundations and empirical synthesis

For Section 2.3, organize the discussion around the decisions the project must make. Explain academic certificates versus transcripts; issuer, holder and verifier roles; document integrity versus academic truth; status checking and revocation; centralized and blockchain-backed trust arrangements; on-chain commitments versus off-chain storage; encryption and key custody; and public lookup versus confidential sharing.

Do not introduce a formal adoption theory simply to fill a theoretical-framework section. The supplied handbook does not prescribe one for this chapter. If a theory is used, explain its variables, supporting literature and actual role in the research questions or evaluation.

For Section 2.4, group studies into themes: credential issuance and integrity; transcripts and course-credit records; privacy and student authorization; and implementation and evaluation. Within each theme, compare how studies approached the same problem and where their evidence differs. Describe a study's aim, design, implementation, evaluation and limits before drawing implications for CUSL.

Each synthesis paragraph should connect evidence from relevant sources, explain agreement or disagreement and identify the implication for the proposed system. Avoid a sequence of disconnected summaries or an assumption that every published claim is experimentally established.

## 7. Stage 4: Review the four selected systems

The following links are the starting source set identified during the shortlist review. Recheck versions and retrieve the relevant documents during chapter research. A reachable website, a documented deployment and a completed end-to-end verification test are different levels of evidence.

### 7.1 Blockcerts

Starting documentation: https://www.blockcerts.org/guide/

Institutional implementation evidence: https://registrar.mit.edu/transcripts-records/diplomas/digital-diplomas/digital-diploma-verification

Review the issuance and verification lifecycle, recipient sharing, issuer identification and credential status. Use MIT's instructions to support the operational academic example. Identify which component or version a technical claim describes. Do not confuse Blockcerts at blockcerts.org with similarly named commercial services.

### 7.2 OpenCerts

Verification site: https://www.opencerts.io/

Versioned technical documentation: https://docs.opencerts.io/docs/v2/

Institutional implementation evidence: https://www.ntu.edu.sg/education/academic-services/opencerts-digital-certificates-and-transcripts

Review certificates and transcripts, issuance, document verification, status and the relationship between the credential file and its displayed form. Distinguish the documented OpenAttestation-based version from any newer credential framework or migration guidance encountered during research. Do not describe transcript support as absent: NTU explicitly documents it. Compare student authorization and confidentiality only after checking the relevant implementation evidence.

### 7.3 European Blockchain Services Infrastructure (EBSI)

Developer documentation and tools: https://hub.ebsi.eu/

Accreditation integration documentation: https://docs.deqar.eu/stable/ebsi/

Review institutional trust, issuer accreditation, identifiers, credential exchange and verification services. Describe EBSI as infrastructure supporting an ecosystem rather than as one university's complete registry application. Distinguish sandbox, pilot and operational components according to the cited source. Its governance model may inform consortium discussion without establishing that the CUSL prototype implements the same arrangement.

### 7.4 EduCTX

Project site: https://www.eductx.org/

Published study: https://doi.org/10.1109/ACCESS.2018.2789929

Accessible author manuscript: https://arxiv.org/abs/1710.09918

Review the higher-education credit model, institutional participation, prototype architecture and reported evaluation. The manuscript describes an Ark-based proof of concept. Distinguish that historical implementation from features claimed by the current project site. The paper is a research source; the current website alone does not establish that its services still operate exactly as evaluated in the paper.

### 7.5 Common system-review template

For each of the four systems, write the following in the same order: purpose and intended users; implementation or deployment evidence; architecture and workflow; credential types; verification and status; privacy and sharing; documented evaluation; strengths; limitations and evidence gaps; and relevance to CUSL. Keep the depth comparable so that the final table is meaningful.

Where a public demo is available, record only the behavior actually observed using sample or synthetic documents. Do not upload real student credentials or report private workflows as tested without access. Screenshots must identify the system and observed context and must not replace technical analysis.

## 8. Stage 5: Construct the comparison

Use the handbook's required columns for the main comparison. Fill the template below only after source extraction. The entries describe review tasks, not findings about feature support.

Table W2.4: Template for Table 2.1, Comparison of existing credentialing systems

| Existing system | Key features | Strengths | Limitations | What the project addresses |
| --- | --- | --- | --- | --- |
| Blockcerts | Extract verified issuance and verification features. | Link documented advantages to sources. | Separate documented constraints from unknowns. | Explain relevance to the CUSL workflow. |
| OpenCerts | Include confirmed certificate and transcript handling. | Identify supported institutional use and technical capabilities. | Check version-specific privacy and sharing evidence. | Explain the case-specific design choice without claiming transcript novelty. |
| EBSI | Extract trust, accreditation and credential-exchange services. | Assess documented institutional interoperability. | Discuss integration and governance requirements supported by sources. | Relate to future network governance rather than assume equivalent deployment. |
| EduCTX | Extract credit-model and implementation features from the paper. | Identify findings supported by the prototype study. | Preserve study and historical-version limitations. | Relate credit-record lessons to the certificate and transcript scope. |

Use a separate extraction sheet for detailed criteria: issuer authorization, certificate support, transcript or credit support, public status, document comparison, encryption, key custody, student sharing, expiry, revocation, deployment model, infrastructure dependencies, evaluation and cost evidence. This keeps the required five-column table readable.

Classify uncertain features as not established in the reviewed sources. Do not convert silence into an absent feature. Separate a credential's revocation from cancellation of access permission. Avoid comparative claims such as faster, cheaper or more secure unless the cited measurements use defensibly comparable conditions.

## 9. Stage 6: Define the supported project opportunity

Build Section 2.7 from the completed evidence matrix. First state what existing work already demonstrates. Then identify the requirement or contextual issue still unresolved for the selected case. Finally explain what the proposed project will implement or evaluate and the evidence that will be needed.

A suitable direction to investigate is the fit between institutional approval, certificate and transcript integrity, encrypted storage and scoped student-authorized sharing in the CUSL workflow. This is a candidate contribution to substantiate, not a predetermined finding. The absence of a reviewed feature or deployment at CUSL does not establish worldwide novelty.

Do not claim that blockchain credentialing, transcript verification or two-tier access is new without an adequate literature search. Do not describe the project as superior merely because it combines familiar components. Distinguish a contextual application, an engineering integration and a genuinely new method.

End with specific implications for Chapter Three: which stakeholders need consultation, which assumptions require institutional confirmation, which requirements merit validation and which evaluation measures are justified. Keep implementation detail and actual results in their later chapters.

## 10. Stage 7: Draft, revise and verify

Draft Sections 2.3 and 2.4 from the source matrix, then Section 2.5 from the common system template. Complete the comparison before writing the gap synthesis. Write the introduction and summary after the chapter's actual argument is clear. Retain the search log and extraction records as supporting material rather than filling the main chapter with administrative notes.

Check that each factual claim is supported by a source of the appropriate type. Give every in-text citation a complete reference entry and remove references never used. Use the author-date style already established in Chapter One unless the institution directs otherwise. Verify dates, author names, titles, versions and DOI links against the source itself. Summarize in original language and use only brief necessary quotations with attribution.

Generate Chap2_draft.md and Chap2_draft.docx when substantive drafting begins, using the existing document builder and style. Check that both versions contain the same text, that every table has a caption and that headings follow the proposed numbering. Open the Word draft for table wrapping, pagination and final visual review; package validation alone is insufficient.

## 11. Deliverables and completion gate

The Chapter Two work should produce a source register, search log, literature extraction matrix, four structured system assessments, the handbook comparison table and the drafted chapter in Markdown and Word. The review records may be consolidated into one supporting evidence file if that is easier to maintain.

Chapter Two is ready for the next review when:

1. The chapter addresses the handbook's concepts, studies, methods, systems, comparison and project opportunity.
2. All four system reviews identify their evidence level and source version.
3. Empirical research is distinguished from standards, documentation and deployment reports.
4. Certificate, transcript, privacy, authorization and revocation claims are traceable.
5. Unknown features are not presented as missing capabilities.
6. The gap follows from the reviewed evidence and aligns with Chapter One's scope.
7. No invented references, deployments, benchmark results or observed tests appear.
8. Citations and references agree, and the Word document receives a visual review.
9. The conclusion supplies clear inputs to Chapter Three without revising that chapter prematurely.
