import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync as readGeneratedFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildDemoPack } from "../lib/diagnostic-pack.js";

const fixture = JSON.parse(readFileSync(new URL("../examples/diagnostic-demo.json", import.meta.url), "utf8"));
const clone = () => structuredClone(fixture);

test("synthetic customer pack produces a fully reconciled three-fix report without claiming delivery", () => {
  const markdown = buildDemoPack(clone());
  assert.match(markdown, /3 = 2 canonical \+ 1 duplicate \+ 0 excluded/);
  assert.match(markdown, /FICTIONAL DEMONSTRATION/);
  assert.match(markdown, /Delivery release: HOLD/);
  assert.match(markdown, /\| F-01 \|/);
  assert.match(markdown, /\| 3 \|/);
  assert.match(markdown, /EV-001/);
  assert.match(markdown, /ENQUIRY_DIAGNOSTIC_DELIVERY_QA\.md/);
  assert.match(markdown, /Separate actual delivery \| Immutable real pack version/);
  const qaRows = markdown.match(/\| (?:Scope|Privacy|Completeness|Ownership|Action control|Status integrity|Duplicate control|Reconciliation|Fix quality|Claims|Human review|Client acceptance) \| NOT RUN \|/g);
  assert.equal(qaRows?.length, 12);
  assert.doesNotMatch(markdown, /RELEASE APPROVED|cleared revenue|actual customer/i);
});

test("fails closed on real-data mode and unexpected personal data fields", () => {
  const real = clone(); real.synthetic = false;
  assert.throws(() => buildDemoPack(real), /only explicitly fictional/);
  const pii = clone(); pii.records[0].email = "example@example.com";
  assert.throws(() => buildDemoPack(pii), /unapproved field email/);
  const inline = clone(); inline.records[0].nextAction = "Email alice@example.com";
  assert.throws(() => buildDemoPack(inline), /possible identifying/);
  const secret = clone(); secret.records[0].nextAction = "Bearer abcdefghijklmnopqrstuvwxyz01234";
  assert.throws(() => buildDemoPack(secret), /possible identifying/);
});

test("enforces one channel, at most 20 source records and no duplicate IDs", () => {
  const channel = clone(); channel.channel = "Website, Email";
  assert.throws(() => buildDemoPack(channel), /single approved fictional channel/);
  const tooMany = clone(); tooMany.records = Array.from({length: 21}, (_,i) => ({
    ...fixture.records[0], id: "SYN-" + String(i+1).padStart(3,"0"),
    evidenceRef: "EV-" + String(i+1).padStart(3,"0"),
  }));
  assert.throws(() => buildDemoPack(tooMany), /1–20/);
  const duplicateId = clone(); duplicateId.records[2].id = duplicateId.records[0].id;
  assert.throws(() => buildDemoPack(duplicateId), /source ID must be unique/);
});

test("rejects unsupported findings, duplicate chains and impossible timestamps", () => {
  const nonexistent = clone(); nonexistent.findings[0].evidenceRefs = ["EV-999"];
  assert.throws(() => buildDemoPack(nonexistent), /missing or excluded evidence/);
  const cycle = clone(); cycle.records[2].duplicateOf = "SYN-003";
  assert.throws(() => buildDemoPack(cycle), /must reference a canonical/);
  const badDate = clone(); badDate.records[0].receivedAt = "2026-02-30T09:00:00Z";
  assert.throws(() => buildDemoPack(badDate), /valid UTC ISO seconds/);
  const badDue = clone(); badDue.records[0].dueAt = "2026-10-18T08:05:00Z";
  assert.throws(() => buildDemoPack(badDue), /deadline before receipt/);
});

test("requires exactly three unique evidence-based fixes and no unassigned silent ownership", () => {
  const tooFew = clone(); tooFew.fixes.pop();
  assert.throws(() => buildDemoPack(tooFew), /exactly 3/);
  const repeated = clone(); repeated.fixes[1].priority = 1;
  assert.throws(() => buildDemoPack(repeated), /distinct priorities/);
  const missingEsc = clone(); missingEsc.records[1].exception = "None";
  assert.throws(() => buildDemoPack(missingEsc), /unassigned owner needs/);
});

test("actual CLI creates a fictional report with secure permissions and never releases it", () => {
  const dir = mkdtempSync(join(tmpdir(), "newton-diag-"));
  const target = join(dir, "test-demo.md");
  try {
    const output = execFileSync(process.execPath, [
      new URL("../scripts/build-diagnostic-demo.mjs", import.meta.url).pathname,
      target,
    ], { encoding: "utf8" });
    assert.match(output, /FICTIONAL demo generated/);
    const markdown = readGeneratedFileSync(target, "utf8");
    assert.match(markdown, /Source reconciliation: 3 = 2 canonical/);
    assert.match(markdown, /Delivery release: HOLD/);
    assert.match(markdown, /12-test QA execution record/);
    assert.match(markdown, /\| Client acceptance \| NOT RUN \|/);
    assert.match(markdown, /Client intake \| Written client\/project reference/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
