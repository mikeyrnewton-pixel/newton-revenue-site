import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
const file=fileURLToPath(new URL("../scripts/atlas-stage2-local-proof-bootstrap-20261102.sh",import.meta.url));
const code=readFileSync(file,"utf8");
test("bash source syntax and absent or incorrect owner switch fail closed",()=>{
 const syntax=spawnSync("bash",["-n",file],{encoding:"utf8"});
 assert.equal(syntax.status,0,syntax.stderr);
 const p=spawnSync("bash",[file,"--apply"],{encoding:"utf8"});
 assert.equal(p.status,2);
 assert.match(p.stdout,/HOLD_EXACT_MODE_REQUIRED/);
 if(process.platform!=="darwin"){
  const n=spawnSync("bash",[file,"--stage-isolated-proof"],{encoding:"utf8"});
  assert.equal(n.status,2);
  assert.match(n.stdout,/HOLD_OWNER_MAC_REQUIRED/);
 }
});
test("bootstrap is source pinned, private, single operation and no-network",()=>{
 assert.match(code,/SOURCE_SHA=ea7fba3885cc9b04e6bcad04acb97261adb860f5/);
 assert.match(code,/PIN=3299f309673091bcd2f0d82bcb615ca70a568cb3/);
 assert.match(code,/--network none/);
 assert.match(code,/--read-only/);
 assert.match(code,/--cap-drop ALL/);
 assert.match(code,/--security-opt no-new-privileges:true/);
 assert.match(code,/--pull=never/);
 assert.match(code,/--entrypoint node/);
 assert.match(code,/dst=\/opt\/atlas-stage2,readonly/);
 assert.match(code,/dst=\/run\/atlas-stage2"/);
 assert.match(code,/\.mjs list/);
 assert.match(code,/NO_REMOTE_ACTIONS_NO_TUNNEL_CHANGES/);
 for(const forbidden of ["container stop","container start","docker.sock"," --privileged"," --publish","--network host","--network container:","approve ","execute "," trade ","sk-proj"])
  assert.equal(code.includes(forbidden),false,forbidden);
});
test("bootstrap requires owned directories and preserves existing source",()=>{
 for(const phrase of ["DIRECTORY_IS_SYMLINK","DIRECTORY_NOT_PRIVATE","EXISTING_SOURCE_UNVERIFIED","SOURCE_ALREADY_EXISTS","SOURCE_FILE_NOT_PRIVATE","OBSERVER_STATE_CHANGED"])
  assert.match(code,new RegExp(phrase));
 assert.match(code,/chmod 600 "\$TMP"/);
 assert.match(code,/SOURCE_HASH_FAILED/);
});
