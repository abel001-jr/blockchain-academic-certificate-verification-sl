# CHAPTER TWO
# LITERATURE REVIEW AND RELATED SYSTEMS

## 2.1 Introduction

This chapter reviews the concepts, research implementations and existing systems relevant to academic certificate and transcript issuance and verification. The purpose is to establish what previous work demonstrates, examine the evidence behind competing approaches and identify the implications for the Central University SL (CUSL) prototype described in Chapter One. The review concentrates on authorized issuance, document integrity, credential status, off-chain storage and student-authorized disclosure.

The chapter first explains the review approach and technical foundations. It then examines research on academic records, institutional authorization and implementation evaluation. Four existing systems are reviewed in detail: Blockcerts, OpenCerts, the European Blockchain Services Infrastructure (EBSI) and EduCTX. A comparison and synthesis connect their lessons to the proposed project. The review distinguishes a documented feature from an independently tested result and an implemented prototype from an institution-wide service.

## 2.2 Review Approach and Source Selection

The chapter uses a focused narrative review of technical foundations, research implementations and four selected credentialing systems. Literature discovery and direct source retrieval were undertaken on 24 October 2026. Queries combined academic credential verification, blockchain, transcripts, IPFS, student sharing and implementation evaluation, followed by searches for the named systems and regional studies. The search used web discovery, publisher records, author manuscripts and official system documentation. It was selective and does not constitute a systematic review of all available research.

Sources were included when they explained a relevant mechanism, described an inspectable implementation, reported an evaluation or documented institutional use. The selected studies span 2018–2025, supported by standards and versioned documentation available at the review date. Duplicate manuscript and publication versions were treated as one study. Abstract-only discoveries, unrelated applications and unsupported promotional statements were not used to establish comparative findings. A partially accessible implementation article is discussed only at the level supported by the material retrieved.

The analysis distinguishes research evidence from implementation documentation. Academic papers support discussion of methods and reported results; standards clarify concepts; and university instructions support claims of documented deployment. None is treated as an independent security audit of the systems reviewed here. The four systems were assessed from published evidence rather than tested through new external transactions. Search details, source versions and retrieval limits are retained in the supporting research record.

The review is organized by the questions the project must resolve: what information is represented, who authorizes issuance, what a verifier checks, how confidential content is shared and how a working implementation is evaluated. An undocumented feature is classified as not established in the selected sources, rather than assumed absent. This approach allows a comparison without overstating either the weaknesses of existing work or the novelty of the proposed application.

## 2.3 Conceptual and Technical Foundations

### 2.3.1 Academic Credentials and Verification Scope

A certificate confirms an award, while a transcript provides the associated course-level academic information. Their verification requirements overlap but are not identical. A basic inquiry may concern whether an award exists and remains valid. Another may require confirmation that a complete transcript corresponds to the issued record. A useful system must identify which of these questions it has answered.

The World Wide Web Consortium (W3C, 2025) distinguishes issuers, holders and verifiers in its credential model. It also explains that verifiability does not establish the truth of the underlying claims. Applied to this project, the university remains responsible for academic approval, the graduate holds or accesses the credential, and a receiving party evaluates it under its own acceptance rules. This is a conceptual reference, not a claim that the proposed prototype implements W3C credential conformance.

The distinction has a practical consequence: checking a credential identifier cannot, by itself, establish that an accompanying PDF is unchanged. The project will need to communicate the scope of each outcome. This separation allows public status lookup and confidential document comparison to be evaluated as different functions.

### 2.3.2 Centralized Services and Blockchain-Based References

A centralized verification service places the current record and response process under the institution's administrative control. Its practical attraction is that it can fit existing account and record-management arrangements; its verification response remains dependent on the service and its controls. A digitally signed credential instead allows a recipient to check protected content against issuer verification material, while still requiring an issuer-trust and status policy. The W3C model permits different registry arrangements and does not make blockchain a universal requirement (W3C, 2025).

