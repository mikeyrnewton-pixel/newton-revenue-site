# Offline synthetic diagnostic rehearsal — actually executable

Run this **in the existing Newton Revenue website repo**, with Node 22:

```sh
npm test
node scripts/build-diagnostic-demo.mjs
```

Output: git-ignored `generated/diagnostic-demo.md`. This is a real evidence-linked Markdown demo for the site's current £195 one-channel Enquiry Ownership Diagnostic.

- Uses **only** `examples/diagnostic-demo.json` (entirely fictional); no APIs, CRM connection, real enquiries or customer information.
- Refuses real-data mode, unexpected personal-data fields, common email/phone/secret strings, unresolved evidence links, impossible dates, duplicate-of-duplicate chains, 21+ samples and unsupported recommendations.
- Always renders **delivery release HOLD**. Structural preflight passing never means a customer's data, commercial/VAT terms, all twelve private SOP QA tests or delivery approval has been completed.
- To change the illustrative story, edit the synthetic JSON fixture and rerun locally. Do not commit real customer data, paste personal data into the fixture, or represent the demo as a client result.
- Real customer delivery still uses `ENQUIRY_DIAGNOSTIC_DELIVERY_QA.md` and requires anonymisation, actual source reconciliation, written scope, human QA and owner approval.
- No background scheduling or public website deployment is required for this delivery tool. This is an internal build asset.

**Why built:** The existing SOP described the report but did not offer a reproducible, validated rehearsal output. The small tool now connects the same fictional input to a consistent tracker, findings, three fixes, evidence references and fail-closed release gate.
