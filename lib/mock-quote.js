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
    "Proposed service: Enquiry Ownership Diagnostic (one channel: " + input.channel + ")",
    "Example limit: no more than " + input.maxExamples + " anonymised or fictional entries.",
    "Indicative scope: human review of one enquiry process, an owner / next-action / deadline map, three evidence-based fixes, a sample tracker and optional 15-minute debrief.",
    "Proposed base price: **£195**. **VAT status: UNKNOWN. Final price and tax treatment require owner and adviser confirmation before any binding quote.**",
    "Working delivery target: two working days after receipt of all agreed suitably redacted examples, subject to capacity and written acceptance.",
    "Excluded: live account logins, raw personal data, scraping, customer replies, production automation, guaranteed conversions, and ongoing maintenance.",
    "",
    "## Commercial acceptance gate — HOLD",
    "- [ ] Confirm exact legal trading entity, registration details and appropriate invoice information",
    "- [ ] Confirm VAT registration, VAT treatment and final total explicitly",
    "- [ ] Approve final customer terms, cancellation/refund wording, confidentiality and data-handling boundaries",
    "- [ ] Confirm specific one-channel scope, capped examples, real delivery capacity and due date",
    "- [ ] Obtain actual customer written acceptance; only then prepare an approved buyer-specific invoice or payment link",
    "- [ ] Record invoice/payment status separately; never call an invoice cleared money",
    "",
    "**NO payment link has been generated. This fictional document is not an invoice, paid order, acceptance or proof of a sale.**",
    "",
  ].join("\n");
}
