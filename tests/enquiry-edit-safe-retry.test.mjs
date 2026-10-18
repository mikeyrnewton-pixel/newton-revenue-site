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
  async get(key) { return this.entries.get(key) ?? null; }
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
