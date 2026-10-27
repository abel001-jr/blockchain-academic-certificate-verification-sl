# CHAPTER THREE
# METHODOLOGY, REQUIREMENTS AND SYSTEM ANALYSIS

## 3.1 Introduction

This chapter explains the approach to investigating credential management at Central University SL (CUSL), identifying system requirements and developing the proposed certificate and transcript verification prototype. It connects the four objectives in Chapter One with the design implications established in Chapter Two. The chapter addresses the development method, requirements gathering, functional and non-functional requirements, existing-system analysis and proposed system.

The methodology combines iterative prototyping with a case-based requirements investigation. Institutional evidence will establish the current process and user needs, while technical analysis will identify the controls required for the selected architecture. The requirements presented here form a proposed baseline for review and evaluation; they are not a report that every function has been implemented or accepted by stakeholders. Detailed design belongs in Chapter Four and actual evaluation results in Chapter Five.

## 3.2 Development Methodology

### 3.2.1 Method and Rationale

Iterative prototyping is selected to develop and refine the credential lifecycle in manageable stages. The project involves related but distinct responsibilities: institutional officers approve and issue records, graduates access and share credentials, and receiving parties verify information within an authorized scope. Developing these interactions incrementally allows requirements, interface behavior and exception handling to be reviewed before the complete workflow is evaluated.

Design Science Research Methodology provides the broader research framework. Peffers et al. (2007) identify problem identification, solution objectives, design and development, demonstration, evaluation and communication as activities connecting an information-system artifact to its research purpose. In this study, the framework connects institutional investigation to the artifact and its evaluation. Iterative prototyping specifies the development approach within that framework rather than being treated as an alternative name for it.

The selected method provides a structure for the work to be documented. Existing repository artifacts can support implementation history, but they do not establish that a particular interview, review or user-evaluation session took place. The reported development account will distinguish recorded work from planned review activities.

### 3.2.2 Development Stages and Outputs

Table 3.1 defines the development stages and their review outputs. Feedback can return a stage to an earlier activity when a requirement or implementation decision changes.

Table 3.1: Development stages and review outputs

| Stage | Main activity | Inspectable output |
| --- | --- | --- |
| Investigation | Examine actors, current procedures, controls and constraints. | Process account, evidence register and initial needs. |
| Requirements | Translate supported needs and technical constraints into assessable requirements. | Prioritized requirements and acceptance checks. |
| Prototype development | Develop approval, issuance, access and verification increments. | Working increments and recorded implementation decisions. |
| Demonstration | Exercise the integrated lifecycle using synthetic records. | Demonstration record and identified defects or requirement changes. |
| Evaluation and refinement | Assess behavior and user tasks against the baseline. | Test evidence, changes and retest records. |
| Communication | Explain the method, design, results and limits. | Dissertation, supporting records and operating instructions. |

### 3.2.3 Review, Change Control and Traceability

Each requirement will have a stable identifier, origin, priority, acceptance check and test reference. A change record will state the reason for an alteration and its effect on scope, design and evaluation. A literature-derived requirement will remain distinguishable from one confirmed through institutional consultation.

The evaluated artifact will be identified by its code revision and deployment configuration. This enables a later result to be traced to the actual implementation tested. Changes following a failed check will retain the original outcome and the subsequent retest rather than overwrite the evidence of the defect.

## 3.3 Requirements Gathering

### 3.3.1 Setting and Stakeholders

The case institution is CUSL. Requirements investigation will focus on personnel responsible for registry coordination, academic result preparation, institutional approval and verification, together with graduates and receiving users. These groups represent different parts of the lifecycle rather than necessarily separate offices or unique individuals.

Institutional participants will be eligible where they have direct responsibility for a relevant process. Graduate eligibility will be established from an authorized cohort record. A person holding more than one administrative role will be counted once in participant totals. The investigation will confirm the actual allocation of responsibility instead of assuming that the preliminary process account applies unchanged.

### 3.3.2 Recruitment and Participation

Administrative participants will be recruited purposively for operational knowledge. Initial role coverage will include registry, examination and verification responsibilities, with further consultation where an important approval or exception process remains unexplained. The depth and coverage of the accounts, together with access limitations, will be reported without assuming that a small group represents every employee.

A voluntary questionnaire will be offered to reachable members of the confirmed eligible graduate cohort, subject to institutional permission. Cohort-wide invitation with voluntary response is not probability sampling. The analysis will record eligible invitations, submissions, exclusions and valid responses as far as the available recruitment records permit. No population margin of error will be attached to self-selected responses.

