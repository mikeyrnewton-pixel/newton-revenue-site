// Reproducible, zero-network acceptance rehearsal for the EXISTING site + £195
// diagnostic. All credentials, requests, clients and data here are fictional.
// A passing rehearsal NEVER means live Cloudflare, owner email or payment is ready.
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { onRequestPost as submit } from "../functions/api/enquiry.js";
import { onRequestGet as listLeads } from "../functions/api/leads.js";
import { onRequestPost as retryNotice } from "../functions/api/retry-owner-notices.js";
import { buildDemoPack } from "../lib/diagnostic-pack.js";
import { buildMockQuote } from "../lib/mock-quote.js";

const origin = "https://newton-revenue-site.pages.dev";
const fakeReceiver = "https://script.google.com/macros/s/syntheticOnlyDeployment/exec";
const adminToken = "fictional-admin-token-only-for-offline-acceptance";
const ownerToken = "fictional-notice-token-only-for-offline-acceptance";
const fakeEmail = "fictional-request@example.invalid";
const readFixture = (filename) => JSON.parse(readFileSync(new URL("../examples/" + filename, import.meta.url), "utf8"));
const digest = (data) => createHash("sha256").update(data).digest("hex");

class MemoryKV {
  constructor() { this.values = new Map(); }
  async put(key, value, {expiration, expirationTtl} = {}) {
    assert.ok(expiration || expirationTtl, "every fictional KV write has expiry");
    this.values.set(key, String(value));
  }
  async get(key, format) {
    const value = this.values.get(key);
    if (value === undefined) return null;
    return format === "json" ? JSON.parse(value) : value;
  }
  async list({prefix, limit, cursor}) {
    const keys = [...this.values.keys()].filter(k => k.startsWith(prefix)).sort();
    const start = Number(cursor || 0);
    return {keys: keys.slice(start, start + limit).map(name => ({name})),
      list_complete: start + limit >= keys.length, cursor: String(start + limit)};
  }
}
const testBody = (submissionId) => ({
  submissionId, name: "SYNTHETIC REHEARSAL", company: "FICTIONAL PROPERTY BUSINESS",
  email: fakeEmail, problem: "FICTIONAL: a repair enquiry has no assigned estimator",
  contactPermission: true, source: "enquiry-check", website: ""
});
const post = (body) => new Request(origin + "/api/enquiry", {
  method: "POST", headers: {"Content-Type": "application/json", Origin: origin},
  body: JSON.stringify(body)
});
const authorisedRead = (authorised) => new Request(origin + "/api/leads", {
  headers: authorised ? {Authorization: "Bearer " + adminToken} : {}
});
const authorisedRetry = (authorised) => new Request(origin + "/api/retry-owner-notices", {
  method: "POST", headers: authorised ? {Authorization: "Bearer " + adminToken} : {}
});
const envFor = (kv) => ({LEADS: kv, ADMIN_TOKEN: adminToken,
  OWNER_NOTICE_URL: fakeReceiver, OWNER_NOTICE_TOKEN: ownerToken});

