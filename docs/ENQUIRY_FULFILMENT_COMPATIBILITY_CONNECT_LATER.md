# Enquiry fulfilment compatibility — CONNECT LATER

Status: **READY / TESTED_OFFLINE pending / NEEDS_CONNECTION / customer delivery HOLD / not LIVE**

This gate reconciles the existing contracts rather than creating a second fulfilment system:

- PR11: 12-test £195 diagnostic QA and human/client acceptance hold;
- PR29: commercial evidence ordering, with fictional rehearsal excluded from revenue;
- PR30: consent-backed, PII-free acquisition handoff held offline;
- PR43: retention/deletion review held offline and disconnected.

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
