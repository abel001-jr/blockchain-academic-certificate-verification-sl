# CHAPTER ONE
# INTRODUCTION

## 1.1 Background of the Project

Academic credentials provide a formal record of educational achievement and support decisions about employment, further study and professional development. Within higher education, degree certificates and academic transcripts serve related but distinct purposes. A certificate records the award of a qualification, whereas a transcript presents the academic detail underlying that award, including courses, credit units, grades and cumulative performance. A credential verification system must therefore address both confirmation of an award and the integrity of the associated academic record.

As credentials are exchanged digitally, institutions must consider how a receiving party can establish their origin and determine whether the information has changed. The World Wide Web Consortium (W3C, 2025) describes a digital credential ecosystem involving issuers, holders and verifiers. This distinction is useful in an academic setting: the university issues a credential, the graduate holds and shares it, and an employer or another institution checks it. The same specification distinguishes verification of a credential from acceptance of the truth of its claims. Technical verification must therefore operate alongside trust in the issuing institution and its academic approval procedures.

Document preparation and document verification are separate administrative functions. Producing a certificate electronically does not, by itself, provide a mechanism for a third party to confirm that a particular copy was authorized or remains valid. Printed signatures and stamps may communicate institutional approval, while correspondence with a registry may establish the status of a record. Where confirmation depends on locating records and obtaining a response from designated staff, the process may be affected by staff availability, the organization of archives and the completeness of the request. These factors require investigation within the institution rather than assumption from the format of its documents.

Blockchain technology offers one approach to maintaining a shared reference for verification. Yaga et al. (2018) describe blockchain ledgers as tamper-evident and tamper-resistant records maintained through a distributed arrangement. For this project, the relevant application is the recording of cryptographic commitments associated with approved credentials. A document can subsequently be hashed and compared with the recorded reference to determine whether its bytes agree with those represented at issuance. This supports detection of changes after the reference is established; it does not validate an incorrect grade or an unauthorized decision made before issuance.

There is an established practical precedent for applying blockchain to academic credentials. In 2017, the Massachusetts Institute of Technology introduced a digital diploma initiative using blockchain-backed verification and the Blockcerts standard. Its verification process connected a graduate's digital record with a blockchain receipt (Durant & Trachy, 2017). Nanyang Technological University also documents the issuance and verification of digital certificates and transcripts through OpenCerts (Nanyang Technological University, n.d.). These examples establish that digital academic verification and transcript support already exist. The question for the present study is how a suitable approach can be integrated with the responsibilities, disclosure needs and operating conditions of the selected institution.

Academic documents also raise storage and confidentiality requirements. Full transcripts may contain information unnecessary for a basic award-status check. The proposed approach therefore separates on-chain verification references from off-chain document storage. The InterPlanetary File System (IPFS) provides content-addressed retrieval, but its official documentation explains that public IPFS does not provide content encryption automatically. Sensitive documents require an additional encryption and access-management layer (IPFS, n.d.). In this project, off-chain storage will be combined with encrypted document handling rather than treated as a privacy control in itself.

The institutional setting is Central University, Sierra Leone, referred to in this study as Central University SL (CUSL). The university identifies its location as 1 Silicon Hills, Mile 91, Tonkolili District, Sierra Leone (Central University, n.d.). The study focuses on the relationship between academic record preparation, institutional approval, credential issuance and subsequent verification. Registry personnel, examination personnel, graduates and verification users provide the principal operational perspectives for investigating this lifecycle.

The project's preliminary institutional account describes a process combining internally prepared records, printed credentials, authorized signatures and registry-mediated verification. This account provides a starting point for examining how academic information moves between responsible officers and external users. The investigation will establish the detailed process, existing controls and any supported difficulties through stakeholder consultation and authorized process documentation. It will also consider what information a verifier needs and how much of a graduate's academic history should be disclosed for a particular purpose.

The proposed solution is a blockchain-backed credentialing prototype incorporating a Two-Tier Verification Protocol. Tier 1 provides public lookup of credential status and permitted metadata using a Certificate ID or corresponding QR link. Tier 2 provides student-authorized access to confidential documents and the associated integrity checks. A public status result will identify its verification scope; checking an identifier will not be presented as proof that every document bearing that identifier is unchanged. This separation is intended to support verification without making complete academic transcripts part of every public inquiry.

The project's contribution is the investigation, implementation and evaluation of this integrated workflow in the CUSL case. It combines established techniques rather than assuming that their individual use is novel. Chapter Two examines the related systems in detail, while the present chapter defines the problem, intended outputs and boundaries against which the project will be assessed.

