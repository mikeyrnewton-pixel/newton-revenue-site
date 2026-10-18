import test from "node:test";
import assert from "node:assert/strict";
import {onRequestPost as submit} from "../functions/api/enquiry.js";
import {
  toFictionalDeliveryHandoff,
  buildCanonicalFictionalHandoffs,
} from "../lib/enquiry-handoff.js";

const ORIGIN = "https://newton-revenue-site.pages.dev";
const SUBMISSION_ID = "11111111-2222-4333-8444-555555555555";

class MemoryKV {
  data = new Map();
  async put(key, value) { this.data.set(key, String(value)); }
  async get(key, format) {
    const value = this.data.get(key);
    if (value === undefined) return null;
    return format === "json" ? JSON.parse(value) : value;
  }
}
function request() {
  return new Request(ORIGIN + "/api/enquiry", {
    method: "POST",
    headers: {"Content-Type": "application/json", Origin: ORIGIN},
    body: JSON.stringify({
      submissionId: SUBMISSION_ID,
      name: "SYNTHETIC TASK011",
      company: "FICTIONAL REPAIR CO",
      email: "task011@example.invalid",
      problem: "FICTIONAL: route one consented enquiry into an offline delivery rehearsal",
      contactPermission: true,
      source: "enquiry-check",
      channel: "direct",
      website: "",
    }),
  });
}

test("intake provenance supports one deduped PII-free fictional handoff", async () => {
  const kv = new MemoryKV();
  const env = {LEADS: kv};
  const first = await submit({request: request(), env});
  assert.equal(first.status, 201);
  const firstBody = await first.json();
  const second = await submit({request: request(), env});
  assert.equal(second.status, 200);
  assert.equal((await second.json()).reference, firstBody.reference);

  const leadKeys = [...kv.data.keys()].filter(key => key.startsWith("lead:"));
  assert.equal(leadKeys.length, 1, "one canonical lead after retry");
  const record = await kv.get(leadKeys[0], "json");
  assert.equal(record.submissionId, SUBMISSION_ID);
  assert.equal(record.contactPermission, true);
  assert.equal(record.contactPermissionCapturedAt, record.createdAt);

  const handoffs = buildCanonicalFictionalHandoffs([record, {...record}]);
  assert.equal(handoffs.length, 1, "same submission is handed off once");
  const handoff = handoffs[0];
  assert.equal(handoff.schema, "NEWTON_FICTIONAL_DISTRIBUTION_V1");
  assert.equal(handoff.handoffId, "enquiry:" + SUBMISSION_ID);
  assert.equal(handoff.workflow.state, "STAGED_OFFLINE_ONLY");
  assert.equal(handoff.workflow.customerDelivery, "HOLD");
  assert.equal(handoff.consent.purpose, "respond_to_enquiry");
  assert.equal(handoff.consent.marketing, false);
  assert.deepEqual(handoff.ownerNotice, {version: 1, status: "pending", attempts: 0});

  const serialized = JSON.stringify(handoff);
  for (const privateValue of [record.name, record.company, record.email, record.problem]) {
    assert.equal(serialized.includes(privateValue), false, "handoff must omit customer PII");
  }
});

test("handoff fails closed on missing consent, real-looking data or dedupe conflict", () => {
  const base = {
    id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    submissionId: SUBMISSION_ID,
    createdAt: "2026-10-17T20:00:00.000Z",
    contactPermissionCapturedAt: "2026-10-17T20:00:00.000Z",
    source: "enquiry-check",
    channel: "direct",
    name: "SYNTHETIC TASK011",
    company: "FICTIONAL REPAIR CO",
    email: "task011@example.invalid",
    problem: "FICTIONAL offline delivery rehearsal",
    contactPermission: true,
    marketingConsent: false,
    notification: {version: 1, status: "pending", attempts: 0},
  };
  assert.throws(() => toFictionalDeliveryHandoff({...base, contactPermission: false}), /contact permission/);
  assert.throws(() => toFictionalDeliveryHandoff({...base, createdAt: "2026-02-30T20:00:00.000Z"}), /canonical UTC creation timestamp/);
  assert.throws(() => toFictionalDeliveryHandoff({...base, contactPermissionCapturedAt: "2026-10-17T20:00:01.000Z"}), /consent capture cannot follow record creation/);
  assert.throws(() => toFictionalDeliveryHandoff({...base, email: "person@example.com"}), /only explicit/);
  assert.throws(() => toFictionalDeliveryHandoff({...base, notification: undefined}), /owner-notice evidence/);
  assert.throws(() => toFictionalDeliveryHandoff({...base, notification: {version: 2, status: "pending", attempts: 0}}), /schema version 1/);
  assert.throws(() => toFictionalDeliveryHandoff({...base, notification: {version: 1, status: "pending", attempts: -1}}), /non-negative owner-notice attempts/);
  assert.throws(() => buildCanonicalFictionalHandoffs([
    base,
    {...base, id: "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff"},
  ]), /conflicting records/);
  assert.throws(() => buildCanonicalFictionalHandoffs([
    base,
    {...base, channel: "search"},
  ]), /divergent records/);
});
