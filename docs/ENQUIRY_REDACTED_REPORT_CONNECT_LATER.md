# Redacted diagnostic report acceptance — CONNECT LATER

Status: **READY / TESTED_OFFLINE pending / NEEDS_CONNECTION / customer delivery HOLD / browser NOT RUN**

This checker extends the existing `build-diagnostic-demo.mjs`; it does not create another report generator. It verifies the generated Markdown is private, fictional, redacted, structurally complete, held at all 12 QA rows and bound to the cross-PR compatibility manifest.

```bash
node scripts/enquiry-redacted-report-acceptance.mjs \
  --report PRIVATE_DIAGNOSTIC_REPORT.md \
  --compatibility PRIVATE_FULFILMENT_COMPATIBILITY_MANIFEST.json \
  --config config/enquiry-redacted-report-connect-later.template.json \
  --output PRIVATE_REDACTED_REPORT_ACCEPTANCE.json
```

The acceptance receipt is private mode `0600`. It never sends the report and cannot mark delivery, acceptance, payment, connection or live verification.

## CONNECT LATER — one owner action

On Wednesday, Michael reviews the private report and chooses the approved private delivery route and recipient role. A separate reviewed change may then fill the blank fields. Credentials and real customer data must never be committed.

Direct browser/Cloudflare review remains **NOT RUN** by this checker.
