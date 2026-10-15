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

## Delivery pack manifest and version control

Create this private manifest before handover. It proves that the reviewed pack and the delivered pack are the same version, and prevents a draft, omitted attachment or corrected-but-unreviewed file from being treated as the client deliverable.

| Field | Required record |
| --- | --- |
| Private client/project reference | Same non-identifying reference used across intake, QA and handover |
| Scope version | Exact approved scope version and approval evidence reference |
| Pack version | Immutable delivery version; increment for every correction |
| Manifest created at (UTC) | Timestamp and responsible delivery owner |
| Findings page | Private file reference, version and checksum |
| Ownership map | Private file reference, version and checksum |
| Enquiry tracker | Private file reference, version and checksum |
| Three-fix action plan | Private file reference, version and checksum |
| Evidence appendix | Private index reference and checksum; no raw personal data |
| QA record | Private 12-test record reference and reviewer/date |
| Data-handling record | Private transfer, access, retention and deletion reference |
| Handover record | Approved route, intended recipient role and release decision |
| Superseded versions | Prior pack versions and withdrawal status |
| Manifest reviewer | Independent reviewer role, UTC date and outcome |
| Release state | `HOLD` or `RELEASE` |

Fail closed:

- keep the manifest at `HOLD` until every required component has an immutable reference, version and checksum;
- the pack version, scope version and 12-test QA record must refer to the same delivery state;
- a missing, changed or additional component invalidates the release and requires a new manifest review;
- corrections create a new pack version; never overwrite or silently replace the version already delivered;
- mark superseded versions withdrawn and retain only the minimum private audit evidence required by the retention decision;
- do not release when the intended recipient, approved private route or independent reviewer is missing;
- manifest `RELEASE` proves only pack integrity and authorised handover readiness; it does not prove client acceptance, invoicing, cleared payment or commercial outcome.

### Synthetic manifest snapshot

This example is fictional and excluded from every client, delivery and revenue KPI.

| Field | Synthetic value |
| --- | --- |
| Private client/project reference | SYN-DIAG-001 |
| Scope version | v1 synthetic; approval incomplete |
| Pack version | v0.1 draft |
| Manifest created at (UTC) | Not created |
| Findings page | SYN-FINDINGS-001; checksum not recorded |
| Ownership map | SYN-MAP-001; checksum not recorded |
| Enquiry tracker | SYN-TRACKER-001; checksum not recorded |
| Three-fix action plan | Included in synthetic findings; checksum not recorded |
| Evidence appendix | SYN-EVIDENCE-001; checksum not recorded |
| QA record | 12 tests NOT RUN |
| Data-handling record | SYN-DATA-HANDLING-001 |
| Handover record | Not approved |
| Superseded versions | None |
| Manifest reviewer | Not reviewed |
| Release state | HOLD |

The synthetic manifest stays at `HOLD`: approval, checksums, QA release, handover route and independent review are incomplete. It is not evidence that a real pack was delivered.

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


## Two-working-day delivery clock and exception control

Create this private record once the intake state is `READY`. The clock starts only when written scope approval, a confirmed delivery slot and the complete approved source set are all evidenced. Record timestamps in UTC and retain the original baseline when anything changes.

| Field | Required record |
| --- | --- |
| Private client/project reference | Same non-identifying reference used across intake, QA and handover |
| Clock start eligibility | `READY` intake reference, complete-source receipt reference and confirmed Newton owner |
| Clock started at (UTC) | Actual start timestamp; blank until all eligibility evidence exists |
| Working-day calendar | Agreed working days, timezone and excluded dates |
| Day 1 control checkpoint | Due timestamp, completion timestamp, owner and evidence for anonymisation, reconciliation and initial ownership map |
| Day 2 QA checkpoint | Due timestamp, completion timestamp, owner and evidence for findings, tracker, three fixes and 12-test QA |
| Client response dependency | Client-owned decision or missing source, requested by timestamp and response deadline |
| Clock state | `NOT STARTED`, `RUNNING`, `PAUSED — CLIENT DEPENDENCY`, `HOLD — NEWTON EXCEPTION`, `COMPLETE` |
| Exception | Specific event, accountable owner, impact, opened timestamp, next action and review deadline |
| Revised target | Written timestamp plus client approval reference; blank unless an approved change exists |
| Release state | `HOLD` until QA release and private handover evidence are complete |

