# Enquiry form failure, retry and rollback acceptance

Status: **PREPARED — REVIEW ONLY**  
Applies to: PR43 only  
Data rule: fictional inputs only; never use a real name, email, company or enquiry in acceptance testing.

This is the release acceptance sheet for the Newton Revenue enquiry form. It does not authorise merge, production deployment, customer contact, data collection or a claim that an enquiry was received.

## Customer-safe failure contract

| Scenario | Storage state | Required customer response | Required behaviour | Pass condition |
| --- | --- | --- | --- | --- |
| Connection fails before storage | Not stored | “We couldn't confirm your enquiry was received. Please try again or email us directly.” | Re-enable submit; identical retry keeps the same submission ID | No success claim and no duplicate |
| Response is lost after storage | Stored, browser uncertain | Same unconfirmed message | Identical retry keeps the same submission ID | Existing receipt is returned; exactly one lead exists |
| User edits after an ambiguous result | Original may be stored | No success until the edited enquiry is stored | Any payload, consent, source or channel edit gets a fresh submission ID | Original and edited enquiry cannot share a receipt |
| Submission ID belongs to different content | Original stored | “This submission ID already belongs to a different enquiry. Refresh and submit again.” | Return 409 and never overwrite or acknowledge the edit | No new write and no received flag |
| Receipt exists but original lead cannot be validated | Unknown/damaged | “Could not validate the previous enquiry. Please email us.” | Return 503 and fail closed | No received flag |
| Duplicate-check storage is unavailable | Unknown | “Could not validate submission. Please retry or email us.” | Return 503 and fail closed | No received flag |
| Required field or consent is missing | Not stored | Existing validation response | Return 400 | No lead or receipt write |
| Confirmed success | Stored | “Thank you. Your enquiry has been received. We'll review it and get back to you.” | Reset form and retry identity only after confirmed storage | One lead and one success state |

## Synthetic acceptance fixture

Use only this fictional pattern:

- Name: Alex Example
- Company: Fictional Workshop Ltd
- Email: qa@example.invalid
- Problem: Synthetic enquiry used only to verify failure recovery
- Consent: checked only inside the isolated fixture
- Source/channel: allowlisted synthetic values

The .invalid domain must never be replaced with a real address during automated acceptance.

## Evidence commands

Run against the exact PR43 head:

~~~bash
node --test tests/enquiry-edit-safe-retry.test.mjs
node --test tests/enquiry-idempotency.test.mjs
node --test tests/enquiry-failure-rollback-doc.test.mjs
~~~

Record the commit SHA and each command's pass/fail result. “PREPARED” means the files exist. “TESTED” means the commands passed on that exact SHA. “VERIFIED” additionally requires an authorised human review of the preview behaviour. “DEPLOYED” requires separate explicit approval and production evidence.

## Release HOLD checklist

Keep PR43 unmerged and undeployed unless every item is evidenced:

- [ ] Exact-head automated tests pass.
- [ ] Preview URL is reviewed with fictional data only.
- [ ] Lost-response retry creates exactly one stored lead.
- [ ] Editing any submitted field, consent or attribution creates a new submission ID.
- [ ] 409/503 paths never display the success message.
- [ ] No browser persistence, analytics addition or new external endpoint exists.
- [ ] Privacy, client-intake scope, £195 diagnostic scope, payment terms and turnaround are separately approved.
- [ ] Owner gives explicit merge and deployment approval.

## Rollback triggers

Rollback is mandatory if any of these occurs:

1. A changed enquiry receives an earlier enquiry's success receipt.
2. A 409, 503 or network failure displays the success message.
3. Consent becomes optional, stale or detached from the submitted payload.
4. A retry creates duplicate storage for unchanged content.
5. A real person or customer record appears in acceptance evidence.
6. An unapproved endpoint, browser persistence, analytics call or production change appears.
7. Any exact-head acceptance test fails.

## Rollback procedure

1. **Before merge:** stop; keep PR43 open and unmerged. Revert the unsafe branch commit through a new review commit.
2. **Preview only:** remove the failing change from the feature branch; do not promote the preview.
3. **After a separately authorised production release:** revert through the normal reviewed pull-request path to the last known-good production commit; never use a destructive history reset.
4. Re-run all three evidence commands on the rollback head.
5. Confirm that no failure path claims receipt and document the exact rollback SHA.

Current conclusion: **HOLD — prepared/testable evidence only; not production verified or authorised.**

