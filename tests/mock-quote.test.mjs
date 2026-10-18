import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { buildMockQuote } from "../lib/mock-quote.js";

const fixture = JSON.parse(readFileSync(new URL("../examples/mock-quote.json", import.meta.url), "utf8"));
const fresh = () => structuredClone(fixture);
test("builds a fictional £195 scope but refuses to represent it as a real binding quote", () => {
  const result = buildMockQuote(fresh());
  assert.match(result, /£195/);
  assert.match(result, /VAT status: UNKNOWN/);
  assert.match(result, /COMMERCIAL RELEASE HOLD/);
  assert.match(result, /NO payment link, invoice or bank instruction has been generated/);
  assert.match(result, /20 anonymised or fictional/);
  assert.doesNotMatch(result, /payment received|VAT included|terms agreed/i);
});
test("adds operational legal, cancellation, data and payment gates without pretending approval", () => {
  const result = buildMockQuote(fresh());
  assert.match(result, /NEWTON STRATEGIC HOLDINGS LTD \(company number 17330041\)/);
  assert.match(result, /find-and-update\.company-information\.service\.gov\.uk\/company\/17330041/);
  assert.match(result, /invoice\/trading address requires Michael's explicit approval/);
  assert.match(result, /Do not copy an address from a third-party directory/);
  assert.match(result, /infer VAT registration from the Companies House record/);
  assert.match(result, /Michael must confirm.*VAT status/i);
  assert.match(result, /cancellation deadline/);
  assert.match(result, /statutory rights/);
  assert.match(result, /tied to the original invoice\/payment reference/);
  assert.match(result, /REFUND_REQUESTED, REFUND_APPROVED, REFUND_ISSUED and REFUND_SETTLED/);
  assert.match(result, /Never ask for fresh bank details by email/);
  assert.match(result, /suitably redacted or anonymised/);
  assert.match(result, /subprocessors, retention\/deletion date/);
  assert.match(result, /buyer.*written acceptance/i);
  assert.match(result, /accepted document version or digest/);
  assert.match(result, /acceptance timestamp/);
  assert.match(result, /authorised representative and evidence of that representative's authority/);
  assert.match(result, /matching email domain.*is not acceptance/i);
  assert.match(result, /fresh written acceptance before invoicing/);
  assert.match(result, /quote-validity deadline with timezone/);
  assert.match(result, /expired, backdated or stale acceptance is not authority to invoice/);
  assert.match(result, /validity deadline passes.*recheck current delivery capacity, price and VAT treatment/i);
  assert.match(result, /purchase order, supplier onboarding or named finance approver/);
  assert.match(result, /INVOICE HOLD.*buyer-issued reference\/approval/i);
  assert.match(result, /procurement correspondence as scope acceptance/);
  assert.match(result, /purchase-order\/reference where required/);
  assert.match(result, /form submission, draft checkbox or verbal indication is not acceptance/i);
  assert.match(result, /Michael's explicit approval/);
  assert.match(result, /settled bank\/merchant evidence may mark CLEARED/);
  assert.match(result, /Never place bank details, merchant secrets or reusable payment URLs in source code/);
  assert.match(result, /buyer-approved billing contact through the approved channel/);
  assert.match(result, /change-request email alone/);
  assert.match(result, /fresh approval plus independent verification through a previously trusted channel/);
  assert.match(result, /issued invoice\/payment-request version and delivery evidence privately/);
  assert.match(result, /private invoice register to prevent a duplicate request/);
  assert.match(result, /never silently overwrite an invoice/i);
  assert.match(result, /cancellation, credit-note and replacement-invoice trail/);
  assert.doesNotMatch(result, /sort code|account number|IBAN|payment\.newton|revolut\.me/i);
});
test("refuses real scope, inflated example limits, other commercial prices and unknown fields", () => {
  const real = fresh(); real.synthetic = false;
  assert.throws(() => buildMockQuote(real), /only fictional/);
  const large = fresh(); large.maxExamples = 21;
  assert.throws(() => buildMockQuote(large), /20/);
  const high = fresh(); high.proposedPriceGBP = 295;
  assert.throws(() => buildMockQuote(high), /£195/);
  const pii = fresh(); pii.email = "alice@example.com";
  assert.throws(() => buildMockQuote(pii), /unapproved scope field/);
  const scope = fresh(); scope.channel = "Two channels";
  assert.throws(() => buildMockQuote(scope), /exactly one/);
});
test("actual CLI writes a usable private mock quote with HOLD status", () => {
  const dir = mkdtempSync(join(tmpdir(),"newton-quote-"));
  const target = join(dir,"sample.md");
  try {
    const msg = execFileSync(process.execPath, [
      new URL("../scripts/build-mock-quote.mjs", import.meta.url).pathname, target
    ],{encoding:"utf8"});
    assert.match(msg,/commercial release HOLD/);
    const output = readFileSync(target,"utf8");
    assert.match(output,/FICTIONAL diagnostic scope and quote/);
    assert.match(output,/VAT status: UNKNOWN/);
    assert.match(output,/Buyer-specific acceptance and payment handoff/);
    assert.match(output,/COMMERCIAL RELEASE HOLD/);
  } finally {
    rmSync(dir,{recursive:true,force:true});
  }
});
