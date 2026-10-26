// Cloudflare Pages Function: POST /api/delete-lead
// Private owner-only erasure path. Deletes idempotency and notice metadata
// before the personal-data record so an interrupted operation is safely retryable.
const MAX_BYTES = 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Authenticated erasure is limited to a 1-KiB JSON body. Stop before buffering
// an oversized upload; no customer data is logged or transmitted here.
async function readBoundedBody(request) {
  const declared = request.headers.get('Content-Length');
  if (declared !== null && /^\d+$/.test(declared) && Number(declared) > MAX_BYTES)
    return { error: 'oversized' };
  if (!request.body || typeof request.body.getReader !== 'function')
    return { raw: '' };
  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0;
  let raw = '';
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (!(chunk.value instanceof Uint8Array)) return { error: 'unreadable' };
      size += chunk.value.byteLength;
      if (size > MAX_BYTES) {
        void reader.cancel().catch(() => {});
        return { error: 'oversized' };
      }
      raw += decoder.decode(chunk.value, { stream: true });
    }
    raw += decoder.decode();
    return { raw };
  } catch {
    return { error: 'unreadable' };
  } finally {
    reader.releaseLock();
  }
}
function isJsonContentType(value) {
  if (typeof value !== 'string') return false;
  const parts = value.split(';').map(x => x.trim());
  return parts[0].toLowerCase() === 'application/json' &&
    (parts.length === 1 ||
      (parts.length === 2 && /^charset\s*=\s*(?:utf-8|"utf-8")$/i.test(parts[1])));
}

function reply(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow',
  } });
}

export async function onRequestPost({ request, env }) {
  if (!env.LEADS?.get || !env.LEADS?.put || !env.LEADS?.delete ||
      typeof env.ADMIN_TOKEN !== 'string' || env.ADMIN_TOKEN.length < 24) {
    return reply({ error: 'Private erasure service is not configured.' }, 503);
  }
  if (request.headers.get('Authorization') !== 'Bearer ' + env.ADMIN_TOKEN) {
    return reply({ error: 'Unauthorised.' }, 401);
  }
  if (!isJsonContentType(request.headers.get('Content-Type')))
    return reply({ error: 'JSON required.' }, 415);
  const read = await readBoundedBody(request);
  if (read.error === 'oversized') return reply({ error: 'Request too large.' }, 413);
  if (read.error) return reply({ error: 'Could not read request.' }, 400);
  const raw = read.raw;
  let body;
  try { body = JSON.parse(raw); }
  catch { return reply({ error: 'Malformed request.' }, 400); }
  const leadId = typeof body?.leadId === 'string' ? body.leadId.toLowerCase() : '';
  if (!UUID.test(leadId)) return reply({ error: 'Invalid lead reference.' }, 400);

  try {
    const record = await env.LEADS.get('lead:' + leadId, 'json');
    if (!record) {
      // When a successful response is lost, the owner can safely retry.
      // Absence alone is NOT success: require our server-issued tombstone.
      const tombstone = await env.LEADS.get('erased:' + leadId, 'json');
      if (tombstone?.version === 1 && tombstone?.erased === true &&
          typeof tombstone.erasedAt === 'string' &&
          Number.isFinite(Date.parse(tombstone.erasedAt))) {
        return reply({ ok: true, deleted: true, reference: leadId,
          alreadyDeleted: true });
      }
      return reply({ error: 'Lead not found.' }, 404);
    }
    if (record.id !== leadId) {
      return reply({ error: 'Stored lead identity mismatch; erasure stopped.' }, 409);
    }
    const submissionId = typeof record.submissionId === 'string' &&
      UUID.test(record.submissionId) ? record.submissionId : null;
    // Non-PII tombstone closes the race with a notice already in flight.
    // It expires with the original maximum personal-data retention window.
    const erasedAt = new Date().toISOString();
    await env.LEADS.put('erased:' + leadId, JSON.stringify({
      version: 1, erased: true, erasedAt,
    }), { expirationTtl: 30 * 24 * 60 * 60 });
    if (submissionId) {
      await env.LEADS.put('erased-submission:' + submissionId, JSON.stringify({
        version: 1, erased: true, erasedAt,
      }), { expirationTtl: 30 * 24 * 60 * 60 });
    }
    // Lead remains available until ancillary deletions finish, making a
    // partial KV failure safely retryable without orphaning the receipt ID.
    if (submissionId) await env.LEADS.delete('receipt:' + submissionId);
    await env.LEADS.delete('notice:' + leadId);
    await env.LEADS.delete('lead:' + leadId);
    return reply({ ok: true, deleted: true, reference: leadId,
      receiptRemoved: Boolean(submissionId) });
  } catch {
    return reply({ error: 'Erasure incomplete. Retry with the same lead reference.' }, 503);
  }
}

export async function onRequest() {
  return reply({ error: 'Method not allowed.' }, 405);
}
