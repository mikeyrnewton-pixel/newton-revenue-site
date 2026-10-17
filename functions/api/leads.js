// Cloudflare Pages Function: GET /api/leads
// Private owner-only API. Cloudflare secret ADMIN_TOKEN is never placed in client code.
function reply(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
export async function onRequestGet({ request, env }) {
  if (!env.LEADS || typeof env.LEADS.list !== "function" ||
      typeof env.ADMIN_TOKEN !== "string" || env.ADMIN_TOKEN.length < 24) {
    return reply({ error: "Private lead dashboard is not configured." }, 503);
  }
  const authorization = request.headers.get("Authorization");
  if (authorization !== "Bearer " + env.ADMIN_TOKEN) {
    return reply({ error: "Unauthorised." }, 401);
  }
  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor");
  if (cursor && (cursor.length > 1024 || !/^[A-Za-z0-9_+\/=.-]+$/.test(cursor))) {
    return reply({ error: "Invalid cursor." }, 400);
  }
  try {
    const opts = { prefix: "lead:", limit: 100 };
    if (cursor) opts.cursor = cursor;
    const page = await env.LEADS.list(opts);
    const records = (await Promise.all(
      page.keys.map(key => env.LEADS.get(key.name, "json"))
    )).filter(Boolean).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    await Promise.all(records.map(async record => {
      if (record.notification?.version !== 1) return;
      const notice = await env.LEADS.get('notice:' + record.id, 'json');
      if (notice) record.notification = notice;
    }));
    // Owner-only operational state is stored separately to preserve immutable
    // customer submissions and the original retention deadline.
    await Promise.all(records.map(async record => {
      const action = await env.LEADS.get('triage:' + record.id, 'json');
      if (action?.version === 1) record.triage = action;
    }));
    return reply({ records, hasMore: !page.list_complete, nextCursor: page.cursor || null });
  } catch {
    return reply({ error: "Could not retrieve leads." }, 503);
  }
}
export async function onRequest() {
  return reply({ error: "Method not allowed." }, 405);
}

