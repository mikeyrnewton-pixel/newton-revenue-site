# ATLAS Sales Integration — source reconciliation and release hold

**Audit:** 24 October 2026. **Destination:** PR #45 (`atlas/commercial-payment-evidence-review-20261022`), commit `9d5a1a0e7d86adf77dbd79ecaadbdf112f4cb324` before this evidence-only document. **No main merge, production deployment, customer data, outbound contacts, invoice, payment link, charge, paid API or Mac changes.**

## Verified source versions reconciled

1. **CRM / website source truth:** PR #30 `58d81df040cbc820e9313ad938362ef52a66f007`. All 13 of its relevant source/test files were compared by Git blob SHA against PR #45. Initially **8 of 13 differed**. The 8 source/test files were safely copied to the draft integration branch: `lib/enquiry-source-inventory.js`, `tests/enquiry-source-inventory.test.mjs`, `lib/enquiry-crm-adapter.js`, `tests/enquiry-crm-adapter.test.mjs`, `lib/enquiry-crm-export.js`, `tests/enquiry-crm-export.test.mjs`, `lib/enquiry-commercial-ledger.js`, `tests/enquiry-commercial-ledger.test.mjs`. The remaining 5 files already matched (including the actual enquiry endpoint and handoff module). This restores source-inventory freshness, bounded Gmail source claims, coverage/consent verification, no-PII exports and fail-closed fictional ledger handling in the combined review candidate. CI passes after integration.
2. **Commercial payment source:** PR #29 `b1051ee45a250ed325bbfb932f96973af1d62f1c`. Compared all 8 source/test files with PR #45. Initially **6 differed**. The payment connector and its complete regression tests were ported to PR #45. `lib/mock-quote.js` and `tests/mock-quote.test.mjs` already matched. The other 4 differing files (commercial-readiness, commercial-source-evidence and their tests) were **intentionally preserved in PR #45** because the combined branch has stricter integration-specific controls:
    - **Fictional money must not become real ledger money.** Combined `lib/commercial-readiness.js` exposes `recordedPaymentEvidenceGBP = 0` and `clearedEvidenceGBP = 0` throughout synthetic tests, while keeping `simulatedRecordedPaymentEvidenceGBP` / `simulatedClearedEvidenceGBP` explicitly separate. The upstream PR #29 version still assigns 195 to real-named evidence fields for fictional stages. **Do not blindly overwrite the combined guard.**
    - **Consent timing must be grounded.** Combined `lib/commercial-source-evidence.js` additionally requires canonical `createdAt` and `contactPermissionCapturedAt` and validates creation-time consent. These integration-specific gates and tests are not present in the pinned source PR #29. **Keep these checks.**

## Exact branch test evidence

At commit `9d5a1a0e7d86adf77dbd79ecaadbdf112f4cb324`, all three independent GitHub PR check types returned **completed/success**: **Website quality checks**, **Build fictional customer handoff package**, and **Preview runtime binding safety**. These checks establish deterministic offline/source coverage only. They are **not** a real Mac run, a real Cloudflare customer journey, confirmed buyer, externally sent quote, agreed terms, invoice, payment-provider proof or cleared cash.

## Release gates — HOLD until independently verified and owner approved

- Re-evaluate source-branch drift if PR #29, PR #30 or PR #43 advances **after the pinned SHAs above**. Preserve the stricter integration-specific fictional-money and consent safeguards during rebase or manual cherry-pick.
- Verify the **exact post-integration PR #45 commit** on its own isolated Cloudflare Preview with non-writing expected responses: public GET / → 200; deliberately invalid /api/enquiry → 415; unauthenticated private GET /api/leads → 401. Do not submit a real or synthetic enquiry without distinct consent.
- Independently test the lost-network-reply → identical-payload retry → edited-payload new submission sequence with non-sensitive fixtures. CI success alone does not prove the live preview integration.
- Confirm supplier/company identity, VAT/legal terms, cancellation and refunds, privacy, written buyer approval, invoice and payment route before any real client delivery or outreach. Never conflate a simulated payment receipt with bank-cleared funds.
- No public merge/deployment, provider connection, real buyer communications, changes to private customer records or charge until Michael explicitly approves the exact scope.

**Execution state: BUILT / TESTED_OFFLINE / REVIEW_BRANCH. Real buyer and cleared revenue: NOT VERIFIED. New spend: £0.**


## Follow-up: upstream payment branch hardened — 24 Oct 2026

After confirming the integration-specific guarantees, the team **also applied the stricter combined controls back to the original review-only PR #29** (`task010-commercial-handoff-controls-20261017`). At exact commit `f32af19ef0ac520b0b7921125cfa7a59edd79693`, these four upstream files now match PR #45's stronger implementations/tests: `lib/commercial-readiness.js`, `tests/commercial-readiness.test.mjs`, `lib/commercial-source-evidence.js`, `tests/commercial-source-evidence.test.mjs`. Existing upstream payment connector/tests and mock quote/tests already match the PR #45 integrated versions after the reconciliation above. Thus the **eight commercial source/test paths now agree across PR #29 and PR #45** at the pinned snapshot. Both upstream PR #29 quality checks completed **SUCCESS** at this exact commit. No production code was merged or released. **The earlier source-vs-integration divergence detailed above is historical, not a remaining current discrepancy.** Future agent commits can introduce new drift, so repeat the checks before release.
