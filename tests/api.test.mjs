import test from "node:test";
import assert from "node:assert/strict";
import { onRequestPost as submit, onRequest as otherEnquiry } from "../functions/api/enquiry.js";
import { onRequestGet as leads, onRequest as otherLeads } from "../functions/api/leads.js";

const URL = "https://newton-revenue.pages.dev/api/enquiry";
const TOKEN = "a-long-owner-token-at-least-24-characters";
class MemoryKV {
  data = new Map();
  async put(k, v, opts) { assert.equal(opts.expirationTtl, 2592000); this.data.set(k, JSON.parse(v)); }
  async list({ prefix, limit, cursor }) {
    const start = Number(cursor || "0");
    const names = [...this.data.keys()].filter(k => k.startsWith(prefix));
    const keys = names.slice(start, start + limit).map(name => ({ name }));
    return { keys, list_complete: start + limit >= names.length, cursor: String(start + limit) };
  }
  async get(k, format) { assert.equal(format, "json"); return this.data.get(k) || null; }
}
const valid = () => ({ name: "Alex", company: "Acme Services", email: "alex@example.com",
  problem: "We miss customer enquiries after 5pm", contactPermission: true, website: "" });
const req = (payload, opts = {}) => new Request(URL, {
  method: "POST",
  headers: { "Content-Type": "application/json", "Origin": URL.replace("/api/enquiry", ""), ...opts.headers },
  body: opts.raw ?? JSON.stringify(payload),
});
test("missing KV fails closed", async () => {
  const r = await submit({ request: req(valid()), env: {} });
  assert.equal(r.status, 503);
});
test("valid form is stored once with distinct 30-day retention", async () => {
  const kv = new MemoryKV();
  const response = await submit({ request: req(valid()), env: { LEADS: kv } });
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.received, true);
  assert.equal(kv.data.size, 1);
  const record = [...kv.data.values()][0];
  assert.equal(record.marketingConsent, false);
  assert.equal(record.email, "alex@example.com");
  assert.equal(record.status, "new");
  assert.equal(record.source, "newton-revenue-site");
});
test("rejects invalid, oversized and malformed submissions", async () => {
  const kv = new MemoryKV();
  assert.equal((await submit({ request: req({ ...valid(), email: "invalid" }), env: { LEADS: kv } })).status, 400);
  assert.equal((await submit({ request: req({ ...valid(), contactPermission: false }), env: { LEADS: kv } })).status, 400);
  assert.equal((await submit({ request: req(valid(), { raw: "{" }), env: { LEADS: kv } })).status, 400);
  assert.equal((await submit({ request: req({ ...valid(), problem: "z".repeat(9000) }), env: { LEADS: kv } })).status, 413);
  assert.equal((await submit({ request: req(valid(), { headers: { Origin: "https://attacker.test" } }), env: { LEADS: kv } })).status, 403);
  assert.equal(kv.data.size, 0);
});
test("honeypot returns success without storing data", async () => {
  const kv = new MemoryKV();
  const r = await submit({ request: req({ ...valid(), website: "spam.test" }), env: { LEADS: kv } });
  assert.equal(r.status, 202);
  assert.equal(kv.data.size, 0);
});
test("admin reads only with secret; pagination metadata stays private", async () => {
  const kv = new MemoryKV();
  await submit({ request: req(valid()), env: { LEADS: kv } });
  const get = auth => new Request("https://newton-revenue.pages.dev/api/leads", {
    headers: auth ? { Authorization: auth } : {},
  });
  assert.equal((await leads({ request: get(), env: { LEADS: kv, ADMIN_TOKEN: TOKEN } })).status, 401);
  assert.equal((await leads({ request: get("Bearer wrong"), env: { LEADS: kv, ADMIN_TOKEN: TOKEN } })).status, 401);
  const r = await leads({ request: get("Bearer " + TOKEN), env: { LEADS: kv, ADMIN_TOKEN: TOKEN } });
  assert.equal(r.status, 200);
  const data = await r.json();
  assert.equal(data.records.length, 1);
  assert.equal(data.records[0].email, valid().email);
});
test("unexpected methods fail closed", async () => {
  assert.equal((await otherEnquiry()).status, 405);
  assert.equal((await otherLeads()).status, 405);
});


test("approved brand attribution is retained and arbitrary source strings are ignored", async () => {
  const first = new MemoryKV();
  const a = await submit({ request: req({ ...valid(), source: "ai-profit-brief" }), env: { LEADS: first } });
  assert.equal(a.status, 201);
  const rowA = [...first.data.values()].find(item => item && typeof item === "object" && item.status === "new");
  assert.equal(rowA.source, "ai-profit-brief");

  const second = new MemoryKV();
  const b = await submit({ request: req({ ...valid(), source: "inject-me" }), env: { LEADS: second } });
  assert.equal(b.status, 201);
  const rowB = [...second.data.values()].find(item => item && typeof item === "object" && item.status === "new");
  assert.equal(rowB.source, "newton-revenue-site");
});
