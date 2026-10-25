import test from "node:test";
import assert from "node:assert/strict";
import {onRequestPost as submit} from "../functions/api/enquiry.js";
import {
  toFictionalDeliveryHandoff,
  buildCanonicalFictionalHandoffs,
  acknowledgeFictionalHandoff,
  reconcileFictionalHandoffReceipts,
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
function request(overrides = {}) {
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
      ...overrides,
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
  assert.deepEqual(handoff.ownerNotice, {
    version: 1,
    status: "pending",
    attempts: 0,
    attemptLimit: 3,
    lastAttemptAt: null,
    deliveredAt: null,
    nextAction: "RETRY_OWNER_NOTICE",
  });

  const serialized = JSON.stringify(handoff);
  for (const privateValue of [record.name, record.company, record.email, record.problem]) {
    assert.equal(serialized.includes(privateValue), false, "handoff must omit customer PII");
  }
});

test("equal consent timestamps produce one deterministic manifest order across retries", () => {
  const common = {
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
  const first = {
    ...common,
    id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    submissionId: "11111111-2222-4333-8444-555555555555",
  };
  const second = {
    ...common,
    id: "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff",
    submissionId: "00000000-1111-4222-8333-444444444444",
  };
  const forward = buildCanonicalFictionalHandoffs([first, second]);
  const retried = buildCanonicalFictionalHandoffs([second, first]);

  assert.deepEqual(retried, forward, "input order must not change the canonical manifest");
  assert.deepEqual(forward.map(item => item.handoffId), [
    "enquiry:00000000-1111-4222-8333-444444444444",
    "enquiry:11111111-2222-4333-8444-555555555555",
  ]);
});



test("same submission ID rejects divergent retry payload without another lead", async () => {
  const kv = new MemoryKV();
  const env = {LEADS: kv};
  const first = await submit({request: request(), env});
  assert.equal(first.status, 201);
  const changed = await submit({
    request: request({problem: "FICTIONAL: materially different offline rehearsal"}),
    env,
  });
  assert.equal(changed.status, 409);
  assert.match((await changed.json()).error, /different enquiry/);
  assert.equal([...kv.data.keys()].filter(key => key.startsWith("lead:")).length, 1);
  const receipt = JSON.parse(await kv.get("receipt:" + SUBMISSION_ID));
  assert.equal(receipt.version, 1);
  assert.match(receipt.fingerprint, /^[0-9a-f]{64}$/);
  assert.equal(Object.keys(receipt).sort().join(","), "fingerprint,reference,version");
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
  assert.throws(() => toFictionalDeliveryHandoff({
    ...base, id: "00000000-0000-0000-0000-000000000000",
  }), /valid enquiry reference/);
  assert.throws(() => toFictionalDeliveryHandoff({
    ...base, submissionId: "00000000-0000-0000-0000-000000000000",
  }), /submission ID required/);
  assert.throws(() => toFictionalDeliveryHandoff({...base, contactPermission: false}), /contact permission/);
  assert.throws(() => toFictionalDeliveryHandoff({...base, createdAt: "2026-02-30T20:00:00.000Z"}), /canonical UTC creation timestamp/);
  assert.throws(() => toFictionalDeliveryHandoff({...base, contactPermissionCapturedAt: "2026-10-17T20:00:01.000Z"}), /consent capture cannot follow record creation/);
  assert.throws(() => toFictionalDeliveryHandoff({...base, email: "person@example.com"}), /only explicit/);
  assert.throws(() => toFictionalDeliveryHandoff({...base, notification: undefined}), /owner-notice evidence/);
  assert.throws(() => toFictionalDeliveryHandoff({...base, notification: {version: 2, status: "pending", attempts: 0}}), /schema version 1/);
  assert.throws(() => toFictionalDeliveryHandoff({...base, notification: {version: 1, status: "pending", attempts: -1}}), /non-negative owner-notice attempts/);
  assert.throws(() => toFictionalDeliveryHandoff({...base, notification: {version: 1, status: "pending", attempts: 3}}), /retry budget must be dead-lettered/);
  assert.throws(() => toFictionalDeliveryHandoff({...base, notification: {version: 1, status: "dead-letter", attempts: 2}}), /requires an exhausted retry budget/);
  assert.throws(() => toFictionalDeliveryHandoff({...base, notification: {version: 1, status: "dead-letter", attempts: 4}}), /exceed the retry budget/);
  assert.throws(() => toFictionalDeliveryHandoff({...base, notification: {version: 1, status: "delivered", attempts: 0}}), /terminal owner-notice state/);
  assert.throws(() => toFictionalDeliveryHandoff({...base, notification: {version: 1, status: "pending", attempts: 1}}), /attempt timestamp/);
  assert.throws(() => toFictionalDeliveryHandoff({...base, notification: {
    version: 1, status: "pending", attempts: 0, lastAttemptAt: "2026-10-17T20:00:01.000Z",
  }}), /unattempted owner notice/);
  assert.throws(() => toFictionalDeliveryHandoff({...base, notification: {
    version: 1, status: "pending", attempts: 1, lastAttemptAt: "2026-10-17T19:59:59.000Z",
  }}), /attempt cannot predate record creation/);
  assert.throws(() => toFictionalDeliveryHandoff({...base, notification: {
    version: 1, status: "pending", attempts: 1,
    lastAttemptAt: "2026-10-17T20:00:01.000Z", deliveredAt: "2026-10-17T20:00:02.000Z",
  }}), /undelivered owner notice/);
  assert.throws(() => toFictionalDeliveryHandoff({...base, notification: {
    version: 1, status: "delivered", attempts: 1,
    lastAttemptAt: "2026-10-17T20:00:02.000Z", deliveredAt: "2026-10-17T20:00:01.000Z",
  }}), /delivery cannot predate its last attempt/);
  const delivered = toFictionalDeliveryHandoff({...base, notification: {
    version: 1, status: "delivered", attempts: 1,
    lastAttemptAt: "2026-10-17T20:00:01.000Z", deliveredAt: "2026-10-17T20:00:01.000Z",
  }});
  assert.equal(delivered.ownerNotice.nextAction, "NONE");
  assert.equal(delivered.ownerNotice.attemptLimit, 3);
  assert.equal(delivered.ownerNotice.lastAttemptAt, "2026-10-17T20:00:01.000Z");
  assert.equal(delivered.ownerNotice.deliveredAt, "2026-10-17T20:00:01.000Z");
  const deadLetter = toFictionalDeliveryHandoff({...base, notification: {
    version: 1, status: "dead-letter", attempts: 3,
    lastAttemptAt: "2026-10-17T20:03:00.000Z", failure: "missing_ack",
  }});
  assert.equal(deadLetter.ownerNotice.nextAction, "MANUAL_OWNER_NOTICE_REVIEW");
  assert.equal(deadLetter.ownerNotice.lastAttemptAt, "2026-10-17T20:03:00.000Z");
  assert.equal(deadLetter.ownerNotice.deliveredAt, null);
  assert.throws(() => buildCanonicalFictionalHandoffs([
    base,
    {...base, id: "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff"},
  ]), /conflicting records/);
  assert.throws(() => buildCanonicalFictionalHandoffs([
    base,
    {...base, channel: "search"},
  ]), /divergent records/);
});


test("creates one deterministic PII-free offline acknowledgement and fails closed on mismatch", () => {
  const record = {
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
    notification: {
      version: 1,
      status: "delivered",
      attempts: 1,
      lastAttemptAt: "2026-10-17T20:01:00.000Z",
      deliveredAt: "2026-10-17T20:01:01.000Z",
    },
  };
  const handoff = toFictionalDeliveryHandoff(record);
  const evidence = {
    version: 1,
    handoffId: handoff.handoffId,
    enquiryRef: handoff.enquiryRef,
    consumer: "fictional-delivery-rehearsal",
    ownerNoticeDeliveredAt: "2026-10-17T20:01:01.000Z",
    acknowledgedAt: "2026-10-17T20:01:02.000Z",
  };
  const first = acknowledgeFictionalHandoff(handoff, evidence);
  const retry = acknowledgeFictionalHandoff(handoff, {...evidence});
  assert.deepEqual(retry, first, "same evidence produces one deterministic receipt");
  assert.deepEqual(first, {
    schema: "NEWTON_FICTIONAL_HANDOFF_ACK_V1",
    synthetic: true,
    receiptId: "enquiry:" + SUBMISSION_ID + ":" + record.id,
    handoffId: "enquiry:" + SUBMISSION_ID,
    enquiryRef: record.id,
    consumer: "fictional-delivery-rehearsal",
    ownerNoticeDeliveredAt: "2026-10-17T20:01:01.000Z",
    acknowledgedAt: "2026-10-17T20:01:02.000Z",
    state: "ACKNOWLEDGED_OFFLINE",
    customerDelivery: "HOLD",
  });
  const serialized = JSON.stringify(first);
  for (const privateValue of [record.name, record.company, record.email, record.problem]) {
    assert.equal(serialized.includes(privateValue), false, "receipt must omit customer PII");
  }

  const withPii = structuredClone(handoff);
  withPii.email = "task011@example.invalid";
  assert.throws(() => acknowledgeFictionalHandoff(withPii, evidence),
    /exact PII-free canonical handoff fields/);
  const badHandoffId = structuredClone(handoff);
  badHandoffId.handoffId = "enquiry:00000000-0000-0000-0000-000000000000";
  assert.throws(() => acknowledgeFictionalHandoff(badHandoffId, {
    ...evidence, handoffId: badHandoffId.handoffId,
  }), /canonical handoff ID/);
  const badSource = structuredClone(handoff);
  badSource.source = "unapproved-source";
  assert.throws(() => acknowledgeFictionalHandoff(badSource, evidence),
    /canonical handoff source/);
  const badConsent = structuredClone(handoff);
  badConsent.consent.marketing = true;
  assert.throws(() => acknowledgeFictionalHandoff(badConsent, evidence),
    /canonical consent evidence/);
  const badNoticeShape = structuredClone(handoff);
  badNoticeShape.ownerNotice.failure = "secret detail";
  assert.throws(() => acknowledgeFictionalHandoff(badNoticeShape, evidence),
    /exact owner-notice evidence/);
  const badAttemptLimit = structuredClone(handoff);
  badAttemptLimit.ownerNotice.attemptLimit = 99;
  assert.throws(() => acknowledgeFictionalHandoff(badAttemptLimit, evidence),
    /delivered owner-notice evidence/);
  const badWorkflow = structuredClone(handoff);
  badWorkflow.workflow.unapproved = true;
  assert.throws(() => acknowledgeFictionalHandoff(badWorkflow, evidence),
    /exact offline workflow evidence/);

  const pending = toFictionalDeliveryHandoff({
    ...record,
    notification: {version: 1, status: "pending", attempts: 0},
  });
  assert.throws(() => acknowledgeFictionalHandoff(pending, evidence),
    /delivered owner-notice evidence/);
  assert.throws(() => acknowledgeFictionalHandoff(handoff, {
    ...evidence, enquiryRef: "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff",
  }), /enquiry reference mismatch/);
  assert.throws(() => acknowledgeFictionalHandoff(handoff, {
    ...evidence, acknowledgedAt: "2026-10-17T20:00:59.000Z",
  }), /cannot predate owner-notice delivery/);
  assert.throws(() => acknowledgeFictionalHandoff(handoff, {
    ...evidence, ownerNoticeDeliveredAt: "2026-10-17T20:01:00.000Z",
  }), /owner-notice delivery mismatch/);
  const {ownerNoticeDeliveredAt, ...missingNoticeBinding} = evidence;
  assert.throws(() => acknowledgeFictionalHandoff(handoff, missingNoticeBinding),
    /owner-notice delivery timestamp required/);
  assert.throws(() => acknowledgeFictionalHandoff(handoff, {
    ...evidence, email: "task011@example.invalid",
  }), /unapproved acknowledgement field/);
});


test("reconciles exactly one validated receipt per canonical handoff and holds incomplete batches", () => {
  const base = {
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
    notification: {
      version: 1,
      status: "delivered",
      attempts: 1,
      lastAttemptAt: "2026-10-17T20:01:00.000Z",
      deliveredAt: "2026-10-17T20:01:01.000Z",
    },
  };
  const handoffs = [
    toFictionalDeliveryHandoff({
      ...base,
      id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      submissionId: SUBMISSION_ID,
    }),
    toFictionalDeliveryHandoff({
      ...base,
      id: "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff",
      submissionId: "00000000-1111-4222-8333-444444444444",
    }),
  ];
  const receipts = handoffs.map((handoff, index) =>
    acknowledgeFictionalHandoff(handoff, {
      version: 1,
      handoffId: handoff.handoffId,
      enquiryRef: handoff.enquiryRef,
      consumer: "fictional-delivery-rehearsal",
      ownerNoticeDeliveredAt: handoff.ownerNotice.deliveredAt,
      acknowledgedAt: `2026-10-17T20:01:0${index + 2}.000Z`,
    }));
  const batch = reconcileFictionalHandoffReceipts(handoffs, receipts);
  assert.deepEqual(batch, {
    schema: "NEWTON_FICTIONAL_HANDOFF_BATCH_V1",
    synthetic: true,
    state: "RECONCILED_OFFLINE",
    handoffCount: 2,
    receiptIds: [...receipts.map(item => item.receiptId)].sort(),
    customerDelivery: "HOLD",
  });
  assert.throws(() => reconcileFictionalHandoffReceipts(handoffs, receipts.slice(0, 1)),
    /missing acknowledgement receipt/);
  assert.throws(() => reconcileFictionalHandoffReceipts(handoffs, [receipts[0], receipts[0]]),
    /duplicate acknowledgement receipt/);
  const extra = {...receipts[0], handoffId: "enquiry:99999999-8888-4777-8666-555555555555"};
  assert.throws(() => reconcileFictionalHandoffReceipts(handoffs, [extra, receipts[1]]),
    /no canonical handoff/);
  const forged = {...receipts[0], receiptId: "forged-receipt-id"};
  assert.throws(() => reconcileFictionalHandoffReceipts(handoffs, [forged, receipts[1]]),
    /does not match canonical handoff/);
  const pii = {...receipts[0], email: "task011@example.invalid"};
  assert.throws(() => reconcileFictionalHandoffReceipts(handoffs, [pii, receipts[1]]),
    /exact acknowledgement receipt fields/);
});


test("rejects uppercase UUID aliases before canonical handoff", () => {
  const record = {
    id: "abcdefab-cdef-4abc-8def-abcdefabcdef",
    submissionId: "abcdefab-cdef-4abc-8def-abcdefabcdea",
    createdAt: "2026-10-20T19:00:01.000Z",
    contactPermissionCapturedAt: "2026-10-20T19:00:00.000Z",
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
  };
  assert.throws(
    () => toFictionalDeliveryHandoff({...record, id: record.id.toUpperCase()}),
    /valid enquiry reference required/,
  );
  assert.throws(
    () => toFictionalDeliveryHandoff({
      ...record,
      submissionId: record.submissionId.toUpperCase(),
    }),
    /submission ID required for canonical dedupe/,
  );
});

test("A retry receipt with missing original lead cannot claim success", async () => {
  const kv = new MemoryKV();
  const first = await submit({request: request(), env: {LEADS: kv}});
  assert.equal(first.status, 201);
  const {reference} = await first.json();
  kv.data.delete("lead:" + reference); // synthetic simulation of missing/expired KV record
  const replay = await submit({request: request(), env: {LEADS: kv}});
  assert.equal(replay.status, 503);
  const body = await replay.json();
  assert.equal(body.received, undefined);
  assert.match(body.error, /Could not validate the previous enquiry/);
  assert.equal([...kv.data.keys()].filter(key => key.startsWith("lead:")).length, 0);
});

test("A retry receipt cannot acknowledge a corrupted original lead", async () => {
  const kv = new MemoryKV();
  const first = await submit({request: request(), env: {LEADS: kv}});
  assert.equal(first.status, 201);
  const {reference} = await first.json();
  const original = await kv.get("lead:" + reference, "json");
  // Same submission UUID and valid old receipt, but the original data is different.
  kv.data.set("lead:" + reference, JSON.stringify({...original, email: "other@example.invalid"}));
  const replay = await submit({request: request(), env: {LEADS: kv}});
  assert.equal(replay.status, 503);
  const body = await replay.json();
  assert.equal(body.received, undefined);
  assert.equal(JSON.stringify(body).includes("other@example.invalid"), false);
  assert.equal([...kv.data.keys()].filter(key => key.startsWith("lead:")).length, 1);
});

test("Case-only changes in the same consented email remain a valid retry", async () => {
  const kv = new MemoryKV();
  const first = await submit({
    request: request({email: "TASK011@EXAMPLE.INVALID"}), env: {LEADS: kv},
  });
  assert.equal(first.status, 201);
  const {reference} = await first.json();
  const replay = await submit({
    request: request({email: "task011@example.invalid"}), env: {LEADS: kv},
  });
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).reference, reference);
  assert.equal([...kv.data.keys()].filter(key => key.startsWith("lead:")).length, 1);
});