Fail closed:

- do not backdate the clock or start it from a sales call, payment promise, partial data receipt or synthetic example;
- a client dependency pauses the clock only when the request, owner and deadline are evidenced; otherwise retain the original target and record a risk;
- a Newton capacity, quality or privacy exception never silently pauses the clock—set `HOLD — NEWTON EXCEPTION` and escalate to the named owner;
- scope additions create a versioned change decision and separate price/capacity review; never overwrite the original target;
- missed checkpoints require an exception, recovery action and owner-approved client communication draft before work continues;
- `COMPLETE` means the 12-test QA gate passed and handover evidence exists; it does not prove client acceptance, invoicing or cleared payment.

### Synthetic clock snapshot

This example is fictional and excluded from all client, delivery and revenue KPIs.

| Field | Synthetic value |
| --- | --- |
| Private client/project reference | SYN-DIAG-001 |
| Clock start eligibility | HOLD — VAT, payment terms and written scope approval incomplete |
| Clock started at (UTC) | Blank |
| Working-day calendar | Europe/London; Monday–Friday excluding agreed holidays |
| Day 1 control checkpoint | Not scheduled |
| Day 2 QA checkpoint | Not scheduled |
| Client response dependency | None recorded |
| Clock state | NOT STARTED |
| Exception | Readiness conditions incomplete; synthetic Newton owner to review before any start |
| Revised target | Blank |
| Release state | HOLD |

The synthetic clock remains `NOT STARTED`; no delivery timing, acceptance or revenue may be inferred.

## Delivery effort and margin-control record

Create this private record for every accepted scope before work starts. It protects the fixed £195 offer from hidden effort, unapproved cost and unpaid scope expansion. Record actual time from evidence; do not estimate retrospectively to make the delivery appear profitable.

| Field | Required record |
| --- | --- |
| Private client/project reference | Same non-identifying reference used across intake, QA and handover |
| Final price and VAT treatment | Written GBP total, VAT basis and approval reference |
| Approved effort ceiling | Maximum delivery hours approved by the Newton owner before start |
| Approved external-cost ceiling | £0 unless a specific cost and owner approval are recorded |
| Planned hours by phase | Intake/anonymisation, analysis, findings, QA and handover |
| Actual hours by phase | Start/stop evidence or contemporaneous time record |
| External costs incurred | Supplier, purpose, GBP amount and approval evidence; otherwise £0 |
| Gross cash contribution | Cleared client cash minus evidenced external costs; never use contracted or invoiced value |
| Effective cleared hourly value | Gross cash contribution divided by actual delivery hours; blank until cash clears |
| Variance | Actual hours and costs versus approved ceilings |
| Scope-change evidence | Versioned client request, price/capacity decision and written approval |
| Stop-loss state | `CONTINUE`, `HOLD — SCOPE CHANGE`, `HOLD — COST` or `COMPLETE` |
| Review owner and UTC date | Human reviewer and decision timestamp |

Fail closed:

- do not start while the effort ceiling, £0 default cost ceiling, final price or VAT treatment is missing;
- do not absorb a new channel, more than 20 unique examples, implementation work or extra review cycle into the fixed fee—set `HOLD — SCOPE CHANGE`;
- no expense, paid tool or subcontractor cost is authorised by this record; separate owner approval is required before commitment;
- if actual effort or cost reaches 80% of its ceiling before the Day 2 QA checkpoint, review remaining work and record a decision before continuing;
- set `HOLD — COST` when a ceiling is exceeded or evidence is incomplete;
- do not calculate contribution from a proposal, contract or invoice; cleared cash must be independently evidenced;
- client acceptance, delivery completion and profitability are separate outcomes.

### Synthetic margin snapshot

This example is fictional and excluded from every buyer, delivery and revenue KPI.

