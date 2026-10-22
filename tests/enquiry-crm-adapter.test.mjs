import test from "node:test";
import assert from "node:assert/strict";
import { toFictionalDeliveryHandoff } from "../lib/enquiry-handoff.js";
import {
  buildFictionalCrmEvents,
  toFictionalCrmEvent,
} from "../lib/enquiry-crm-adapter.js";

function fictionalRecord(overrides = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    submissionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    createdAt: "2026-10-20T08:00:01.000Z",
    contactPermissionCapturedAt: "2026-10-20T08:00:00.000Z",
    contactPermission: true,
    marketingConsent: false,
    source: "newton-revenue-site",
    channel: "direct",
    name: "Fictional Test Buyer",
    email: "fictional@example.invalid",
    company: "Synthetic Venue Ltd",
    problem: "Synthetic missed enquiry",
    notification: {
      version: 1,
      status: "pending",
      attempts: 0,
      lastAttemptAt: null,
      deliveredAt: null,
    },
    ...overrides,
  };
}

test("maps canonical handoff to deterministic PII-free CRM event", () => {
  const handoff = toFictionalDeliveryHandoff(fictionalRecord());
  const event = toFictionalCrmEvent(handoff);

  assert.deepEqual(event, {
    schema: "NEWTON_FICTIONAL_CRM_EVENT_V1",
    synthetic: true,
    eventKey: "crm:enquiry:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    eventType: "ENQUIRY_CAPTURED",
    handoffId: "enquiry:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    enquiryRef: "11111111-1111-4111-8111-111111111111",
    attribution: {
      source: "newton-revenue-site",
      channel: "direct",
    },
    consent: {
      purpose: "respond_to_enquiry",
      capturedAt: "2026-10-20T08:00:00.000Z",
      marketing: false,
    },
    ownerNoticeStatus: "pending",
    state: "STAGED_OFFLINE_ONLY",
    customerDelivery: "HOLD",
  });

  const serialized = JSON.stringify(event);
  for (const forbidden of [
    "Fictional Test Buyer",
    "fictional@example.invalid",
    "Synthetic Venue Ltd",
    "Synthetic missed enquiry",
  ]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test("dedupes byte-identical canonical retries", () => {
  const handoff = toFictionalDeliveryHandoff(fictionalRecord());
  const events = buildFictionalCrmEvents([handoff, handoff]);
  assert.equal(events.length, 1);
  assert.equal(events[0].eventKey,
    "crm:enquiry:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
});

test("rejects extra fields at the CRM boundary", () => {
  const handoff = toFictionalDeliveryHandoff(fictionalRecord());
  assert.throws(
    () => toFictionalCrmEvent({ ...handoff, email: "leak@example.invalid" }),
    /exact PII-free canonical handoff fields required/,
  );
});

test("rejects absent enquiry consent or enabled marketing", () => {
  const handoff = toFictionalDeliveryHandoff(fictionalRecord());
  assert.throws(
    () => toFictionalCrmEvent({
      ...handoff,
      consent: { ...handoff.consent, purpose: "marketing" },
    }),
    /consent must be enquiry-response only/,
  );
  assert.throws(
    () => toFictionalCrmEvent({
      ...handoff,
      consent: { ...handoff.consent, marketing: true },
    }),
    /consent must be enquiry-response only/,
  );
});

test("rejects live workflow or released customer delivery", () => {
  const handoff = toFictionalDeliveryHandoff(fictionalRecord());
  assert.throws(
    () => toFictionalCrmEvent({
      ...handoff,
      workflow: { state: "LIVE", customerDelivery: "HOLD" },
    }),
    /offline customer-delivery HOLD/,
  );
  assert.throws(
    () => toFictionalCrmEvent({
      ...handoff,
      workflow: { state: "STAGED_OFFLINE_ONLY", customerDelivery: "READY" },
    }),
    /offline customer-delivery HOLD/,
  );
});

test("rejects divergent retries sharing a CRM event key", () => {
  const first = toFictionalDeliveryHandoff(fictionalRecord());
  const altered = { ...first, source: "enquiry-check" };
  assert.throws(
    () => buildFictionalCrmEvents([first, altered]),
    /conflicting canonical handoffs share one CRM event key/,
  );
});

test("preserves owner-notice integrity across pending, delivered and dead-letter states", () => {
  const pending = toFictionalDeliveryHandoff(fictionalRecord());
  const delivered = toFictionalDeliveryHandoff(fictionalRecord({
    id: "22222222-2222-4222-8222-222222222222",
    submissionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    contactPermissionCapturedAt: "2026-10-20T08:01:00.000Z",
    createdAt: "2026-10-20T08:01:01.000Z",
    notification: {
      version: 1,
      status: "delivered",
      attempts: 1,
      lastAttemptAt: "2026-10-20T08:02:00.000Z",
      deliveredAt: "2026-10-20T08:02:01.000Z",
    },
  }));
  const deadLetter = toFictionalDeliveryHandoff(fictionalRecord({
    id: "33333333-3333-4333-8333-333333333333",
    submissionId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    contactPermissionCapturedAt: "2026-10-20T08:03:00.000Z",
    createdAt: "2026-10-20T08:03:01.000Z",
    notification: {
      version: 1,
      status: "dead-letter",
      attempts: 3,
      lastAttemptAt: "2026-10-20T08:04:00.000Z",
      deliveredAt: null,
    },
  }));

  assert.deepEqual(
    buildFictionalCrmEvents([deadLetter, delivered, pending])
      .map(event => event.ownerNoticeStatus),
    ["pending", "delivered", "dead-letter"],
  );
});


test("rejects uppercase UUID aliases at the CRM boundary", () => {
  const handoff = toFictionalDeliveryHandoff(fictionalRecord({
    id: "abcdefab-cdef-4abc-8def-abcdefabcdef",
    submissionId: "abcdefab-cdef-4abc-8def-abcdefabcdea",
  }));
  assert.throws(
    () => toFictionalCrmEvent({
      ...handoff,
      handoffId: handoff.handoffId.toUpperCase(),
    }),
    /canonical handoff ID required/,
  );
  assert.throws(
    () => toFictionalCrmEvent({
      ...handoff,
      enquiryRef: handoff.enquiryRef.toUpperCase(),
    }),
    /canonical enquiry reference required/,
  );
});
