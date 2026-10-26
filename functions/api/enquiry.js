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
async function submissionFingerprint(p, email, source, channel) {
  const canonical = JSON.stringify({
    name: p.name.trim(),
    company: p.company.trim(),
    email: email.toLowerCase(),
    problem: p.problem.trim(),
    contactPermission: true,
    source,
    channel,
  });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, "0")).join("");
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
  // Canonicalise source/channel before evaluating the idempotency receipt,
  // so a reused ID cannot silently acknowledge a different enquiry.
  const source = normalisedSource(p.source);
  const channel = normalisedChannel(p.channel);
  // Retry protection: client reuses a random 36-character ID when a network reply is lost.
  // Cloudflare KV is eventually consistent; this is best-effort, not a transaction lock.
  const submissionId = typeof p.submissionId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p.submissionId)
    ? p.submissionId.toLowerCase() : null;
  const fingerprint = submissionId
    ? await submissionFingerprint(p, email, source, channel) : null;
  if (submissionId && typeof env.LEADS.get === "function") {
    try {
      // A stale browser retry must not recreate an enquiry after an
      // authorised erasure removed its receipt and personal-data record.
      const erased = await env.LEADS.get("erased-submission:" + submissionId);
      if (erased) {
        return reply({ error: "This enquiry was erased. Refresh before submitting a new enquiry." }, 410);
      }
      const receipt = await env.LEADS.get("receipt:" + submissionId);
      if (receipt) {
        // Versioned receipts bind a browser retry ID to the canonical enquiry
        // content. Plain UUID receipts remain readable for a safe staged
        // migration, but both formats still require the original lead.
        const legacyReference =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(receipt)
            ? receipt.toLowerCase() : null;
        let parsed = null;
        if (!legacyReference) {
          try { parsed = JSON.parse(receipt); }
          catch {
            return reply({ error: "Could not validate submission. Please retry or email us." }, 503);
          }
          if (!parsed || parsed.version !== 1 ||
              !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
                .test(parsed.reference || "") ||
              !/^[0-9a-f]{64}$/.test(parsed.fingerprint || "")) {
            return reply({ error: "Could not validate submission. Please retry or email us." }, 503);
          }
          if (parsed.fingerprint !== fingerprint) {
            return reply({ error: "This submission ID already belongs to a different enquiry. Refresh and submit again." }, 409);
          }
        }
        const reference = legacyReference || parsed.reference.toLowerCase();
        const previous = await env.LEADS.get("lead:" + reference, "json");
        const unchanged = previous && !Array.isArray(previous) &&
          typeof previous === "object" &&
          previous.id === reference &&
          (previous.submissionId === submissionId ||
            (legacyReference !== null && previous.submissionId == null)) &&
          previous.name === p.name.trim() &&
          previous.company === p.company.trim() &&
          typeof previous.email === "string" &&
          previous.email.toLowerCase() === email.toLowerCase() &&
          previous.problem === p.problem.trim() &&
          previous.source === source &&
          previous.channel === channel &&
          previous.contactPermission === true;
        if (!unchanged) {
          return reply({ error: "Could not validate the previous enquiry. Please email us." }, 503);
        }
        return reply({ ok: true, received: true, reference }, 200);
      }
    } catch {
      // If the duplicate check fails, do not silently claim it has been recorded.
      return reply({ error: "Could not validate submission. Please retry or email us." }, 503);
    }
  }
  // One server timestamp is both creation evidence and the instant at which
  // the accepted contact permission was captured. PR30's privacy-safe handoff
  // requires this explicit evidence; deriving it later would be unverifiable.
  const createdAt = new Date().toISOString();
  const record = {
    id: crypto.randomUUID(),
    createdAt,
    contactPermissionCapturedAt: createdAt,
    ...(submissionId ? { submissionId } : {}),
    source,
    channel,
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

