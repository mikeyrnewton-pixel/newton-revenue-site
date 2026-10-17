import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync, rmSync, readFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";

test("one real CLI run connects synthetic intake, owner ACK, dedupe, outage/retry, mock quote and three-fix report", () => {
  const dir = mkdtempSync(join(tmpdir(), "newton-customer-rehearsal-"));
  try {
    const script = new URL("../scripts/run-customer-rehearsal.mjs", import.meta.url).pathname;
    const output = execFileSync(process.execPath, [script, dir], {encoding: "utf8"});
    assert.match(output, /STAGED OFFLINE/);
    const manifest = JSON.parse(readFileSync(join(dir, "handoff.json"), "utf8"));
    assert.equal(manifest.schema, "ATLAS_REHEARSAL_V1");
    assert.equal(manifest.state, "STAGED_OFFLINE_ONLY");
    assert.equal(manifest.customerDelivery, "HOLD");
    assert.equal(manifest.productionNoticeVerified, false);
    assert.equal(manifest.productionPaymentVerified, false);
    assert.equal(manifest.vatApproved, false);
    assert.equal(manifest.projectRef, "DEMO-REPAIR-01");
    assert.equal(manifest.scope.channel, "Website");
    assert.equal(manifest.intake.leadCount, 1);
    assert.equal(manifest.intake.duplicateSuppressed, true);
    assert.equal(manifest.intake.ownerAck, true);
    assert.equal(manifest.intake.noticeWithoutPII, true);
    assert.equal(manifest.intake.privateAuth, true);
    assert.equal(manifest.recovery.outageRetainsLead, true);
    assert.equal(manifest.recovery.authorisedRetry, true);
    assert.equal(manifest.recovery.noDuplicateAfterRetry, true);
    assert.equal(manifest.diagnostics.fixCount, 3);
    assert.equal(manifest.releaseBlockers.length, 4);
    for(const [name, expected] of Object.entries(manifest.files)) {
      const data = readFileSync(join(dir, name), "utf8");
      assert.equal(createHash("sha256").update(data).digest("hex"), expected);
    }
    assert.match(readFileSync(join(dir, "mock-quote.md"), "utf8"), /VAT status: UNKNOWN/);
    assert.match(readFileSync(join(dir, "diagnostic-report.md"), "utf8"), /Delivery release: HOLD/);
  } finally {rmSync(dir, {recursive: true, force: true});}
});

test("rehearsal refuses writing into public/static source folder", () => {
  const script = new URL("../scripts/run-customer-rehearsal.mjs", import.meta.url).pathname;
  const target = new URL("../public/unapproved-private-handoff", import.meta.url).pathname;
  assert.throws(() => execFileSync(process.execPath, [script, target], {stdio: "pipe"}));
});
