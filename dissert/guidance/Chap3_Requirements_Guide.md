# CHAPTER THREE REQUIREMENTS GUIDE
# METHODOLOGY, REQUIREMENTS AND SYSTEM ANALYSIS

Prepared 24 October 2026 | Companion to the supervisor's handbook

## 1. Authority and purpose

This guide makes the Chapter Three requirements explicit before the chapter is revised. It supplements the supplied Central University Final Year Project Requirements & Submission Guidelines 2026; it does not amend or replace the supervisor's original PDF. The handbook's Section 8, pages 6–7, is the source of the six required content areas below. The numbering and tables in this companion are a proposed writing structure for satisfying those areas, not additional instructions attributed to the supervisor.

Use this guide together with Chap3_Workflow.md. Do not revise the actual chapter until its structure and evidence status have been checked against these documents. Changes to the university's prescribed report structure remain subject to its own supervision process.

## 2. Explicit handbook requirements

Table G3.1: Requirements stated in the supplied handbook

| Handbook provision | Required content | Minimum evidence in the chapter |
| --- | --- | --- |
| 8.1 Development Methodology | Identify the development method, explain its stages and justify its suitability. | Named method, stages, outputs and project-specific rationale. |
| 8.2 Requirements Gathering | Explain how system requirements were identified. | Actual or clearly planned techniques, sources and the route from evidence to requirements. |
| 8.3 Functional Requirements | State what the system must do as clear actions. | Explicit requirements describing actors and system behavior. |
| 8.4 Non-Functional Requirements | State relevant quality attributes and constraints. | Security, usability, performance and other applicable requirements with assessable conditions. |
| 8.5 Existing System Analysis | Explain the current process and its problems, delays, risks or limitations. | Process steps, responsible actors, existing controls and supported deficiencies. |
| 8.6 Proposed System | Explain how the proposed system responds to the identified problems and objectives. | Actors, intended workflow and links between problems and proposed functions. |

The handbook does not prescribe a compulsory research theory, sampling formula, fixed participant count, ten-part research-method chapter or numerical performance target. Any such choice must be justified by the project and its evidence. Design Science may provide a research framework, but it does not remove the need to explain the software development method.

## 3. Required writing structure for the next revision

The next draft will use the following eight main sections. Sections 3.2–3.7 follow the six handbook areas in their stated order. Introduction and summary provide the chapter's opening and transition. Research-method details sit inside the relevant sections instead of displacing the required software analysis.

Table G3.2: Proposed chapter structure and completion criteria

| Section | Required contents | Complete when |
| --- | --- | --- |
| 3.1 Introduction | Chapter purpose, connection to objectives and outputs. | Describes methodology, requirements and analysis without claiming results. |
| 3.2 Development Methodology | 3.2.1 method and rationale; 3.2.2 stages and deliverables; 3.2.3 review and change control. | The actual development process is explained and supported; planned stages are identified. |
| 3.3 Requirements Gathering | 3.3.1 setting and stakeholders; 3.3.2 eligibility and recruitment; 3.3.3 techniques and instruments; 3.3.4 collection and analysis; 3.3.5 ethics and quality controls. | Every claimed activity has evidence, and findings can be traced into requirements. |
| 3.4 Functional Requirements | Scope, actors, prioritized numbered requirements and acceptance criteria. | Every requirement states a testable behavior and has a source and later test link. |
| 3.5 Non-Functional Requirements | Applicable quality attributes, measurement conditions and acceptance targets. | Qualities are assessable; unagreed targets are explicitly provisional. |
| 3.6 Existing System Analysis | 3.6.1 current process; 3.6.2 existing controls; 3.6.3 evidenced problems and constraints; 3.6.4 baseline limitations. | Distinguishes observed, documented and reported practice from assumptions. |
| 3.7 Proposed System | 3.7.1 actors and responsibilities; 3.7.2 intended lifecycle; 3.7.3 verification scopes; 3.7.4 problem-to-function mapping; 3.7.5 trust and deployment boundaries. | Explains the response to the problem without presenting detailed implementation or results. |
| 3.8 Chapter Summary | Main methodological and analytical outputs; transition to Chapter Four. | Leads to design and implementation and does not introduce new claims. |

