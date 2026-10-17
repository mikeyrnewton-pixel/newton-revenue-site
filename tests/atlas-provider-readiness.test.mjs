import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const command = new URL("../scripts/atlas-provider-readiness.mjs", import.meta.url).pathname;
function run(home, envExtra = {}) {
  const env = {
    HOME: home,
    PATH: process.env.PATH || "",
    ...envExtra
  };
  return JSON.parse(execFileSync(process.execPath,
    [command, "--json", "--no-local"], {encoding: "utf8", env, timeout: 6000}));
}
function get(rows, name) {return rows.providers.find(p => p.provider === name);}

test("without existing keys, inventory is honest and makes no external provider calls", () => {
  const tmp = mkdtempSync(join(tmpdir(), "atlas-providers-empty-"));
  try {
    const out = run(tmp);
    assert.equal(out.result, "READ_ONLY_INVENTORY_COMPLETE");
    assert.equal(out.authorisation, "NO_PROVIDER_NETWORK_CALLS_NO_CHARGES");
    assert.equal(out.routedProvidersWithCredentials, 0);
    assert.equal(out.routedProviderFamilies, 7);
    assert.equal(out.localQwen, "NOT_CHECKED");
    assert.equal(out.privateGitHubAuthentication, "NOT_CHECKED");
    for (const p of out.providers)
      assert.equal(p.credentialStatus, "MISSING_OR_NOT_DISCOVERED");
  } finally {rmSync(tmp, {recursive: true, force: true});}
});

test("reads existing local .env without printing keys or confusing a key with a working AI", () => {
  const tmp = mkdtempSync(join(tmpdir(), "atlas-providers-config-"));
  try {
    const dir = join(tmp, "Newton-Empire");
    mkdirSync(dir);
    const secrets = ["SECRET_CEREBRAS_674239", "SECRET_MISTRAL_188744",
      "SECRET_XAI_333782", "SECRET_GROQ_111999"];
    writeFileSync(join(dir, ".env"), [
      "CEREBRAS_API_KEY=" + secrets[0],
      "MISTRAL_API_KEY='" + secrets[1] + "'",
      "XAI_API_KEY=" + secrets[2],
      "GROQ_API_KEY=your_key_here",
      "GEMINI_API_KEY=<your-gemini-key>",
      "CLOUDFLARE_ACCOUNT_ID=fake-account-id",
      "OPENROUTER_API_KEY=${OPENROUTER_API_KEY}",
      "# NVIDIA_API_KEY=not-present",
    ].join("\n")+"\n");
    const out = run(tmp, {GROQ_API_KEY: secrets[3]});
    assert.equal(out.configFoundAtKnownLocations, true);
    assert.equal(out.routedProvidersWithCredentials, 3);
    assert.equal(get(out, "Cerebras").credentialStatus, "PRESENT_UNTESTED");
    assert.equal(get(out, "Groq").credentialStatus, "PRESENT_UNTESTED");
    assert.equal(get(out, "Mistral").credentialStatus, "PRESENT_UNTESTED");
    assert.equal(get(out, "xAI (Grok API)").credentialStatus, "PRESENT_UNTESTED");
    assert.equal(get(out, "xAI (Grok API)").inExistingRouter, false);
    assert.equal(get(out, "Cloudflare AI").credentialStatus, "MISSING_OR_NOT_DISCOVERED");
    assert.equal(get(out, "Gemini").credentialStatus, "MISSING_OR_NOT_DISCOVERED");
    const payload = JSON.stringify(out);
    for(const value of secrets) assert.ok(!payload.includes(value), "secret leaked from status");
    assert.ok(!payload.includes(dir), "config path leaked");
  } finally {rmSync(tmp, {recursive: true, force: true});}
});

test("explicit symlinked config is ignored and no secret or path leaks", () => {
  const tmp = mkdtempSync(join(tmpdir(), "atlas-providers-symlink-"));
  try {
    const safe = join(tmp, "source.env");
    const link = join(tmp, "linked.env");
    writeFileSync(safe, "GROQ_API_KEY=DO_NOT_SHOW_SECRET_12345\n");
    symlinkSync(safe, link);
    const out = run(tmp, {ATLAS_EXISTING_ENV_FILE:link});
    assert.equal(get(out, "Groq").credentialStatus, "MISSING_OR_NOT_DISCOVERED");
    assert.ok(!JSON.stringify(out).includes(safe));
  } finally {rmSync(tmp, {recursive:true,force:true});}
});

test("unknown options fail before inspecting files, network or providers", () => {
  const result = spawnSync(process.execPath,
    [command, "--probe-all-and-spend"], {encoding:"utf8", timeout:6000});
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Unknown argument/);
  assert.doesNotMatch(result.stdout, /SECRET/);
});
