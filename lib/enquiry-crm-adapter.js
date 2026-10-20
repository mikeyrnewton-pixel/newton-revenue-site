// PII-free canonical handoff -> CRM event adapter for TASK011 acquisition rehearsals.
// This module is offline-only: it does not call a CRM, send messages or write customer data.
const SOURCES = new Set(["ai-profit-brief", "newton-reset", "autopilot-8", "enquiry-check", "newton-revenue-site"]);
const CHANNELS = new Set(["facebook", "instagram", "youtube", "search", "partner", "direct"]);
const NOTICE_STATES = new Set(["pending", "delivered", "dead-letter"]);
const NOTICE_ACTIONS = Object.freeze({
  pending: "RETRY_OWNER_NOTICE",
  delivered: "NONE",
  "dead-letter": "MANUAL_OWNER_NOTICE_REVIEW",
});
const MAX_NOTICE_ATTEMPTS = 3;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function invariant(ok, message) {
  if (!ok) throw new Error("TASK011 CRM HOLD: " + message);
}
function exactKeys(value, keys) {
  return value && !Array.isArray(value) && typeof value === "object" &&
    Object.keys(value).length === keys.length &&
    Object.keys(value).every(key => keys.includes(key));
}
function validIso(value) {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

function validateCanonicalHandoff(handoff) {
  invariant(exactKeys(handoff, [
    "schema", "synthetic", "handoffId", "enquiryRef", "source", "channel",
    "consent", "ownerNotice", "workflow",
  ]), "exact PII-free canonical handoff fields required");
  invariant(handoff.schema === "NEWTON_FICTIONAL_DISTRIBUTION_V1" &&
    handoff.synthetic === true, "only canonical fictional handoffs are accepted");
  invariant(/^enquiry:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    .test(handoff.handoffId || ""), "canonical handoff ID required");
  invariant(UUID.test(handoff.enquiryRef || ""), "canonical enquiry reference required");
  invariant(SOURCES.has(handoff.source), "approved attribution source required");
  invariant(CHANNELS.has(handoff.channel), "approved attribution channel required");

  invariant(exactKeys(handoff.consent, ["purpose", "capturedAt", "marketing"]),
    "exact consent evidence required");
  invariant(handoff.consent.purpose === "respond_to_enquiry" &&
    validIso(handoff.consent.capturedAt) &&
    handoff.consent.marketing === false,
    "consent must be enquiry-response only with marketing disabled");

  const notice = handoff.ownerNotice;
  invariant(exactKeys(notice, [
    "version", "status", "attempts", "attemptLimit", "lastAttemptAt",
    "deliveredAt", "nextAction",
  ]), "exact owner-notice evidence required");
  invariant(notice.version === 1 && NOTICE_STATES.has(notice.status),
    "recognised owner-notice evidence required");
  invariant(Number.isInteger(notice.attempts) && notice.attempts >= 0 &&
    notice.attempts <= MAX_NOTICE_ATTEMPTS &&
    notice.attemptLimit === MAX_NOTICE_ATTEMPTS,
    "valid owner-notice retry budget required");
  invariant(notice.nextAction === NOTICE_ACTIONS[notice.status],
    "owner-notice next action does not match status");
  invariant(notice.status === "pending" || notice.attempts >= 1,
    "terminal owner-notice state requires an attempt");
  invariant(notice.status !== "pending" || notice.attempts < MAX_NOTICE_ATTEMPTS,
    "exhausted owner notice must be dead-lettered");
  invariant(notice.status !== "dead-letter" || notice.attempts === MAX_NOTICE_ATTEMPTS,
    "dead-letter owner notice requires exhausted retries");
  if (notice.attempts === 0) {
    invariant(notice.lastAttemptAt == null, "unattempted owner notice cannot have a timestamp");
  } else {
    invariant(validIso(notice.lastAttemptAt), "owner-notice attempt timestamp required");
  }
  if (notice.status === "delivered") {
    invariant(validIso(notice.deliveredAt) &&
      Date.parse(notice.deliveredAt) >= Date.parse(notice.lastAttemptAt),
      "valid owner-notice delivery evidence required");
  } else {
    invariant(notice.deliveredAt == null, "undelivered owner notice cannot have delivery evidence");
  }

  invariant(exactKeys(handoff.workflow, ["state", "customerDelivery"]) &&
    handoff.workflow.state === "STAGED_OFFLINE_ONLY" &&
    handoff.workflow.customerDelivery === "HOLD",
    "offline customer-delivery HOLD must remain intact");
}

export function toFictionalCrmEvent(handoff) {
  validateCanonicalHandoff(handoff);
  return Object.freeze({
    schema: "NEWTON_FICTIONAL_CRM_EVENT_V1",
    synthetic: true,
    eventKey: "crm:" + handoff.handoffId,
    eventType: "ENQUIRY_CAPTURED",
    handoffId: handoff.handoffId,
    enquiryRef: handoff.enquiryRef,
    attribution: Object.freeze({
      source: handoff.source,
      channel: handoff.channel,
    }),
    consent: Object.freeze({
      purpose: handoff.consent.purpose,
      capturedAt: handoff.consent.capturedAt,
      marketing: false,
    }),
    ownerNoticeStatus: handoff.ownerNotice.status,
    state: "STAGED_OFFLINE_ONLY",
    customerDelivery: "HOLD",
  });
}

export function buildFictionalCrmEvents(handoffs) {
  invariant(Array.isArray(handoffs), "canonical handoff array required");
  const byEventKey = new Map();
  for (const handoff of handoffs) {
    const event = toFictionalCrmEvent(handoff);
    const previous = byEventKey.get(event.eventKey);
    invariant(!previous || JSON.stringify(previous) === JSON.stringify(event),
      "conflicting canonical handoffs share one CRM event key");
    if (!previous) byEventKey.set(event.eventKey, event);
  }
  return Object.freeze([...byEventKey.values()].sort((a, b) =>
    a.consent.capturedAt.localeCompare(b.consent.capturedAt) ||
    a.eventKey.localeCompare(b.eventKey)));
}
