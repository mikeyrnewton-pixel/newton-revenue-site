# £195 Enquiry Ownership Diagnostic — Delivery SOP and QA Acceptance

Status: reusable delivery asset. This file contains synthetic examples only and is not evidence of a real client result.

## Preconditions

Do not start delivery until all are true:

- written scope identifies one agreed enquiry channel and no more than 20 examples;
- owner confirms delivery capacity, final GBP price, VAT treatment and payment terms;
- client confirms a lawful basis for sharing the minimum necessary data;
- examples are anonymised before analysis; no raw personal data is committed to this repository;
- any confidentiality, access or retention exception has a named owner and written decision.

Stop and escalate if any precondition is missing.

## Fixed deliverables

1. One-page findings summary.
2. Enquiry ownership map: who owns each stage from receipt to resolution.
3. Tracker containing owner, next action, deadline and exception for every in-scope enquiry.
4. Three prioritised fixes, each with impact, effort, owner and first implementation step.
5. Evidence appendix using anonymous IDs only.
6. Completed QA and client-acceptance record.

Out of scope unless separately agreed: CRM implementation, automated messaging, contact-data enrichment, legal advice, live integrations and performance guarantees.

## Two-working-day SOP

### Day 1 — control and classify

1. Create IDs `E-001` to `E-020`; remove names, emails, phone numbers, free-text identifiers and attachment metadata.
2. Record the source count and reject duplicates without deleting the audit reference.
3. Classify each enquiry by channel, received time, intent, status and failure/exception category.
4. Assign one accountable owner.
5. Set one next action and deadline for each unresolved item, or record a specific exception and escalation owner.
6. Draft the ownership map and reconcile totals.

### Day 2 — diagnose and hand over

1. Identify recurring delay, handoff and missing-owner patterns.
2. Rank three fixes by impact, effort and reversibility.
3. Complete the tracker and one-page findings summary.
4. Run every acceptance test below.
5. Human-review the pack for privacy, accuracy and unsupported claims.
6. Send only after owner approval; capture client acceptance or requested corrections.

## Tracker schema

| Field | Rule |
| --- | --- |
| Enquiry ID | Unique anonymous ID |
| Received at | ISO 8601 timestamp or `UNKNOWN` |
| Channel | Agreed in-scope channel |
| Intent/category | Controlled label |
| Status | `NEW`, `IN_PROGRESS`, `WAITING`, `RESOLVED`, `EXCEPTION` |
| Owner | One accountable role/person, or `UNASSIGNED` as a reported defect |
| Next action | Observable action; blank only when resolved |
| Deadline | ISO date/time; blank only when resolved or an exception explains why |
| Exception | Specific blocker, decision owner and review date |
| Evidence ref | Anonymous source reference |
| Duplicate of | Canonical Enquiry ID where applicable |
| QA note | Correction or reviewer note |

## Customer-ready findings page

Create this as the first page of the private delivery pack. Keep the language factual and trace every conclusion to anonymous evidence references. Do not include personal data, unsupported uplift estimates or internal QA notes.

### Delivery summary

| Field | Required content |
| --- | --- |
| Client / project | Private client or project reference |
| Agreed channel | Exactly one in-scope enquiry channel |
| Review window | Start and end timestamps |
| Source count | Total examples received before deduplication |
| Unique in-scope | Canonical enquiry rows analysed |
| Duplicates | Rows linked to a canonical Enquiry ID |
| Exclusions | Count and documented reason |
| Reconciliation | Source count = unique in-scope + duplicates + exclusions |
| Overall gate | `HOLD` until all 12 QA tests pass; otherwise `RELEASE` |

### Evidence-linked findings

| Finding | Evidence references | Operational consequence | Confidence / limitation |
| --- | --- | --- | --- |
|  |  |  |  |
|  |  |  |  |
|  |  |  |  |

Every evidence reference must resolve to an anonymous tracker row or private source index. A missing reference keeps the delivery gate at `HOLD`.

### Ownership map

| Stage | Accountable owner | Handoff trigger | Expected deadline | Exception path |
| --- | --- | --- | --- | --- |
| Receipt |  |  |  |  |
| Qualification |  |  |  |  |
| Response |  |  |  |  |
| Resolution |  |  |  |  |

### Three prioritised fixes

| Priority | Fix | Evidence references | Impact | Effort | Owner | First implementation step |
| --- | --- | --- | --- | --- | --- | --- |
| 1 |  |  |  |  |  |  |
| 2 |  |  |  |  |  |  |
| 3 |  |  |  |  |  |  |

Do not add a fourth fix. If fewer than three are evidence-supported, keep the gate at `HOLD` and record the gap rather than inventing one.

### Synthetic completed snapshot

