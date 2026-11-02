import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {generateKeyPairSync,sign as signEd25519} from "node:crypto";
import {makeStage2BGate,STAGE2B_SIGNING_CONTRACT as C} from "../scripts/atlas-stage2b-signed-intent-gate.mjs";

const setup=fn=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),"atlas-stage2b-"));
 fs.chmodSync(home,0o700);
 const stateRoot=path.join(home,"state");
 const {privateKey,publicKey}=generateKeyPairSync("ed25519");
 const pem=publicKey.export({type:"spki",format:"pem"});
 let time=Date.UTC(2026,10,2,18,0,0);
 const gate=makeStage2BGate({ownerPublicKeyPem:pem,stateRoot,now:()=>time});
 const setTime=t=>{time=t};
 const signFor=approval=>signEd25519(null,Buffer.from(JSON.stringify({
  schema:approval.schema,id:approval.id,intentDigest:approval.intentDigest,
  purpose:approval.purpose,approvedAt:approval.approvedAt,validUntil:approval.validUntil
 })),privateKey).toString("base64url");
 const makeApproval=(p,{at=time}={})=>({
  schema:C.approval,id:p.intent.id,intentDigest:p.intentDigest,
  purpose:C.purpose,
  approvedAt:new Date(at).toISOString(),
  validUntil:new Date(at+C.approvalValidMs).toISOString()
 });
 try{return fn({gate,stateRoot,home,pem,setTime,time,makeApproval,signFor});}
 finally{fs.rmSync(home,{recursive:true,force:true});}
};
const mustHold=(cb,code)=>assert.throws(cb,new RegExp("ATLAS_STAGE2B_HOLD_"+code));

