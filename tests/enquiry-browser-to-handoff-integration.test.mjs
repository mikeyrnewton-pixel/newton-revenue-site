import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { onRequestPost } from "../functions/api/enquiry.js";
import { buildCanonicalFictionalHandoffs } from "../lib/enquiry-handoff.js";

// PR43 ACTUAL browser handler -> PR30 ACTUAL Cloudflare API handler ->
// PR30 ACTUAL fictional-only privacy-safe handoff. Isolated in-memory KV:
// this test NEVER submits to the public website or reads customer data.
const appSource = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const origin = "https://newton-revenue-site.pages.dev";

class MemoryKV {
  records = new Map();
  puts = 0;
  async get(key, format) {
    const raw = this.records.get(key) ?? null;
    return format === "json" && raw !== null ? JSON.parse(raw) : raw;
  }
  async put(key, value) { this.puts++; this.records.set(key, String(value)); }
  leads() {
    return [...this.records.entries()]
      .filter(([key]) => key.startsWith("lead:"))
      .map(([, value]) => JSON.parse(value));
  }
}
function mount(fetchImpl) {
  const state = {
    values: {
      name: "SYNTHETIC ATLAS",
      company: "FICTIONAL QA COMPANY",
      email: "atlas-integration@example.invalid",
      problem: "FICTIONAL: check consent-safe customer handoff",
      website: "", contactPermission: "on",
    },
    status: { className: "", textContent: "" },
    button: { disabled: false },
    resetCount: 0,
    ids: [],
    location: { search: "?source=enquiry-check&utm_source=instagram" },
  };
  const handlers = {};
  const form = {
    addEventListener: (event, handler) => { handlers[event] = handler; },
    reportValidity: () => true,
    reset: () => { state.resetCount++; },
  };
  const document = {
    querySelector: selector => ({
      "#enquiry-form": form, "#form-status": state.status, "#send": state.button,
    })[selector],
  };
  class FormDataStub { get(field) { return state.values[field] ?? null; } }
  const browserCrypto = {
    randomUUID() {
      const id = "ba048326-2718-4e22-afab-" +
        String(state.ids.length + 1).padStart(12, "0");
      state.ids.push(id);
      return id;
    },
  };
  vm.runInNewContext(appSource, {
    document, FormData: FormDataStub, crypto: browserCrypto, URLSearchParams,
    location: state.location, fetch: fetchImpl,
  }, { filename: "public/app.js" });
  state.submit = () => handlers.submit({ preventDefault() {} });
  return state;
}

function request(payload) {
  return new Request(origin + "/api/enquiry", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify(payload),
  });
}
function privateHandoffs(kv) {
  const leads = kv.leads();
  assert.ok(leads.every(l => l.contactPermission === true));
  assert.ok(leads.every(l => l.contactPermissionCapturedAt === l.createdAt));
  const handoffs = buildCanonicalFictionalHandoffs(leads);
  for (const handoff of handoffs) {
    assert.equal(handoff.synthetic, true);
    assert.equal(handoff.workflow.state, "STAGED_OFFLINE_ONLY");
    assert.equal(handoff.workflow.customerDelivery, "HOLD");
    assert.equal(handoff.consent.marketing, false);
    const serialized = JSON.stringify(handoff);
    for (const lead of leads) {
      for (const pii of [lead.name, lead.company, lead.email, lead.problem]) {
        assert.ok(!serialized.includes(pii), "fictional handoff must omit PII");
      }
    }
  }
  return handoffs;
}

test("lost browser reply -> unchanged retry -> exactly one stored lead and one PII-free canonical handoff", async () => {
  const kv = new MemoryKV();
  const sent = [];
  let loseFirstResponse = true;
  const state = mount(async (_url, init) => {
    const payload = JSON.parse(init.body);
    sent.push(payload);
    const response = await onRequestPost({ request: request(payload), env: { LEADS: kv } });
    if (loseFirstResponse) {
      loseFirstResponse = false;
      throw new Error("fictional simulated response lost AFTER successful storage");
    }
    return response;
  });
  await state.submit();
  assert.match(state.status.textContent, /couldn't confirm/i);
  assert.equal(kv.leads().length, 1);
  await state.submit();
  assert.equal(state.status.className, "status success");
  assert.equal(state.resetCount, 1);
  assert.equal(state.button.disabled, false);
  assert.equal(sent.length, 2);
  assert.equal(sent[0].submissionId, sent[1].submissionId);
  assert.equal(kv.leads().length, 1);
  const receipt = JSON.parse(await kv.get("receipt:" + sent[0].submissionId));
  assert.equal(receipt.version, 1);
  assert.match(receipt.fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(privateHandoffs(kv).length, 1);
});

test("ambiguous saved first enquiry + edited browser form creates a SECOND independent handoff", async () => {
  const kv = new MemoryKV();
  const sent = [];
  let loseFirstResponse = true;
  const state = mount(async (_url, init) => {
    const payload = JSON.parse(init.body);
    sent.push(payload);
    const response = await onRequestPost({ request: request(payload), env: { LEADS: kv } });
    if (loseFirstResponse) {
      loseFirstResponse = false;
      throw new Error("fictional mobile reply lost AFTER storage");
    }
    return response;
  });
  await state.submit();
  state.values.problem = "FICTIONAL: edited customer request after uncertain response";
  await state.submit();
  assert.equal(sent.length, 2);
  assert.notEqual(sent[0].submissionId, sent[1].submissionId);
  assert.equal(kv.leads().length, 2);
  const handoffs = privateHandoffs(kv);
  assert.equal(handoffs.length, 2);
  assert.deepEqual(handoffs.map(h => h.handoffId).sort(), [
    "enquiry:" + sent[0].submissionId, "enquiry:" + sent[1].submissionId,
  ].sort());
  assert.equal(state.status.className, "status success");
});

test("revoked browser enquiry-contact permission never creates a second lead or handoff", async () => {
  const kv = new MemoryKV();
  const sent = [];
  let loseFirstResponse = true;
  const state = mount(async (_url, init) => {
    const payload = JSON.parse(init.body);
    sent.push(payload);
    const response = await onRequestPost({ request: request(payload), env: { LEADS: kv } });
    if (loseFirstResponse) {
      loseFirstResponse = false;
      throw new Error("fictional response lost");
    }
    return response;
  });
  await state.submit();
  state.values.contactPermission = "";
  await state.submit();
  assert.equal(sent[1].contactPermission, false);
  assert.notEqual(sent[0].submissionId, sent[1].submissionId);
  assert.equal(kv.leads().length, 1);
  assert.equal(privateHandoffs(kv).length, 1);
  assert.notEqual(state.status.className, "status success");
  assert.equal(state.resetCount, 0);
});
