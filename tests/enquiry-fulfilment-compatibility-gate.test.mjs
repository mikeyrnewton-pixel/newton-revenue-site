import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,readFileSync,writeFileSync,lstatSync,symlinkSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {execFileSync,spawnSync} from "node:child_process";

const script=new URL("../scripts/enquiry-fulfilment-compatibility-gate.mjs",import.meta.url).pathname;
const fixture=new URL("../fixtures/enquiry-fulfilment-compatibility.synthetic.json",import.meta.url).pathname;
const template=new URL("../config/enquiry-fulfilment-connect-later.template.json",import.meta.url).pathname;
const doc=readFileSync(new URL("../docs/ENQUIRY_FULFILMENT_COMPATIBILITY_CONNECT_LATER.md",import.meta.url),"utf8");
const temp=()=>mkdtempSync(join(tmpdir(),"fulfilment-compat-"));
function run(dir,bundle=JSON.parse(readFileSync(fixture,"utf8")),config=JSON.parse(readFileSync(template,"utf8"))){
  const bp=join(dir,"bundle.json"),cp=join(dir,"config.json"),op=join(dir,"manifest.json");
  writeFileSync(bp,JSON.stringify(bundle),{mode:0o600}); writeFileSync(cp,JSON.stringify(config),{mode:0o600});
  const summary=JSON.parse(execFileSync(process.execPath,[script,"--bundle",bp,"--config",cp,"--output",op],{encoding:"utf8",timeout:6000}));
  return {summary,manifest:JSON.parse(readFileSync(op,"utf8")),output:op};
}
function rejected(bundle,config){
  const dir=temp();
  try{
    const bp=join(dir,"bundle.json"),cp=join(dir,"config.json"),op=join(dir,"manifest.json");
    writeFileSync(bp,JSON.stringify(bundle),{mode:0o600}); writeFileSync(cp,JSON.stringify(config),{mode:0o600});
    return spawnSync(process.execPath,[script,"--bundle",bp,"--config",cp,"--output",op],{encoding:"utf8"});
  }finally{rmSync(dir,{recursive:true,force:true});}
}

