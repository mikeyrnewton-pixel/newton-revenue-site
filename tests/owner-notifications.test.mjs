import test from 'node:test';
import assert from 'node:assert/strict';
import { noticeConfigured, deliverOwnerNotice } from '../lib/owner-notifications.js';
import { onRequestPost as retry, onRequest as other } from '../functions/api/retry-owner-notices.js';
import { onRequestPost as submit } from '../functions/api/enquiry.js';
const TOKEN = 'synthetic-test-token-with-at-least-32-characters';
const URL = 'https://script.google.com/macros/s/test-deployment/exec';
const fixture = () => ({ id: 'test-lead', createdAt: new Date().toISOString(), source: 'enquiry-check',
  name: 'PRIVATE NAME', email: 'private@example.com', problem: 'PRIVATE PROBLEM',
  notification: { version: 1, status: 'pending', attempts: 0 } });
const setup = () => {
  const writes = [];
  return { writes, env: { OWNER_NOTICE_URL: URL, OWNER_NOTICE_TOKEN: TOKEN,
    LEADS: { put: async (...args) => writes.push(args) } } };
};
test('notice config rejects arbitrary destinations and weak tokens', () => {
  const { env } = setup();
  assert.equal(noticeConfigured(env), true);
  for (const u of ['http://script.google.com/macros/s/test/exec', 'https://attacker.test/',
    URL + '?token=unsafe', 'https://script.google.com.evil.test/macros/s/test/exec']) {
    assert.equal(noticeConfigured({ ...env, OWNER_NOTICE_URL: u }), false);
  }
  assert.equal(noticeConfigured({ ...env, OWNER_NOTICE_TOKEN: 'short' }), false);
});
test('no config retains pending lead without fetching or extending retention', async () => {
  const { env, writes } = setup();
  delete env.OWNER_NOTICE_TOKEN;
  assert.equal(await deliverOwnerNotice(fixture(), env, () => { throw Error('must not fetch'); }), 'unconfigured');
  assert.equal(writes.length, 0);
});
test('matching ACK marks delivered; payload excludes all customer details; original expiry retained', async () => {
  const { env, writes } = setup();
  const lead = fixture();
  const result = await deliverOwnerNotice(lead, env, async (url, opts) => {
    assert.equal(url, URL);
    const body = JSON.parse(opts.body);
    assert.deepEqual(Object.keys(body).sort(), ['createdAt', 'leadId', 'source', 'token']);
    assert.equal(body.leadId, lead.id);
    assert.equal(opts.body.includes('PRIVATE'), false);
    return Response.json({ ok: true, leadId: lead.id });
  });
  assert.equal(result, 'delivered');
  const saved = JSON.parse(writes[0][1]);
  assert.equal(writes[0][0], 'notice:' + lead.id);
  assert.equal(saved.status, 'delivered');
  assert.equal('email' in saved, false);
  assert.equal(writes[0][2].expiration, Math.floor((Date.parse(lead.createdAt) + 2592000000) / 1000));
  assert.equal('expirationTtl' in writes[0][2], false);
});
test('HTTP 200 login/error pages, wrong ACK and HTTP failures remain pending', async () => {
  for (const response of [new Response('<html>login</html>'), Response.json({ ok: true, leadId: 'wrong' }),
    Response.json({ error: 'bad' }, { status: 500 })]) {
    const { env, writes } = setup();
    assert.equal(await deliverOwnerNotice(fixture(), env, async () => response), 'pending');
    assert.equal(JSON.parse(writes[0][1]).status, 'pending');
  }
});
test('network errors remain retryable; delivered and legacy leads are not resent', async () => {
  const { env, writes } = setup();
  const lead = fixture();
  assert.equal(await deliverOwnerNotice(lead, env, async () => { throw Error('network'); }), 'pending');
  const pending = { ...lead, notification: JSON.parse(writes[0][1]) };
  assert.equal(pending.notification.attempts, 1);
  assert.equal(await deliverOwnerNotice(pending, env, () => { throw Error('must not fetch'); }), 'deferred');
  lead.notification.status = 'delivered';
  assert.equal(await deliverOwnerNotice(lead, env), 'skipped');
  delete lead.notification;
  assert.equal(await deliverOwnerNotice(lead, env), 'skipped');
});
test('retry requires existing owner auth and rejects unsafe cursor', async () => {
  const { env } = setup();
  env.ADMIN_TOKEN = TOKEN;
  env.LEADS.get = async () => null;
  env.LEADS.list = async () => ({ keys: [], list_complete: true });
  const req = (auth, query = '') => new Request('https://site.test/api/retry-owner-notices' + query,
    { method: 'POST', headers: auth ? { Authorization: auth } : {} });
  assert.equal((await retry({ request: req(), env })).status, 401);
  assert.equal((await retry({ request: req('Bearer wrong'), env })).status, 401);
  assert.equal((await retry({ request: req('Bearer ' + TOKEN, '?cursor=%3Cbad%3E'), env })).status, 400);
  assert.equal((await other()).status, 405);
});
test('persisted delivery state prevents resending without rewriting the lead', async () => {
  const { env, writes } = setup();
  const lead = fixture();
  env.LEADS.get = async (key, format) => {
    assert.equal(key, 'notice:' + lead.id);
    assert.equal(format, 'json');
    return { version: 1, status: 'delivered', attempts: 1 };
  };
  assert.equal(await deliverOwnerNotice(lead, env, () => { throw Error('must not fetch'); }), 'skipped');
  assert.equal(writes.length, 0);
  assert.equal(lead.notification.status, 'pending');
});
test('retry returns bounded page progress without customer data', async () => {
  const { env } = setup();
  env.ADMIN_TOKEN = TOKEN;
  env.LEADS.list = async opts => {
    assert.equal(opts.limit, 5);
    assert.equal(opts.cursor, 'second-page');
    return { keys: [{ name: 'lead:old-test' }], list_complete: false, cursor: 'third-page' };
  };
  env.LEADS.get = async () => ({ ...fixture(), notification: undefined });
  const request = new Request('https://site.test/api/retry-owner-notices?cursor=second-page',
    { method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN } });
  const response = await retry({ request, env });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, counts: { delivered: 0, pending: 0, skipped: 1, expired: 0, deferred: 0 },
    hasMore: true, nextCursor: 'third-page' });
});
test('cursorless retry rotates through pages so later pending notices cannot starve', async () => {
  const { env } = setup();
  env.ADMIN_TOKEN = TOKEN;
  let savedCursor = '';
  const seen = [];
  env.LEADS.get = async (key) => {
    if (key === 'meta:notice-retry-cursor') return savedCursor;
    return { ...fixture(), id: key.slice(5), notification: undefined };
  };
  env.LEADS.put = async (key, value) => {
    assert.equal(key, 'meta:notice-retry-cursor');
    savedCursor = value;
  };
  env.LEADS.list = async opts => {
    seen.push(opts.cursor || null);
    if (!opts.cursor) {
      return { keys: Array.from({ length: 5 }, (_, i) => ({ name: 'lead:first-' + i })),
        list_complete: false, cursor: 'second-page' };
    }
    assert.equal(opts.cursor, 'second-page');
    return { keys: [{ name: 'lead:later-pending' }], list_complete: true };
  };
  const request = () => new Request('https://site.test/api/retry-owner-notices',
    { method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN } });

  const first = await retry({ request: request(), env });
  assert.equal(first.status, 200);
  assert.equal((await first.json()).nextCursor, 'second-page');
  assert.equal(savedCursor, 'second-page');

  const second = await retry({ request: request(), env });
  assert.equal(second.status, 200);
  assert.equal((await second.json()).nextCursor, null);
  assert.equal(savedCursor, '');
  assert.deepEqual(seen, [null, 'second-page']);
});

test('stored enquiry succeeds even when owner notification fails', async () => {
  const { env, writes } = setup();
  const request = new Request('https://site.test/api/enquiry', { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      name: 'Test', company: 'Example', email: 'test@example.com', problem: 'Synthetic test', contactPermission: true }) });
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw Error('offline'); };
  try {
    const response = await submit({ request, env });
    assert.equal(response.status, 201);
    assert.equal(writes.length, 2);
    assert.equal(JSON.parse(writes[1][1]).status, 'pending');
  } finally { globalThis.fetch = oldFetch; }
});
