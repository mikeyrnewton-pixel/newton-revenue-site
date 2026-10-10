// Cloudflare Pages Function: POST /api/enquiry
// Stores only valid enquiries in a private KV namespace; no notification or CRM claim.
const MAX_BYTES = 8192;
const TTL_SECONDS = 30 * 24 * 60 * 60;

function reply(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
function validText(value, max) {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= max;
}
export async function onRequestPost({ request, env }) {
  if (!env.LEADS || typeof env.LEADS.put !== "function") {
    return reply({ error: "Lead intake is not configured. Please email us instead." }, 503);
  }
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin) {
    return reply({ error: "Cross-origin submission is not allowed." }, 403);
  }
  if (!(request.headers.get("Content-Type") || "").toLowerCase().includes("application/json")) {
    return reply({ error: "JSON required." }, 415);
  }
  let raw;
  try {
    raw = await request.text();
  } catch {
    return reply({ error: "Could not read request." }, 400);
  }
  if (new TextEncoder().encode(raw).length > MAX_BYTES) {
    return reply({ error: "Submission too large." }, 413);
  }
  let p;
  try {
    p = JSON.parse(raw);
  } catch {
    return reply({ error: "Malformed submission." }, 400);
  }
  if (!p || Array.isArray(p) || typeof p !== "object") {
    return reply({ error: "Invalid submission." }, 400);
  }
  // Quietly accept bot bait without retaining personal data.
  if (typeof p.website === "string" && p.website.trim()) {
    return reply({ ok: true, received: true }, 202);
  }
  const email = typeof p.email === "string" ? p.email.trim() : "";
  if (!validText(p.name, 100) || !validText(p.company, 120) ||
      !validText(email, 200) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !validText(p.problem, 2000) || p.contactPermission !== true) {
    return reply({ error: "Please complete all required fields and agree to enquiry contact." }, 400);
  }
  // Retry protection: client reuses a random 36-character ID when a network reply is lost.
  // Cloudflare KV is eventually consistent; this is best-effort, not a transaction lock.
  const submissionId = typeof p.submissionId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p.submissionId)
    ? p.submissionId.toLowerCase() : null;
  if (submissionId && typeof env.LEADS.get === "function") {
    try {
      const receipt = await env.LEADS.get("receipt:" + submissionId);
      if (receipt) return reply({ ok: true, received: true, reference: receipt }, 200);
    } catch {
      // If the duplicate check fails, do not silently claim it has been recorded.
      return reply({ error: "Could not validate submission. Please retry or email us." }, 503);
    }
  }
  const record = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    source: ["ai-profit-brief", "newton-reset", "autopilot-8"].includes(p.source) ? p.source : "newton-revenue-site",
    name: p.name.trim(),
    company: p.company.trim(),
    email,
    problem: p.problem.trim(),
    contactPermission: true,
    marketingConsent: false,
    status: "new",
  };
  try {
    await env.LEADS.put("lead:" + record.id, JSON.stringify(record), {
      expirationTtl: TTL_SECONDS,
    });
    if (submissionId) {
      try {
        await env.LEADS.put("receipt:" + submissionId, record.id, { expirationTtl: 24 * 60 * 60 });
      } catch {
        // The lead is already stored. Do not tell the customer their enquiry failed.
      }
    }
  } catch {
    return reply({ error: "Could not save the enquiry. Please email us instead." }, 503);
  }
  return reply({ ok: true, received: true, reference: record.id }, 201);
}
export async function onRequest() {
  return reply({ error: "Method not allowed." }, 405);
}
