import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost as submit } from '../functions/api/enquiry.js';
import { onRequestPost as retry } from '../functions/api/retry-owner-notices.js';
import { onRequestGet as leads } from '../functions/api/leads.js';

// Offline integration only. No live traffic, no secrets, no real customer data.
const adminToken = 'synthetic-admin-secret-with-32-plus-characters';
const noticeToken = 'synthetic-owner-secret-with-32-plus-characters';
const noticeUrl = 'https://script.google.com/macros/s/synthetic-deployment/exec';
class MemoryKV {
  constructor() { this.values = new Map(); }
  async put(key, value, options) {
    assert.ok(options?.expiration || options?.expirationTtl, 'KV record must expire');
    this.values.set(key, value);
  }
  async get(key, format) {
    const raw = this.values.get(key);
    if (!raw) return null;
    return format === 'json' ? JSON.parse(raw) : raw;
  }
  async list({ prefix, limit, cursor }) {
    const keys = [...this.values.keys()].filter(k => k.startsWith(prefix)).sort();
    const offset = Number(cursor || 0);
    return { keys: keys.slice(offset, offset + limit).map(name => ({ name })),
      list_complete: offset + limit >= keys.length, cursor: String(offset + limit) };
  }
}

test('synthetic enquiry survives notice outage, retries with owner auth, persists matching ACK, then dedupes', async () => {
  const originalFetch = globalThis.fetch;
  const originalDateNow = Date.now;
  const kv = new MemoryKV();
  const env = { LEADS: kv, ADMIN_TOKEN: adminToken,
    OWNER_NOTICE_URL: noticeUrl, OWNER_NOTICE_TOKEN: noticeToken };
  const pendingTasks = [];
  let outgoingCalls = 0;
  try {
    globalThis.fetch = async () => { outgoingCalls++; throw Error('synthetic notice receiver outage'); };
    const enquiry = new Request('https://newton-revenue-site.pages.dev/api/enquiry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'FICTIONAL TEST ONLY', company: 'EXAMPLE INVALID',
        email: 'atlas-qa@example.invalid',
        problem: 'Synthetic offline failure and recovery test, not a real buyer',
        contactPermission: true, source: 'enquiry-check' }),
    });
    const response = await submit({ request: enquiry, env,
      waitUntil: p => pendingTasks.push(p) });
    assert.equal(response.status, 201, 'outage must not lose saved enquiry');
    const receipt = await response.json();
    assert.equal(receipt.ok, true);
    await Promise.all(pendingTasks);
    assert.equal(outgoingCalls, 1);
    const key = 'notice:' + receipt.reference;
    const firstNotice = await kv.get(key, 'json');
    assert.equal(firstNotice.status, 'pending');
    assert.equal(firstNotice.attempts, 1);
    assert.equal(firstNotice.failure, 'delivery_failed');

    // Simulate elapsed retry interval in-memory, never mutate real data or time.
    firstNotice.lastAttemptAt = new Date(originalDateNow() - 61_000).toISOString();
    kv.values.set(key, JSON.stringify(firstNotice));
    globalThis.fetch = async (url, options) => {
      outgoingCalls++;
      assert.equal(url, noticeUrl);
      const payload = JSON.parse(options.body);
      assert.deepEqual(Object.keys(payload).sort(), ['createdAt', 'leadId', 'source', 'token']);
      assert.equal(payload.token, noticeToken);
      assert.equal(payload.leadId, receipt.reference);
      assert.equal(options.body.includes('atlas-qa@example.invalid'), false);
      return Response.json({ ok: true, leadId: payload.leadId });
    };
    const makeRetry = auth => new Request('https://newton-revenue-site.pages.dev/api/retry-owner-notices',
      { method: 'POST', headers: auth ? { Authorization: auth } : {} });
    assert.equal((await retry({ request: makeRetry(), env })).status, 401);
    assert.equal(outgoingCalls, 1, 'public request cannot trigger a notice');

    const retried = await retry({ request: makeRetry('Bearer ' + adminToken), env });
    assert.equal(retried.status, 200);
    const result = await retried.json();
    assert.equal(result.counts.delivered, 1);
    assert.equal(result.hasMore, false);
    const delivered = await kv.get(key, 'json');
    assert.equal(delivered.status, 'delivered');
    assert.equal(delivered.attempts, 2);
    assert.equal(outgoingCalls, 2);

    const readRequest = new Request('https://newton-revenue-site.pages.dev/api/leads',
      { headers: { Authorization: 'Bearer ' + adminToken } });
    const privateView = await leads({ request: readRequest, env });
    assert.equal(privateView.status, 200);
    const privateData = await privateView.json();
    assert.equal(privateData.records.length, 1);
    assert.equal(privateData.records[0].notification.status, 'delivered');
    assert.equal((await leads({ request: new Request('https://newton-revenue-site.pages.dev/api/leads'), env })).status, 401);

    const again = await retry({ request: makeRetry('Bearer ' + adminToken), env });
    assert.equal(again.status, 200);
    assert.equal((await again.json()).counts.skipped, 1);
    assert.equal(outgoingCalls, 2, 'acknowledged notice must not be resent');
  } finally {
    globalThis.fetch = originalFetch;
    Date.now = originalDateNow;
  }
});
