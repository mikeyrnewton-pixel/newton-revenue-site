import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
const file=fileURLToPath(new URL("../scripts/atlas-observer-meta-hotfix-owner-20261102.sh",import.meta.url));
const code=readFileSync(file,"utf8");
test("safe syntax and no unapproved non-Mac or mode use",()=>{
 const p=spawnSync("bash",["-n",file],{encoding:"utf8"});
 assert.equal(p.status,0,p.stderr);
 const args=spawnSync("bash",[file,"--force"],{encoding:"utf8"});
 assert.equal(args.status,2); assert.match(args.stdout,/HOLD_EXACT_MODE_REQUIRED/);
 if(process.platform!=="darwin"){
  const nonmac=spawnSync("bash",[file,"--apply-verified-hotfix"],{encoding:"utf8"});
  assert.equal(nonmac.status,2); assert.match(nonmac.stdout,/HOLD_OWNER_MAC_ONLY/);
 }
});
test("requires original exact source blob and exact patched blob",()=>{
 assert.match(code,/ORIGINAL_SHA=56eafea5e1e2a60ec5de0a3eb8051ea6b72349c5/);
 assert.match(code,/PATCH_SHA=c2a6d169b101d6dfe103bc1f14639b7d8c221d5a/);
 assert.match(code,/PIN=d82dff0e0e482fa38c53cb82d6e8ae85e8ac6180/);
 assert.match(code,/ORIGINAL_SOURCE_HASH_CHANGED/);
 assert.match(code,/PATCH_HASH_MISMATCH/);
 assert.match(code,/ALREADY_PATCHED_NEEDS_INDEPENDENT_REMOTE_CHECK/);
});
test("retains hard fails on source, confinement, and existing rollback",()=>{
 for(const phrase of [
  "TUNNEL_NOT_POINTING_TO_OBSERVER","OBSERVER_LIFECYCLE_CHANGED","OBSERVER_CONFINEMENT_CHANGED",
  "OBSERVER_MOUNTS_CHANGED","OBSERVER_LAUNCH_CHANGED","OBSERVER_IMAGE_CHANGED",
  "ROLLBACK_GUARD_MISSING","ROLLBACK_ID_MISMATCH","OBSERVER_ID_CHANGED",
  "PATCHED_OBSERVER_SMOKE_FAILED","PATCHED_OBSERVER_STATE","LOCAL_PATCH_VERIFIED_REMOTE_UNVERIFIED",
 ])assert.ok(code.includes(phrase),phrase);
 assert.match(code,/--read-only --cap-drop ALL --security-opt no-new-privileges:true/);
 assert.match(code,/--network "container:\$CANARY"/);
 assert.match(code,/--pull=never/);
 assert.match(code,/--user "\$\(id -u\):\$\(id -g\)"/);
 assert.match(code,/--mount "type=bind,src=\$SCRIPTS,dst=\/opt\/atlas-observer\/scripts,readonly"/);
 assert.match(code,/--mount "type=bind,src=\$SNAP,dst=\/run\/atlas-observer,readonly"/);
});
test("recreates only isolated observer, never mutates key/tunnel/canary or Activepieces",()=>{
 assert.match(code,/container stop --time 10 "\$OBSID"/);
 assert.doesNotMatch(code,/container (start|stop|rm|create|update) "\$TUNNEL"/);
 assert.doesNotMatch(code,/container (start|stop|rm|create|update) "\$OLD"/);
 assert.doesNotMatch(code,/container (start|stop|rm|create|update) "\$CANARY"/);
 assert.doesNotMatch(code,/docker\.sock|--privileged|--publish|-p 18788/);
 assert.match(code,/RECOVERY_STARTED/);
 assert.match(code,/ORIGINAL_SOURCE_RESTORED_ATTEMPTED/);
});
test("runs MCP _meta acceptance check on all 3 tools after isolated restart",()=>{
 assert.match(code,/progressToken:"atlas-patch-smoke"/);
 for(const t of ["atlas_ping","atlas_capabilities","atlas_status"])assert.ok(code.includes('ask("'+t+'")'),t);
 assert.match(code,/s\.status!=="FRESH"/);
 assert.match(code,/cap\.writeActions!==false\|\|cap\.macShell!==false/);
});

test("Docker no-host-ports representations accepted, but exposed ports still denied",()=>{
 const source = code;
 assert.match(source,/ports="\$\(fmt '\{\{json \.HostConfig\.PortBindings\}\}' "\$OBS"\)"/);
 assert.match(source,/case "\$ports" in null\|'\{\}'\) ;; \*\) hold OBSERVER_HOST_PORTS_EXPOSED;; esac/);
 for(const value of ["null","{}"]){
  const p=spawnSync("bash",["-c",'p="$1"; case "$p" in null|"{}") exit 0;; *) exit 2;; esac',"--",value],{encoding:"utf8"});
  assert.equal(p.status,0,"should accept "+value);
 }
 for(const value of ['{"18788/tcp":[{"HostPort":"18788"}]}', "INSPECT_FAILED", "[]", '{"x":{}}']){
  const p=spawnSync("bash",["-c",'p="$1"; case "$p" in null|"{}") exit 0;; *) exit 2;; esac',"--",value],{encoding:"utf8"});
  assert.equal(p.status,2,"must reject "+value);
 }
});