Yaga et al. (2018) characterize blockchain as a distributed, tamper-evident and tamper-resistant ledger. For academic records, its relevant role is to retain agreed commitments and status information. The justification for adopting it depends on the trust relationships and operating conditions of the particular application. Recording a value does not replace the institutional procedure that authorizes its entry.

The architectural choice is therefore a trade-off between institutional control, portable verification evidence and shared ledger operation. The proposed project adopts blockchain commitments as an engineering approach to evaluate, while retaining application services for institutional workflow and confidential access. Its evaluation must explain the additional operating dependencies and cannot assume that a local development node delivers the governance properties of a multi-institution network.

### 2.3.3 Smart Contracts, Issuance and Status

Smart-contract operations can represent credential registration and status changes, but their value depends on access rules and the relationship between on-chain and application state. The system must establish who can issue a record, which approvals precede issuance and how a verifier learns that an earlier credential has been withdrawn. These are separate concerns from whether a transaction was successfully submitted.

The Blockcerts verification documentation includes checks of issuer information, credential data and expiry or revocation status (Blockcerts, n.d.-a). This supports a lifecycle view of authenticity: a document can remain unchanged while no longer being acceptable because its status has changed. The CUSL design should therefore prevent a stale application record from overriding the authoritative status used in verification.

Credential revocation and sharing cancellation must also be distinguished. Revoking a credential withdraws its validity under institutional rules. Cancelling a sharing permission restricts a particular route to confidential information without necessarily affecting the award itself. Separate tests and user messages are needed for these outcomes.

### 2.3.4 Off-Chain Storage, Integrity and Confidentiality

IPFS addresses content through content identifiers, but public IPFS does not automatically encrypt stored files. Its documentation distinguishes transport encryption from protection of the content itself and notes public visibility of network metadata (IPFS, n.d.). An architecture that places transcripts on IPFS must consequently explain confidentiality separately from retrieval and content addressing.

For this project, a document hash is the integrity reference, encrypted storage protects the document payload, and access authorization controls application retrieval. These functions should not be collapsed into a single claim of secure storage. An available CID does not establish an authorized disclosure decision, while a valid hash cannot restore a lost document.

The project must also define the exact representation being checked. Comparing the bytes of an issued PDF answers a different question from comparing selected metadata or the visual similarity of a scan. Evaluation should use unchanged and deliberately modified originals and report when a check is not applicable or cannot be completed. Availability failures should not be presented as proof of forgery.

### 2.3.5 Student Sharing and Institutional Trust

Student control can refer to choosing when to present a credential, granting application access or holding cryptographic keys. These are different arrangements with different trust implications. A temporary share code can support scoped application access, but it does not necessarily give the graduate independent custody of the storage encryption key.

The proposed Two-Tier Verification Protocol concerns disclosure scope: public credential status and permitted metadata are separated from authorized confidential document access. Its assessment must consider unauthorized requests, expired permissions, incorrect student associations and the consequences of a recipient saving a copy. The project can control later access through its service; it cannot assume that permission expiry erases a previously downloaded document.

## 2.4 Thematic Review of Research Implementations

### 2.4.1 Credential Representation and Document Integrity

Research differs in what it represents as the academic record. Turkanović et al. (2018) implement EduCTX as an Ark-based credit platform, whereas Fartitchou et al. (2024) include diploma and transcript contracts in the BlockMEDC preprint. These approaches show that academic detail is not limited to the final award. Their representations nevertheless differ from a service that preserves and verifies the complete issued PDF document pair.

Ifeyemi et al. (2024) provide a complementary certificate-centered implementation using Celo and application metadata, including file and identifier verification. The distinction between these operations matters: a matching identifier locates a record, while a file comparison establishes agreement with a particular content reference. For CUSL, the appropriate unit of verification must follow the user's task rather than the broad label of blockchain verification.

The studies therefore support several feasible representations rather than a single preferred architecture. Structured data can support field-level processing, while preserved documents support checking the specific files released by the university. Choosing the latter does not establish a new transcript-verification method; it establishes a design boundary that the implementation and evaluation must preserve.

### 2.4.2 Issuer Authorization and Institutional Governance