Prototype evaluation will recruit participants for officer, graduate and verifier tasks. Requirements-survey respondents, interview participants and usability participants will be reported separately, with overlap identified where relevant. Counts and dates will reflect the records of actual activities rather than planning assumptions.

### 3.3.3 Techniques and Instruments

Semi-structured interviews will examine preparation of academic information, approvals, document release, archiving, verification requests, corrections and revocation. Questions will seek concrete examples and distinguish routine procedures from exceptions. Audio recording will require consent; approved written notes provide an alternative. The instrument will be reviewed for clarity before use.

Where access permits, process observation and review of redacted forms, approval instructions and request logs will complement interviews. Each process statement will identify whether it was observed, documented or reported. This distinction allows disagreements between accounts and records to remain visible instead of being concealed in a single narrative.

The graduate questionnaire will cover previous credential-access experiences, verification requests, device and connectivity constraints, privacy preferences and expectations for sharing. Not-applicable responses will be available for tasks a participant has not experienced. Questions about expectations will remain separate from usability questions administered after prototype use.

Table 3.2 links the planned techniques to their outputs. The table specifies the gathering design and does not assert that collection has been completed.

Table 3.2: Requirements-gathering sources and instruments

| Source or group | Technique | Intended output |
| --- | --- | --- |
| Registry and examination personnel | Interviews and permitted process review. | Responsibilities, approval steps, controls and exceptions. |
| Verification users | Interviews or structured task discussion. | Information needs and interpretation of verification outcomes. |
| Eligible graduates | Voluntary questionnaire. | Access constraints and sharing preferences. |
| Institutional records | Authorized redacted document review. | Corroboration of process steps and available baseline measures. |
| Chapter Two and project artifacts | Literature synthesis and technical inspection. | Candidate controls and implementation constraints, clearly labeled by origin. |

### 3.3.4 Collection, Analysis and Requirement Formation

Collection will begin with required access permission and participant information. Interview and process findings will inform questionnaire wording and initial requirements. Instruments may be piloted with appropriate volunteers to identify ambiguous wording; any pilot and resulting changes will be reported from their actual records.

Qualitative material will be analyzed through familiarization, coding, development and review of themes, and interpretation connected to the project questions. Braun and Clarke's account emphasizes recursive engagement with the data rather than mechanical application of fixed steps (Braun & Clarke, n.d.). Analytic notes will record how excerpts support a theme and how that theme informs a requirement. Reviewing process summaries with officers can clarify factual responsibilities without being treated as proof that interpretation is free of bias.

Questionnaire analysis will use frequencies, percentages and explicit denominators. Missing and not-applicable answers will be distinguished. Response distributions will be emphasized for ordinal items. Composite scores or internal-consistency estimates will be used only where the items and sample support that interpretation; no reliability coefficient will be reported without a calculation record.

Requirements will be entered in a register that links the originating observation, policy, literature implication or project constraint to the proposed behavior. Conflicts will be recorded and reviewed with the responsible stakeholders where access permits. A requirement will not be described as user-confirmed merely because the repository already contains a corresponding feature.

### 3.3.5 Ethics and Quality Controls

Administrative gatekeeper permission will be distinguished from any separate research ethics decision required by the institution. New participant collection and access to nonpublic records will follow the applicable approvals. Participants will receive information about purpose, activities, recording, voluntariness, data handling and withdrawal. Participation will not be linked to academic clearance or employment decisions.

Consent and recruitment records will be stored separately from analysis data. Unnecessary names, student numbers and identifying details will be excluded. Small staff groups can remain identifiable through job titles, so role labels will not be presented as guaranteed anonymity. Quotations and process descriptions will minimize unnecessary disclosure.

The collection protocol will establish authorized access, protected storage, retention and deletion arrangements before data is gathered. It will explain the withdrawal deadline and the limit on removing a response once it can no longer be identified after anonymization. Synthetic credentials will be used for technical testing unless a separately approved procedure authorizes real records.

Quality checks will include instrument review, documented coding, comparison of available sources and clear separation of evidence from assumptions. Case specificity, voluntary response, incomplete records and researcher interpretation will remain limitations of the findings. Records of approval, review or piloting will support any claim that these activities occurred.

### 3.3.6 Prototype Evaluation Methods

Technical evaluation will exercise normal and adverse conditions using synthetic credentials. Each test will identify its requirement, preconditions, input, expected outcome and evidence location. User evaluation will use officer issuance, graduate access/sharing and verifier tasks. Completion, elapsed time, errors and assistance will be recorded separately rather than merged into a general satisfaction claim.

