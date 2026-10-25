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
