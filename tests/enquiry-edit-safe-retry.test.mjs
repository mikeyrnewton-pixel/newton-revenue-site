import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { onRequestPost as submit } from "../functions/api/enquiry.js";

// Test the ACTUAL public/app.js event handler with a minimal DOM stand-in;
// submit requests pass through the ACTUAL Cloudflare enquiry handler.
const source = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const endpoint = "https://newton-revenue.pages.dev/api/enquiry";

function mount(fetchImpl) {
  const state = {
    values: {
      name: "Alex", company: "Acme", email: "alex@example.com",
      problem: "Need follow-ups", website: "", contactPermission: "on",
    },
    status: { className: "", textContent: "" },
    button: { disabled: false },
    events: {},
    resetCount: 0,
    uuids: [],
    location: { search: "" },
  };
  const form = {
    addEventListener: (type, fn) => { state.events[type] = fn; },
    reportValidity: () => true,
    reset: () => { state.resetCount += 1; },
  };
  const document = {
    querySelector: selector =>
      ({ "#enquiry-form": form, "#form-status": state.status, "#send": state.button })[selector],
  };
  class FormDataStub {
    constructor() {}
    get(key) { return state.values[key] || null; }
  }
  const crypto = {
    randomUUID() {
      const id = "ba048326-2718-4e22-afab-" + String(state.uuids.length + 1).padStart(12, "0");
      state.uuids.push(id);
      return id;
    },
  };
  vm.runInNewContext(source, {
    document, crypto, FormData: FormDataStub,
    URLSearchParams, location: state.location, fetch: fetchImpl,
  }, { filename: "public/app.js" });
  state.submit = () => state.events.submit({ preventDefault() {} });
  return state;
}

class MockKV {
  entries = new Map();
  async get(key, format) { const item = this.entries.get(key) ?? null; return format === "json" && item !== null ? JSON.parse(item) : item; }
  async put(key, value) { this.entries.set(key, value); }
}

const toRequest = payload => new Request(endpoint, {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: "https://newton-revenue.pages.dev" },
  body: JSON.stringify(payload),
});

function asFetchResponse(result) {
  return result;
}

test("Unchanged retry preserves the UUID and doesn't create duplicate lead after lost response", async () => {
  const kv = new MockKV();
  const outgoing = [];
  let failAfterStorage = true;
  const state = mount(async (_path, init) => {
    const payload = JSON.parse(init.body);
    outgoing.push(payload);
    const response = await submit({ request: toRequest(payload), env: { LEADS: kv } });
    if (failAfterStorage) {
      failAfterStorage = false;
      throw new Error("Synthetic network reply lost AFTER successful storage");
    }
    return asFetchResponse(response);
  });
  await state.submit();
  assert.match(state.status.textContent, /couldn't confirm/i);
  await state.submit();
  assert.equal(outgoing.length, 2);
  assert.equal(outgoing[0].submissionId, outgoing[1].submissionId);
  assert.equal(state.resetCount, 1);
  assert.equal(state.status.className, "status success");
  assert.equal([...kv.entries.keys()].filter(x => x.startsWith("lead:")).length, 1);
  assert.equal(state.button.disabled, false);
});

test("Editing the enquiry after an ambiguous server success forces a NEW receipt ID and saves the edit", async () => {
  const kv = new MockKV();
  const outgoing = [];
  let failAfterStorage = true;
  const state = mount(async (_path, init) => {
    const payload = JSON.parse(init.body);
    outgoing.push(payload);
    const response = await submit({ request: toRequest(payload), env: { LEADS: kv } });
    if (failAfterStorage) {
      failAfterStorage = false;
      throw new Error("Synthetic mobile connection drop");
    }
    return response;
  });
  await state.submit();
  state.values.problem = "UPDATED request: automated support desk";
  await state.submit();

  assert.notEqual(outgoing[0].submissionId, outgoing[1].submissionId);
  assert.equal(outgoing[1].problem, "UPDATED request: automated support desk");
  const saved = [...kv.entries.entries()]
    .filter(([key]) => key.startsWith("lead:"))
    .map(([, value]) => JSON.parse(value));
  assert.equal(saved.length, 2);
  assert.ok(saved.some(x => x.problem === "UPDATED request: automated support desk"));
  assert.equal(state.status.className, "status success");
  assert.equal(state.resetCount, 1);
});

test("Changing consent changes the retry identity and server will reject an unconsented request", async () => {
  const outgoing = [];
  const state = mount(async (_path, init) => {
    outgoing.push(JSON.parse(init.body));
    throw new Error("Synthetic unavailable");
  });
  await state.submit();
  state.values.contactPermission = "";
  await state.submit();
  assert.notEqual(outgoing[0].submissionId, outgoing[1].submissionId);
  assert.equal(outgoing[1].contactPermission, false);
  assert.equal(state.resetCount, 0);
});

test("Same form after a success starts a NEW submission instead of recycling earlier receipt", async () => {
  const outgoing = [];
  const state = mount(async (_path, init) => {
    outgoing.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ received: true, ok: true }), {
      status: 201, headers: { "Content-Type": "application/json" },
    });
  });
  await state.submit();
  await state.submit();
  assert.notEqual(outgoing[0].submissionId, outgoing[1].submissionId);
  assert.equal(state.resetCount, 2);
});

test("Changing source/channel tracking tags forces a fresh retry receipt", async () => {
  const outgoing = [];
  const state = mount(async (_path, init) => {
    outgoing.push(JSON.parse(init.body));
    throw new Error("Synthetic connection failure");
  });
  await state.submit();
  state.location.search = "?source=enquiry-check&utm_source=instagram";
  await state.submit();
  assert.notEqual(outgoing[0].submissionId, outgoing[1].submissionId);
  assert.equal(outgoing[1].source, "enquiry-check");
  assert.equal(outgoing[1].channel, "instagram");
});

