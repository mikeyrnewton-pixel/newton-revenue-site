import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync, spawnSync} from "node:child_process";

const file = new URL("../scripts/bootstrap_mac_builds.sh", import.meta.url);
const path = file.pathname;
test("public Mac bootstrap is valid bash with no network calls when asking for help", () => {
  execFileSync("bash", ["-n", path], {encoding:"utf8"});
  const out = execFileSync("bash", [path, "--help"], {encoding:"utf8"});
  assert.match(out, /--dry-run/);
  assert.match(out, /--apply/);
});
test("bad mode fails closed before accessing private repositories", () => {
  const result = spawnSync("bash", [path, "--unsafe-force"], {encoding:"utf8"});
  assert.equal(result.status, 2);
  assert.match(result.stderr, /BLOCKED/);
});
test("non-Mac host refuses even an explicit apply without creating workspace", () => {
  if (process.platform === "darwin") return;
  const result = spawnSync("bash", [path, "--apply"], {encoding:"utf8"});
  assert.equal(result.status, 3);
  assert.match(result.stderr, /Mac only/);
});
test("source restricts private repo to authenticated Mac and never touches existing live bots", () => {
  const src=readFileSync(file,"utf8");
  for(const required of [
    "gh auth status", "GIT_TERMINAL_PROMPT=0", "safe_repo",
    "merge --ff-only", "status --porcelain", "REAL_CUSTOMER_DELIVERY=HOLD",
    "MAC_RUNNING_BOTS_CHANGED=NO", "NEW_SERVICES_INSTALLED=NO",
    "site-tests.log", "ATLAS_BUILD_STATUS.txt",
    "atlas-provider-readiness.mjs", "AI_PROVIDER_READINESS.json",
    "NO_PROVIDER_NETWORK_CALLS_NO_CHARGES",
  ]) assert.ok(src.includes(required), "missing "+required);
  for(const forbidden of [
    "git reset --hard", "sudo ", "launchctl load", "launchctl unload",
    "rm -rf", "curl | bash", "git config --global", "gh auth login",
    "git push", "AWS_SECRET_ACCESS_KEY", "gh auth token"
  ]) assert.ok(!src.includes(forbidden), "unsafe phrase "+forbidden);
});


test("existing private Mac checkout fallback is fingerprint-pinned and never prints credentials", () => {
  const src = readFileSync(file, "utf8");
  for (const required of [
    'LOCAL_EMPIRE="$HOME/Newton-Empire"',
    "git hash-object",
    "7a484b9ab93ff49a6a463214cd4ff3518d452b5c",
    "FOUR_APPROVED_LOCAL_OFFLINE_BUILD_TASKS_RUN",
    "LOCAL_PRIVATE_CHECKOUT_FOUND_NEEDS_BUILD_CODE_UPDATE",
    "LOCAL_PRIVATE_CHECKOUT_ORIGIN_NOT_APPROVED",
    "status --porcelain --untracked-files=no",
    "ATLAS_BUILD_ONLY=1"
  ]) assert.ok(src.includes(required), "missing existing checkout guard " + required);
  for (const forbidden of [
    "git reset --hard", "gh auth token", "security find-generic-password",
    "source $HOME/Newton-Empire/.env", "cp $HOME/Newton-Empire/.env",
    "git push", "launchctl load", "launchctl unload"
  ]) assert.ok(!src.includes(forbidden), "private or destructive action present: " + forbidden);
});
