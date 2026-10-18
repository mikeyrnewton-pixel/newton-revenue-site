// Privacy-safe canonical mapping for TASK011 fictional distribution rehearsals.
// This module never sends, publishes or writes customer data.
const SOURCES = new Set(["ai-profit-brief", "newton-reset", "autopilot-8", "enquiry-check", "newton-revenue-site"]);
const CHANNELS = new Set(["facebook", "instagram", "youtube", "search", "partner", "direct"]);
const NOTICE_STATES = new Set(["pending", "delivered", "dead-letter"]);
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
  if (notice.attempts > 0) {
    invariant(validIso(notice.lastAttemptAt), "attempted owner notice requires canonical attempt timestamp");
  }
  if (notice.status === "delivered") {
    invariant(validIso(notice.deliveredAt), "delivered owner notice requires canonical delivery timestamp");
    invariant(Date.parse(notice.deliveredAt) >= Date.parse(record.createdAt),
      "owner-notice delivery cannot predate record creation");
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
    a.consent.capturedAt.localeCompare(b.consent.capturedAt));
}