| Field | Synthetic value |
| --- | --- |
| Private client/project reference | SYN-DIAG-001 |
| Final price and VAT treatment | £195 proposed; VAT treatment not approved |
| Approved effort ceiling | Not approved |
| Approved external-cost ceiling | £0 |
| Planned hours by phase | Not approved |
| Actual hours by phase | 0 |
| External costs incurred | £0 |
| Gross cash contribution | £0 |
| Effective cleared hourly value | Blank — no cleared cash |
| Variance | Not assessable |
| Scope-change evidence | None |
| Stop-loss state | HOLD — COST |
| Review owner and UTC date | Not reviewed |

The synthetic record remains on hold because price/VAT, effort and human review are incomplete. It is not evidence that the service is profitable.


## Private evidence index and source reconciliation record

Create this private index immediately after anonymisation. It makes every finding traceable without putting raw enquiry content into the delivery pack, and gives the completeness, duplicate-control and reconciliation tests one auditable source of truth.

| Field | Required record |
| --- | --- |
| Private client/project reference | Same non-identifying reference used across intake, tracker, QA and manifest |
| Source item reference | Immutable private source reference; never a name, email address, phone number or message excerpt |
| Anonymous evidence ID | Unique ID used by the tracker and findings, such as `EV-001` |
| Canonical enquiry ID | One `E-###` row, or blank only for an evidenced exclusion |
| Received at (UTC) | Source timestamp or `UNKNOWN` with an exception owner and review date |
| Scope decision | `IN SCOPE`, `DUPLICATE` or `EXCLUDED` |
| Duplicate of | Canonical enquiry ID; required only for `DUPLICATE` |
| Exclusion reason | Controlled reason and decision owner; required only for `EXCLUDED` |
| Integrity reference | Private checksum, export row ID or immutable system reference |
| Anonymisation check | `PASS`, `FAIL` or `NOT RUN`, plus reviewer and UTC date |
| Tracker cross-reference | Exact tracker row/version using the evidence |
| Finding cross-reference | Finding/fix IDs using the evidence, or `NONE` |
| Retention/deletion link | Private data-handling record and due date |
| Exception | Specific gap, accountable owner, next action and review deadline |

Record one reconciliation decision:

| Control | Pass condition | Initial state |
| --- | --- | --- |
| Source coverage | Every received source item appears exactly once in the evidence index | HOLD |
| Anonymous-ID uniqueness | Every evidence ID is unique and resolves to one source item | HOLD |
| Classification total | Source count = in-scope canonical items + duplicates + exclusions | HOLD |
| Duplicate integrity | Every duplicate resolves to one in-scope canonical enquiry | HOLD |
| Tracker traceability | Every non-excluded item resolves to the reviewed tracker version | HOLD |
| Finding traceability | Every reported finding and fix resolves only to indexed evidence | HOLD |
| Privacy review | Every indexed item has a passing anonymisation check | HOLD |

Fail closed:

- never copy raw messages, direct identifiers, credentials or attachment contents into this index;
- do not omit rejected, duplicate or out-of-scope source items—retain a minimal private audit reference and classification;
- a source item cannot be both canonical and duplicate, and a duplicate cannot point to another duplicate;
- a finding supported by an absent, excluded, failed-anonymisation or superseded item keeps the QA gate at `HOLD`;
- changed source data or tracker rows require a new index version, reconciliation and manifest checksum;
- the evidence index proves traceability only; it does not prove buyer consent, client acceptance, invoicing, payment or business outcome.

### Synthetic evidence-index snapshot

This example is fictional and excluded from every enquiry, buyer, delivery and revenue KPI.

| Source item reference | Anonymous evidence ID | Canonical enquiry ID | Scope decision | Duplicate of | Integrity reference | Anonymisation check | Tracker cross-reference | Finding cross-reference |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SYN-SRC-01 | EV-001 | E-001 | IN SCOPE |  | SYN-HASH-01 | PASS — synthetic reviewer, 2026-10-14T08:35:00Z | SYN-TRACKER-v0.1 row E-001 | F-03 |
| SYN-SRC-02 | EV-002 | E-002 | IN SCOPE |  | SYN-HASH-02 | PASS — synthetic reviewer, 2026-10-14T08:36:00Z | SYN-TRACKER-v0.1 row E-002 | F-01, F-02 |
| SYN-SRC-03 | EV-003 | E-003 | DUPLICATE | E-002 | SYN-HASH-03 | PASS — synthetic reviewer, 2026-10-14T08:37:00Z | SYN-TRACKER-v0.1 row E-003 | F-02 |