## 1.2 Statement of the Problem

The preliminary account of credential processing at CUSL places the Registry Office at the center of document preparation, release and external verification, with academic information and approvals supplied by other responsible officers. It describes internally prepared records that are released as printed credentials and checked through institutional correspondence. The detailed sequence and adequacy of current controls require confirmation through authorized records and stakeholder consultation. This study therefore treats the account as a basis for investigation rather than evidence of a measured institutional failure.

Within this setting, the problem is how to connect an approved academic record, its issued certificate or transcript and a later verification request through a coherent, controlled process. A receiving party needs to establish whether the record was authorized, whether it remains valid and, where a document is supplied, whether the content agrees with the issued reference. Printed outputs and individual correspondence do not by themselves specify a repeatable application process for answering all three questions.

The stakeholders have different information needs. Registry and examination personnel need a traceable connection between academic approval and release. Graduates need access to their records and a defined way to permit confidential sharing. Employers and other receiving institutions need interpretable verification outcomes without obtaining unnecessary academic detail. If these needs are handled independently, a status inquiry may be confused with document verification or a full transcript may be disclosed for a limited inquiry. The investigation will establish which of these issues occurs in current practice and its operational significance.

The engineering requirement is consequently to integrate authorized issuance, document-integrity references, current credential status and student-authorized disclosure. The extent of delays, repeated work and any documented alteration incidents will be established through the institutional investigation; no numerical improvement is assumed in advance. The prototype will be assessed against documented requirements and defined user tasks, with unavailable evidence distinguished from a confirmed integrity mismatch.

Existing digital credentialing systems demonstrate relevant techniques, but their existence does not establish their fit to CUSL's approval responsibilities and disclosure requirements. The project addresses this case-specific integration and evaluation problem. Its intended outcome is a demonstrable workflow and evidence of its behavior, rather than an unsupported claim to eliminate academic fraud or replace all existing university systems.

## 1.3 Aim of the Project

To design, develop and evaluate a blockchain-backed academic certificate and transcript issuance and verification prototype for Central University SL, integrating document-integrity checks and student-authorized access to confidential academic records.

## 1.4 Specific Objectives

The specific objectives are:

1. To investigate the existing certificate and transcript issuance and verification procedures at Central University SL and identify stakeholder needs, existing controls and operational constraints.
2. To specify the functional and non-functional requirements for authorized issuance, blockchain-based verification references, encrypted off-chain document storage and student-authorized sharing.
3. To design and develop a web-based prototype integrating institutional approval workflows, smart-contract interaction, off-chain storage and the Two-Tier Verification Protocol.
4. To test and evaluate the prototype's functional correctness, authorization controls, document integrity, performance and usability against the documented requirements.

## 1.5 Research and Project Questions

The study will address the following questions:

1. How are certificates and transcripts currently issued and verified at Central University SL, and what stakeholder needs, controls and operational constraints influence these procedures?
2. What functional and non-functional requirements are needed to support authorized issuance, verification references, encrypted document storage and student-authorized sharing?
3. How can institutional workflows, smart contracts and off-chain storage be integrated into a web-based prototype supporting the Two-Tier Verification Protocol?
4. To what extent does the prototype satisfy the documented requirements for functional correctness, authorization, document integrity, performance and usability?

Table 1.1 links each objective to its corresponding question and the evidence through which achievement will be assessed.

Table 1.1: Alignment of objectives, research questions and expected evidence

| Objective | Question | Expected evidence |
| --- | --- | --- |
| O1: Investigate existing procedures | Q1 | A process account identifying actors, steps, existing controls and supported constraints. |
| O2: Specify system requirements | Q2 | A requirements register linking stakeholder needs to priorities and testable acceptance criteria. |
| O3: Design and develop the prototype | Q3 | A documented design and demonstrable issuance, access and verification workflows. |
| O4: Test and evaluate the prototype | Q4 | Recorded expected and actual outcomes, timing measurements and role-based usability findings. |

The objectives are sequential: the institutional investigation informs requirements, the requirements guide implementation, and the evaluation assesses the resulting artifact. Achievement will be reported using the corresponding evidence rather than inferred from completion of the written chapters alone.

## 1.6 Significance of the Project

### 1.6.1 Registry and Examination Personnel

The project is intended to support a clearer relationship between reviewed academic information, institutional approval and issued documents. A documented workflow can help officers identify the current stage of a credential and the actions required before release. Verification references may also provide a consistent basis for responding to later inquiries. The evaluation will establish which of these functions the prototype supports and whether users encounter practical difficulties.

### 1.6.2 Students and Graduates