BlockMEDC describes institutional authority contracts and reports a Sepolia implementation using Remix and Solidity (Fartitchou et al., 2024). EduCTX describes institutional network participation and controls around student credit records (Turkanović et al., 2018). The studies address related trust questions at different layers: permission to issue an academic record and participation in the ledger infrastructure are not interchangeable.

This distinction prevents an important overgeneralization. A contract with restricted functions may implement issuer authorization without establishing consensus jointly governed by several universities. Conversely, network membership does not guarantee that a university's internal academic approvals were completed correctly. The CUSL prototype must document both its application roles and its actual deployment configuration, with evidence appropriate to each claim.

### 2.4.3 Confidentiality and Student Authorization

The reviewed implementations motivate a distinction between possession of academic evidence and authorization to retrieve confidential content. EduCTX incorporates student participation in presenting credit evidence (Turkanović et al., 2018); this does not establish an equivalent temporary-code service for confidential PDF access. Likewise, identifying a transcript contract in BlockMEDC does not by itself establish the confidentiality properties of every associated storage and interface component.

The storage documentation helps clarify this boundary: IPFS content addressing must be combined with additional measures when payload confidentiality is required (IPFS, n.d.). The analytical implication is that a privacy assessment should identify exposed metadata, key custody, authorization scope and recipient access. The present project will investigate these requirements rather than infer privacy merely from keeping documents off-chain.

The proposed two-tier arrangement is consequently an application design to validate, not evidence that earlier research ignored student participation. Its usefulness must be demonstrated through defined disclosure rules and tests of allowed and denied access. A graduate's ability to authorize sharing also needs to be distinguished from the ability to retract a recipient's saved copy.

### 2.4.4 Evaluation Methods and Strength of Evidence

Ifeyemi et al. (2024) report evaluation by ten users. Such evidence can inform interface and acceptance discussions, but user ratings of security do not replace authorization or tamper-detection tests. By comparison, Fernández-Blanco et al. (2025) report an implementation study addressing hardware, consensus and energy-performance trade-offs. The accessible material supports that evaluation direction; it does not provide a directly comparable benchmark for the CUSL environment.

These approaches answer different questions. User tasks assess whether participants can operate a service; technical trials examine behavior under specified inputs and configurations. Neither alone establishes long-term institutional benefit. The CUSL evaluation should combine appropriate evidence while reporting participant counts, workloads, equipment, service dependencies and failed operations separately.

Table 2.1 summarizes the studies' contributions and the boundaries of the evidence used in this review. The table is not a ranking of systems or publication quality.

Table 2.1: Research approaches, evidence and relevance to the project

| Study | Approach and implementation | Evidence boundary | Relevance to CUSL |
| --- | --- | --- | --- |
| Turkanović et al. (2018) | Credit-platform proof of concept. | Original prototype evidence, not current endpoint testing. | Clarify academic representation and institutional participation. |
| Ifeyemi et al. (2024) | Certificate implementation and ten-user assessment. | User ratings do not establish independently audited security. | Separate usability findings from technical tests. |
| Fartitchou et al. (2024) | Contract architecture and testnet implementation. | Accessible preprint, not demonstrated national production adoption. | Examine issuer roles and transcript representation. |
| Fernández-Blanco et al. (2025) | Resource-aware implementation evaluation. | Partial article access; no numerical comparison adopted. | Record hardware and workload when measuring performance. |

Taken together, the studies support feasibility while leaving deployment-specific questions open. The literature justifies investigating requirements and measuring the selected implementation; it does not justify assuming that any blockchain application will reduce costs, eliminate fraud or fit the university's workflow without further evidence.

## 2.5 Review of Existing Systems

### 2.5.1 Blockcerts

Blockcerts provides open components for issuing and verifying blockchain-based credentials, serving issuers, recipients and verifiers (Blockcerts, n.d.-b). MIT's registrar documents an academic use in which recipients receive digital diplomas and verifiers use a URL or JSON file (Massachusetts Institute of Technology Registrar, n.d.). This is institutional deployment evidence rather than a controlled comparison of verification performance.

