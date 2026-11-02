import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {makeController} from "../scripts/atlas-stage2-controlled-executor.mjs";

const source=fileURLToPath(new URL("../scripts/atlas-stage2-controlled-executor.mjs",import.meta.url));
const fixture=fn=>{
  const home=fs.mkdtempSync(path.join(os.tmpdir(),"atlas-stage2-"));
  fs.chmodSync(home,0o700);
  try{return fn(home);}finally{fs.rmSync(home,{recursive:true,force:true});}
};
const controller=(home,clock,rand="0123456789abcdef01234567") =>
  makeController({home,now:()=>clock.value,random:()=>Buffer.from(rand,"hex")});
const consent="I_APPROVE_STAGE2_LOCAL_PROOF";
const localRoot=home=>path.join(home,".atlas-stage2-control");

test("allowlist contains exactly one local harmless action with no shell or outside effects",()=>{
 const actions=makeController().listActions();
 assert.equal(actions.length,1);
 assert.equal(actions[0].id,"local_proof_v1");
 for(const flag of ["network","shell","docker","spending","externalMessages"])
   assert.equal(actions[0][flag],false,flag);
 const code=fs.readFileSync(source,"utf8");
 for(const bad of ["child_process","execSync(","spawnSync(","eval(","docker.sock","https.request","http.request"])
   assert.equal(code.includes(bad),false,bad);
});
test("separate proposal, explicit owner approval and once-only local execution",()=>fixture(home=>{
 const t={value:Date.UTC(2026,10,2,13,0,0)},c=controller(home,t);
 const p=c.propose("local_proof_v1");
 assert.equal(p.status,"PROPOSED_NOT_APPROVED");
 assert.match(p.id,/^[0-9a-f]{24}$/);
 assert.throws(()=>c.execute(p.id),/STAGE2_HOLD_FILE_MISSING/);
 assert.throws(()=>c.approve(p.id,"yes"),/STAGE2_HOLD_OWNER_CONSENT_REQUIRED/);
 assert.deepEqual(c.approve(p.id,consent),{status:"OWNER_APPROVAL_RECORDED",id:p.id});
 assert.throws(()=>c.approve(p.id,consent),/STAGE2_HOLD_REPLAY_OR_SYMLINK/);
 const e=c.execute(p.id);
 assert.equal(e.status,"LOCAL_PROOF_EXECUTED");
 assert.equal(e.externalEffect,false);
 assert.equal(e.noSpend,true);
 assert.throws(()=>c.execute(p.id),/STAGE2_HOLD_ACTION_ALREADY_STARTED/);
 const receipt=c.receipt(p.id);
 assert.equal(receipt.result,"LOCAL_PROOF_ONLY");
 assert.equal(receipt.id,p.id);
 assert.equal(receipt.externalEffect,false);
 for(const dir of ["requests","approvals","receipts","locks"]){
   assert.equal(fs.statSync(path.join(localRoot(home),dir)).mode & 0o077,0,dir);
 }
 const f=path.join(localRoot(home),"receipts",p.id+".json");
 assert.equal(fs.statSync(f).mode & 0o077,0);
}));
test("unknown action, extra CLI commands and path smuggling all rejected",()=>fixture(home=>{
 const t={value:Date.now()},c=controller(home,t);
 for(const action of ["", "shell", "docker_restart", "send_outreach", "../../etc/passwd","local_proof_v1;whoami"])
  assert.throws(()=>c.propose(action),/STAGE2_HOLD_ACTION_NOT_ALLOWLISTED/);
 for(const id of ["../../etc/passwd","z".repeat(24),"a",null])
  assert.throws(()=>c.execute(id),/STAGE2_HOLD_REQUEST_ID/);
 const cli=spawnSync(process.execPath,[source,"shell","id"],{encoding:"utf8"});
 assert.equal(cli.status,2);
 assert.match(cli.stdout,/STAGE2_HOLD_COMMAND_NOT_ALLOWLISTED/);
}));
test("proposal expires and cannot be approved/executed late",()=>fixture(home=>{
 const t={value:Date.UTC(2026,10,2,10,0,0)},c=controller(home,t);
 const p=c.propose("local_proof_v1");
 t.value+=31*60*1000;
 assert.throws(()=>c.approve(p.id,consent),/STAGE2_HOLD_REQUEST_EXPIRED_OR_CLOCK/);
}));
test("tampered proposal cannot authorize an action",()=>fixture(home=>{
 const t={value:Date.UTC(2026,10,2,10,0,0)},c=controller(home,t);
 const p=c.propose("local_proof_v1");
 c.approve(p.id,consent);
 const f=path.join(localRoot(home),"requests",p.id+".json");
 const o=JSON.parse(fs.readFileSync(f,"utf8"));
 o.expiresAt=new Date(t.value+30*60*1000).toISOString();
 o.extra="smuggled";
 fs.writeFileSync(f,JSON.stringify(o),{mode:0o600});
 assert.throws(()=>c.execute(p.id),/STAGE2_HOLD_REQUEST_SCHEMA/);
}));
test("approval digest mismatch is rejected",()=>fixture(home=>{
 const t={value:Date.UTC(2026,10,2,10,0,0)},c=controller(home,t);
 const p=c.propose("local_proof_v1");
 c.approve(p.id,consent);
 const f=path.join(localRoot(home),"approvals",p.id+".json");
 const a=JSON.parse(fs.readFileSync(f,"utf8"));
 a.requestSha256="0".repeat(64);
 fs.writeFileSync(f,JSON.stringify(a),{mode:0o600});
 assert.throws(()=>c.execute(p.id),/STAGE2_HOLD_APPROVAL_INVALID/);
}));
test("unsafe directory, symlink and loose file permissions fail closed",()=>fixture(home=>{
 const t={value:Date.now()},c=controller(home,t);
 const p=c.propose("local_proof_v1");
 const root=localRoot(home);
 fs.chmodSync(root,0o755);
 assert.throws(()=>c.approve(p.id,consent),/STAGE2_HOLD_PRIVATE_DIRECTORY_UNSAFE/);
 fs.chmodSync(root,0o700);
 const pfile=path.join(root,"requests",p.id+".json");
 fs.chmodSync(pfile,0o644);
 assert.throws(()=>c.approve(p.id,consent),/STAGE2_HOLD_FILE_UNSAFE/);
 fs.chmodSync(pfile,0o600);
 const staged=path.join(root,"requests",p.id+".bak");
 fs.renameSync(pfile,staged);
 fs.symlinkSync(staged,pfile);
 assert.throws(()=>c.approve(p.id,consent),/STAGE2_HOLD_FILE_UNSAFE/);
}));
test("only fixed owner local proof supported; no remote MCP service is exposed",()=>fixture(home=>{
 const t={value:Date.now()},c=controller(home,t);
 assert.equal(c.listActions()[0].approval,"owner local SSH");
 assert.equal(fs.existsSync(localRoot(home)),false,"list must be read only");
}));