The System Usability Scale (SUS) will supplement task observations after participants use the prototype. Brooke (1996) specifies ten items scored by subtracting one from odd-item responses and subtracting even-item responses from five, then multiplying the sum by 2.5. The resulting 0–100 score is a composite usability measure, not a percentage of tasks completed. Complete responses will be used for composite scoring; incomplete forms and their exclusion will be reported. No universal pass mark is assumed.

Performance evaluation will distinguish public lookup, authorized retrieval, storage operations and transaction confirmation. It will record the environment, file sizes, request count, concurrency, cache condition and failures. Median and upper-percentile latency will be reported for the defined workload. Results and corrections will appear in Chapter Five; this chapter establishes the methods and acceptance basis.

## 3.4 Functional Requirements

The proposed baseline below follows Chapter One's scope and Chapter Two's design implications. Each listed requirement is a Must for the scoped prototype, subject to documented review of business rules. Their origin is the project scope or a literature/technical implication; institutional confirmation remains part of requirements gathering. The supporting register records sources, priorities and test references. The requirements describe intended behavior rather than established implementation results.

Table 3.3: Functional requirements and acceptance checks

| ID | System requirement | Acceptance check / planned test |
| --- | --- | --- |
| FR01 | The system shall authenticate a user before granting a protected institutional action. | Invalid or absent authentication denies the action: T01. |
| FR02 | The system shall enforce the role permission assigned to each protected action. | A wrong-role request changes no protected state: T02. |
| FR03 | The system shall validate required credential fields before accepting the record for review. | Missing mandatory input produces a validation response: T03. |
| FR04 | The system shall require the configured approvals before final issuance. | An incomplete approval sequence blocks issuance: T04. |
| FR05 | The system shall associate an issued record with the applicable final-document and metadata commitments. | A synthetic issued record resolves to the intended commitments: T05. |
| FR06 | The system shall store confidential document payloads in encrypted form. | Storage inspection does not expose the original readable PDF: T06. |
| FR07 | The system shall provide public lookup within the defined permitted-metadata scope. | Public results omit confidential documents and identify unchecked PDF content: T07. |
| FR08 | The system shall restrict graduate access to the records associated with that authorized identity. | Another student's record cannot be retrieved through the graduate route: T08. |
| FR09 | The system shall allow a graduate to authorize sharing within a defined record scope and validity period. | Correctly scoped valid authorization permits the allowed access: T09. |
| FR10 | The system shall deny confidential access through expired or cancelled sharing authorization. | Expired and cancelled authorizations return no readable document: T10. |
| FR11 | The system shall compare applicable document content with the trusted reference commitment. | Original bytes match; deliberate changes produce a mismatch: T11. |
| FR12 | The system shall require authorization before releasing readable confidential document content. | An unauthorized document request releases no readable payload: T12. |
| FR13 | The system shall allow an authorized institutional role to revoke a credential. | The permitted action changes status; the wrong role is denied: T13. |
| FR14 | The system shall reflect credential revocation in its verification result. | A revoked chain record is not reported valid from stale application data: T14. |
| FR15 | The system shall distinguish missing records, integrity mismatches and unavailable verification evidence. | Missing record, modified content and service outage produce distinct outcomes: T15. |
| FR16 | The system shall retain an access-controlled record of significant credential workflow actions. | Issuance and status changes are traceable without exposing keys or share codes: T16. |

Authorization to manage institutional records is separate from a graduate's permission to share documents. A sharing cancellation does not revoke the academic award. Public lookup, authorized document retrieval and comparison of a supplied original are evaluated within their own scope. A transcript check is not counted as passed when no applicable transcript commitment exists.

## 3.5 Non-Functional Requirements

Quality requirements concern the conditions under which the functional workflow operates. Table 3.4 specifies assessable criteria for the local prototype. Proposed numerical performance and usability thresholds are project planning values, not supervisor standards or achieved results. They must be reviewed and frozen in the evaluation plan before final trials; any later change will retain its rationale and the original result.

Table 3.4: Non-functional requirements and measurement conditions