The documented model connects a recipient-held credential to integrity and issuer evidence. Its FAQ describes expiry and revocation checks and discusses separating high-level credentials from more detailed records for disclosure purposes (Blockcerts, n.d.-a). Consequently, the reviewed material already addresses recipient presentation and differentiated disclosure; these cannot be claimed as concerns first introduced by the CUSL project.

The main strength for this comparison is portability of credential evidence beyond a particular registry interface. The associated design constraint is that the credential format, issuer material and applicable status mechanism must remain interpretable by a compatible verifier. The selected documentation does not establish CUSL's approval sequence or an equivalent temporary-code PDF service. For this project, the lesson is to state precisely which evidence is portable and which checks depend on the backend.

### 2.5.2 OpenCerts

OpenCerts supports educational issuance and verification. Its v2 documentation describes an OpenAttestation-based implementation with issuer, issuance and revocation resources, and a transcript schema (OpenCerts, n.d.-b, n.d.-c). NTU supplies concrete institutional evidence for both digital certificates and transcripts within an OpenCerts document (Nanyang Technological University, n.d.). It therefore offers the closest comparison of credential types among the four systems.

The reviewed FAQ separates integrity, issuer identity and status checks. It also describes newer TrustVC issuance alongside legacy OpenAttestation acceptance (OpenCerts, n.d.-a). The version distinction is essential: v2 architecture should not be attributed without qualification to every current credential. Possession of the file supports sharing, while matching the named recipient to the presenter remains a separate verification responsibility.

Its strength is a documented connection between educational credential representation and usable verification. An important operational boundary is preservation of the verifiable digital object: a printed or converted display is not equivalent to checking the original credential file (Nanyang Technological University, n.d.). The available evidence does not establish an exact match to CUSL's officer approvals or sharing policy, nor does it provide an independent benchmark for the proposed backend. The project should explain those integration choices without claiming novelty for transcript coverage.

### 2.5.3 European Blockchain Services Infrastructure

EBSI provides shared credential infrastructure for institutional participants and service developers. Its hub documents identifiers, issuance, trust-chain participation and validation tools (EBSI, n.d.). EQAR's DEQAR documentation supplies an integration example through verifiable accreditation information, distinguishing EBSI-specific credentials from another DEQAR credential format (European Quality Assurance Register for Higher Education, n.d.). The reviewed evidence is an infrastructure and accreditation integration, not a complete university registry application.

Its workflow emphasizes the relationship between an issuer and the authority supporting that issuer. This is useful for academic trust: verifying an unchanged credential is different from determining whether its issuer is recognized for the purpose concerned. The reviewed sources establish this institutional layer but do not establish a specific confidential PDF-sharing or temporary-code workflow equivalent to the CUSL service.

The principal strength is the explicit treatment of trust across organizational boundaries. The corresponding integration requirement is coordination of identifiers, trusted roles and participating services; a local smart contract alone does not reproduce it. No comparative performance or cost conclusion is drawn from the developer portal. For CUSL, EBSI informs the future governance discussion, while the evaluated artifact remains the local prototype defined in Chapter One.

### 2.5.4 EduCTX

EduCTX addresses academic-credit representation for institutions, students and receiving organizations. The original study presents an Ark-based prototype with institutional participation, multisignature controls and student verification (Turkanović et al., 2018). Its evidence concerns that implementation, not independent confirmation of current service availability.

The main strength is a concrete credit-record model. Its design boundary is that academic-credit representation is not equivalent to confidential certificate-and-transcript PDF delivery. The selected manuscript does not establish the same expiry, sharing and document-status workflow proposed for CUSL. Those are comparison limits, not assertions that such extensions are impossible. The project draws on its institutional participation lesson without adopting its token model.

## 2.6 Comparative Analysis

Table 2.2 compares the four systems using the categories required by the institutional handbook. Limitations include documented design boundaries and limits on applying the available evidence to this case. They are not unsupported declarations that a system lacks an undocumented feature.

Table 2.2: Comparison of existing credentialing systems