This snapshot demonstrates the format only. It is fictional and excluded from every enquiry, buyer and revenue KPI.

| Field | Synthetic value |
| --- | --- |
| Agreed channel | Website form |
| Review window | 2026-10-14 09:15–09:24 BST |
| Source count | 3 |
| Unique in-scope | 2 |
| Duplicates | 1 |
| Exclusions | 0 |
| Reconciliation | 3 = 2 + 1 + 0 |
| Overall gate | HOLD — QA and client acceptance not complete |

| Finding | Evidence references | Operational consequence | Confidence / limitation |
| --- | --- | --- | --- |
| One service-fit enquiry is waiting on a capacity decision | SYN-02 | Response cannot be finalised until Operations confirms capacity | High for the synthetic rows only |
| A duplicate enquiry would inflate workload if treated as new demand | SYN-02, SYN-03 | Merge under the canonical row while retaining the audit trace | High for the synthetic rows only |
| The pricing enquiry has an owner and dated next action | SYN-01 | Sales can progress it without a handoff clarification | High for the synthetic rows only |

| Priority | Fix | Evidence references | Impact | Effort | Owner | First implementation step |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Add a same-day capacity decision checkpoint | SYN-02 | Prevents stalled service-fit responses | Low | Operations owner | Confirm the available delivery slot by the recorded deadline |
| 2 | Deduplicate before workload and conversion reporting | SYN-02, SYN-03 | Prevents double-counting and duplicate handling | Low | Sales owner | Link the duplicate to its canonical Enquiry ID |
| 3 | Preserve an owner and dated next action for every unresolved enquiry | SYN-01, SYN-02 | Makes follow-up responsibility visible | Low | Sales owner | Review the tracker at the start of each working day |

## Synthetic worked example

| Enquiry ID | Received at | Channel | Intent/category | Status | Owner | Next action | Deadline | Exception | Evidence ref | Duplicate of |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| E-001 | 2026-10-14T09:15:00+01:00 | Website form | Pricing question | IN_PROGRESS | Sales owner | Send approved scope options | 2026-10-15T12:00:00+01:00 |  | SYN-01 |  |
| E-002 | 2026-10-14T09:22:00+01:00 | Website form | Service fit | EXCEPTION | Operations owner | Confirm delivery capacity | 2026-10-15T10:00:00+01:00 | Capacity decision pending; review by Operations owner | SYN-02 |  |
| E-003 | 2026-10-14T09:24:00+01:00 | Website form | Service fit | WAITING | Sales owner | Merge with E-002 and retain audit trace | 2026-10-15T10:00:00+01:00 |  | SYN-03 | E-002 |

These rows are fictional and must never be counted as enquiries, buyers or revenue.

## Objective acceptance tests

The pack passes only when all tests pass.

| Test | Pass condition |
| --- | --- |
| Scope | Exactly one agreed channel and no more than 20 unique in-scope examples |
| Privacy | No direct personal identifiers or unnecessary free text in the delivery pack; the private data-handling record is complete and the deletion state is evidenced |
| Completeness | Every source example has an anonymous ID and evidence reference |
| Ownership | Every row has one owner or is explicitly reported as `UNASSIGNED` |
| Action control | Every unresolved row has a next action and deadline, or a complete exception |
| Status integrity | Every status uses the allowed values |
| Duplicate control | Each duplicate points to one canonical ID; totals are not double-counted |
| Reconciliation | Source count = unique rows + duplicate rows + documented exclusions |
| Fix quality | Exactly three fixes include impact, effort, owner and first step |
| Claims | No guaranteed revenue, conversion uplift or automation outcome is stated |
| Human review | Reviewer name/role, review date and corrections are recorded |
| Client acceptance | Written acceptance or specific correction request is stored outside this public repository |

Any failed test keeps the pack at `HOLD`.

## QA execution record

Create a private copy for each delivery. Start every outcome at `NOT RUN`. Use only anonymous or private evidence references; never paste client data into this public repository.

| Test | Outcome (`PASS` / `FAIL` / `NOT RUN`) | Evidence reference | Reviewer and UTC date |
| --- | --- | --- | --- |
| Scope | NOT RUN |  |  |
| Privacy | NOT RUN |  |  |
| Completeness | NOT RUN |  |  |
| Ownership | NOT RUN |  |  |
| Action control | NOT RUN |  |  |
| Status integrity | NOT RUN |  |  |
| Duplicate control | NOT RUN |  |  |
| Reconciliation | NOT RUN |  |  |
| Fix quality | NOT RUN |  |  |
| Claims | NOT RUN |  |  |
| Human review | NOT RUN |  |  |
| Client acceptance | NOT RUN |  |  |

Record one overall delivery gate:

| Gate | Rule | Initial state |
| --- | --- | --- |
| Delivery release | `RELEASE` only when all 12 outcomes are `PASS`, every row has an evidence reference, and reviewer/date fields are complete | HOLD |

A `FAIL` or `NOT RUN` outcome keeps the delivery at `HOLD`. Record the correction owner, due date and retest evidence beside the failed test before reassessment. Client acceptance must be written and stored privately; delivery completion never proves payment.

### Correction and retest log

Use this private log for every `FAIL` result. Do not overwrite the original outcome. Close a failure only after the correction is independently retested and the evidence reference is complete.

| Test | Failure / exception | Correction owner | Next action | Due (UTC) | Retest outcome (`PASS` / `FAIL` / `NOT RUN`) | Retest evidence reference | Closed by and UTC date |
| --- | --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  | NOT RUN |  |  |

The delivery gate remains `HOLD` while any failure lacks an owner, next action, due date, passing retest evidence or closure record.

## Private data-handling and deletion record

Create this record privately before opening any source material. Use roles rather than unnecessary names, do not paste credentials or personal data into it, and retain only the minimum evidence needed to prove control.

| Field | Required evidence |
| --- | --- |
| Client/project reference | Private non-identifying reference |
| Approved transfer method | Client-approved private route; never public repository or ordinary chat |
| Data controller / decision owner | Named client role responsible for lawful sharing and retention |
| Delivery access list | Minimum roles with access; additions require written approval |
| Source received (UTC) | Timestamp and source-item count before deduplication |
| Integrity reference | Private manifest, checksum or immutable source index |
| Anonymisation completed (UTC) | Reviewer, timestamp and anonymous-ID range |
| Raw-source working location | Approved private location only |
| Retention basis and deadline | Written purpose plus exact UTC deletion/review deadline |
| Deletion outcome | `NOT DUE`, `DELETED`, `CLIENT RETAINED` or `HOLD — EXCEPTION` |
| Deletion evidence | Private audit/event reference; never the raw data itself |
| Exception owner and review date | Required for any retention, access or deletion exception |

Fail closed:

- do not start analysis until transfer method, decision owner, access list and retention deadline are recorded;
- do not release the delivery while anonymisation or access evidence is incomplete;
- do not mark `DELETED` from intention alone—record a completed private deletion event or keep the state at `NOT DUE`;
- any overdue deletion, unexplained access or retention exception sets the delivery gate to `HOLD`;
- client acceptance and payment do not authorise indefinite retention.

### Synthetic data-handling snapshot

This example is fictional and must not be used as evidence for a real delivery.

| Field | Synthetic value |
| --- | --- |
| Client/project reference | SYN-DIAG-001 |
| Approved transfer method | Private client-provided folder |
| Data controller / decision owner | Client operations owner |
| Delivery access list | Delivery reviewer only |
| Source received (UTC) | 2026-10-14T08:15:00Z; 3 source items |
| Integrity reference | SYN-MANIFEST-001 |
| Anonymisation completed (UTC) | QA reviewer; 2026-10-14T08:30:00Z; E-001–E-003 |
| Raw-source working location | Synthetic private workspace |
| Retention basis and deadline | Delivery QA; delete/review by 2026-10-21T17:00:00Z |
| Deletion outcome | NOT DUE |
| Deletion evidence | Not applicable until completed |
| Exception owner and review date | None |

## Client handover and acceptance record

Create one private record for each delivery. Its purpose is to separate what was delivered, what the client accepted and what was actually paid. Start every outcome at `PENDING`; never pre-fill acceptance or payment.

| Field | Required record |
| --- | --- |
| Private client/project reference | Non-identifying reference used across scope, QA and payment records |
| Agreed scope version | Version plus client approval timestamp |
| Delivery version | Immutable delivery reference or private checksum |
| Delivered at (UTC) | Timestamp and approved private delivery route |
| Delivery contents | Findings page, ownership map, tracker, three fixes, evidence appendix and QA record |
| QA gate | `RELEASE` only after 12/12 tests pass; otherwise `HOLD` |
| Client response due | Written date/time agreed in the scope |
| Client outcome | `PENDING`, `ACCEPTED`, `CORRECTIONS REQUESTED` or `REJECTED` |
| Client evidence reference | Private email, portal or signed record reference |
| Correction owner / due | Required when corrections are requested |
| Final acceptance at (UTC) | Timestamp only when written acceptance exists |
| Retention/deletion due | Exact UTC deadline from the data-handling record |
| Payment state | `PROPOSED`, `AGREED`, `INVOICED` or `CLEARED` |
| Invoice/payment reference | Private invoice ID or actual bank/merchant reference |
| Cleared amount (GBP) | Zero unless settlement is independently evidenced |

