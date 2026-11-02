import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
const file=fileURLToPath(new URL("../scripts/atlas-stage2-clock-fix-owner-20261102.sh",import.meta.url));
const code=readFileSync(file,"utf8");
test("syntax and exact owner mode: no accidental install",()=>{
 const s=spawnSync("bash",["-n",file],{encoding:"utf8"});
 assert.equal(s.status,0,s.stderr);
 const no=spawnSync("bash",[file,"--force"],{encoding:"utf8"});
 assert.equal(no.status,2);
 assert.match(no.stdout,/HOLD_EXACT_MODE_REQUIRED/);
 if(process.platform!=="darwin"){
  const n=spawnSync("bash",[file,"--install-and-propose"],{encoding:"utf8"});
  assert.equal(n.status,2);
  assert.match(n.stdout,/HOLD_OWNER_MAC_ONLY/);
 }
});
test("source and archive are exact hash-pinned, no loose installer trust",()=>{
 assert.match(code,/OLD_SHA=ea7fba3885cc9b04e6bcad04acb97261adb860f5/);
 assert.match(code,/NEW_SHA=72bd99a0dbedc75d30e1d75ecca5c7a7df321a3e/);
 assert.match(code,/PIN=5d652cf72ea6f114b5838a5f037c48b2f34d0467/);
 assert.match(code,/ORIGINAL_FILE_UNSAFE/);
 assert.match(code,/UNEXPECTED_ORIGINAL_HASH/);
 assert.match(code,/ALREADY_PATCHED_DO_NOT_REISSUE/);
 assert.match(code,/BACKUP_NOT_VERIFIED/);
 assert.match(code,/BACKUP_ALREADY_EXISTS/);
 assert.match(code,/SOURCE_CHANGED_DURING_STAGE/);
 assert.match(code,/PATCH_INSTALLED_HASH_FAILED/);
});
test("rollback backup is independent, separate inode, owner-private and exclusive",()=>{
 assert.doesNotMatch(code,/ln "\$TARGET" "\$BACKUP"/);
 assert.match(code,/cp "\$TARGET" "\$BPTMP"/);
 assert.match(code,/\/bin\/ln "\$BPTMP" "\$BACKUP"/);
 assert.match(code,/\/bin\/rm "\$BPTMP"/);
 assert.match(code,/stat -f %l "\$BACKUP"/);
 assert.match(code,/chmod 600 "\$BPTMP"/);
 assert.match(code,/PRIVATE_DIRECTORY_CHANGED/);
});
test("isolated fixed action proposer only, never approval or execution",()=>{
 assert.match(code,/--network none/);
 assert.match(code,/--read-only/);
 assert.match(code,/--cap-drop ALL/);
 assert.match(code,/--security-opt no-new-privileges:true/);
 assert.match(code,/--pull=never/);
 assert.match(code,/--user "\$\(id -u\):\$\(id -g\)"/);
 assert.match(code,/propose local_proof_v1/);
 assert.match(code,/NEW_PROPOSAL_CREATED_NOT_APPROVED/);
 for(const bad of [" --privileged","--publish","--network host","docker.sock",
  " container stop"," container restart","rm -rf"])
   assert.equal(code.includes(bad),false,bad);
 assert.doesNotMatch(code,/runNode[^\n]*\s(?:approve|execute)\s/);
});
