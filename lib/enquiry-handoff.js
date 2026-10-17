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
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
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
  invariant(validIso(record.createdAt), "valid creation timestamp required");
  invariant(validIso(record.contactPermissionCapturedAt), "consent capture timestamp required");
  invariant(record.contactPermission === true, "enquiry contact permission required");
  invariant(record.marketingConsent === false, "marketing consent must remain false");
  invariant(SOURCES.has(record.source), "approved source required");
  invariant(CHANNELS.has(record.channel), "approved channel required");
  invariant(isExplicitlyFictional(record), "only explicit .invalid fictional data may enter this rehearsal");
  const noticeStatus = record.notification?.status || "pending";
  invariant(NOTICE_STATES.has(noticeStatus), "recognised owner-notice state required");

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
    ownerNoticeStatus: noticeStatus,
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
    if (!previous) bySubmission.set(handoff.handoffId, handoff);
  }
  return [...bySubmission.values()].sort((a, b) =>
    a.consent.capturedAt.localeCompare(b.consent.capturedAt));
}