test("legacy plain-UUID receipt preserves old user retry only if stored lead matches", async () => {
  const kv = new MemoryKV();
  const first = await submit({request: request(), env: {LEADS: kv}});
  assert.equal(first.status, 201);
  const {reference} = await first.json();
  // Model the previous public handler's 24-hour KV receipt and stored record.
  const oldRecord = await kv.get("lead:" + reference, "json");
  delete oldRecord.submissionId;
  delete oldRecord.contactPermissionCapturedAt;
  kv.data.set("lead:" + reference, JSON.stringify(oldRecord));
  kv.data.set("receipt:" + SUBMISSION_ID, reference);
  const unchanged = await submit({request: request(), env: {LEADS: kv}});
  assert.equal(unchanged.status, 200);
  assert.equal((await unchanged.json()).reference, reference);
  const different = await submit({
    request: request({problem: "CHANGED request, same legacy UUID"}), env: {LEADS: kv},
  });
  assert.equal(different.status, 503);
  assert.equal((await different.json()).received, undefined);
  assert.equal([...kv.data.keys()].filter(key => key.startsWith("lead:")).length, 1);
});

test("legacy plain-UUID receipt without original record fails closed", async () => {
  const kv = new MemoryKV();
  const first = await submit({request: request(), env: {LEADS: kv}});
  const {reference} = await first.json();
  kv.data.set("receipt:" + SUBMISSION_ID, reference);
  kv.data.delete("lead:" + reference);
  const replay = await submit({request: request(), env: {LEADS: kv}});
  assert.equal(replay.status, 503);
  assert.equal((await replay.json()).received, undefined);
});
