// Privacy-safe canonical mapping for TASK011 fictional distribution rehearsals.
// This module never sends, publishes or writes customer data.
const SOURCES = new Set(["ai-profit-brief", "newton-reset", "autopilot-8", "enquiry-check", "newton-revenue-site"]);
const CHANNELS = new Set(["facebook", "instagram", "youtube", "search", "partner", "direct"]);
const NOTICE_STATES = new Set(["pending", "delivered", "dead-letter"]);
const MAX_NOTICE_ATTEMPTS = 3;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function invariant(ok, message) {
  if (!ok) throw new Error("TASK011 HOLD: " + message);
}
function exactKeys(value, keys) {
  return value && !Array.isArray(value) && typeof value === "object" &&
    Object.keys(value).length === keys.length &&
    Object.keys(value).every(key => keys.includes(key));
}
function validHandoffId(value) {
  return typeof value === "string" && value.startsWith("enquiry:") &&
    UUID.test(value.slice("enquiry:".length));
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
  invariant(exactKeys(handoff, [
    "schema", "synthetic", "handoffId", "enquiryRef", "source", "channel",
    "consent", "ownerNotice", "workflow",
  ]), "exact PII-free canonical handoff fields required");
  invariant(validHandoffId(handoff.handoffId),
    "canonical handoff ID required");
  invariant(SOURCES.has(handoff.source), "canonical handoff source required");
  invariant(CHANNELS.has(handoff.channel), "canonical handoff channel required");
  invariant(exactKeys(handoff.consent, ["purpose", "capturedAt", "marketing"]) &&
    handoff.consent.purpose === "respond_to_enquiry" &&
    validIso(handoff.consent.capturedAt) &&
    handoff.consent.marketing === false,
    "canonical consent evidence required");
  invariant(exactKeys(handoff.ownerNotice, [
    "version", "status", "attempts", "attemptLimit", "lastAttemptAt",
    "deliveredAt", "nextAction",
  ]), "exact owner-notice evidence required");
  invariant(handoff.ownerNotice.version === 1 &&
    handoff.ownerNotice.status === "delivered" &&
    Number.isInteger(handoff.ownerNotice.attempts) &&
    handoff.ownerNotice.attempts >= 1 &&
    handoff.ownerNotice.attempts <= MAX_NOTICE_ATTEMPTS &&
    handoff.ownerNotice.attemptLimit === MAX_NOTICE_ATTEMPTS &&
    validIso(handoff.ownerNotice.lastAttemptAt) &&
    validIso(handoff.ownerNotice.deliveredAt) &&
    Date.parse(handoff.ownerNotice.deliveredAt) >=
      Date.parse(handoff.ownerNotice.lastAttemptAt) &&
    handoff.ownerNotice.nextAction === "NONE",
    "delivered owner-notice evidence required before acknowledgement");
  invariant(exactKeys(handoff.workflow, ["state", "customerDelivery"]),
    "exact offline workflow evidence required");
  invariant(UUID.test(handoff.enquiryRef || ""), "canonical enquiry reference required");
  invariant(handoff.ownerNotice?.status === "delivered" && handoff.ownerNotice?.nextAction === "NONE",
    "delivered owner-notice evidence required before acknowledgement");
  invariant(handoff.workflow?.state === "STAGED_OFFLINE_ONLY" &&
    handoff.workflow?.customerDelivery === "HOLD",
    "offline delivery HOLD must remain intact");

  invariant(acknowledgement && !Array.isArray(acknowledgement) &&
    typeof acknowledgement === "object", "acknowledgement evidence required");
  const allowed = new Set(["version", "handoffId", "enquiryRef", "consumer", "ownerNoticeDeliveredAt", "acknowledgedAt"]);
  invariant(Object.keys(acknowledgement).every(key => allowed.has(key)),
    "unapproved acknowledgement field");
  invariant(acknowledgement.version === 1, "acknowledgement schema version 1 required");
  invariant(acknowledgement.handoffId === handoff.handoffId,
    "acknowledgement handoff ID mismatch");
  invariant(acknowledgement.enquiryRef === handoff.enquiryRef,
    "acknowledgement enquiry reference mismatch");
  invariant(acknowledgement.consumer === "fictional-delivery-rehearsal",
    "approved fictional acknowledgement consumer required");
  invariant(validIso(acknowledgement.ownerNoticeDeliveredAt),
    "canonical owner-notice delivery timestamp required in acknowledgement");
  invariant(acknowledgement.ownerNoticeDeliveredAt === handoff.ownerNotice.deliveredAt,
    "acknowledgement owner-notice delivery mismatch");
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
    ownerNoticeDeliveredAt: acknowledgement.ownerNoticeDeliveredAt,
    acknowledgedAt: acknowledgement.acknowledgedAt,
    state: "ACKNOWLEDGED_OFFLINE",
    customerDelivery: "HOLD",
  });
}


export function reconcileFictionalHandoffReceipts(handoffs, receipts) {
  invariant(Array.isArray(handoffs), "canonical handoff array required");
  invariant(Array.isArray(receipts), "acknowledgement receipt array required");
  const expected = new Map();
  for (const handoff of handoffs) {
    invariant(handoff && typeof handoff === "object" && !Array.isArray(handoff),
      "canonical handoff required for reconciliation");
    invariant(!expected.has(handoff.handoffId), "duplicate canonical handoff ID");
    expected.set(handoff.handoffId, handoff);
  }
  const seen = new Set();
  const receiptIds = [];
  const receiptKeys = [
    "schema", "synthetic", "receiptId", "handoffId", "enquiryRef", "consumer",
    "ownerNoticeDeliveredAt", "acknowledgedAt", "state", "customerDelivery",
  ];
  for (const receipt of receipts) {
    invariant(exactKeys(receipt, receiptKeys), "exact acknowledgement receipt fields required");
    invariant(!seen.has(receipt.handoffId), "duplicate acknowledgement receipt");
    const handoff = expected.get(receipt.handoffId);
    invariant(handoff, "acknowledgement has no canonical handoff");
    const rebuilt = acknowledgeFictionalHandoff(handoff, {
      version: 1,
      handoffId: receipt.handoffId,
      enquiryRef: receipt.enquiryRef,
      consumer: receipt.consumer,
      ownerNoticeDeliveredAt: receipt.ownerNoticeDeliveredAt,
      acknowledgedAt: receipt.acknowledgedAt,
    });
    invariant(JSON.stringify(rebuilt) === JSON.stringify(receipt),
      "acknowledgement receipt does not match canonical handoff");
    seen.add(receipt.handoffId);
    receiptIds.push(receipt.receiptId);
  }
  invariant(seen.size === expected.size, "missing acknowledgement receipt");
  return Object.freeze({
    schema: "NEWTON_FICTIONAL_HANDOFF_BATCH_V1",
    synthetic: true,
    state: "RECONCILED_OFFLINE",
    handoffCount: expected.size,
    receiptIds: Object.freeze(receiptIds.sort()),
    customerDelivery: "HOLD",
  });
}