function assertSafeNotice(url, options) {
  assert.equal(url, fakeReceiver, "notice must only go to fictional fixed receiver");
  const payload = JSON.parse(options.body);
  assert.deepEqual(Object.keys(payload).sort(), ["createdAt","leadId","source","token"]);
  assert.equal(payload.token, ownerToken);
  assert.ok(!options.body.includes(fakeEmail), "notice must not disclose enquiry PII");
  return Response.json({ok: true, leadId: payload.leadId});
}
async function testCustomerChain() {
  const kv = new MemoryKV(), env = envFor(kv), tasks = [];
  const idempotencyKey = randomUUID();
  let notices = 0;
  globalThis.fetch = async (...args) => {
    notices++;
    return assertSafeNotice(...args);
  };
  const first = await submit({request: post(testBody(idempotencyKey)), env, waitUntil: task => tasks.push(task)});
  assert.equal(first.status, 201, "first fictional submission must save");
  const receipt = await first.json();
  assert.ok(receipt.reference, "receipt must include a reference");
  await Promise.all(tasks);
  const stored = await kv.get("lead:" + receipt.reference, "json");
  assert.equal(stored.email, fakeEmail);
  const notice = await kv.get("notice:" + receipt.reference, "json");
  assert.equal(notice?.status, "delivered", "owner receiver must ACK matching reference");
  const again = await submit({request: post(testBody(idempotencyKey)), env});
  const repeat = await again.json();
  assert.equal(again.status, 200);
  assert.equal(repeat.reference, receipt.reference);
  assert.equal(notices, 1, "same submission must not send duplicate owner alert");
  assert.equal((await listLeads({request: authorisedRead(false),env})).status, 401);
  const privateRead = await listLeads({request: authorisedRead(true),env});
  assert.equal(privateRead.status, 200);
  const recordList = (await privateRead.json()).records;
  assert.equal(recordList.length, 1, "exactly one saved fictional enquiry");
  assert.equal(recordList[0].notification.status, "delivered");
  return {stored: true, duplicateSuppressed: true, ownerAck: true,
    noticeWithoutPII: true, privateAuth: true, leadCount: recordList.length};
}
async function testRecoveryChain() {
  const kv = new MemoryKV(), env = envFor(kv), tasks = [];
  globalThis.fetch = async () => { throw new Error("fictional receiver outage"); };
  const first = await submit({request: post(testBody(randomUUID())), env, waitUntil: task => tasks.push(task)});
  assert.equal(first.status, 201, "intake must survive owner notice outage");
  const receipt = await first.json();
  await Promise.all(tasks);
  const key = "notice:" + receipt.reference;
  const failed = await kv.get(key, "json");
  assert.equal(failed?.status, "pending");
  assert.equal(failed?.attempts, 1);
  // Artificially age ONLY the in-memory retry metadata; no system clock change.
  failed.lastAttemptAt = new Date(Date.now() - 61_000).toISOString();
  kv.values.set(key, JSON.stringify(failed));
  let recoveryCalls = 0;
  globalThis.fetch = async (...args) => {recoveryCalls++; return assertSafeNotice(...args);};
  assert.equal((await retryNotice({request: authorisedRetry(false),env})).status, 401);
  const response = await retryNotice({request: authorisedRetry(true),env});
  assert.equal(response.status, 200);
  assert.equal((await response.json()).counts.delivered, 1);
  assert.equal((await kv.get(key, "json")).status, "delivered");
  const noResend = await retryNotice({request: authorisedRetry(true),env});
  assert.equal((await noResend.json()).counts.skipped, 1);
  assert.equal(recoveryCalls, 1);
  return {outageRetainsLead: true, authorisedRetry: true, matchingAck: true,
    noDuplicateAfterRetry: true, noExternalNetwork: true};
}
export async function runOfflineRehearsal() {
  const originalFetch = globalThis.fetch;
  try {
    const quoteData = readFixture("mock-quote.json");
    const reportData = readFixture("diagnostic-demo.json");
    assert.equal(quoteData.synthetic, true);
    assert.equal(reportData.synthetic, true);
    assert.equal(quoteData.projectRef, reportData.projectRef, "commercial and delivery references must match");
    assert.equal(quoteData.channel, reportData.channel, "one channel shared across both documents");
    assert.ok(reportData.records.length <= quoteData.maxExamples, "do not exceed agreed sample cap");
    const mockQuote = buildMockQuote(quoteData);
    const diagnosticReport = buildDemoPack(reportData);
    assert.match(mockQuote, /COMMERCIAL RELEASE HOLD/);
    assert.match(diagnosticReport, /Delivery release: HOLD/);
    const intake = await testCustomerChain();
    const recovery = await testRecoveryChain();
    const manifest = {
      schema: "ATLAS_REHEARSAL_V1",
      synthetic: true,
      state: "STAGED_OFFLINE_ONLY",
      customerDelivery: "HOLD",
      productionNoticeVerified: false,
      productionPaymentVerified: false,
      vatApproved: false,
      projectRef: quoteData.projectRef,
      scope: {channel: quoteData.channel, maxExamples: quoteData.maxExamples, proposedPriceGBP: quoteData.proposedPriceGBP},
      diagnostics: {sourceCount: reportData.records.length, findingCount: reportData.findings.length, fixCount: reportData.fixes.length},
      intake, recovery,
      files: {"mock-quote.md": digest(mockQuote), "diagnostic-report.md": digest(diagnosticReport)},
      releaseBlockers: ["Actual company/VAT/terms and buyer acceptance", "Authorised production owner notification and intake", "Private customer data/QA approvals", "Verified customer-specific invoice and settlement"]
    };
    return {manifest, mockQuote, diagnosticReport};
  } finally {
    globalThis.fetch = originalFetch;
  }
}

const cli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (cli) {
  try {
    const result = await runOfflineRehearsal();
    const out = resolve(process.argv[2] || "generated/customer-rehearsal");
    const root = resolve(new URL("../", import.meta.url).pathname);
    const forbidden = ["public", ".github", "functions", "lib", "tests", "examples"].some(name =>
      out === join(root, name) || out.startsWith(join(root, name) + sep));
    if (forbidden) throw Error("HOLD: refusal to write build outputs into source or public directories");
    mkdirSync(out, {recursive: true, mode: 0o700});
    for (const [name, body] of Object.entries({
      "mock-quote.md": result.mockQuote,
      "diagnostic-report.md": result.diagnosticReport,
      "handoff.json": JSON.stringify(result.manifest, null, 2) + "\n"
    })) writeFileSync(join(out, name), body, {mode: 0o600, flag: "w"});
    console.log("STAGED OFFLINE: fictional customer journey accepted; handoff saved to " + out + "; real customer RELEASE HOLD");
  } catch (error) {
    console.error("HOLD: offline customer rehearsal failed: " + error.message);
    process.exitCode = 1;
  }
}
