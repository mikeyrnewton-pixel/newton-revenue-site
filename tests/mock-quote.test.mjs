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
  assert.match(result, /NO payment link has been generated/);
  assert.match(result, /20 anonymised or fictional/);
  assert.doesNotMatch(result, /payment received|VAT included|terms agreed/i);
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
    assert.match(output,/COMMERCIAL RELEASE HOLD/);
  } finally {
    rmSync(dir,{recursive:true,force:true});
  }
});