Fail closed:

- delivery is not complete while the QA gate is `HOLD`;
- silence is not acceptance—keep the client outcome at `PENDING`;
- a correction request reopens the relevant QA tests and requires passing retest evidence;
- `ACCEPTED`, `INVOICED` and `CLEARED` are separate states and must never be inferred from one another;
- do not mark `CLEARED` from a promise, invoice, screenshot without settlement evidence or contingent fee;
- retention and deletion controls continue after acceptance or payment.

### Synthetic handover snapshot

This example is fictional and excluded from all buyer, delivery and revenue KPIs.

| Field | Synthetic value |
| --- | --- |
| Private client/project reference | SYN-DIAG-001 |
| Agreed scope version | v1; synthetic approval 2026-10-14T08:00:00Z |
| Delivery version | SYN-DELIVERY-001 |
| Delivered at (UTC) | Not delivered |
| Delivery contents | Draft synthetic pack only |
| QA gate | HOLD — client acceptance test NOT RUN |
| Client response due | Not agreed |
| Client outcome | PENDING |
| Client evidence reference | None |
| Correction owner / due | Not applicable |
| Final acceptance at (UTC) | Blank |
| Retention/deletion due | 2026-10-21T17:00:00Z |
| Payment state | PROPOSED |
| Invoice/payment reference | None |
| Cleared amount (GBP) | 0 |

Never infer delivery, acceptance, invoicing or payment from this synthetic record.

## Client intake and scope-lock record

Complete this private record before accepting source data or starting the two-working-day clock. It converts a sales conversation into an executable delivery brief and prevents unpaid scope drift. Use only the minimum necessary information; keep personal data and credentials out of this public repository.

| Field | Required decision or evidence |
| --- | --- |
| Private client/project reference | Non-identifying reference used across scope, QA, handover and payment records |
| Agreed enquiry channel | Exactly one channel |
| Review window | Exact start and end timestamps for the sample |
| Maximum source items | No more than 20 unique in-scope examples |
| Source format | Agreed export or private access method; no unapproved live-account access |
| Included enquiry types | Controlled list agreed in writing |
| Exclusions | Explicitly excluded channels, integrations, enrichment and implementation work |
| Client decision owner | Role authorised to approve scope and corrections |
| Delivery approver | Role authorised to accept the final pack |
| Transfer and privacy approval | Reference to the completed private data-handling record |
| Delivery capacity | Named Newton owner and confirmed two-working-day slot |
| Price and VAT | Final GBP total plus written VAT treatment |
| Payment terms | Agreed trigger, due date and verified payment route; no invoice or link issued without owner approval |
| Client response deadline | Written date/time for acceptance or correction requests |
| Change-control rule | Any new channel, extra examples or implementation work requires a separately approved scope |
| Readiness state | `READY`, `HOLD` or `DECLINED` |
| Scope approval evidence | Private email, portal or signed-record reference and UTC timestamp |

Readiness is `READY` only when every required field is complete, the source fits the fixed offer and both client and Newton decision owners have approved the same scope version. Otherwise keep the state at `HOLD`; do not accept data, start analysis, promise delivery or infer a sale.

Fail closed:

- more than one channel, more than 20 unique examples or requested implementation work requires a separately priced scope;
- missing VAT treatment, payment trigger, delivery capacity or approval evidence keeps the state at `HOLD`;
- a verified payment route does not authorise issuing an invoice or payment link;
- scope changes after approval create a new version; never overwrite the prior approved record;
- silence, a meeting or a verbal expression of interest is not written scope approval.

### Synthetic intake snapshot

This example is fictional and excluded from all buyer, delivery and revenue KPIs.

| Field | Synthetic value |
| --- | --- |
| Private client/project reference | SYN-DIAG-001 |
| Agreed enquiry channel | Website form |
| Review window | 2026-10-14T08:15:00Z to 2026-10-14T08:30:00Z |
| Maximum source items | 3 synthetic examples |
| Source format | Synthetic private CSV |
| Included enquiry types | Pricing question; service fit |
| Exclusions | CRM changes, automated messages, enrichment and live integrations |
| Client decision owner | Synthetic client operations owner |
| Delivery approver | Synthetic client operations owner |
| Transfer and privacy approval | SYN-DATA-HANDLING-001 |
| Delivery capacity | Synthetic Newton delivery owner; slot reserved |
| Price and VAT | £195 proposed; VAT treatment not approved |
| Payment terms | Not agreed; no payment route issued |
| Client response deadline | Not agreed |
| Change-control rule | New work requires a separately approved scope |
| Readiness state | HOLD |
| Scope approval evidence | None |

The synthetic record stays at `HOLD` because VAT treatment, payment terms, response deadline and written approval are missing.
