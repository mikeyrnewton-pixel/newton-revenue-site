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
| Privacy | No direct personal identifiers or unnecessary free text in the delivery pack |
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

## Handover record

Record privately:

- scope version and approval timestamp;
- delivery version and delivery timestamp;
- reviewer and QA result;
- client acceptance/corrections;
- retention/deletion date for source material;
- payment state separately as proposed, agreed, invoiced and actually cleared.

Never infer payment from delivery or acceptance.
