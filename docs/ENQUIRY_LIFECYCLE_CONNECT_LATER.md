# Enquiry lifecycle receipt — CONNECT LATER

Status: **BUILT / TESTED_OFFLINE pending / STAGED / NEEDS_CONNECTION / not LIVE**

This component creates a private, redacted review receipt for the £195 Enquiry Ownership Diagnostic. It helps an authorised human decide whether a synthetic enquiry remains within retention, has reached its policy date, or carries a deletion request. It never connects to storage and never deletes, contacts, publishes or approves anything.

## Offline rehearsal

Use fictional data only. The record must declare `syntheticOnly: true`, `personalData: false`, and use an `@example.invalid` address.

```bash
node scripts/enquiry-lifecycle-receipt.mjs \
  --record fixtures/enquiry-lifecycle.synthetic.json \
  --policy config/enquiry-lifecycle.template.json \
  --as-of 2026-10-20T08:00:00.000Z \
  --output PRIVATE_ENQUIRY_LIFECYCLE_RECEIPT.json
```

The output is mode `0600`, omits the address, fingerprints the inputs, states `NEEDS_CONNECTION`, and keeps `deletionExecuted: false`.

## CONNECT LATER — one owner action

After a separate privacy review, choose and explicitly approve the existing authorised storage/deletion integration. Only then may a new reviewed change replace the blank `storageAdapter` and `deletionAdapter` values. Do not paste credentials into this template or commit them.

Connection, real-client validation, deletion execution, deployment and a `LIVE` claim all require separate evidence. A passing offline receipt is not client delivery.

## Mandatory holds

- Real names, addresses, emails or enquiry content: **HOLD**.
- Missing consent or lawful data-sharing basis: **HOLD**.
- Blank adapters or `ownerApproval: NOT_GRANTED`: **HOLD / NEEDS_CONNECTION**.
- Retention expiry or deletion request: **human review**, never automatic deletion.
- Any secret-like text, symlink output or unsupported action flag: fail closed.