| ID | Quality requirement | Measurement and acceptance basis |
| --- | --- | --- |
| NFR01 | Protected access shall remain denied under the defined negative-test cases. | No readable PDF or protected state change in wrong-user, wrong-role and invalid-sharing cases; record tested cases and residual risks: T17. |
| NFR02 | Integrity checks shall correctly classify the defined original and modified file set. | Every unchanged file matches and every intentionally byte-modified file mismatches in the declared dataset; report omissions and failures: T18. |
| NFR03 | Public lookup shall meet the declared local response-time objective. | Provisional target: at least 95% within five seconds across at least 30 sequential single-user requests; record hardware, cache state, connection, failures and p95: T19. |
| NFR04 | Core tasks shall be usable by participants in the assigned role. | Provisional target: at least 80% unassisted completion for each role-specific task; report actual numerator, denominator, errors and training: T20. |
| NFR05 | Dependency failures shall produce a safe and interpretable response. | Each injected RPC or storage outage produces an unavailable outcome without false validity or unauthorized release: T21. |
| NFR06 | The evaluated environment shall be reproducible from documented configuration. | Setup instructions recreate the recorded revision and a synthetic lifecycle without published secrets: T22. |
| NFR07 | Local state persistence and loss shall be handled explicitly. | Controlled restart retains the test record; missing chain state cannot yield validity solely from a database entry: T23. |

The provisional latency target provides a local evaluation goal, and the completion target provides a role-based task criterion. Neither is an adoption forecast or a benchmark copied from another system. The small sequential workload does not establish production scalability. Finite integrity and access tests also do not prove absence of all vulnerabilities or permanent service availability.

Acceptance records will preserve the distinction between an expected denial, an infrastructure outage and an implementation defect. Successful cases and failed cases will both be included. Production throughput, multi-institution availability and monetary transaction costs require a separate environment and operating assumptions outside this local evaluation.

## 3.6 Existing System Analysis

### 3.6.1 Preliminary Current Process

The current-process account is preliminary and follows the institutional description introduced in Chapter One. It links receipt of academic information or a request, checking of academic details, document preparation, authorized approval, release and archiving, and later verification correspondence. It is not yet a completed observational finding. Table 3.5 identifies the questions that institutional evidence must resolve.

Table 3.5: Preliminary current process and analysis questions

| Process stage | Preliminary account | Evidence needed |
| --- | --- | --- |
| Input and checking | Academic details or requests reach responsible personnel. | Actual source records, validation responsibilities and exception rules. |
| Preparation | Certificate or transcript content is prepared internally. | Preparation tools, data transfer and correction procedures. |
| Approval | Responsible officers authorize release. | Required roles, sequence, signatures and existing audit evidence. |
| Release and archiving | Approved documents are issued and retained. | Release controls, archive format and access arrangements. |
| Later verification | An institution or employer seeks confirmation. | Request channels, checks performed, response records and disclosure rules. |

### 3.6.2 Existing Controls and Responsibilities

The analysis will identify controls already present, including checks of academic information, authorization of signatories and access to archives where these are supported by evidence. Paper output or a centralized record store will not be treated as proof that the process is insecure. Existing software and manual controls may address some needs and should be preserved where appropriate.

Where accounts differ, the description will retain the distinction and seek clarification from the responsible process owner. This is particularly relevant when one office prepares results and another releases credentials. The final process analysis must explain that responsibility boundary rather than assign all authority to the Registry by assumption.

### 3.6.3 Problems, Risks and Constraints

The investigation will examine approval waiting time, repeated entry, record retrieval, dependence on particular personnel and the handling of verification requests. These are candidate issues, not findings that every difficulty occurs at CUSL. Documented incidents, participant reports and technical risks will be distinguished.

A receiving party may need award status, document integrity or both. The analysis will examine how the existing process answers each question and what information is disclosed. A QR link or identifier will be assessed by the checks it actually initiates, rather than its appearance on a credential.

### 3.6.4 Baseline and Interpretation Limits

Where request logs permit, elapsed turnaround, staff handling steps and repeat contacts will be recorded using consistent definitions. Calendar turnaround includes waiting; active handling concerns staff effort. If comparable records are unavailable, the evaluation will assess requirement attainment and user experience rather than calculate an unsupported percentage reduction in institutional workload or delay.

## 3.7 Proposed System

### 3.7.1 Actors and Responsibilities

Institutional administrators will manage protected access within the approved role model. Preparing and approving officers will handle credential content and release decisions within their assigned permissions. Graduates will access their associated issued records and grant permitted sharing. Verifiers will perform public checks and use valid authorization for confidential document access.

Application services will coordinate these interactions with the configured blockchain and storage services. Human roles and service responsibilities will remain explicit so that an automated check is not mistaken for an academic approval decision. Detailed interfaces and entity relationships will be presented in Chapter Four.

### 3.7.2 Intended Credential Lifecycle

