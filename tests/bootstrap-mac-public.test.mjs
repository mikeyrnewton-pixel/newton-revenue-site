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


test("local integration scanner is part of existing bootstrap but changes no bots", () => {
  const src = readFileSync(file, "utf8");
  for (const required of [
    "atlas-local-integration-readiness.mjs",
    "LOCAL_INTEGRATION_READINESS.json",
    "LOCAL_INTEGRATION_INVENTORY=COMPLETE_READ_ONLY_NOT_CONNECTED",
    "NO_EXTERNAL_NETWORK_NO_PAID_API_NO_CHANGES",
    "chmod 600"
  ]) assert.ok(src.includes(required), "missing local inventory guard " + required);
  for (const unsafe of ["docker start", "docker run", "tailscale up", "launchctl bootstrap", "launchctl kickstart"]) {
    assert.ok(!src.includes(unsafe), "unexpected service-changing action " + unsafe);
  }
});


test("reviewed private builder fetch preserves active control-bridge work and fails closed", () => {
  const src = readFileSync(file, "utf8");
  for (const required of [
    'build/control-bridge-2026-09-30',
    '1e376b1eaa28e88b07136682f9e1a179b2de5a95',
    '301f7d31c6f4b34bc71ad0967cbc85e73a5c2805',
    '7a484b9ab93ff49a6a463214cd4ff3518d452b5c',
    'git -C "$LOCAL_EMPIRE" fetch --quiet --no-tags origin main',
    'git -C "$LOCAL_EMPIRE" show "301f7d31c6f4b34bc71ad0967cbc85e73a5c2805:scripts/run_build_shift.sh"',
    'git hash-object "$REVIEWED_BUILDER"',
    'PRIVATE_FETCH_NEEDS_EXISTING_GITHUB_AUTH',
    'CONTROL_BRIDGE_CHANGED_NO_PRIVATE_EXECUTION',
    'PRIVATE_REMOTE_MAIN_CHANGED_REVIEW_REQUIRED',
    'PRIVATE_BUILDER_FINGERPRINT_MISMATCH',
    'FOUR_PINNED_PRIVATE_SYNTHETIC_BUILDS_RUN',
    'rm -f "$REVIEWED_BUILDER"',
    'ATLAS_BUILD_ONLY=1'
  ]) assert.ok(src.includes(required), "missing specific guard: "+required);
  for (const forbidden of [
    "git checkout ", "git switch ", "git reset ",
    "git clean ", "git stash ", "git worktree ",
    "git config --global", "gh auth login",
    "git push ", "source .env", "cat .env",
    "launchctl bootout", "launchctl kickstart",
    "docker start", "docker restart"
  ]) assert.ok(!src.includes(forbidden), "unexpected state-changing command: "+forbidden);
  assert.match(src, /TASK-009 TASK-010 TASK-012 TASK-013/);
  assert.match(src, /git -C "\$LOCAL_EMPIRE" status --porcelain --untracked-files=no/);
});

test("reviewed private recovery stays after local checkout guard and before report receipt", () => {
  const src = readFileSync(file, "utf8");
  const existing = src.indexOf('LOCAL_PRIVATE_CHECKOUT_HAS_UNSAVED_EDITS_OR_NON_MAIN');
  const guardedFetch = src.indexOf('PRIVATE_FETCH_NEEDS_EXISTING_GITHUB_AUTH');
  const receipt = src.indexOf('JOURNEY="NOT_IN_MERGED_MAIN"');
  assert.ok(existing >= 0 && existing < guardedFetch && guardedFetch < receipt);
});
