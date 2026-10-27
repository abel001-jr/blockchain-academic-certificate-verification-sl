# Chapter Three requirements and traceability register

Baseline: 24 October 2026. Candidate requirements for the scoped prototype, not a stakeholder sign-off or a completed test report.

## Source and priority keys

C1 means the revised Chapter One objectives and scope. C2 means the analytical implications in Chapter Two, especially its requirements mapping. P1 means project architecture documented in back/cred/verification/VERIFICATION_FLOW.md and inspected implementation context. P2 means the persistent local environment described in chain/PERSISTENT_LOCAL_CHAIN.md. These are scope, literature-derived or technical sources; none is a substitute for a confirmed interview finding or institutional policy.

All listed requirements are proposed Must items for the current baseline. The designation records project priority, not formal university approval. Case consultation may revise them; record the decision, reason and effect before changing the baseline. Institutional role permissions, approval sequence, disclosure policy and sharing rules remain to be confirmed.

## Requirement-to-source and test mapping

The complete behavior and acceptance check appear in Chapter Three Tables 3.3 and 3.4. Test IDs below identify planned checks only. Actual inputs, results, logs and retests belong in the later testing record and Chapter Five.

| Requirement | Origin | Objective link | Priority | Planned test |
| --- | --- | --- | --- | --- |
| FR01 Authentication | C1, C2 | O2, O3, O4 | Must | T01 |
| FR02 Role authorization | C1, C2 | O2, O3, O4 | Must | T02 |
| FR03 Input validation | C1 | O2, O3, O4 | Must | T03 |
| FR04 Approval before issuance | C1, C2 | O1, O2, O3, O4 | Must | T04 |
| FR05 Final-content commitments | C1, C2, P1 | O2, O3, O4 | Must | T05 |
| FR06 Encrypted payload storage | C1, C2, P1 | O2, O3, O4 | Must | T06 |
| FR07 Scoped public lookup | C1, C2, P1 | O2, O3, O4 | Must | T07 |
| FR08 Graduate-record association | C1, C2 | O2, O3, O4 | Must | T08 |
| FR09 Scoped sharing authorization | C1, C2 | O2, O3, O4 | Must | T09 |
| FR10 Expired/cancelled sharing denial | C1, C2 | O2, O3, O4 | Must | T10 |
| FR11 Document-content comparison | C1, C2, P1 | O2, O3, O4 | Must | T11 |
| FR12 Authorized readable retrieval | C1, C2, P1 | O2, O3, O4 | Must | T12 |
| FR13 Authorized credential revocation | C1, C2 | O2, O3, O4 | Must | T13 |
| FR14 Current revocation result | C1, C2, P1 | O2, O3, O4 | Must | T14 |
| FR15 Distinct verification outcomes | C1, C2, P1 | O2, O3, O4 | Must | T15 |
| FR16 Protected action traceability | C1, C2 | O2, O3, O4 | Must | T16 |
| NFR01 Negative access cases | C1, C2 | O2, O4 | Must | T17 |
| NFR02 Defined integrity dataset | C1, C2 | O2, O4 | Must | T18 |
| NFR03 Local response-time goal | C1, C2; provisional project threshold | O2, O4 | Must | T19 |
| NFR04 Role-specific task completion | C1, C2; provisional project threshold | O2, O4 | Must | T20 |
| NFR05 Dependency failure response | C1, C2, P1 | O2, O4 | Must | T21 |
| NFR06 Reproducible environment | C1, P2 | O2, O3, O4 | Must | T22 |
| NFR07 State persistence/loss handling | C1, C2, P1, P2 | O2, O4 | Must | T23 |

O1 also produces the process account and requirements evidence used to validate this register. Its achievement is not reduced to software tests: process-review records and supported constraints are the relevant evidence.

## Decisions required before final evaluation

1. Confirm the roles permitted to prepare, approve, issue and revoke records.
2. Confirm mandatory fields, credential types and approval order.
3. Define public metadata and the legitimate confidential access routes.
4. Confirm share validity, cancellation and the treatment of downloaded copies.
5. Freeze a synthetic file set and the adverse-case conditions before execution.
6. Accept or revise the provisional five-second/30-request timing design and 80% unassisted task criterion. These values are neither literature benchmarks nor supervisor requirements.
7. Define hardware, cache, network, participant tasks and assistance protocol.
8. Record actual evidence, unresolved requirements, failures and retests against the final baseline.

The current chapter does not prove that all these requirements are implemented. Technical inspection and actual execution are needed to establish that claim.