The intended lifecycle begins with preparation and validation of academic information. Required officers approve the record before final issuance. The applicable final certificate and transcript content is associated with integrity commitments, and confidential documents are encrypted for off-chain storage. The approved record is linked to the blockchain references used by verification, after which graduate access becomes available according to the workflow state.

Issuance must distinguish preparation, pending actions and completed registration. A failed storage or blockchain operation must not be displayed as successful issuance. The implementation will need explicit retry and recovery behavior so that repeated actions do not create inconsistent records. Detailed transaction ordering and commitment fields will be explained from the actual design in Chapter Four.

### 3.7.3 Public and Confidential Verification

Tier 1 will expose credential status and permitted metadata through public lookup. Its result will state which checks were completed and which document checks were not performed. It will not treat the successful lookup of an identifier as confirmation that a PDF carrying that identifier is unchanged.

Tier 2 will require valid student sharing authorization or another explicitly approved access route. Applicable document retrieval will combine authorization, decryption and comparison with the trusted content reference. Expired permission, credential revocation, missing evidence, integrity mismatch and unavailable services will have distinct interpretations. An absent optional transcript reference will be not applicable, not a successful transcript match.

### 3.7.4 Relationship to Problems and Objectives

Table 3.6 maps the issues to investigate to the proposed response and requirement groups. The issue column identifies analytical needs rather than claiming completed institutional findings. The corresponding source register will distinguish confirmed needs from candidate design implications.

Table 3.6: Problem, objective and proposed-response mapping

| Need or issue to assess | Objective | Proposed response and requirements |
| --- | --- | --- |
| Traceability from academic approval to issued record. | O1, O2, O3 | Protected preparation and approval, final commitments and audit records: FR01–FR05, FR16. |
| Different information needs for public and confidential checks. | O1, O2, O3 | Scoped lookup and authorized sharing: FR07–FR10, FR12. |
| Detection of changes and interpretation of credential status. | O2, O3, O4 | Document comparison and revocation behavior: FR11, FR13–FR15, NFR02. |
| Confidentiality and association of documents with the correct graduate. | O2, O3, O4 | Encryption and controlled retrieval: FR06, FR08, FR12, NFR01. |
| Practical operation under local infrastructure constraints. | O1, O2, O4 | Defined timing, usability, outage and recovery checks: NFR03–NFR07. |

### 3.7.5 Trust and Deployment Boundaries

The documented project environment uses a local blockchain for development and evaluation. A consortium operated by independent institutions remains a possible future deployment model rather than an established result. Its adoption would require separate membership, governance and operating arrangements.

The application mediates confidential access and decryption, so the prototype retains trust in backend authorization, key custody and the configured RPC and contract. Off-chain encryption does not make all public metadata private. Access expiry restricts later retrieval through the service and cannot erase a recipient's saved copy. Integrity commitments detect disagreement with a reference but cannot establish that the university's original academic assessment was correct.

Key backup, rotation, recovery and metadata disclosure will be documented as implemented controls or remaining operational requirements, according to their evidence. Chapter Four will describe the actual design, and Chapter Five will report the behavior observed under tests. This preserves the distinction between the proposed system and demonstrated assurance.

## 3.8 Chapter Summary

This chapter establishes an iterative development method and a case-based process for gathering, analyzing and tracing requirements. It states the functional and quality baseline, identifies the preliminary current-process model and explains how the proposed system responds to the project's objectives. Research activities are distinguished from completed findings, and provisional acceptance targets are distinguished from measured results.

Chapter Four will present the architecture and implementation of the confirmed requirements. Chapter Five will provide the technical and user-evaluation evidence, including failures, corrections and remaining limitations, for the configuration and participants actually studied.

## References Cited in Chapter Three

Braun, V., & Clarke, V. (n.d.). Doing reflexive TA. Thematic Analysis. https://www.thematicanalysis.net/doing-reflexive-ta/

Brooke, J. (1996). SUS: A quick and dirty usability scale. In P. W. Jordan, B. Thomas, B. A. Weerdmeester, & I. L. McClelland (Eds.), Usability evaluation in industry (pp. 189–194). Taylor & Francis. Accessible chapter: https://digital.ahrq.gov/sites/default/files/docs/survey/systemusabilityscale%2528sus%2529_comp%255B1%255D.pdf

Peffers, K., Tuunanen, T., Rothenberger, M. A., & Chatterjee, S. (2007). A design science research methodology for information systems research. Journal of Management Information Systems, 24(3), 45–77. https://doi.org/10.2753/MIS0742-1222240302
