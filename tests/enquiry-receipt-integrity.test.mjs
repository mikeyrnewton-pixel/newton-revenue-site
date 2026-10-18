import test from "node:test";
import assert from "node:assert/strict";
import { onRequestPost as submit } from "../functions/api/enquiry.js";

const endpoint = "https://newton-revenue-site.pages.dev/api/enquiry";
const ID = "11111111-2222-4333-8444-555555555555";

class MemoryKV {
  records = new Map();
  writes = 0;
  async put(key, value) { this.records.set(key, value); this.writes++; }
  async get(key, format) {
    const raw = this.records.get(key) ?? null;
    return format === "json" && raw !== null ? JSON.parse(raw) : raw;
  }
}
const payload = overrides => ({
  name: "Example", company: "Fictional Ltd",
  email: "qa@example.invalid",
  problem: "A fictional enquiry for safe testing",
  contactPermission: true, source: "enquiry-check",
  channel: "instagram", submissionId: ID, website: "",
  ...overrides,
});
const send = (env, data) => submit({ env, request: new Request(endpoint, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(data),
}) });

test("Same submission ID and same payload is acknowledged without duplicate lead or notice", async () => {
  const kv = new MemoryKV(); const env = { LEADS: kv };
  const first = await send(env, payload());
  assert.equal(first.status, 201);
  const a = await first.json();
  const writes = kv.writes;
  const retry = await send(env, payload());
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).reference, a.reference);
  assert.equal(kv.writes, writes);
  assert.equal([...kv.records.keys()].filter(k => k.startsWith("lead:")).length, 1);
});

test("Reusing an ID for a changed enquiry never reports success", async () => {
  const kv = new MemoryKV(); const env = { LEADS: kv };
  assert.equal((await send(env, payload())).status, 201);
  for (const edit of [
    { problem: "UPDATED fictional need" },
    { company: "Changed Organisation" },
    { name: "Different Fictional Person" },
    { email: "changed@example.invalid" },
    { channel: "facebook" },
    { source: "autopilot-8" },
  ]) {
    const before = kv.writes;
    const r = await send(env, payload(edit));
    assert.equal(r.status, 409);
    assert.equal((await r.json()).received, undefined);
    assert.equal(kv.writes, before, "must never duplicate or overwrite a lead");
  }
});

test("Missing original lead behind an existing receipt never falsely acknowledges", async () => {
  const kv = new MemoryKV(); const env = { LEADS: kv };
  const first = await send(env, payload());
  const id = (await first.json()).reference;
  kv.records.delete("lead:" + id);
  const retry = await send(env, payload());
  assert.equal(retry.status, 503);
  assert.equal((await retry.json()).received, undefined);
});

test("KV duplicate-check failure is not silently treated as success", async () => {
  const kv = new MemoryKV(); const env = { LEADS: kv };
  assert.equal((await send(env, payload())).status, 201);
  const previousGet = kv.get;
  kv.get = async (key, fmt) => {
    if (key.startsWith("lead:")) throw new Error("Synthetic KV unavailable");
    return previousGet.call(kv, key, fmt);
  };
  const retry = await send(env, payload());
  assert.equal(retry.status, 503);
});

test("Different UUID for changed form creates independent lead when contact consent is valid", async () => {
  const kv = new MemoryKV(); const env = { LEADS: kv };
  assert.equal((await send(env, payload())).status, 201);
  const newer = await send(env, payload({
    submissionId: "99999999-8888-4777-8666-555555555555",
    problem: "Distinct fictional problem",
  }));
  assert.equal(newer.status, 201);
  assert.equal([...kv.records.keys()].filter(k => k.startsWith("lead:")).length, 2);
});