| Control | Synthetic outcome |
| --- | --- |
| Source coverage | PASS — 3 of 3 synthetic source items indexed |
| Anonymous-ID uniqueness | PASS — EV-001 to EV-003 unique |
| Classification total | PASS — 3 = 2 canonical + 1 duplicate + 0 exclusions |
| Duplicate integrity | PASS — E-003 resolves to canonical E-002 |
| Tracker traceability | PASS for synthetic tracker v0.1 only |
| Finding traceability | PASS for synthetic findings F-01 to F-03 only |
| Privacy review | PASS for synthetic rows only |
| Release state | HOLD — remaining QA tests, client acceptance and manifest review are not complete |

The synthetic reconciliation demonstrates the control but cannot release a real delivery or substantiate a commercial result.


## One-page operator release checklist

Use this private checklist as the front sheet for each delivery. It consolidates the detailed controls above; it does not replace them. Record only private or anonymous evidence references.

| Gate | Required state | Outcome (`PASS` / `HOLD` / `NOT RUN`) | Evidence reference | Owner and UTC date |
| --- | --- | --- | --- | --- |
| 1. Scope and commercial readiness | Intake record is `READY`; one channel, no more than 20 unique examples, capacity, final GBP price, VAT treatment and payment terms are approved | NOT RUN |  |  |
| 2. Private data readiness | Transfer route, controller decision, access list, retention deadline and anonymisation plan are approved | NOT RUN |  |  |
| 3. Source reconciliation | Every source item is indexed once; canonical, duplicate and excluded totals reconcile; privacy checks pass | NOT RUN |  |  |
| 4. Delivery control | Clock and working-day calendar are evidenced; margin state is `CONTINUE`; no overdue exception or unapproved cost exists | NOT RUN |  |  |
| 5. Pack integrity | Findings, ownership map, tracker, three fixes, evidence appendix and QA record share the approved scope and pack version | NOT RUN |  |  |
| 6. Objective QA | All 12 QA tests pass and every failed test has a closed correction/retest record | NOT RUN |  |  |
| 7. Authorised handover | Manifest is `RELEASE`; intended recipient, private route and independent reviewer are recorded | NOT RUN |  |  |
| 8. Post-handover commercial state | Client outcome, invoice state and cleared payment are recorded separately without inference | NOT RUN |  |  |

Release decision:

- set **delivery release** to `RELEASE` only when gates 1–7 are `PASS`, their evidence references resolve to the same scope and pack version, and no open exception exists;
- gate 8 does not block an authorised delivery, but it must remain factual: delivery, acceptance, invoicing and cleared payment are distinct;
- `NOT RUN`, missing evidence, version mismatch, overdue exception or unsupported `N/A` keeps delivery at `HOLD`;
- an `N/A` decision is permitted only with a written scope reason, owner and independent reviewer/date;
- never use a synthetic checklist as evidence of a buyer, completed delivery, invoice, payment or revenue.

### Synthetic operator snapshot

This fictional example demonstrates the fail-closed state and is excluded from every commercial KPI.

| Gate | Synthetic outcome | Reason |
| --- | --- | --- |
| 1. Scope and commercial readiness | HOLD | VAT, payment terms and written approval are incomplete |
| 2. Private data readiness | HOLD | Synthetic plan only; no real transfer authority |
| 3. Source reconciliation | PASS — synthetic only | Three fictional source items reconcile |
| 4. Delivery control | NOT RUN | Clock is not eligible to start |
| 5. Pack integrity | HOLD | Checksums and approved pack version are absent |
| 6. Objective QA | NOT RUN | 12-test record has not been executed |
| 7. Authorised handover | HOLD | No recipient, route or independent release |
| 8. Post-handover commercial state | NOT RUN | No delivery, acceptance, invoice or cleared payment |
| Delivery release | HOLD | Gates 1–7 are not all PASS |

The operator checklist is a control summary only. The detailed private records remain the source of truth.