| Existing system | Key features | Strengths | Limitations | What the project addresses |
| --- | --- | --- | --- | --- |
| Blockcerts | Open credential components; issuer, integrity and status verification. | Recipient-held records and documented MIT use. | Selected deployment instructions do not establish CUSL workflow or sharing equivalence. | Explicit institutional approvals and scoped document access for the case. |
| OpenCerts | Educational credentials, transcript support and versioned verification resources. | Documented certificate-and-transcript issuance at NTU. | Version migration must be distinguished; no independent trial was performed here. | Case-specific approval and sharing integration, rather than transcript novelty. |
| EBSI | Credential infrastructure, identity and trust-chain services. | Institutional trust and accreditation integration. | Infrastructure integration differs from a ready-made registry workflow. | Local requirements and a clearly bounded prototype deployment. |
| EduCTX | Academic-credit representation and institutional network participation. | Implemented research model for course-level achievement. | Original credit-token prototype is not a confidential PDF service. | Issued document integrity and authorized sharing requirements. |

Sources for Table 2.2: Blockcerts (n.d.-a, n.d.-b), Massachusetts Institute of Technology Registrar (n.d.), OpenCerts (n.d.-a, n.d.-b, n.d.-c), Nanyang Technological University (n.d.), EBSI (n.d.), European Quality Assurance Register for Higher Education (n.d.) and Turkanović et al. (2018).

The comparison does not identify one universally superior system. It identifies different units of design: an open credential standard, an educational issuance and verification implementation, shared trust infrastructure and an academic-credit prototype. A meaningful selection must consider which responsibilities the university retains and which evidence the verifier receives.

Three distinctions are particularly relevant. First, academic detail may be represented as structured data, credits or a finalized document. Second, institutional trust can be established through different issuer and membership mechanisms. Third, recipient control can mean portable file possession or application-enforced access. These distinctions should be stated before comparing privacy or decentralization.

## 2.7 Synthesis and Project Opportunity

### 2.7.1 What Existing Work Establishes

The selected sources establish precedents for academic blockchain verification, transcript handling, course-credit representation and institutional trust arrangements. They also provide examples of implemented applications and published evaluations. The proposed project therefore cannot reasonably claim that transcript support or the use of blockchain with off-chain storage is, by itself, a new contribution.

An important design lesson is that verification needs several coordinated forms of evidence: an authorized issuer, an appropriate integrity reference, a current status and a clearly identified scope. Confidential document handling introduces additional requirements that should be evaluated independently of the ledger. The value of the proposed system will depend on how well these elements meet the case institution's requirements.

### 2.7.2 Opportunity in the CUSL Case

The supported opportunity is to investigate and evaluate the fit of an integrated credentialing workflow within CUSL. It concerns the coordination of institutional approvals, final certificate and transcript documents, blockchain commitments and student-authorized confidential access. The reviewed sources do not establish that this exact combination has been evaluated against CUSL's operational requirements. This is a bounded observation about the reviewed evidence, not proof that no other Sierra Leonean research exists.

The project's contribution is consequently framed as a contextual application and engineering evaluation. It will need to show which requirements arise from the institution, how the implementation addresses them and what the tests demonstrate. A combination of existing techniques is useful only when its integration and practical behavior are documented. It must not be presented as a new cryptographic protocol without the corresponding formal specification and analysis.

### 2.7.3 Implications for Requirements and Evaluation

Table 2.3 translates the synthesis into candidate requirements and evaluation directions. These are the project's analytical deductions and must be confirmed through the methodology in Chapter Three rather than attributed as stakeholder findings.

Table 2.3: Review implications for the proposed project

| Review implication | Candidate requirement | Evaluation direction |
| --- | --- | --- |
| Issuer authority differs from document matching. | Enforce an approved issuance and role model. | Test authorized actions, incomplete approvals and denied actions. |
| Status and document integrity answer different questions. | Expose applicable checks and credential status. | Test revocation, original files and modified files separately. |
| Storage location does not establish confidentiality. | Encrypt confidential documents and control retrieval. | Test unauthorized access and document-association errors. |
| Sharing control differs from recipient ownership. | Define student permission scope and expiry. | Test valid, expired, cancelled and incorrectly scoped sharing. |
| Evidence depends on operating conditions. | Report infrastructure failures explicitly. | Record RPC and storage outages as unavailable outcomes. |
| A local prototype does not establish consortium operation. | Document the actual network and trust configuration. | Record deployment coordinates and state-recovery behavior. |

