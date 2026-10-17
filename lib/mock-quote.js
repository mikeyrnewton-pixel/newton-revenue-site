// Offline rehearsal of the commercial handoff. Never a real offer, invoice or payment.
const keys = new Set(["synthetic", "projectRef", "channel", "maxExamples", "proposedPriceGBP"]);
export function buildMockQuote(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw Error("HOLD: invalid scope input");
  for (const key of Object.keys(input)) if (!keys.has(key)) throw Error("HOLD: unapproved scope field: " + key);
  if (input.synthetic !== true) throw Error("HOLD: only fictional, non-customer scope is allowed");
  if (!/^DEMO-[A-Z0-9-]{3,30}$/.test(input.projectRef || "")) throw Error("HOLD: invalid fictional project reference");
  if (!["Website", "Email", "Phone", "WhatsApp"].includes(input.channel)) throw Error("HOLD: exactly one approved enquiry channel required");
  if (!Number.isInteger(input.maxExamples) || input.maxExamples < 1 || input.maxExamples > 20) throw Error("HOLD: scope must not exceed 20 anonymised or fictional examples");
  if (input.proposedPriceGBP !== 195) throw Error("HOLD: £195 remains proposed, not a committed or paid price");
  return [
    "# Newton Revenue — FICTIONAL diagnostic scope and quote",
    "",
    "**INTERNAL DRAFT ONLY · NOT FOR SENDING · NO REAL CUSTOMER OR CONTRACT · COMMERCIAL RELEASE HOLD**",
    "",
    "Reference: " + input.projectRef,
    "Proposed supplier: **Newton Strategic Holdings Ltd (company number 17330041)**. Registered-office and invoice-address details must be checked against the current official company record before use.",
    "Proposed service: Enquiry Ownership Diagnostic (one channel: " + input.channel + ")",
    "Example limit: no more than " + input.maxExamples + " anonymised or fictional entries.",
    "Indicative scope: human review of one enquiry process, an owner / next-action / deadline map, three evidence-based fixes, a sample tracker and optional 15-minute debrief.",
    "Proposed base price: **£195**. **VAT status: UNKNOWN. Michael must confirm the supplier's current VAT status and whether £195 is net, gross or outside VAT before any binding quote or payment request.**",
    "Working delivery target: two working days only after receipt of all agreed suitably redacted examples, written buyer acceptance, cleared payment where required, and confirmed delivery capacity.",
    "Excluded: live account logins, raw personal data, scraping, customer replies, production automation, guaranteed conversions, and ongoing maintenance.",
    "",
    "## Proposed cancellation and refund controls — OWNER/LEGAL APPROVAL REQUIRED",
    "- Buyer-specific written terms must state the cancellation deadline, whether work has started, any approved refund basis and refund timing.",
    "- Do not imply that payment is automatically non-refundable or waive statutory rights; obtain appropriate legal review for the buyer type and sales channel.",
    "- No deduction, cancellation fee or refund promise is authorised by this fictional draft.",
    "",
    "## Proposed data-sharing controls — HOLD",
    "- Accept only the agreed minimum, suitably redacted or anonymised examples through an owner-approved secure route; never request passwords, access tokens or live account credentials.",
    "- Record the permitted purpose, authorised sender/recipient, any approved subprocessors, retention/deletion date and deletion confirmation before transfer.",
    "- Do not reuse, enrich, publish or onward-share buyer data, and stop if personal or special-category data is not covered by the written instructions.",
    "",
    "## Buyer-specific acceptance and payment handoff — strict order",
    "1. Finalise supplier identity, exact one-channel scope, exclusions, delivery date, cancellation/refund terms, data instructions and VAT-inclusive or VAT-exclusive total.",
    "2. Obtain the buyer's written acceptance of that exact scope and terms.",
    "3. Obtain Michael's explicit approval for that buyer-specific commercial request.",
    "4. Only then issue either an accurate company invoice or one approved merchant payment link. Never place bank details, merchant secrets or reusable payment URLs in source code.",
    "5. The invoice/request must show buyer identity, project reference, exact GBP total and VAT treatment, issue/due dates, payment method and supplier details. Independently verify the destination before sending.",
    "6. Record SENT, ACCEPTED, INVOICED and CLEARED separately; only settled bank/merchant evidence may mark CLEARED. The delivery clock starts only at the agreed trigger.",
    "",
    "## Commercial acceptance gate — HOLD",
    "- [ ] Re-check Newton Strategic Holdings Ltd company number and current registered/invoice details",
    "- [ ] Michael confirms current VAT registration, VAT treatment and exact final total",
    "- [ ] Owner/legal review approves buyer-type cancellation/refund wording and statutory-rights treatment",
    "- [ ] Approve confidentiality, data minimisation, secure-transfer, subprocessor and retention/deletion instructions",
    "- [ ] Confirm specific one-channel scope, capped examples, real delivery capacity and due date",
    "- [ ] Obtain actual buyer written acceptance of the exact scope and terms",
    "- [ ] Obtain Michael's buyer-specific invoice/payment approval before issuing anything",
    "- [ ] Record invoice/payment status separately; never call an invoice cleared money",
    "",
    "**NO payment link, invoice or bank instruction has been generated. This fictional document is not a contract, paid order, acceptance or proof of a sale.**",
    "",
  ].join("\n");
}
