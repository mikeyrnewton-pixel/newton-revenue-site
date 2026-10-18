// Privacy-safe canonical mapping for TASK011 fictional distribution rehearsals.
// This module never sends, publishes or writes customer data.
const SOURCES = new Set(["ai-profit-brief", "newton-reset", "autopilot-8", "enquiry-check", "newton-revenue-site"]);
const CHANNELS = new Set(["facebook", "instagram", "youtube", "search", "partner", "direct"]);
const NOTICE_STATES = new Set(["pending", "delivered", "dead-letter"]);
const MAX_NOTICE_ATTEMPTS = 3;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function invariant(ok, message) {
  if (!ok) throw new Error("TASK011 HOLD: " + message);
}
function validIso(value) {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}
function isExplicitlyFictional(record) {
  const email = typeof record.email === "string" ? record.email.trim().toLowerCase() : "";
  const marker = [record.name, record.company, record.problem]
    .filter(value => typeof value === "string")
    .join(" ")
    .toLowerCase();
  return email.endsWith("@example.invalid") && /fictional|synthetic/.test(marker);
}

export function toFictionalDeliveryHandoff(record) {
  invariant(record && !Array.isArray(record) && typeof record === "object", "lead record required");
  invariant(UUID.test(record.id || ""), "valid enquiry reference required");
  invariant(UUID.test(record.submissionId || ""), "submission ID required for canonical dedupe");
  invariant(validIso(record.createdAt), "canonical UTC creation timestamp required");
  invariant(validIso(record.contactPermissionCapturedAt), "canonical UTC consent capture timestamp required");
  invariant(Date.parse(record.contactPermissionCapturedAt) <= Date.parse(record.createdAt),
    "consent capture cannot follow record creation");
  invariant(record.contactPermission === true, "enquiry contact permission required");
  invariant(record.marketingConsent === false, "marketing consent must remain false");
  invariant(SOURCES.has(record.source), "approved source required");
  invariant(CHANNELS.has(record.channel), "approved channel required");
  invariant(isExplicitlyFictional(record), "only explicit .invalid fictional data may enter this rehearsal");
  const notice = record.notification;
  invariant(notice && !Array.isArray(notice) && typeof notice === "object",
    "explicit owner-notice evidence required");
  invariant(notice.version === 1, "owner-notice schema version 1 required");
  invariant(Number.isInteger(notice.attempts) && notice.attempts >= 0,
    "non-negative owner-notice attempts required");
  invariant(NOTICE_STATES.has(notice.status), "recognised owner-notice state required");
  invariant(notice.status === "pending" || notice.attempts >= 1,
    "terminal owner-notice state requires at least one attempt");
  invariant(notice.attempts <= MAX_NOTICE_ATTEMPTS,
    "owner-notice attempts exceed the retry budget");
  invariant(notice.status !== "pending" || notice.attempts < MAX_NOTICE_ATTEMPTS,
    "exhausted owner-notice retry budget must be dead-lettered");
  invariant(notice.status !== "dead-letter" || notice.attempts === MAX_NOTICE_ATTEMPTS,
    "dead-letter owner notice requires an exhausted retry budget");
  if (notice.attempts === 0) {
    invariant(notice.lastAttemptAt == null,
      "unattempted owner notice cannot carry an attempt timestamp");
  } else {
    invariant(validIso(notice.lastAttemptAt), "attempted owner notice requires canonical attempt timestamp");
    invariant(Date.parse(notice.lastAttemptAt) >= Date.parse(record.createdAt),
      "owner-notice attempt cannot predate record creation");
  }
  if (notice.status === "delivered") {
    invariant(validIso(notice.deliveredAt), "delivered owner notice requires canonical delivery timestamp");
    invariant(Date.parse(notice.deliveredAt) >= Date.parse(notice.lastAttemptAt),
      "owner-notice delivery cannot predate its last attempt");
  } else {
    invariant(notice.deliveredAt == null,
      "undelivered owner notice cannot carry a delivery timestamp");
  }
  const noticeNextAction = notice.status === "delivered"
    ? "NONE"
    : notice.status === "dead-letter"
      ? "MANUAL_OWNER_NOTICE_REVIEW"
      : "RETRY_OWNER_NOTICE";

  // Deliberately omit name, email, company and free-text problem.
  return Object.freeze({
    schema: "NEWTON_FICTIONAL_DISTRIBUTION_V1",
    synthetic: true,
    handoffId: "enquiry:" + record.submissionId.toLowerCase(),
    enquiryRef: record.id.toLowerCase(),
    source: record.source,
    channel: record.channel,
    consent: Object.freeze({
      purpose: "respond_to_enquiry",
      capturedAt: record.contactPermissionCapturedAt,
      marketing: false,
    }),
    ownerNotice: Object.freeze({
      version: notice.version,
      status: notice.status,
      attempts: notice.attempts,
      attemptLimit: MAX_NOTICE_ATTEMPTS,
      lastAttemptAt: notice.lastAttemptAt ?? null,
      deliveredAt: notice.deliveredAt ?? null,
      nextAction: noticeNextAction,
    }),
    workflow: Object.freeze({
      state: "STAGED_OFFLINE_ONLY",
      customerDelivery: "HOLD",
    }),
  });
}

