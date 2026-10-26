import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost as submit } from '../functions/api/enquiry.js';
import { onRequestPost as erase, onRequest as other } from '../functions/api/delete-lead.js';
import { deliverOwnerNotice } from '../lib/owner-notifications.js';

const TOKEN = 'synthetic-owner-token-at-least-24-characters';
const SUBMISSION = '11111111-2222-4333-8444-555555555555';
const ORIGIN = 'https://newton-revenue.pages.dev';

class MemoryKV {
  constructor() { this.values = new Map(); this.deleted = []; this.failOnce = null; }
  async put(key, value, options) {
    assert.ok(options?.expirationTtl || options?.expiration);
    this.values.set(key, value);
  }
  async get(key, format) {
    const value = this.values.get(key);
    if (value == null) return null;
    return format === 'json' ? JSON.parse(value) : value;
  }
  async delete(key) {
    this.deleted.push(key);
    if (this.failOnce === key) {
      this.failOnce = null;
      throw Error('synthetic KV deletion interruption');
    }
    this.values.delete(key);
  }
}

const deletionRequest = (leadId, token = TOKEN) => new Request(ORIGIN + '/api/delete-lead', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
  body: JSON.stringify({ leadId }),
});

test('private erasure removes receipt, notice and lead in retry-safe order', async () => {
  const kv = new MemoryKV();
  const enquiry = new Request(ORIGIN + '/api/enquiry', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    body: JSON.stringify({
      submissionId: SUBMISSION,
      name: 'FICTIONAL PERSON',
      company: 'EXAMPLE INVALID',
      email: 'delete-test@example.invalid',
      problem: 'Synthetic erasure acceptance case only',
      contactPermission: true,
    }),
  });
  const submitted = await submit({ request: enquiry, env: { LEADS: kv } });
  assert.equal(submitted.status, 201);
  const { reference } = await submitted.json();
  const stored = await kv.get('lead:' + reference, 'json');
  assert.equal(stored.submissionId, SUBMISSION);
  kv.values.set('notice:' + reference, JSON.stringify({ version: 1, status: 'pending' }));

  assert.equal((await erase({ request: deletionRequest(reference, ''), env: {
    LEADS: kv, ADMIN_TOKEN: TOKEN,
  } })).status, 401);
  assert.equal(kv.deleted.length, 0);

  // If ancillary deletion is interrupted, the lead remains so the same
  // authorised request can finish without losing the receipt relationship.
  kv.failOnce = 'notice:' + reference;
  const interrupted = await erase({ request: deletionRequest(reference), env: {
    LEADS: kv, ADMIN_TOKEN: TOKEN,
  } });
  assert.equal(interrupted.status, 503);
  assert.equal(kv.values.has('receipt:' + SUBMISSION), false);
  assert.equal(kv.values.has('notice:' + reference), true);
  assert.equal(kv.values.has('lead:' + reference), true);

  const completed = await erase({ request: deletionRequest(reference), env: {
    LEADS: kv, ADMIN_TOKEN: TOKEN,
  } });
  assert.equal(completed.status, 200);
  assert.deepEqual(await completed.json(), {
    ok: true, deleted: true, reference, receiptRemoved: true,
  });
  assert.equal(kv.values.has('receipt:' + SUBMISSION), false);
  assert.equal(kv.values.has('notice:' + reference), false);
  assert.equal(kv.values.has('lead:' + reference), false);
  assert.deepEqual(kv.deleted, [
    'receipt:' + SUBMISSION, 'notice:' + reference,
    'receipt:' + SUBMISSION, 'notice:' + reference, 'lead:' + reference,
  ]);
  const submissionTombstone = await kv.get('erased-submission:' + SUBMISSION, 'json');
  assert.equal(submissionTombstone.erased, true);

  // Simulate a lost HTTP success response: the same authorised erasure must
  // acknowledge the valid tombstone without recreating or deleting anything.
  const deletesAfterCompletion = [...kv.deleted];
  const repeated = await erase({ request: deletionRequest(reference), env: {
    LEADS: kv, ADMIN_TOKEN: TOKEN,
  } });
  assert.equal(repeated.status, 200);
  assert.deepEqual(await repeated.json(), {
    ok: true, deleted: true, reference, alreadyDeleted: true,
  });
  assert.deepEqual(kv.deleted, deletesAfterCompletion);
  assert.equal(kv.values.has('lead:' + reference), false);

  const staleRetry = new Request(ORIGIN + '/api/enquiry', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    body: JSON.stringify({
      submissionId: SUBMISSION,
      name: 'FICTIONAL PERSON',
      company: 'EXAMPLE INVALID',
      email: 'delete-test@example.invalid',
      problem: 'Synthetic erasure acceptance case only',
      contactPermission: true,
    }),
  });
  const blocked = await submit({ request: staleRetry, env: { LEADS: kv } });
  assert.equal(blocked.status, 410);
  assert.equal((await blocked.json()).error,
    'This enquiry was erased. Refresh before submitting a new enquiry.');
  assert.equal([...kv.values.keys()].filter(key => key.startsWith('lead:')).length, 0);
});

