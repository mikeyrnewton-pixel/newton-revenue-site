# Enquiry fulfilment compatibility — CONNECT LATER

Status: **READY / TESTED_OFFLINE pending / NEEDS_CONNECTION / customer delivery HOLD / not LIVE**

This gate reconciles the existing contracts rather than creating a second fulfilment system. It consumes the actual output schema of `enquiry-lifecycle-receipt.mjs`, not a manually reduced substitute:

- PR11: 12-test £195 diagnostic QA and human/client acceptance hold;
- PR29: commercial evidence ordering, with fictional rehearsal excluded from revenue;
- PR30: consent-backed, PII-free acquisition handoff held offline;
- PR43: retention/deletion review held offline and disconnected.

The PR30 `handoffId` enquiry UUID must exactly match the PR43 lifecycle `enquiryId`; contradictory customer identities fail closed.
The PR29 `sourceRecordId` must match that same enquiry ID. The gate accepts the exact `NEWTON_COMMERCIAL_READINESS_V1` output shape from PR29 and requires the £195 price, an explicitly resolved VAT treatment, approved supplier address and terms, `COMMERCIAL_GATE_READY`, no accepted commercial events, £0 recorded/cleared evidence and `FICTIONAL_ONLY_NOT_REVENUE`. Those four commercial fields are preserved in the output manifest as `commercialBasis`. A quote draft or synthetic £195 rehearsal is never treated as acceptance, payment or revenue.

It emits a private `0600` manifest only when project references and safety states agree. Even a passing rehearsal remains `READY_FOR_HUMAN_ASSISTED_PRIVATE_DRY_RUN`; it cannot claim delivery, acceptance, cleared payment, connection or live browser verification.

## Reproducible offline check

```bash
node scripts/enquiry-fulfilment-compatibility-gate.mjs \
  --bundle fixtures/enquiry-fulfilment-compatibility.synthetic.json \
  --config config/enquiry-fulfilment-connect-later.template.json \
  --output PRIVATE_FULFILMENT_COMPATIBILITY_MANIFEST.json
```

## CONNECT LATER — one owner action

On Wednesday, review and approve the intended private adapters and PR43 preview dry-run. A separate reviewed change may then fill the blank adapter and preview fields. Credentials never belong in the template or repository.

The following remain blockers until independently evidenced: human review, client acceptance, cleared payment, owner connection approval and live-browser verification. Browser and Cloudflare interaction: **NOT RUN by this gate**.