Graduates are expected to benefit from a way to access their issued credentials and authorize confidential sharing for employment or further study. Separating public status checks from full-document access allows the purpose of a verification request to guide the information disclosed. Time-limited access can restrict subsequent retrieval through the application, although it cannot withdraw a copy already downloaded by an authorized recipient.

### 1.6.3 Employers and Other Verifiers

The proposed system will provide verifiers with a defined process for checking credential status and, where authorized, comparing relevant documents with their recorded integrity references. Clear outcomes will help distinguish an absent record, a revoked credential, an integrity mismatch and a service temporarily unable to complete a check. This distinction is intended to improve interpretation of verification results and reduce reliance on a document's appearance alone.

### 1.6.4 The University and Educational Administrators

The project will provide CUSL with a documented requirements baseline, a prototype and evaluation evidence to inform decisions about digital credential management. The findings may identify implementation prerequisites such as role definition, staff training, storage arrangements and service recovery. Wider institutional adoption will require consideration of actual operating costs, governance and data-handling responsibilities beyond the prototype evaluation.

### 1.6.5 Researchers and Future Developers

The study will document a case application combining certificate and transcript workflows, blockchain verification references and controlled document sharing. Its contribution will be the design rationale and evidence obtained in the selected setting. It may inform subsequent work at comparable institutions, while further investigation will be needed to establish whether the same design meets their requirements.

## 1.7 Scope and Delimitation of the Project

### 1.7.1 Institutional and Functional Scope

The project is a single-institution case study centered on Central University SL. It covers the preparation, approval, issuance, access and verification of degree certificates and academic transcripts. Principal actors are authorized institutional officers, graduates and third-party verifiers. Consultation with registry, examination and verification stakeholders will establish the detailed responsibilities of each role.

The main functions are controlled credential preparation and approval, association of issued records with blockchain commitments, encrypted document storage, graduate access, public lookup and authorized confidential sharing. Institutional officers will prepare and approve records within their authorized roles; graduates will access their associated credentials and grant permitted sharing; verifiers will perform checks within the public or authorized scope. The system will distinguish certificate verification from transcript verification and record which checks apply to each response. Changes to credential status, including revocation, form part of the verification lifecycle.

### 1.7.2 Technical and Evaluation Scope

The evaluated artifact is a web-based prototype comprising an application interface, backend services, smart-contract integration and encrypted off-chain document storage using IPFS through the project's Pinata integration. The evaluation concerns the complete application workflow, including its dependencies on the configured blockchain and storage services. Frameworks, component interfaces, deployment details and the technology stack will be documented in Chapter Four.

The local blockchain environment provides a controlled setting for prototype development and testing. Multi-institution consortium operation is a possible deployment direction requiring separate governance and network arrangements; it is not an achievement assumed by this study. Technical evaluation will use synthetic credentials and documented test conditions. It will cover core functional behavior, authorization, document integrity, verification timing and handling of relevant failures. User evaluation will address tasks performed by the actual approved participant group, with the recruitment procedure and counts reported in the methodology and results.

### 1.7.3 Delimitations

The project does not extend to a complete university management system. Fee processing, course registration, learning management and comprehensive student-information-system integration are outside its central scope. Although the wider software repository contains mobile and document-reading components, these are not required evaluation deliverables for the web prototype described here.

The study also excludes comprehensive digitization of historical paper archives and deployment across multiple universities. It does not seek to establish national legal recognition of blockchain credentials or to enact accreditation policy. Real student records will not be required for technical demonstration unless their use is separately authorized under an appropriate research and data-protection procedure.

## 1.8 Limitations of the Project

### 1.8.1 Access to Institutional Evidence

The detail of the process analysis will depend on access to personnel and authorized records. Some operational information may be confidential or unavailable, and participant accounts may differ. Process descriptions will therefore distinguish observed steps, documentary evidence and reported practice. Where reliable baseline records are unavailable, the study will be unable to establish a measured institutional reduction in turnaround time or staff workload.

### 1.8.2 Participation and Generalizability

The case study concerns one institution and a bounded set of users. Purposive administrative consultation can provide detailed role-based insight, but it cannot establish the views of every employee. A voluntary graduate survey may be affected by connectivity, availability and willingness to respond. Findings will be interpreted in relation to the actual recruitment procedure rather than assumed to represent all graduates or universities.

### 1.8.3 Infrastructure and Deployment Conditions

Prototype performance will depend on the test hardware, application configuration, network connection, RPC service and off-chain storage access. Local blockchain results may differ from those of a production network operated by several institutions. Service interruptions or missing chain state can prevent a conclusive verification result even where a credential is genuine. These dependencies will be recorded alongside the relevant tests.

