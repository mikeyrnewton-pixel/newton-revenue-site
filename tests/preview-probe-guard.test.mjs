import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

// Fail before network access when supplied a production/custom/insecure URL.
const forbidden = [
  "https://newton-revenue-site.pages.dev/",
  "https://example.com/",
  "http://abc123.newton-revenue-site.pages.dev/",
  "https://abc123.newton-revenue-site.pages.dev/api/leads",
  "https://user:pass@abc123.newton-revenue-site.pages.dev/",
  "https://abc123.newton-revenue-site.pages.dev/?x=1",
  "https://abc123.newton-revenue-site.pages.dev/#lead",
];
for (const url of forbidden) {
  test("Preview-only probe rejects URL without network access: " + url.replace(/user:pass@/, "credentials@"), () => {
    const result = spawnSync(process.execPath, ["scripts/check-preview-binding.mjs", url], {
      encoding: "utf8", timeout: 4000,
    });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /REFUSED/);
  });
}
test("Preview-only probe rejects missing URL without network access", () => {
  const result = spawnSync(process.execPath, ["scripts/check-preview-binding.mjs"], {
    encoding: "utf8", timeout: 4000,
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Expected an HTTPS/);
});