These implications preserve alignment with Chapter One's objectives. Institutional investigation will establish the process and priorities; requirements analysis will convert supported needs into acceptance criteria; implementation will make the chosen design inspectable; and evaluation will test it under declared conditions. No benefit to CUSL is claimed as measured at this stage.

## 2.8 Chapter Summary

This chapter has reviewed the technical foundations, research implementations and four existing credentialing systems relevant to the proposed project. The reviewed implementations support feasibility within their reported conditions while showing that credential integrity, institutional authority, confidentiality and availability remain separate design responsibilities. Transcript and academic-detail support already exist in related work, so the project opportunity lies in the demonstrated fit and evaluation of the CUSL workflow.

Chapter Three will explain how institutional requirements are established and how the prototype is developed and evaluated. Its methodology should preserve the evidence distinctions used here, including the separation of public status checks from confidential document verification and of local prototype behavior from wider deployment claims.

## References Cited in Chapter Two

Blockcerts. (n.d.-a). FAQ. https://www.blockcerts.org/guide/faq.html

Blockcerts. (n.d.-b). Introduction. https://www.blockcerts.org/guide/

EBSI. (n.d.). EBSI hub. https://hub.ebsi.eu/

European Quality Assurance Register for Higher Education. (n.d.). European Blockchain Service Infrastructure (EBSI). DEQAR Documentation. https://docs.deqar.eu/stable/ebsi/

Fartitchou, M., Lamaakal, I., El Makkaoui, K., El Allali, Z., & Maleh, Y. (2024). BlockMEDC: Blockchain smart contracts for securing Moroccan higher education digital certificates [Preprint]. arXiv. https://arxiv.org/abs/2410.07258

Fernández-Blanco, G., Froiz-Míguez, I., Fraga-Lamas, P., & Fernández-Caramés, T. M. (2025). Design, implementation and practical energy-efficiency evaluation of a blockchain based academic credential verification system for low-power nodes. Applied Sciences, 15(12), 6596. https://doi.org/10.3390/app15126596

Ifeyemi, T., Oyedeji, A., & Adebiyi, F. (2024). A blockchain-based digital educational certificate verification system. Journal of Engineering and Technology for Industrial Applications, 10(49), 35–41. https://doi.org/10.5935/jetia.v10i49.1145

IPFS. (n.d.). Privacy and encryption. IPFS Docs. https://docs.ipfs.tech/concepts/privacy-and-encryption/

Massachusetts Institute of Technology Registrar. (n.d.). Digital diploma verification. https://registrar.mit.edu/transcripts-records/diplomas/digital-diplomas/digital-diploma-verification

Nanyang Technological University. (n.d.). OpenCerts digital certificates and transcripts. https://www.ntu.edu.sg/education/academic-services/opencerts-digital-certificates-and-transcripts

OpenCerts. (n.d.-a). Frequently asked questions. https://dev.opencerts.io/faq/

OpenCerts. (n.d.-b). Getting started (v2). https://docs.opencerts.io/docs/v2/

OpenCerts. (n.d.-c). OpenCerts transcripts (v2). https://docs.opencerts.io/docs/v2/transcripts

Turkanović, M., Hölbl, M., Košič, K., Heričko, M., & Kamišalić, A. (2018). EduCTX: A blockchain-based higher education credit platform. IEEE Access, 6, 5112–5127. https://doi.org/10.1109/ACCESS.2018.2789929

World Wide Web Consortium. (2025, May 15). Verifiable credentials data model v2.0. https://www.w3.org/TR/2025/REC-vc-data-model-2.0-20250515/

Yaga, D., Mell, P., Roby, N., & Scarfone, K. (2018). Blockchain technology overview (NISTIR 8202). National Institute of Standards and Technology. https://doi.org/10.6028/NIST.IR.8202