test("compatible contracts create a private HOLD manifest",()=>{
  const dir=temp();
  try{
    const out=run(dir);
    assert.equal(out.summary.result,"READY_FOR_HUMAN_ASSISTED_PRIVATE_DRY_RUN");
    assert.equal(out.manifest.customerDelivery,"HOLD");
    assert.equal(out.manifest.paymentState,"NOT_CLEARED");
    assert.equal(out.manifest.connectionState,"NEEDS_CONNECTION");
    assert.equal(out.manifest.live,false);
    assert.equal(out.manifest.enquiryId,"11111111-2222-4333-8444-555555555555");
    assert.deepEqual(out.manifest.compatibleContracts,["PR11_QA","PR29_COMMERCIAL","PR30_ACQUISITION","PR43_LIFECYCLE"]);
    assert.equal(lstatSync(out.output).mode&0o077,0);
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test("actual lifecycle generator output is accepted end to end",()=>{
  const dir=temp();
  try{
    const record=join(dir,"record.json"),policy=join(dir,"policy.json"),receipt=join(dir,"receipt.json");
    writeFileSync(record,JSON.stringify({schemaVersion:1,enquiryId:"11111111-2222-4333-8444-555555555555",email:"qa@example.invalid",createdAt:"2026-10-01T09:00:00.000Z",syntheticOnly:true,personalData:false,deletionRequested:false}),{mode:0o600});
    writeFileSync(policy,JSON.stringify({schemaVersion:1,retentionDays:30,deletionGraceDays:7,storageAdapter:"",deletionAdapter:"",connectionStatus:"NEEDS_CONNECTION",ownerApproval:"NOT_GRANTED",liveEnabled:false}),{mode:0o600});
    const lifecycle=new URL("../scripts/enquiry-lifecycle-receipt.mjs",import.meta.url).pathname;
    const generated=spawnSync(process.execPath,[lifecycle,"--record",record,"--policy",policy,"--as-of","2026-10-20T08:00:00.000Z","--output",receipt],{encoding:"utf8"});
    assert.equal(generated.status,0,generated.stderr);
    const bundle=JSON.parse(readFileSync(fixture,"utf8"));bundle.lifecycle=JSON.parse(readFileSync(receipt,"utf8"));
    const out=run(dir,bundle);assert.equal(out.manifest.enquiryId,bundle.lifecycle.enquiryId);
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test("project-reference mismatch fails closed",()=>{
  const b=JSON.parse(readFileSync(fixture,"utf8")); b.commercial.projectRef="DEMO-OTHER-001";
  const r=rejected(b,JSON.parse(readFileSync(template,"utf8")));
  assert.equal(r.status,2); assert.match(r.stderr,/commercial readiness contract mismatch/);
});

test("consent or acquisition delivery promotion fails closed",()=>{
  for(const edit of [b=>b.acquisition.consent.marketing=true,b=>b.acquisition.workflow.customerDelivery="RELEASE"]){
    const b=JSON.parse(readFileSync(fixture,"utf8")); edit(b);
    const r=rejected(b,JSON.parse(readFileSync(template,"utf8")));
    assert.equal(r.status,2); assert.match(r.stderr,/acquisition handoff contract mismatch/);
  }
});

test("invented payment or revenue state fails closed",()=>{
  for(const edit of [b=>b.commercial.clearedEvidenceGBP=195,b=>b.commercial.commercialTruth="REVENUE"]){
    const b=JSON.parse(readFileSync(fixture,"utf8")); edit(b);
    const r=rejected(b,JSON.parse(readFileSync(template,"utf8")));
    assert.equal(r.status,2); assert.match(r.stderr,/commercial readiness contract mismatch/);
  }
});

test("missing QA pass or false human/client completion fails closed",()=>{
  for(const edit of [b=>b.qa.outcomes.Privacy="NOT RUN",b=>b.qa.humanReview="PASS",b=>b.qa.clientAcceptance="PASS",b=>b.qa.overallGate="RELEASE"]){
    const b=JSON.parse(readFileSync(fixture,"utf8")); edit(b);
    const r=rejected(b,JSON.parse(readFileSync(template,"utf8")));
    assert.equal(r.status,2); assert.match(r.stderr,/twelve-test QA rehearsal contract mismatch/);
  }
});

test("lifecycle deletion, connection or live promotion fails closed",()=>{
  for(const edit of [b=>b.lifecycle.deletionExecuted=true,b=>b.lifecycle.storageConnected=true,b=>b.lifecycle.live=true]){
    const b=JSON.parse(readFileSync(fixture,"utf8")); edit(b);
    const r=rejected(b,JSON.parse(readFileSync(template,"utf8")));
    assert.equal(r.status,2); assert.match(r.stderr,/lifecycle contract mismatch/);
  }
});

test("PR30 handoff identity must match the PR43 lifecycle enquiry",()=>{
  const b=JSON.parse(readFileSync(fixture,"utf8")); b.lifecycle.enquiryId="aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  const r=rejected(b,JSON.parse(readFileSync(template,"utf8")));
  assert.equal(r.status,2); assert.match(r.stderr,/lifecycle contract mismatch/);
});

test("nonblank connection placeholders and approval are rejected",()=>{
  for(const edit of [c=>c.acquisitionAdapter="live",c=>c.previewUrl="https://preview.example",c=>c.ownerApproval="GRANTED",c=>c.liveEnabled=true]){
    const c=JSON.parse(readFileSync(template,"utf8")); edit(c);
    const r=rejected(JSON.parse(readFileSync(fixture,"utf8")),c);
    assert.equal(r.status,2); assert.match(r.stderr,/blank, disconnected, NOT_GRANTED and non-live/);
  }
});

test("real email and destructive flags are rejected",()=>{
  const b=JSON.parse(readFileSync(fixture,"utf8")); b.email="person@example.com";
  let r=rejected(b,JSON.parse(readFileSync(template,"utf8")));
  assert.equal(r.status,2); assert.match(r.stderr,/non-fixture email/);
  for(const flag of ["--send","--invoice","--connect","--deploy"]){
    r=spawnSync(process.execPath,[script,flag,"yes"],{encoding:"utf8"});
    assert.equal(r.status,2); assert.match(r.stderr,/no connection, delivery, payment or live change made/);
  }
});

test("symlink output is rejected",()=>{
  const dir=temp();
  try{
    const target=join(dir,"target.json"),link=join(dir,"link.json");
    writeFileSync(target,"{}\n",{mode:0o600}); symlinkSync(target,link);
    const r=spawnSync(process.execPath,[script,"--bundle",fixture,"--config",template,"--output",link],{encoding:"utf8"});
    assert.equal(r.status,2); assert.match(r.stderr,/unsafe/);
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test("documentation keeps Wednesday work and live browser evidence separate",()=>{
  for(const marker of ["READY", "TESTED_OFFLINE", "NEEDS_CONNECTION", "customer delivery HOLD", "NOT RUN by this gate", "one owner action"])
    assert.ok(doc.includes(marker),"missing marker: "+marker);
});