test('erasure validates identity and rejects other methods', async () => {
  const kv = new MemoryKV();
  assert.equal((await erase({ request: deletionRequest('not-a-lead'), env: {
    LEADS: kv, ADMIN_TOKEN: TOKEN,
  } })).status, 400);
  assert.equal((await other()).status, 405);
});


test('erasure tombstone prevents an in-flight owner notice from recreating metadata', async () => {
  const kv = new MemoryKV();
  const leadId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  const record = {
    id: leadId,
    submissionId: SUBMISSION,
    createdAt: new Date().toISOString(),
    source: 'enquiry-check',
    notification: { version: 1, status: 'pending', attempts: 0 },
  };
  kv.values.set('lead:' + leadId, JSON.stringify(record));
  kv.values.set('receipt:' + SUBMISSION, leadId);

  let fetchStarted;
  const started = new Promise(resolve => { fetchStarted = resolve; });
  let releaseFetch;
  const release = new Promise(resolve => { releaseFetch = resolve; });
  const delivery = deliverOwnerNotice(record, {
    LEADS: kv,
    OWNER_NOTICE_URL: 'https://script.google.com/macros/s/synthetic-erasure-race/exec',
    OWNER_NOTICE_TOKEN: 'synthetic-notice-token-at-least-32-characters',
  }, async () => {
    fetchStarted();
    await release;
    return Response.json({ ok: true, leadId });
  });

  await started;
  const deleted = await erase({ request: deletionRequest(leadId), env: {
    LEADS: kv, ADMIN_TOKEN: TOKEN,
  } });
  assert.equal(deleted.status, 200);
  releaseFetch();
  assert.equal(await delivery, 'erased');
  assert.equal(kv.values.has('notice:' + leadId), false);
  assert.equal(kv.values.has('lead:' + leadId), false);
  const tombstone = await kv.get('erased:' + leadId, 'json');
  assert.equal(tombstone.erased, true);
  assert.deepEqual(Object.keys(tombstone).sort(), ['erased', 'erasedAt', 'version']);
});


test('erasure retry trusts only a complete non-PII tombstone', async () => {
  const kv = new MemoryKV();
  const leadId = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';

  for (const malformed of [
    { version: 1, erased: true },
    { version: 1, erased: true, erasedAt: 'not-a-date' },
    { version: 1, erased: true, erasedAt: new Date().toISOString(), leak: 'customer' },
  ]) {
    kv.values.set('erased:' + leadId, JSON.stringify(malformed));
    const response = await erase({ request: deletionRequest(leadId), env: {
      LEADS: kv, ADMIN_TOKEN: TOKEN,
    } });
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: 'Lead not found.' });
  }

  assert.equal(kv.deleted.length, 0);
});


test('erasure retry rejects stale, future and non-canonical tombstone dates', async () => {
  const kv = new MemoryKV();
  const leadId = 'cccccccc-dddd-4eee-8fff-aaaaaaaaaaaa';
  const now = Date.now();
  const invalidDates = [
    new Date(now - (31 * 24 * 60 * 60 * 1000)).toISOString(),
    new Date(now + (60 * 60 * 1000)).toISOString(),
    new Date(now).toUTCString(),
  ];

  for (const erasedAt of invalidDates) {
    kv.values.set('erased:' + leadId, JSON.stringify({
      version: 1, erased: true, erasedAt,
    }));
    const response = await erase({ request: deletionRequest(leadId), env: {
      LEADS: kv, ADMIN_TOKEN: TOKEN,
    } });
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: 'Lead not found.' });
  }

  assert.equal(kv.deleted.length, 0);
});


test('erasure stops before mutation when stored submission identity is malformed', async () => {
  const leadId = 'dddddddd-eeee-4fff-8aaa-bbbbbbbbbbbb';
  for (const submissionId of [
    null,
    'not-a-submission-id',
    '11111111-2222-4333-8444-55555555555Z',
  ]) {
    const kv = new MemoryKV();
    kv.values.set('lead:' + leadId, JSON.stringify({
      id: leadId,
      submissionId,
      createdAt: new Date().toISOString(),
      source: 'enquiry-check',
    }));
    kv.values.set('notice:' + leadId, JSON.stringify({
      version: 1, status: 'pending',
    }));

    const response = await erase({
      request: deletionRequest(leadId),
      env: { LEADS: kv, ADMIN_TOKEN: TOKEN },
    });
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), {
      error: 'Stored submission identity is invalid; erasure stopped.',
    });
    assert.deepEqual(kv.deleted, []);
    assert.equal(kv.values.has('lead:' + leadId), true);
    assert.equal(kv.values.has('notice:' + leadId), true);
    assert.equal(kv.values.has('erased:' + leadId), false);
  }
});
