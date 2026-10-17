# £195 Enquiry Ownership Diagnostic — OWNER REVIEW DRAFT (16 October 2026)

**INTERNAL DRAFT — NOT customer-approved terms.** Do not publish or promise a turnaround until Michael approves and legal/company facts are verified. Price is the existing public advertised £195, but whether it includes VAT depends on the actual seller's VAT status. Avoid implying legal advice or guaranteed results.

## Proposed scope

- One UK business; **one nominated enquiry channel** (for example a contact form, shared inbox or booking request) chosen in writing.
- Up to **60 minutes of discovery** by a call or shared screenshots/redacted workflow evidence, and a structured review of how enquiries are received, owned, followed up and closed.
- Deliverable: a short written **Enquiry Ownership Report** with current-flow map, up to five prioritised leak points, risk/impact/effort, one recommended first fix, and a simple eight-column follow-up tracker. No promises of uplift or conversion.
- No automatic connection to customer's inbox/CRM, no customer messages, live deployment, integration, custom software, data migration, GDPR legal audit, paid subscriptions, performance guarantee or ongoing management within £195. These require a separate written proposal and approval.
- Do not request passwords, payment details or raw customer personal data. Prefer redacted samples, approved access and minimum retention.

## Owner choices needed before public wording

1. **Legal seller:** exact contracting company, registered address/company number, contact email and applicable jurisdiction. Do not automatically assume any Newton entity is the seller.
2. **VAT:** whether the seller is VAT-registered, applicable VAT treatment and whether the advertised £195 is inclusive or exclusive. For UK consumers, total pricing generally needs to be clear; B2B wording must not mislead.
3. **Delivery promise:** proposed **within 3 UK working days of receipt of all agreed inputs**; do not promise until capacity is confirmed. Define working days and dependency on timely customer responses.
4. **Payment:** buyer-specific Revolut Business link AFTER buyer accepts written scope, invoice/payment terms and verified recipient. No public pay button assumed.
5. **Cancellation/refunds:** seller's lawful policy must be reviewed based on buyer classification (business/consumer), online contract rules, commencement of service and actual statutory rights. Do not write 'non-refundable' by default or waive rights without proper consent.
6. **Privacy/data protection:** verify live privacy notice, controller identity, lawful basis, service providers, retention period, contact channel, DPA when applicable, data-subject rights and international transfers where relevant. Need appropriate customer instruction before handling any data.
7. **Contract acceptance:** explicit scope, dependencies, excluded items, acceptance by named authorised business representative, complaint contact, governing law, invoice timing and liability limitations subject to legal review.

## Suggested customer-facing summary (ONLY after review)

**Enquiry Ownership Diagnostic — £195 [VAT wording pending]**

A focused review of one enquiry channel to identify where messages, quotes, callbacks or booking requests lose their owner or next action.

**You receive:** a concise workflow review, up to five practical recommendations, a prioritised first fix and a follow-up tracker you can start using.

**How it works:** agree one channel and scope; provide redacted examples; we review and return a written report within the agreed timeframe.

**Not included:** building or running automations, contacting your customers, changing your systems, guaranteed bookings or ongoing support. Those are separately scoped and quoted.

**To enquire:** https://newton-revenue-site.pages.dev/enquiry-diagnostic/ or newtonrevenue@gmail.com

## Weekend QA checklist (evidence required)

- From a private/mobile browser, page displays £195 with no contradictory tax or promise text.
- Valid synthetic enquiry is stored with test flag, unique ID, timestamp and consent; owner's notification delivered exactly once or failure visible.
- Invalid/missing required fields are rejected, bot/spam limits and basic privacy checks pass.
- Failed notification can be retried with **separate scoped** credential, without duplicates; no secret logged.
- One real operator monitors inbox and failed notices over weekend; alert escalation/manual backup documented.
- Written buyer acceptance, invoice and buyer-specific payment link can be prepared without charging anyone during test.
- No production launch claims or published legal terms until owner approves final text.

**Release gating:** PR #13 separate draft retry fix. Secrets: GitHub `NEWTON_NOTICE_RETRY_TOKEN`, Cloudflare `RETRY_JOB_TOKEN`; same strong randomly generated value, different from `ADMIN_TOKEN`. Never paste credentials in chats or GitHub issue comments. Production merge conditional on secure setup, final review and safe synthetic-only validation.
