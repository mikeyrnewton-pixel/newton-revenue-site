# ATLAS Universal Sales Router — 25 October 2026 (review only)

Owner: NEWTON BUILD / NEWTON COMMAND. Existing sales integration PR #45; no extra project, ledger or automation.

## Product aim

Enter an offer once (product, service, property, business, digital asset, introduction, or other). ATLAS validates authority and evidence, researches the right buyers/channels, prepares approved sales actions, supports handoff and delivery, and reports independently verified cleared revenue. Each category may need distinct mandates, compliance, marketing permissions, tax rules and settlement flow. This is not permission to sell regulated, prohibited or third-party assets without appropriate authority.

## Implemented increment (REVIEW CODE, NOT LIVE)

- lib/opportunity-intake.js: stateless, bounded, strictly validated offline route with 11 exact input fields and one of four preliminary desks: B2B_BUYER_RESEARCH, CONSUMER_CHANNEL_RESEARCH, SPECIALIST_MANDATE_REVIEW or BUYER_CLASSIFICATION_REVIEW.
- tests/opportunity-intake.test.mjs: seven deterministic positive/negative tests, including authority/restriction/fulfilment holds, input rejection and description privacy. Local Node 22 run: 7 passed, 0 failed. Remote CI is a separate fact to confirm.
- Returns either INTERNAL_SALES_PREPARATION_READY or REVIEW_HOLD. Both forbid customer contact, listings, agreement, invoicing, charges, revenue recognition, CRM access or storage writes. Description is not echoed. Source flags supplied by the owner are NOT independently validated; an authenticated evidence gate remains to be built.

## Outstanding build sequence

1. Secure owner-facing offer form/import and restricted attachment storage; collect commercial scope, seller/mandate, evidence, availability, asking price, allowed buyers/channels, fulfilment, fees, jurisdiction and necessary approvals.
2. Independently verify seller authority, rights, representations, restrictions, supply and any required professional/commercial permission. Unclear opportunities remain on HOLD.
3. Buyer-research adapter: demand evidence, target qualification, contact-law checks, deduplication, source timestamps, exceptions, and confidentiality protections. Mere prospect research does not count as a customer or qualified buyer.
4. Approved outbound/listing executor per channel: draft, review, explicit per-action permissions, sending receipt, opt-out and replies, retry and human exception handling. No known-contact outreach without fresh approval.
5. Deal Desk: buyer response, pricing, negotiation, scope/commission, supplier and buyer contracts with approval gates.
6. Payment/delivery evidence: invoice readiness then separate authorised issuance, processor/bank verification, settlement and CLEARED state, fulfilment handoff and reconciled commission.
7. Control Tower: one evidence-linked offer-to-cash view using the existing NEWTON EMPIRE LIVE COMMERCIAL STATE spreadsheet, not a competing ledger.

## Existing engine ownership

COMMAND prioritises and maintains truth; BUILD integrates; ACQUISITION sources/qualifies demand; CAREER PRIME tests security/delivery; CASH manages buyer conversion, terms and cleared-cash proof. Maintain all five currently enabled hourly tasks unchanged.

## Separate ATLAS blocker

The 24 October later Mac receipt records Stage 2 local Observer as verified; this supersedes the older morning handover. Do not reinstall it. Stage 3 authentication/workspace audit, controlled existing-tunnel cutover, genuine remote atlas_status read and demonstrated rollback remain pending. Mac maintenance-sleep resilience is not proven. Existing one-tool ChatGPT canary works and must be preserved.

**Current release: REVIEW BRANCH + LOCAL UNIT TESTS ONLY. No live sales, real cleared payments, production merge, tunnel change, Activepieces access, external contacts or spending.**

## 25 October follow-on milestone — ATLAS Sales Desk v0.2 (offline owner preview)

- `tools/atlas-sales-desk-offline.html`: mobile-responsive single-file offline form and action pack, stored **outside `public/`** so the existing Pages publish does not make an internal owner tool publicly accessible.
- Supports real-time owner-entered opportunity assessment for all seven existing categories; deterministic hold checks match the Node `routeOfflineOpportunity` rules; produces evidence gates, buyer-research route and an owner-only sales workplan.
- Manually entered **buyer hypotheses** are ranked by **declared** fit and demand signal; their identities, interest, evidence and contact permission are **not independently verified**. Never call them paying customers or qualified buyers.
- Hardened document Content-Security-Policy denies networking, outbound form submission and embedded assets; no local-storage code, database, authentication, payment, email or credential collection. DOM escapes candidate labels via `textContent`. Refresh discards entered data.
- Local headless Chromium tests were run on desktop and simulated iPhone viewports: demo route, candidate add/ranking, safe untrusted markup rendering, authority hold, clear and invalid input; no page JavaScript exceptions or outbound requests. Direct file navigation was blocked by test environment policy, so the browser harness loaded the original standalone HTML as document content.
- `tests/offline-sales-desk.test.mjs` adds repo CI parity checks and privacy constraints. GitHub Actions **Website quality checks** successful for commit `7f6988d6814dfcc9e0b76603a6891a1d33762de9`, running **354 tests passed / 0 failed** (the other workflow results were not yet all final at this timestamp).
- Review PR #45 remains DRAFT, UNMERGED. The HTML is a usable owner **offline preview**, NOT a deployed authenticated customer intake, seller mandate verifier, buyer-sourcing agent, CRM integration or confirmed earning mechanism.
- Next owner-impacting gates: authenticated/private production workspace; evidence/document storage and rights checks; permitted real buyer discovery; approved outreach; contracts/invoices/payment provider; proof of settled funds, delivery and reconciliation. Leave the reserve intact and retain explicit permissions.