test("single harmless action only; no networking, arbitrary shell or commercial effects",()=>setup(({gate})=>{
 const a=gate.listActions();
 assert.equal(a.length,1);
 assert.equal(a[0].action,"local_proof_v1");
 for(const k of ["shell","network","spending","trading","outreach","customerAccess"])
  assert.equal(a[0][k],false);
 assert.equal(a[0].requiresSignedOwnerApproval,true);
}));
test("proposal alone does not create state or execute",()=>setup(({gate,stateRoot})=>{
 const p=gate.propose();
 assert.equal(p.status,"INTENT_ONLY_NOT_APPROVED");
 assert.match(p.intent.id,/^[a-f0-9]{32}$/);
 assert.equal(Date.parse(p.intent.validUntil)-Date.parse(p.intent.requestedAt),C.intentValidMs);
 assert.equal(fs.existsSync(stateRoot),false);
}));
test("independently signed approval authorizes exactly one fixed local proof",()=>setup(({gate,stateRoot,makeApproval,signFor})=>{
 const p=gate.propose(),a=makeApproval(p),sig=signFor(a);
 assert.equal(gate.verifyOwnerApproval(p.intent,a,sig).status,"SIGNED_APPROVAL_VERIFIED");
 const result=gate.executeLocalProof(p.intent,a,sig);
 assert.equal(result.status,"LOCAL_PROOF_EXECUTED");
 assert.equal(result.noSpend,true);
 assert.equal(result.externalEffect,false);
 mustHold(()=>gate.executeLocalProof(p.intent,a,sig),"ACTION_ALREADY_RESERVED");
 const records=fs.readdirSync(path.join(stateRoot,"receipts"));
 assert.deepEqual(records,[p.intent.id+".json"]);
 const receipt=JSON.parse(fs.readFileSync(path.join(stateRoot,"receipts",records[0]),"utf8"));
 assert.equal(receipt.result,"LOCAL_PROOF_ONLY");
 assert.equal(receipt.action,"local_proof_v1");
 assert.equal(receipt.externalEffect,false);
 assert.equal(fs.statSync(stateRoot).mode&0o077,0);
 assert.equal(fs.statSync(path.join(stateRoot,"receipts",records[0])).mode&0o077,0);
}));
test("tampering with action, identifier or digest never executes",()=>setup(({gate,makeApproval,signFor,stateRoot})=>{
 const p=gate.propose(),a=makeApproval(p),sig=signFor(a);
 for(const intent of [
  {...p.intent,action:"restart_docker"},
  {...p.intent,id:"a".repeat(32)},
  {...p.intent,args:{shell:"whoami"}},
  {...p.intent,other:"surprise"},
  {...p.intent,validUntil:new Date(Date.parse(p.intent.validUntil)+1).toISOString()}
 ])mustHold(()=>gate.executeLocalProof(intent,a,sig),/INTENT_|APPROVAL_/);
 const fake={...a,intentDigest:"0".repeat(64)};
 mustHold(()=>gate.executeLocalProof(p.intent,fake,sig),"APPROVAL_INVALID");
 assert.equal(fs.existsSync(stateRoot),false);
}));
test("forged signatures, malformed encodings and wrong public key rejected",()=>setup(({gate,makeApproval,signFor})=>{
 const p=gate.propose(),a=makeApproval(p),sig=signFor(a);
 const fake="A".repeat(86);
 mustHold(()=>gate.executeLocalProof(p.intent,a,fake),"SIGNATURE_INVALID");
 mustHold(()=>gate.executeLocalProof(p.intent,a,"not-base64!!!"),"SIGNATURE_INVALID");
 mustHold(()=>gate.executeLocalProof(p.intent,a,sig.slice(0,85)),"SIGNATURE_INVALID");
 mustHold(()=>gate.executeLocalProof(p.intent,{...a,purpose:"OTHER"},sig),"APPROVAL_INVALID");
 const other=generateKeyPairSync("ed25519");
 const badGate=makeStage2BGate({ownerPublicKeyPem:other.publicKey.export({type:"spki",format:"pem"}),stateRoot:"/tmp/atlas-stage2b-unused"});
 mustHold(()=>badGate.verifyOwnerApproval(p.intent,a,sig),"SIGNATURE_INVALID");
}));
test("late owner approval can occur after hours; short signed approval expiry enforced",()=>setup(({gate,setTime,time,makeApproval,signFor})=>{
 const p=gate.propose();
 const late=time+3*60*60*1000;
 setTime(late);
 const a=makeApproval(p,{at:late});
 const sig=signFor(a);
 assert.equal(gate.verifyOwnerApproval(p.intent,a,sig).status,"SIGNED_APPROVAL_VERIFIED");
 setTime(late+C.approvalValidMs+1);
 mustHold(()=>gate.executeLocalProof(p.intent,a,sig),"APPROVAL_EXPIRED_OR_CLOCK");
}));
test("proposal expires after 24 hours; back-dated or future approval denied",()=>setup(({gate,setTime,time,makeApproval,signFor})=>{
 const p=gate.propose(),a=makeApproval(p),sig=signFor(a);
 setTime(time+C.intentValidMs+1);
 mustHold(()=>gate.verifyOwnerApproval(p.intent,a,sig),"INTENT_EXPIRED_OR_CLOCK");
 setTime(time);
 const wrong=makeApproval(p,{at:time-60_000});
 mustHold(()=>gate.verifyOwnerApproval(p.intent,wrong,signFor(wrong)),"APPROVAL_EXPIRED_OR_CLOCK");
 const ahead=makeApproval(p,{at:time+120_000});
 mustHold(()=>gate.verifyOwnerApproval(p.intent,ahead,signFor(ahead)),"APPROVAL_EXPIRED_OR_CLOCK");
}));
test("no approve method, signer or private key is exposed to the agent-side gate",()=>setup(({gate,pem})=>{
 assert.equal(Object.hasOwn(gate,"approve"),false);
 assert.equal(Object.hasOwn(gate,"sign"),false);
 assert.equal(Object.hasOwn(gate,"runShell"),false);
 assert.equal(Object.hasOwn(gate,"docker"),false);
 assert.equal(gate.ownerPublicKeyPem,undefined);
 for(const bad of ["abc",123,null,{}, ""]){
  mustHold(()=>makeStage2BGate({ownerPublicKeyPem:bad,stateRoot:"/tmp/test"}),"OWNER_PUBLIC_KEY_INVALID");
 }
 assert.match(pem,/BEGIN PUBLIC KEY/);
}));
test("unsafe state paths, exposed permissions or symlinks fail before receipt",()=>setup(({gate,stateRoot,makeApproval,signFor})=>{
 const p=gate.propose(),a=makeApproval(p),sig=signFor(a);
 fs.mkdirSync(stateRoot,{mode:0o755});
 mustHold(()=>gate.executeLocalProof(p.intent,a,sig),"DIRECTORY_UNSAFE");
 fs.chmodSync(stateRoot,0o700);
 const dir=path.join(stateRoot,"receipts");
 fs.symlinkSync("/tmp",dir);
 mustHold(()=>gate.executeLocalProof(p.intent,a,sig),"DIRECTORY_UNSAFE");
}));
test("stateless preview of intent causes no files or user input execution",()=>setup(({gate,stateRoot})=>{
 const i=gate.propose();
 assert.equal(i.intent.action,"local_proof_v1");
 assert.deepEqual(i.intent.args,{});
 assert.equal(i.intent.schema,C.intent);
 assert.equal(fs.existsSync(stateRoot),false);
}));
