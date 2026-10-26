// Cloudflare Pages Function: POST /api/enquiry
// Stores valid enquiries privately; optional owner notices never include customer data.
import { deliverOwnerNotice } from '../../lib/owner-notifications.js';
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
function normalisedSource(value) {
  return ["ai-profit-brief", "newton-reset", "autopilot-8", "enquiry-check"].includes(value)
    ? value : "newton-revenue-site";
}
function normalisedChannel(value) {
  return ["facebook", "instagram", "youtube", "search", "partner"].includes(value)
    ? value : "direct";
}
async function submissionFingerprint(p, email) {
  const canonical = JSON.stringify({
    name: p.name.trim(),
    company: p.company.trim(),
    email: email.toLowerCase(),
    problem: p.problem.trim(),
    contactPermission: true,
    source: normalisedSource(p.source),
    channel: normalisedChannel(p.channel),
  });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}
export async function onRequestPost({ request, env, waitUntil }) {
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
  const fingerprint = submissionId ? await submissionFingerprint(p, email) : null;
  if (submissionId && typeof env.LEADS.get === "function") {
    try {
      // PR43 lawful-erasure compatibility: a stale browser retry must never
      // recreate an enquiry after its receipt and personal record were removed.
      const erased = await env.LEADS.get("erased-submission:" + submissionId);
      if (erased) {
        return reply({
          error: "This enquiry was erased. Refresh before submitting a new enquiry.",
        }, 410);
      }
      const receipt = await env.LEADS.get("receipt:" + submissionId);
      if (receipt) {
        // Production and PR43 used a plain UUID receipt; TASK011's new
        // format uses a versioned digest. Preserve safe legacy retries during
        // a separately approved rollout without treating any receipt as proof
        // that the original lead still exists.
        const legacyReference =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(receipt)
            ? receipt.toLowerCase() : null;
        let parsed = null;
        if (!legacyReference) {
          try {
            parsed = JSON.parse(receipt);
          } catch {
            return reply({ error: "Could not validate submission. Please retry or email us." }, 503);
          }
          if (!parsed || parsed.version !== 1 ||
              !/^[0-9a-f-]{36}$/i.test(parsed.reference || "") ||
              !/^[0-9a-f]{64}$/.test(parsed.fingerprint || "")) {
            return reply({ error: "Could not validate submission. Please retry or email us." }, 503);
          }
          if (parsed.fingerprint !== fingerprint) {
            return reply({ error: "Submission reference conflicts with different enquiry details." }, 409);
          }
        }
        const reference = legacyReference || parsed.reference;
        // PR43 compatibility: a receipt cannot acknowledge a lost, altered or
        // corrupted original lead. A digest alone cannot prove intact storage.
        // Reject without returning customer data or creating a second record.
        const original = await env.LEADS.get("lead:" + reference, "json");
        const originalValid = original && !Array.isArray(original) &&
          typeof original === "object" &&
          original.id === reference &&
          (original.submissionId === submissionId ||
            (legacyReference !== null && original.submissionId == null)) &&
          original.contactPermission === true &&
          typeof original.email === "string" &&
          original.name === p.name.trim() &&
          original.company === p.company.trim() &&
          original.email.toLowerCase() === email.toLowerCase() &&
          original.problem === p.problem.trim() &&
          original.source === normalisedSource(p.source) &&
          original.channel === normalisedChannel(p.channel);
        if (!originalValid) {
          return reply({ error: "Could not validate the previous enquiry. Please email us." }, 503);
        }
        return reply({ ok: true, received: true, reference }, 200);
      }
    } catch {
      // If the duplicate check fails, do not silently claim it has been recorded.
      return reply({ error: "Could not validate submission. Please retry or email us." }, 503);
    }
  }
  const createdAt = new Date().toISOString();
  const record = {
    id: crypto.randomUUID(),
    createdAt,
    submissionId,
    contactPermissionCapturedAt: createdAt,
    source: normalisedSource(p.source),
    channel: normalisedChannel(p.channel),
    name: p.name.trim(),
    company: p.company.trim(),
    email,
    problem: p.problem.trim(),
    contactPermission: true,
    marketingConsent: false,
    status: "new",
    notification: { version: 1, status: 'pending', attempts: 0 },
  };
  try {
    await env.LEADS.put("lead:" + record.id, JSON.stringify(record), {
      expirationTtl: TTL_SECONDS,
    });
    if (submissionId) {
      try {
        await env.LEADS.put("receipt:" + submissionId, JSON.stringify({
          version: 1,
          reference: record.id,
          fingerprint,
        }), { expirationTtl: 24 * 60 * 60 });
      } catch {
        // The lead is already stored. Do not tell the customer their enquiry failed.
      }
    }
  } catch {
    return reply({ error: "Could not save the enquiry. Please email us instead." }, 503);
  }
  // Intake success does not depend on webhook availability. The saved lead is
  // the durable retry record; the authenticated retry endpoint can replay it.
  const notice = deliverOwnerNotice(record, env).catch(() => {
    // The original pending lead remains available if the delivery-state write fails.
  });
  if (typeof waitUntil === 'function') waitUntil(notice);
  else await notice;
  return reply({ ok: true, received: true, reference: record.id }, 201);
}
export async function onRequest() {
  return reply({ error: "Method not allowed." }, 405);
}

