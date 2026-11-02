import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath, pathToFileURL} from "node:url";

const script=fileURLToPath(new URL("../scripts/atlas-stage2-owner-one-shot-proof-20261102.sh",import.meta.url));
const executor=fileURLToPath(new URL("../scripts/atlas-stage2-controlled-executor.mjs",import.meta.url));
const code=fs.readFileSync(script,"utf8");
test("owner switch, Mac only, and shell syntax checks",()=>{
 const syntax=spawnSync("bash",["-n",script],{encoding:"utf8"});
 assert.equal(syntax.status,0,syntax.stderr);
 const wrong=spawnSync("bash",[script,"--do-anything"],{encoding:"utf8"});
 assert.equal(wrong.status,2);
 assert.match(wrong.stdout,/HOLD_EXACT_OWNER_ACTION_REQUIRED/);
 if(process.platform!=="darwin"){
   const host=spawnSync("bash",[script,"--owner-approve-local-proof"],{encoding:"utf8"});
   assert.equal(host.status,2);
   assert.match(host.stdout,/HOLD_OWNER_MAC_REQUIRED/);
 }
});
test("executor and isolated container remain exactly constrained",()=>{
 assert.match(code,/SRC_SHA=72bd99a0dbedc75d30e1d75ecca5c7a7df321a3e/);
 assert.match(code,/--network none --read-only/);
 assert.match(code,/--pull=never/);
 assert.match(code,/--cap-drop ALL/);
 assert.match(code,/--security-opt no-new-privileges:true/);
 assert.match(code,/--mount "type=bind,src=\$S,dst=\/opt\/atlas-stage2,readonly"/);
 assert.match(code,/--mount "type=bind,src=\$P,dst=\/run\/atlas-stage2"/);
 assert.match(code,/OWNER_INITIATED_LOCAL_PROOF_ONLY/);
 assert.match(code,/PROOF_VERIFIED_NO_SERVICE_CHANGES/);
 for (const phrase of ["UNVERIFIED_EXECUTOR_SOURCE","OBSERVER_CHANGED","IMAGE_NOT_PINNED","UNSAFE_BIND_PATH","OBSERVER_STATE_CHANGED"]){
   assert.ok(code.includes(phrase),phrase);
 }
 for(const bad of ["docker.sock","--privileged","--publish","--network host","container stop","container restart","rm -rf","curl ","wget "]){
   assert.equal(code.includes(bad),false,bad);
 }
});
test("same-process proposal, explicit test consent, execution and receipt work without expiry race",()=>{
 const found=code.match(/<<'NODE'\n([\s\S]*?)\nNODE\n/);
 assert.ok(found,"static Node input must be present");
 const home=fs.mkdtempSync(path.join(os.tmpdir(),"atlas-stage2-one-shot-"));
 fs.chmodSync(home,0o700);
 try{
   const js=found[1].replace(
      "file:///opt/atlas-stage2/atlas-stage2-controlled-executor.mjs",
      pathToFileURL(executor).href
   );
   const result=spawnSync(process.execPath,["--input-type=module","-"],{
     input:js,env:{...process.env,HOME:home},encoding:"utf8"
   });
   assert.equal(result.status,0,result.stderr+"\n"+result.stdout);
   for(const message of ["NEW_REQUEST_CREATED","OWNER_APPROVAL_RECORDED","LOCAL_PROOF_EXECUTED","PROOF_VERIFIED"])
      assert.match(result.stdout,new RegExp("ATLAS_STAGE2="+message));
   const root=path.join(home,".atlas-stage2-control");
   const receiptFolder=path.join(root,"receipts");
   const filenames=fs.readdirSync(receiptFolder);
   assert.equal(filenames.length,1);
   const receipt=JSON.parse(fs.readFileSync(path.join(receiptFolder,filenames[0]),"utf8"));
   assert.equal(receipt.result,"LOCAL_PROOF_ONLY");
   assert.equal(receipt.externalEffect,false);
   assert.equal(receipt.network,false);
   assert.equal(receipt.noSpend,true);
 }finally{fs.rmSync(home,{recursive:true,force:true});}
});
