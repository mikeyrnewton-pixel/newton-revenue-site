// Owner-only notices contain a reference, never customer details.
// Delivery is at-least-once: the receiver must deduplicate using leadId.
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export function noticeConfigured(env) {
  if (typeof env.OWNER_NOTICE_TOKEN !== 'string' || env.OWNER_NOTICE_TOKEN.length < 32) return false;
  try {
    const u = new URL(env.OWNER_NOTICE_URL);
    return u.protocol === 'https:' && u.hostname === 'script.google.com' &&
      !u.username && !u.password && !u.search && !u.hash &&
      /^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(u.pathname);
  } catch { return false; }
}

export async function deliverOwnerNotice(record, env, fetchImpl = fetch) {
  if (record?.notification?.version !== 1) return 'skipped';
  const created = Date.parse(record.createdAt);
  if (!Number.isFinite(created) || created + RETENTION_MS <= Date.now() + 60000) return 'expired';
  if (!noticeConfigured(env)) return 'unconfigured';
  if (typeof env.LEADS.get === 'function') {
    try {
      if (await env.LEADS.get('erased:' + record.id)) return 'erased';
    } catch {
      // Never send when erasure state cannot be checked.
      return 'deferred';
    }
  }
  // Separate notice state avoids an immediate second write to the lead key
  // (KV limits writes to one per second per key) and cannot overwrite lead edits.
  const stored = typeof env.LEADS.get === 'function'
    ? await env.LEADS.get('notice:' + record.id, 'json') : null;
  const previous = stored || record.notification;
  if (previous.status === 'delivered') return 'skipped';
  const lastAttempt = Date.parse(previous.lastAttemptAt || '');
  if (Number.isFinite(lastAttempt) && Date.now() - lastAttempt < 60000) return 'deferred';
  let outcome = 'pending';
  let reason = 'delivery_failed';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetchImpl(env.OWNER_NOTICE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: env.OWNER_NOTICE_TOKEN, leadId: record.id,
        createdAt: record.createdAt, source: record.source }),
      signal: controller.signal,
      redirect: 'follow',
    });
    // Apps Script may return an HTTP 200 error/login page. Require a matching ACK.
    const ack = response.ok ? await response.json() : null;
    if (ack?.ok === true && ack.leadId === record.id) {
      outcome = 'delivered';
      reason = '';
    } else { reason = 'missing_ack'; }
  } catch { /* Keep pending; never log a token, URL or customer data. */ }
  finally { clearTimeout(timer); }
  if (typeof env.LEADS.get === 'function') {
    try {
      if (await env.LEADS.get('erased:' + record.id)) return 'erased';
    } catch {
      // Do not recreate notice metadata while erasure state is unreadable.
      return 'deferred';
    }
  }
  const now = new Date().toISOString();
  const next = { version: 1, status: outcome,
    attempts: (Number(previous.attempts) || 0) + 1, lastAttemptAt: now,
    ...(outcome === 'delivered' ? { deliveredAt: now } : { failure: reason }) };
  // Keep original expiry instead of extending personal-data retention on retries.
  await env.LEADS.put('notice:' + record.id, JSON.stringify(next), {
    expiration: Math.floor((created + RETENTION_MS) / 1000),
  });
  return outcome;
}