## 4. Requirement-writing rules

Each functional requirement must have an ID, actor, action, precondition where relevant, expected outcome, source, priority and acceptance check. Use one principal behavior per requirement. A suitable form is: 'The system shall deny confidential document retrieval when the supplied sharing authorization is expired.' The acceptance check must state the input condition and observable outcome, including whether protected data or state can change.

Each non-functional requirement must identify the quality, metric, operating conditions, acceptance threshold and verification method. For example, a response-time target needs a defined operation, request count, workload, environment and percentile. Do not adopt the existing draft's five-second or 80% task-completion targets as supervisor requirements. Retain, revise or remove them after a project-specific rationale is recorded.

Candidate priorities are Must, Should and Could. These are planning labels proposed by this guide, not handbook terminology. A source may be stakeholder evidence, institutional policy, a Chapter Two design implication or a project constraint. Identify which it is; literature-derived candidates are not automatically validated stakeholder needs.

Table G3.3: Required traceability record

| Objective | Evidence/source | Problem or need | Requirement ID | Proposed response | Acceptance/test reference |
| --- | --- | --- | --- | --- | --- |
| O1–O4 as applicable | Specific record or source identifier. | Supported statement, not a presumed benefit. | FR or NFR identifier. | Intended function or quality control. | Planned test ID; actual results reported later. |

## 5. Content boundaries

Chapter Three explains the method, source of requirements, current process and proposed response. Brief evaluation methods belong here where they establish how acceptance will be assessed. Detailed architecture, database/schema design, contract interfaces, technology versions and implementation screenshots belong in Chapter Four. Completed test cases, performance results, usability scores and corrections belong in Chapter Five. Overall achievement of objectives and recommendations belong in Chapter Six.

The distinction is by purpose, not a ban on cross-reference. A short workflow model may support system analysis here, while detailed interaction diagrams explain design later. Interview instruments, consent materials and extensive evidence records should be referenced as appendices rather than copied into every subsection.

## 6. Evidence and consistency requirements

Preserve the current Chapter One objectives and web-prototype scope and use Chapter Two's findings as candidate design inputs. Keep public status lookup separate from confidential PDF verification. Treat encryption, application access and blockchain commitments as different controls. Distinguish credential revocation from cancellation of sharing permission.

Confirm institutional workflow descriptions, cohort totals, staff eligibility, participant counts, approvals, data collection and findings before writing them as completed facts. The older draft's 350 graduates, 187 target, 205 responses, 24 usability participants, 15-person pilot and 100 integrity trials are unverified claims requiring records, not accepted inputs.

Use completed tense for evidenced activities, planned tense for future procedures and conditional language for unevaluated deployment options. Do not retroactively invent an iteration history or assume that development already present in the repository proves consultation occurred. Describe voluntary graduate recruitment accurately; a numerical sample target does not establish probability sampling.

The documented local blockchain is not evidence of a deployed multi-institution consortium. Any discussion of consortium operation must identify it as future architecture unless governance, independent participants and deployment records establish otherwise.

## 7. Formatting and acceptance

Apply handbook Section 18, page 13: A4, Times New Roman, 12-point body text, 1.5 spacing, justified paragraphs, normal margins, clear numbered 14-point headings and page numbers. Caption and reference each table and figure. Generate Word heading styles and retain editable Markdown. The full report is ultimately submitted as PDF; the handbook's report-wide page range is not a separate Chapter Three quota.

Before the next chapter revision is accepted, verify that all six handbook content areas are present, each requirement is assessable, evidence status is explicit, traceability is complete, chapter boundaries are respected and citations have full reference entries. Word-package checks must be followed by visual pagination and table review. Unresolved evidence should be recorded separately rather than concealed or replaced with invented facts.