### 1.8.4 Security and Evaluation Boundaries

The system relies on correct issuer authorization, accurate source records and protected backend services. Encrypted storage requires secure key custody, while temporary sharing requires reliable access enforcement. Cryptographic matching does not establish that the original academic information was correct. Defined security and integrity tests can identify behavior under tested conditions, but they cannot prove absence of every vulnerability.

The duration and scale of the project will also limit evaluation of long-term use, maintenance effort and institution-wide adoption. Usability findings will concern the participants and tasks actually studied. Chapter Five will discuss the observed effects of these limitations, and Chapter Six will identify further work justified by the results.

## 1.9 Operational Definition of Key Terms

Academic credential: An institutionally issued certificate or transcript representing a graduate's qualification or academic record within the project's workflow.

Degree certificate: A document confirming that the university has awarded a specified qualification to a named graduate.

Academic transcript: A document recording course-level results and associated academic performance information, including credits, grades and cumulative measures where applicable.

Registry Office: The institutional function considered in this project for coordinating credential preparation, release, archiving and verification, subject to confirmation of CUSL's actual allocation of responsibilities.

Blockchain: The ledger infrastructure used by the prototype to retain credential verification references and relevant status information through smart contracts.

Smart contract: A program deployed on the blockchain that implements the project's defined credential registration, authorization or status operations.

Cryptographic hash: A value calculated from data or document bytes and used as a reference for checking whether the same content is presented subsequently.

Document integrity: Agreement between the document bytes being checked and the reference represented by the applicable trusted hash.

Encrypted off-chain storage: Storage of protected document payloads outside the blockchain, with access to readable documents dependent on the required authorization and decryption services.

InterPlanetary File System (IPFS): The content-addressed storage and retrieval technology used in the project's off-chain document architecture.

Content identifier (CID): An identifier used to locate content through IPFS. Its representation depends on its format and is distinct from the project's application-level document hash.

Two-Tier Verification Protocol: The project's separation of public credential-status and permitted-metadata checks from authorized confidential document access and integrity checks.

Share code: A temporary application authorization mechanism through which a graduate permits access within a defined sharing scope.

Public verification scope: The credential-status and permitted-metadata checks available without confidential document authorization.

Confidential verification scope: Authorized document access and the applicable certificate or transcript integrity checks, additional to the public scope.

Consortium blockchain: A blockchain network governed by multiple authorized organizations. In this project, it is a potential deployment model beyond the documented local prototype.

Credential revocation: A status change indicating that a previously issued credential is no longer valid for verification purposes under the issuing institution's rules.

## 1.10 Organization of the Report

The report is organized into six chapters. Chapter One introduces the background, problem, aim, objectives, questions, significance, scope, limitations and key terms. Chapter Two reviews relevant literature and existing credentialing systems, compares their approaches and establishes the supported opportunity addressed by the project.

Chapter Three presents the development methodology, requirements-gathering approach, existing-system analysis and proposed-system requirements. Chapter Four describes the architecture, system models, data design, interfaces, technology stack and implementation of the prototype.

Chapter Five presents the testing plan, actual test results and evaluation of the system against its requirements, including failures, corrections and remaining limitations. Chapter Six summarizes the project, assesses achievement of the objectives and presents conclusions, recommendations and future work. The reference list and supporting appendices follow the main chapters.

## References Cited in Chapter One

Central University. (n.d.). About us. Retrieved October 24, 2026, from https://central.edu.sl/web/about-us/

Durant, E., & Trachy, A. (2017, October 17). Digital diploma debuts at MIT. MIT News. https://news.mit.edu/2017/mit-debuts-secure-digital-diploma-using-bitcoin-blockchain-technology-1017

IPFS. (n.d.). Privacy and encryption. IPFS Docs. Retrieved October 24, 2026, from https://docs.ipfs.tech/concepts/privacy-and-encryption/

Nanyang Technological University. (n.d.). OpenCerts digital certificates and transcripts. Retrieved October 24, 2026, from https://www.ntu.edu.sg/education/academic-services/opencerts-digital-certificates-and-transcripts

World Wide Web Consortium. (2025, May 15). Verifiable credentials data model v2.0. W3C Recommendation. https://www.w3.org/TR/2025/REC-vc-data-model-2.0-20250515/

Yaga, D., Mell, P., Roby, N., & Scarfone, K. (2018). Blockchain technology overview (NISTIR 8202). National Institute of Standards and Technology. https://doi.org/10.6028/NIST.IR.8202
