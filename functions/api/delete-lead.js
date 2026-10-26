// Cloudflare Pages Function: POST /api/delete-lead
// Private owner-only erasure path. Deletes idempotency and notice metadata
// before the personal-data record so an interrupted operation is safely retryable.
const MAX_BYTES = 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

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
  if (!(request.headers.get('Content-Type') || '').toLowerCase().includes('application/json')) {
    return reply({ error: 'JSON required.' }, 415);
  }
  let raw;
  try { raw = await request.text(); }
  catch { return reply({ error: 'Could not read request.' }, 400); }
  if (new TextEncoder().encode(raw).length > MAX_BYTES) {
    return reply({ error: 'Request too large.' }, 413);
  }
  let body;
  try { body = JSON.parse(raw); }
  catch { return reply({ error: 'Malformed request.' }, 400); }
  const leadId = typeof body?.leadId === 'string' ? body.leadId.toLowerCase() : '';
  if (!UUID.test(leadId)) return reply({ error: 'Invalid lead reference.' }, 400);

  try {
    const record = await env.LEADS.get('lead:' + leadId, 'json');
    if (!record) {
      // A completed erasure may lose its HTTP response. A repeat must not
      // become an ambiguous 404 when the private, non-PII tombstone proves
      // this exact lead was already erased. Malformed markers fail closed.
      const tombstone = await env.LEADS.get('erased:' + leadId, 'json');
      const validTombstone = tombstone && !Array.isArray(tombstone) &&
        typeof tombstone === 'object' &&
        Object.keys(tombstone).sort().join(',') === 'erased,erasedAt,version' &&
        tombstone.version === 1 && tombstone.erased === true &&
        typeof tombstone.erasedAt === 'string' &&
        Number.isFinite(Date.parse(tombstone.erasedAt));
      if (validTombstone) {
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