export function buildCanonicalFictionalHandoffs(records) {
  invariant(Array.isArray(records), "lead array required");
  const bySubmission = new Map();
  for (const record of records) {
    const handoff = toFictionalDeliveryHandoff(record);
    const previous = bySubmission.get(handoff.handoffId);
    invariant(!previous || previous.enquiryRef === handoff.enquiryRef,
      "conflicting records share one submission ID");
    invariant(!previous || JSON.stringify(previous) === JSON.stringify(handoff),
      "divergent records share one submission ID");
    if (!previous) bySubmission.set(handoff.handoffId, handoff);
  }
  return [...bySubmission.values()].sort((a, b) =>
    a.consent.capturedAt.localeCompare(b.consent.capturedAt) ||
    a.handoffId.localeCompare(b.handoffId));
}


export function acknowledgeFictionalHandoff(handoff, acknowledgement) {
  invariant(handoff && !Array.isArray(handoff) && typeof handoff === "object",
    "canonical handoff required before acknowledgement");
  invariant(handoff.schema === "NEWTON_FICTIONAL_DISTRIBUTION_V1" && handoff.synthetic === true,
    "only canonical fictional handoffs may be acknowledged");
  invariant(/^enquiry:[0-9a-f-]{36}$/i.test(handoff.handoffId || ""),
    "canonical handoff ID required");
  invariant(UUID.test(handoff.enquiryRef || ""), "canonical enquiry reference required");
  invariant(handoff.ownerNotice?.status === "delivered" && handoff.ownerNotice?.nextAction === "NONE",
    "delivered owner-notice evidence required before acknowledgement");
  invariant(handoff.workflow?.state === "STAGED_OFFLINE_ONLY" &&
    handoff.workflow?.customerDelivery === "HOLD",
    "offline delivery HOLD must remain intact");

  invariant(acknowledgement && !Array.isArray(acknowledgement) &&
    typeof acknowledgement === "object", "acknowledgement evidence required");
  const allowed = new Set(["version", "handoffId", "enquiryRef", "consumer", "acknowledgedAt"]);
  invariant(Object.keys(acknowledgement).every(key => allowed.has(key)),
    "unapproved acknowledgement field");
  invariant(acknowledgement.version === 1, "acknowledgement schema version 1 required");
  invariant(acknowledgement.handoffId === handoff.handoffId,
    "acknowledgement handoff ID mismatch");
  invariant(acknowledgement.enquiryRef === handoff.enquiryRef,
    "acknowledgement enquiry reference mismatch");
  invariant(acknowledgement.consumer === "fictional-delivery-rehearsal",
    "approved fictional acknowledgement consumer required");
  invariant(validIso(acknowledgement.acknowledgedAt),
    "canonical acknowledgement timestamp required");
  invariant(Date.parse(acknowledgement.acknowledgedAt) >=
    Date.parse(handoff.ownerNotice.deliveredAt),
    "acknowledgement cannot predate owner-notice delivery");

  return Object.freeze({
    schema: "NEWTON_FICTIONAL_HANDOFF_ACK_V1",
    synthetic: true,
    receiptId: handoff.handoffId + ":" + handoff.enquiryRef,
    handoffId: handoff.handoffId,
    enquiryRef: handoff.enquiryRef,
    consumer: acknowledgement.consumer,
    acknowledgedAt: acknowledgement.acknowledgedAt,
    state: "ACKNOWLEDGED_OFFLINE",
    customerDelivery: "HOLD",
  });
}
