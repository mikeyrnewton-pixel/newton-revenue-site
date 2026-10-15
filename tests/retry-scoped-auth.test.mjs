import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost } from '../functions/api/retry-owner-notices.js';

function mockEnv() {
  return {
    LEADS: {
      list: async () => ({ keys: [], list_complete: true }),
      get: async () => null,
      put: async () => undefined
    },
    ADMIN_TOKEN: 'a'.repeat(40),
    RETRY_JOB_TOKEN: 'b'.repeat(40),
    OWNER_NOTICE_TOKEN: 'c'.repeat(40),
    OWNER_NOTICE_URL: 'https://script.google.com/macros/s/ExampleTesting123456abcdef/exec'
  };
}

async function requestWith(authorisation, env = mockEnv()) {
  const request = new Request('https://newton-revenue-site.pages.dev/api/retry-owner-notices', {
    method: 'POST',
    headers: authorisation ? { Authorization: authorisation } : {}
  });
  return onRequestPost({ request, env });
}

test('owner ADMIN_TOKEN still authorises manual retry', async () => {
  const env = mockEnv();
  const r = await requestWith('Bearer ' + env.ADMIN_TOKEN, env);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).ok, true);
});

test('distinct scoped RETRY_JOB_TOKEN authorises scheduled retry', async () => {
  const env = mockEnv();
  const r = await requestWith('Bearer ' + env.RETRY_JOB_TOKEN, env);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).ok, true);
});

test('missing, short, or incorrect scoped credential cannot authorise', async () => {
  const env = mockEnv();
  for (const authorisation of [null, 'Bearer invalid', 'Bearer ' + 'b'.repeat(31)]) {
    const r = await requestWith(authorisation, env);
    assert.equal(r.status, 401);
  }
});

test('scoped credential is rejected if disabled or same as owner token', async () => {
  const missing = mockEnv();
  delete missing.RETRY_JOB_TOKEN;
  assert.equal((await requestWith('Bearer ' + 'b'.repeat(40), missing)).status, 401);
  const short = mockEnv();
  short.RETRY_JOB_TOKEN = 'short';
  assert.equal((await requestWith('Bearer short', short)).status, 401);
  const reused = mockEnv();
  reused.RETRY_JOB_TOKEN = reused.ADMIN_TOKEN;
  assert.equal((await requestWith('Bearer ' + 'b'.repeat(40), reused)).status, 401);
});

test('missing existing owner prerequisites remains fail-closed', async () => {
  const env = mockEnv();
  delete env.ADMIN_TOKEN;
  assert.equal((await requestWith('Bearer ' + env.RETRY_JOB_TOKEN, env)).status, 503);
});