## Existing Supabase opportunity schema — non-writing connector inspection 25 October 2026

- The owner's EXISTING Supabase project (region eu-west-2) is ACTIVE_HEALTHY. Its `public.newton_opportunities` table already exists with **0 rows**, RLS enabled. `newton_memory` and `newton_runs` also exist with 0 rows; do not recreate or repurpose them.
- Inspected only the table metadata and `pg_policies` (no private rows): `newton_opportunities` has **no policies returned**. RLS enabled is not a usable authenticated owner session; no browser-side customer storage or direct connector write should be enabled until an actual owner identity/authn/authz policy and privacy model are reviewed and explicitly authorised.
- Existing columns: id uuid, title text, source text, status enum-like check (discovered, qualified, contacted, replied, call_booked, proposal, won, lost, paused), estimated_value_gbp numeric, evidence text[], next_action text, next_action_due timestamptz, metadata jsonb, created_at and updated_at.
- `lib/opportunity-crm-preview.js` now maps valid owner-declared offline opportunities to a **fictional no-write `discovered` row**, with opaque ID, digest, hold codes, required approval and no description/customer details. It does **not** connect to Supabase, authenticate, write a row, verify seller authority, source buyers, or recognise funds. `tests/opportunity-crm-preview.test.mjs` guards the boundary.
- Next approved implementation must address secure owner sign-in, table policy, retention, source evidence documents and deduplication before an actual CRM sync. Do not grant `anon`/all `authenticated` blanket access, use service-role credentials in the browser or treat an empty DB as a sales failure.

Evidence: authenticated Supabase list_projects, list_tables verbose and read-only pg_policies metadata on 25 Oct; GitHub PR #45 review branch. No migrations, table writes, permissions, deployments or spending performed.

## Authenticated evidence boundary — BUILD increment

- `lib/opportunity-evidence-requirements.js` converts every valid offline offer into a deterministic, privacy-safe proof checklist for seller authority, offer source, fulfilment/availability, restrictions/jurisdiction and offer terms. Property, business, digital-asset and introduction routes also require specialist mandate/compliance review.
- Owner-entered enum values remain declarations. Even when the intake reports `INTERNAL_SALES_PREPARATION_READY`, the evidence contract remains `AUTHENTICATED_EVIDENCE_REQUIRED`; it cannot accept evidence, permit buyer discovery, enable an external action or write storage.
- `lib/opportunity-crm-preview.js` now carries that evidence gate and requirement codes into the existing no-write `discovered` row. It never promotes a declaration to qualified buyer, authenticated proof or cleared cash.
- `tests/opportunity-evidence-requirements.test.mjs` and the CRM-preview regression tests enforce immutability, privacy, specialist routing and the declaration/evidence separation.

Next integration gate: CAREER PRIME independently reviews the requirement coverage. A later authenticated adapter must bind dated, deduplicated proof digests to an owner-authorised source; this review code deliberately provides no bypass by accepting caller-supplied “verified” evidence.

## Owner's first commercial pilot selection — 25 Oct 2026

Owner explicitly chose the existing **£195 Enquiry Ownership Diagnostic** as the FIRST priority for the universal sales loop, and instructed the team to continue safe work with minimal interruptions. **This approval covers pilot focus and internal build/testing only.** The owner expressly retained separate gates before any real outbound buyer contact (including existing contacts), public production deployment, private-data access, contract/quote release, real invoice/payment activation or financial commitment.

Implementation: `lib/diagnostic-pilot-preflight.js` and `tests/diagnostic-pilot-preflight.test.mjs` create a deterministic, fictional £195 internal scope/action pack with the approved four enquiry channels, maximum 20 fictional/anonymised examples, a narrow human-led deliverable and honest tax/supplier/terms/privacy/delivery blockers. Even if every owner-supplied checkbox says reviewed, the module remains **NOT FOR SENDING**, does not independently verify legal evidence, and has all outbound/storage/payment effects disabled. CI exact head `885e624d3f1c5cbc5f4eb18c25b9d54cee6437c7`: **365/365 Node tests passed, 0 failures**, all three PR check workflows successful.

Near-term commercial gates: (1) independently verify supplier/legal trading identity and current VAT treatment plus buyer-facing trading address; (2) legal/buyer-specific quote/terms and cancellation/refund/data-handling approval; (3) owner-specific approval for any outbound, actual customer data, authenticated CRM changes and transaction activation. The current customer-facing diagnostic page has a mailto scope enquiry route; no new public release and no real buyer contract/revenue verified. Use one true first transaction as proof, not synthetic £195 tests. Keep £0 cost, £200 reserve untouched.
