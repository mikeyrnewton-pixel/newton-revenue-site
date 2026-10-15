import { noticeConfigured, deliverOwnerNotice } from '../../lib/owner-notifications.js';
function reply(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow',
  } });
}
export async function onRequestPost({ request, env }) {
  if (!env.LEADS?.list || !env.LEADS?.get || !env.LEADS?.put ||
      typeof env.ADMIN_TOKEN !== 'string' || env.ADMIN_TOKEN.length < 24) {
    return reply({ error: 'Owner retry service is not configured.' }, 503);
  }
  // The optional scheduled job uses a distinct, retry-only credential. Preserve
  // the existing owner ADMIN_TOKEN for deliberate manual operations.
  const authorisation = request.headers.get('Authorization');
  const ownerAuthorised = authorisation === 'Bearer ' + env.ADMIN_TOKEN;
  const retryJobAuthorised = typeof env.RETRY_JOB_TOKEN === 'string' &&
    env.RETRY_JOB_TOKEN.length >= 32 &&
    env.RETRY_JOB_TOKEN !== env.ADMIN_TOKEN &&
    authorisation === 'Bearer ' + env.RETRY_JOB_TOKEN;
  if (!ownerAuthorised && !retryJobAuthorised) {
    return reply({ error: 'Unauthorised.' }, 401);
  }
  if (!noticeConfigured(env)) return reply({ error: 'Owner notice receiver is not configured.' }, 503);
  const cursor = new URL(request.url).searchParams.get('cursor');
  if (cursor && (cursor.length > 1024 || !/^[A-Za-z0-9_+\/=.-]+$/.test(cursor))) {
    return reply({ error: 'Invalid cursor.' }, 400);
  }
  try {
    const page = await env.LEADS.list({ prefix: 'lead:', limit: 5, ...(cursor ? { cursor } : {}) });
    const counts = { delivered: 0, pending: 0, skipped: 0, expired: 0, deferred: 0 };
    for (const key of page.keys) {
      const record = await env.LEADS.get(key.name, 'json');
      if (!record) { counts.skipped++; continue; }
      const status = await deliverOwnerNotice(record, env);
      counts[status] = (counts[status] || 0) + 1;
    }
    return reply({ ok: true, counts, hasMore: !page.list_complete,
      nextCursor: page.list_complete ? null : page.cursor || null });
  } catch { return reply({ error: 'Retry incomplete. Pending notices retained.' }, 503); }
}
export async function onRequest() { return reply({ error: 'Method not allowed.' }, 405); }
