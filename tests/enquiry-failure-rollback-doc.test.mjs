import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const text = readFileSync(new URL("../docs/ENQUIRY_FORM_FAILURE_ROLLBACK_ACCEPTANCE.md", import.meta.url), "utf8");

test("guide is explicitly review-only and never authorises production", () => {
  assert.match(text, /PREPARED — REVIEW ONLY/);
  assert.match(text, /does not authorise merge, production deployment/);
  assert.match(text, /HOLD — prepared\/testable evidence only/);
});

test("every ambiguous or failed storage path forbids a false receipt", () => {
  for (const marker of [
    "Connection fails before storage",
    "Response is lost after storage",
    "Submission ID belongs to different content",
    "Receipt exists but original lead cannot be validated",
    "Duplicate-check storage is unavailable",
    "No received flag",
  ]) assert.ok(text.includes(marker), "missing contract marker: " + marker);
  assert.match(text, /409\/503 paths never display the success message/);
});

test("edit, consent and attribution changes require a fresh identity", () => {
  assert.match(text, /Any payload, consent, source or channel edit gets a fresh submission ID/);
  assert.match(text, /Editing any submitted field, consent or attribution creates a new submission ID/);
});

test("fixture is fictional and rejects real acceptance data", () => {
  assert.match(text, /qa@example\.invalid/);
  assert.match(text, /must never be replaced with a real address/);
  assert.match(text, /fictional data only/);
});

test("rollback is fail-closed and non-destructive", () => {
  assert.match(text, /keep PR43 open and unmerged/);
  assert.match(text, /never use a destructive history reset/);
  assert.match(text, /Any exact-head acceptance test fails/);
});

test("state labels prevent PREPARED from being misreported as deployed", () => {
  for (const state of ["PREPARED", "TESTED", "VERIFIED", "DEPLOYED"])
    assert.ok(text.includes("“" + state + "”"), "missing state definition: " + state);
});

test("preview config remains a release HOLD until isolated runtime verification", () => {
  assert.match(text, /BLOCKED_PREVIEW_CONFIG/);
  assert.match(text, /\/api\/leads` returned \*\*HTTP 503\*\*/);
  assert.match(text, /an \*\*isolated preview-only KV namespace and separate preview-only administrator secret\*\*/);
  assert.match(text, /Never bind production LEADS to a preview/);
  assert.match(text, /separate production merge\/deploy approval/);
});
