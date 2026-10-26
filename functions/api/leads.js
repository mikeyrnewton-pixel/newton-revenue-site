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
    if (!Array.isArray(page?.keys) || typeof page.list_complete !== "boolean" ||
        (!page.list_complete && (typeof page.cursor !== "string" || !page.cursor))) {
      return reply({ error: "Invalid private storage page. No completeness claim made." }, 503);
    }
    // Damaged legacy rows must not hide valid customer enquiries. Never delete,
    // rewrite, echo raw keys, or claim that skipped records mean zero leads.
    const validKey = /^lead:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
    let skippedInvalidRecords = 0;
    let unavailableKeyCount = 0;
    let unverifiedNoticeCount = 0;
    const records = [];
    for (const item of page.keys) {
      const match = typeof item?.name === "string" && item.name.match(validKey);
      if (!match) { skippedInvalidRecords++; continue; }
      let record;
      try { record = await env.LEADS.get(item.name, "json"); }
      catch { skippedInvalidRecords++; continue; }
      if (record === null) { unavailableKeyCount++; continue; }
      if (!record || typeof record !== "object" || Array.isArray(record) ||
          record.id !== match[1].toLowerCase() ||
          typeof record.createdAt !== "string" ||
          !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(record.createdAt) ||
          !Number.isFinite(Date.parse(record.createdAt))) {
        skippedInvalidRecords++;
        continue;
      }
      if (record.notification?.version === 1) {
        try {
          const notice = await env.LEADS.get("notice:" + record.id, "json");
          if (notice && typeof notice === "object" && !Array.isArray(notice) &&
              notice.version === 1 &&
              ["pending", "delivered"].includes(notice.status)) {
            record.notification = notice;
          } else if (notice) {
            unverifiedNoticeCount++;
          }
        } catch {
          unverifiedNoticeCount++;
        }
      }
      records.push(record);
    }
    records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return reply({
      records, hasMore: !page.list_complete, nextCursor: page.cursor || null,
      dataIntegrityWarning: skippedInvalidRecords > 0 || unavailableKeyCount > 0 ||
        unverifiedNoticeCount > 0,
      skippedInvalidRecords, unavailableKeyCount, unverifiedNoticeCount,
    });
  } catch {
    return reply({ error: "Could not retrieve leads." }, 503);
  }
}
export async function onRequest() {
  return reply({ error: "Method not allowed." }, 405);
}

