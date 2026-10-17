// Authenticated OWNER-ONLY change to a lead's responsibility/next-action state.
// Stores minimal operational metadata separately; never edits original enquiry,
// sends customer messages or extends the 30-day source retention window.
const STATUSES = new Set(["new", "assigned", "waiting", "resolved"]);
const OWNERS = new Set(["owner", "office", "delivery", "unassigned"]);
const STEPS = new Set(["review", "reply", "prepare-quote", "follow-up", "deliver", "close"]);
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

function reply(body, status = 200) {
  return new Response(JSON.stringify(body), {status, headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow"
  }});
}
function validIso(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(s)) return false;
  const t = Date.parse(s);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 19) + "Z" === s;
}
const uuid = v => typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

export async function onRequestPost({request, env}) {
  if (!env.LEADS?.get || !env.LEADS?.put ||
      typeof env.ADMIN_TOKEN !== "string" || env.ADMIN_TOKEN.length < 24) {
    return reply({error: "Owner-action service is not configured."}, 503);
  }
  if (request.headers.get("Authorization") !== "Bearer " + env.ADMIN_TOKEN) {
    return reply({error: "Unauthorised."}, 401);
  }
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin) return reply({error: "Cross-origin changes are not permitted."}, 403);
  if (!/^\s*application\/json(?:\s*;|$)/i.test(request.headers.get("Content-Type") || "")) {
    return reply({error: "JSON required."}, 415);
  }
  let raw;
  try {raw = await request.text();} catch {return reply({error: "Could not read request."}, 400);}
  if (new TextEncoder().encode(raw).length > 1800) return reply({error: "Owner action too large."}, 413);
  let input;
  try {input = JSON.parse(raw);} catch {return reply({error: "Invalid JSON."}, 400);}
  if (!input || typeof input !== "object" || Array.isArray(input)) return reply({error: "Invalid action."}, 400);
  const allowed = new Set(["leadId", "actionId", "status", "responsibility", "nextStep", "dueAt"]);
  if (Object.keys(input).some(key => !allowed.has(key))) return reply({error: "Unexpected field in owner action."}, 400);
  if (!uuid(input.leadId) || !uuid(input.actionId) || !STATUSES.has(input.status) ||
      !OWNERS.has(input.responsibility) || !STEPS.has(input.nextStep)) {
    return reply({error: "Invalid owner action fields."}, 400);
  }
  const done = input.status === "resolved";
  if ((done && (input.nextStep !== "close" || input.dueAt !== null || input.responsibility === "unassigned")) ||
      (!done && (input.nextStep === "close" || !validIso(input.dueAt))) ||
      (["assigned"].includes(input.status) && input.responsibility === "unassigned")) {
    return reply({error: "Inconsistent owner, status or deadline."}, 400);
  }
  try {
    const lead = await env.LEADS.get("lead:" + input.leadId, "json");
    if (!lead) return reply({error: "Enquiry not found."}, 404);
    const receivedAt = Date.parse(lead.createdAt || "");
    const expiry = receivedAt + RETENTION_MS;
    if (!Number.isFinite(receivedAt) || expiry < Date.now() + 60_000) {
      return reply({error: "Enquiry retention period has ended."}, 410);
    }
    const key = "triage:" + input.leadId;
    const earlier = await env.LEADS.get(key, "json");
    if (earlier?.actionId === input.actionId) {
      return reply({ok: true, leadId: input.leadId, actionId: input.actionId, duplicate: true});
    }
    // Best effort Cloudflare KV write-rate guard, not a distributed transaction lock.
    const previousAt = Date.parse(earlier?.updatedAt || "");
    if (Number.isFinite(previousAt) && Date.now() - previousAt < 2000) {
      return reply({error: "Please wait a moment before updating again."}, 429);
    }
    const action = {version: 1, actionId: input.actionId, status: input.status,
      responsibility: input.responsibility, nextStep: input.nextStep,
      dueAt: input.dueAt, updatedAt: new Date().toISOString()};
    await env.LEADS.put(key, JSON.stringify(action), {
      expiration: Math.floor(expiry / 1000)
    });
    return reply({ok: true, leadId: input.leadId, actionId: input.actionId, status: action.status}, 200);
  } catch {
    return reply({error: "Could not save owner action; retry or use the manual tracker."}, 503);
  }
}
export async function onRequest() {return reply({error: "Method not allowed."}, 405);}
