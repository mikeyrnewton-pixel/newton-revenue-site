// Review-only acquisition asset for the £195 one-channel Enquiry Ownership Diagnostic.
// Evidence: a current UK customer-experience brief asks for post-tour enquiry follow-up
// and handling of historic open enquiries. This module performs no contact or delivery.
const SEGMENT = "uk-venue-tour";
const CHANNEL = "email";

export function buildVenueTourDiagnosticQuestions(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("DIAGNOSTIC HOLD: input required");
  }
  const allowed = ["synthetic", "segment", "channel"];
  for (const key of Object.keys(input)) {
    if (!allowed.includes(key)) throw new Error("DIAGNOSTIC HOLD: unapproved field: " + key);
  }
  if (input.synthetic !== true) {
    throw new Error("DIAGNOSTIC HOLD: fictional rehearsal only");
  }
  if (input.segment !== SEGMENT) {
    throw new Error("DIAGNOSTIC HOLD: approved segment required");
  }
  if (String(input.channel || "").toLowerCase() !== CHANNEL) {
    throw new Error("DIAGNOSTIC HOLD: exactly one approved channel (email) required");
  }

  return Object.freeze({
    schema: "NEWTON_ONE_CHANNEL_DIAGNOSTIC_V1",
    synthetic: true,
    segment: SEGMENT,
    channel: CHANNEL,
    offer: "£195 Enquiry Ownership Diagnostic — one channel, review-only",
    evidence: Object.freeze({
      observedNeed: "Follow up enquiries after a tour and progress historic open leads.",
      sourceUrl: "https://www.peopleperhour.com/freelance-jobs/marketing-branding-sales/sales-calls/need-uk-based-virtual-assistant-customer-experience-crm-pers-4524841",
      interpretation: "This evidences an operational follow-up problem, not a buyer, sale or permission to contact.",
    }),
    questions: Object.freeze([
      "When a tour enquiry arrives by email, who is the named owner until it is booked, declined or explicitly closed?",
      "What timestamped evidence shows when the enquiry arrived, when the first human response was sent and whether the prospect replied?",
      "After a tour, what single next action, owner and due time must be recorded before the enquiry can leave the active queue?",
      "How are no-response, not-ready, declined and booked outcomes distinguished without relying on inbox memory?",
      "How are historic open enquiries separated from new enquiries so old records cannot silently re-enter the live queue?",
      "What recorded permission and approved purpose allow each follow-up, and what immediately stops further contact?",
    ]),
    proofRequired: Object.freeze([
      "One anonymised or fictional email-thread example",
      "One current owner/next-action/due-time record",
      "One historic-open-enquiry example with its present status",
      "The channel-specific consent or contact-permission rule",
    ]),
    result: Object.freeze({
      readyWhen: "Every sampled enquiry has one owner, one next action, one due time, evidence of response, a valid status and a permitted follow-up purpose.",
      holdWhen: "Any sample lacks ownership, timestamp evidence, status, due time or contact permission.",
      customerDelivery: "HOLD",
    }),
  });
}
