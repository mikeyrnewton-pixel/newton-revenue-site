# ATLAS offline customer-journey acceptance (build-only)

`node scripts/run-customer-rehearsal.mjs`

Produces ONLY local git-ignored `generated/customer-rehearsal/`:

- `mock-quote.md` — illustrative £195 quote; VAT UNKNOWN; no real customer and payment release HOLD
- `diagnostic-report.md` — fictional three-fix report and linked anonymous source examples; release HOLD
- `handoff.json` — checksums, same project/channel, evidence counts, saved demo intake, matching owner ACK, duplicate suppression, private access denial, notice failure and authenticated recovery

**What runs:** It invokes the EXISTING `functions/api/enquiry.js`, `functions/api/leads.js` and `functions/api/retry-owner-notices.js` with a local in-memory KV stub. It replaces network `fetch` with an in-process simulated Apps Script receiver and restores it afterwards. No real credentials, user data, mail delivery, Cloudflare KV access, external API request, browser, paid model, trading, production write or publication. Source of mock records is existing `examples/diagnostic-demo.json` and `examples/mock-quote.json`.

**Fail closed:** If either mock fixture has a different project/channel, a source count above cap, a bad evidence reference, unacknowledged notice, duplicate submission, unauthorised private access, failed retry or a malformed report, execution stops before writing accepted handoff files. Generated outputs are never written inside `public/`, `functions/` or source directories.

**Not readiness proof:** This rehearsal proves code wiring for *fictional cases only*. To go from STAGED to READY, still need approved legal entity/VAT/customer terms, real account access and confidential data-handling decisions, verified Cloudflare production route, signed-off actual customer delivery QA and customer-specific payment acceptance. Don't count the synthetic intake as a buyer, notification as an email received, a mock quote as an invoice, or a successful test as cleared income.

Run `npm test` to exercise this complete acceptance in existing GitHub CI. No additional npm packages needed.