test("Erased receipt explains recovery and next deliberate submit gets a fresh UUID", async () => {
  const outgoing = [];
  let erased = true;
  const state = mount(async (_path, init) => {
    outgoing.push(JSON.parse(init.body));
    if (erased) {
      erased = false;
      return new Response(JSON.stringify({
        error: "This enquiry was erased. Refresh before submitting a new enquiry.",
      }), { status: 410, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ received: true, ok: true }), {
      status: 201, headers: { "Content-Type": "application/json" },
    });
  });

  await state.submit();
  assert.match(state.status.textContent, /earlier enquiry was erased/i);
  assert.equal(state.status.className, "status error");
  assert.equal(state.resetCount, 0);
  assert.equal(state.button.disabled, false);

  await state.submit();
  assert.notEqual(outgoing[0].submissionId, outgoing[1].submissionId);
  assert.equal(state.status.className, "status success");
  assert.equal(state.resetCount, 1);
});

test("No unapproved data leaves the site except the POST the user explicitly submits", async () => {
  const paths = [];
  const state = mount(async (path, _init) => {
    paths.push(path);
    throw new Error("Offline synthetic test");
  });
  await state.submit();
  assert.deepEqual(paths, ["/api/enquiry"]);
  assert.match(state.status.textContent, /Please email/i);
  assert.equal(state.button.disabled, false);
});


test("Rapid double submission while response is pending sends only one actual request", async () => {
  const sent = [];
  let completeFirst;
  const firstResponse = new Promise(resolve => { completeFirst = resolve; });
  const state = mount(async (path, init) => {
    sent.push({ path, body: JSON.parse(init.body) });
    if (sent.length === 1) return firstResponse;
    return new Response(JSON.stringify({ ok: true, received: true }), {
      status: 201, headers: { "Content-Type": "application/json" },
    });
  });
  const first = state.submit();
  assert.equal(state.button.disabled, true);
  const attemptedDuplicate = state.submit(); // e.g. second Enter press
  await attemptedDuplicate;
  assert.equal(sent.length, 1);
  assert.equal(state.resetCount, 0);
  assert.equal(state.button.disabled, true);
  completeFirst(new Response(JSON.stringify({ ok: true, received: true }), {
    status: 201, headers: { "Content-Type": "application/json" },
  }));
  await first;
  assert.equal(state.status.className, "status success");
  assert.equal(state.button.disabled, false);
  assert.equal(state.resetCount, 1);

  // A later, deliberate submission remains possible, with a fresh ID.
  await state.submit();
  assert.equal(sent.length, 2);
  assert.notEqual(sent[0].body.submissionId, sent[1].body.submissionId);
});

test("Concurrent Enter press cannot duplicate a failed submission and the user can retry", async () => {
  const sent = [];
  let rejectFirst;
  const pending = new Promise((_resolve, reject) => { rejectFirst = reject; });
  const state = mount(async (_path, init) => {
    sent.push(JSON.parse(init.body));
    if (sent.length === 1) return pending;
    return new Response(JSON.stringify({ ok: true, received: true }), {
      status: 201, headers: { "Content-Type": "application/json" },
    });
  });
  const first = state.submit();
  await state.submit();
  assert.equal(sent.length, 1);
  assert.equal(state.button.disabled, true);
  rejectFirst(new Error("Synthetic network failure"));
  await first;
  assert.equal(state.status.className, "status error");
  assert.equal(state.button.disabled, false);
  await state.submit();
  assert.equal(sent.length, 2);
  assert.equal(sent[0].submissionId, sent[1].submissionId);
  assert.equal(state.status.className, "status success");
});


test("Edits made after a slow POST starts survive its success; only earlier snapshot is acknowledged", async () => {
  const sent = [];
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const state = mount(async (_path, init) => {
    const payload = JSON.parse(init.body);
    sent.push(payload);
    if (sent.length === 1) return pending;
    return new Response(JSON.stringify({ ok: true, received: true }), {
      status: 201, headers: { "Content-Type": "application/json" },
    });
  });
  const first = state.submit();
  assert.equal(sent[0].problem, "Need follow-ups");
  state.values.problem = "NEW problem described during slow connection";
  state.values.company = "New business name";
  await state.submit(); // second Enter must not start another POST in-flight
  assert.equal(sent.length, 1);
  finish(new Response(JSON.stringify({ ok: true, received: true }), {
    status: 201, headers: { "Content-Type": "application/json" },
  }));
  await first;
  assert.equal(state.resetCount, 0);
  assert.equal(state.values.problem, "NEW problem described during slow connection");
  assert.equal(state.values.company, "New business name");
  assert.match(state.status.textContent, /earlier enquiry was received/i);
  assert.match(state.status.textContent, /not included/i);
  assert.equal(state.button.disabled, false);

  await state.submit();
  assert.equal(sent.length, 2);
  assert.equal(sent[1].problem, "NEW problem described during slow connection");
  assert.equal(sent[1].company, "New business name");
  assert.notEqual(sent[0].submissionId, sent[1].submissionId);
  assert.equal(state.resetCount, 1);
  assert.equal(state.status.className, "status success");
});

test("Changing attribution or consent during the pending request does not silently claim it was sent", async () => {
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const state = mount(async () => pending);
  const first = state.submit();
  state.location.search = "?utm_source=instagram";
  state.values.contactPermission = "";
  finish(new Response(JSON.stringify({ ok: true, received: true }), {
    status: 201, headers: { "Content-Type": "application/json" },
  }));
  await first;
  assert.equal(state.resetCount, 0);
  assert.match(state.status.textContent, /not included/i);
  assert.equal(state.status.className, "status");
  assert.equal(state.button.disabled, false);
});
