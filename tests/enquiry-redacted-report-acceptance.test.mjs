import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,readFileSync,writeFileSync,chmodSync,lstatSync,symlinkSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {execFileSync,spawnSync} from "node:child_process";

const script=new URL("../scripts/enquiry-redacted-report-acceptance.mjs",import.meta.url).pathname;
const fixture=new URL("../fixtures/enquiry-redacted-report.synthetic.md",import.meta.url).pathname;
const compat=new URL("../fixtures/enquiry-fulfilment-compatibility-manifest.synthetic.json",import.meta.url).pathname;
const template=new URL("../config/enquiry-redacted-report-connect-later.template.json",import.meta.url).pathname;
const doc=readFileSync(new URL("../docs/ENQUIRY_REDACTED_REPORT_CONNECT_LATER.md",import.meta.url),"utf8");
const temp=()=>mkdtempSync(join(tmpdir(),"redacted-report-"));
function run(dir,report=readFileSync(fixture,"utf8"),manifest=JSON.parse(readFileSync(compat,"utf8")),config=JSON.parse(readFileSync(template,"utf8"))){
  const rp=join(dir,"report.md"),mp=join(dir,"compat.json"),cp=join(dir,"config.json"),op=join(dir,"receipt.json");
  writeFileSync(rp,report,{mode:0o600});writeFileSync(mp,JSON.stringify(manifest),{mode:0o600});writeFileSync(cp,JSON.stringify(config),{mode:0o600});
  const summary=JSON.parse(execFileSync(process.execPath,[script,"--report",rp,"--compatibility",mp,"--config",cp,"--output",op],{encoding:"utf8",timeout:6000}));
  return {summary,receipt:JSON.parse(readFileSync(op,"utf8")),output:op};
}
function reject(report,manifest=JSON.parse(readFileSync(compat,"utf8")),config=JSON.parse(readFileSync(template,"utf8"))){
  const dir=temp();try{
    const rp=join(dir,"report.md"),mp=join(dir,"compat.json"),cp=join(dir,"config.json"),op=join(dir,"receipt.json");
    writeFileSync(rp,report,{mode:0o600});writeFileSync(mp,JSON.stringify(manifest),{mode:0o600});writeFileSync(cp,JSON.stringify(config),{mode:0o600});
    return spawnSync(process.execPath,[script,"--report",rp,"--compatibility",mp,"--config",cp,"--output",op],{encoding:"utf8"});
  }finally{rmSync(dir,{recursive:true,force:true});}
}

test("accepts the redacted report only for private review",()=>{
  const dir=temp();try{
    const out=run(dir);
    assert.equal(out.summary.result,"REDACTED_REPORT_ACCEPTED_FOR_PRIVATE_REVIEW");
    assert.equal(out.receipt.qaRowsHeldNotRun,12);
    assert.equal(out.receipt.customerDelivery,"HOLD");
    assert.equal(out.receipt.paymentState,"NOT_CLEARED");
    assert.equal(out.receipt.connectionState,"NEEDS_CONNECTION");
    assert.equal(out.receipt.live,false);
    assert.equal(out.receipt.enquiryId,"11111111-1111-4111-8111-111111111111");
    assert.deepEqual(out.receipt.commercialBasis,{priceGBP:195,vatTreatment:"OUTSIDE_SCOPE",supplierAddressApproved:true,termsApproved:true});
    assert.deepEqual(out.receipt.compatibleContracts,["PR11_QA","PR29_COMMERCIAL","PR30_ACQUISITION","PR43_LIFECYCLE"]);
    assert.deepEqual(out.receipt.compatibilityBlockers,["HUMAN_REVIEW_NOT_RUN","CLIENT_ACCEPTANCE_NOT_RUN","PAYMENT_NOT_CLEARED","OWNER_CONNECTION_NOT_APPROVED","LIVE_BROWSER_NOT_RUN"]);
    assert.match(out.receipt.compatibilityEvidenceDigest,/^sha256:[a-f0-9]{64}$/);
    assert.match(out.receipt.reportSha256,/^[a-f0-9]{64}$/);
    assert.equal(lstatSync(out.output).mode&0o077,0);
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test("actual combined fulfilment gate output is accepted end to end",()=>{
  const dir=temp();try{
    const gate=new URL("../scripts/enquiry-fulfilment-compatibility-gate.mjs",import.meta.url).pathname;
    const bundle=new URL("../fixtures/enquiry-fulfilment-compatibility.synthetic.json",import.meta.url).pathname;
    const gateConfig=new URL("../config/enquiry-fulfilment-connect-later.template.json",import.meta.url).pathname;
    const generated=join(dir,"compatibility.json");
    const gateRun=spawnSync(process.execPath,[gate,"--bundle",bundle,"--config",gateConfig,"--output",generated],{encoding:"utf8"});
    assert.equal(gateRun.status,0,gateRun.stderr);
    const manifest=JSON.parse(readFileSync(generated,"utf8"));
    const out=run(dir,readFileSync(fixture,"utf8"),manifest);
    assert.equal(out.receipt.projectRef,"DEMO-DIAG-001");
    assert.equal(out.receipt.enquiryId,"11111111-2222-4333-8444-555555555555");
    assert.equal(out.receipt.commercialBasis.priceGBP,195);
    assert.equal(out.receipt.customerDelivery,"HOLD");
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test("report project must match the compatibility manifest",()=>{
  const m=JSON.parse(readFileSync(compat,"utf8"));m.projectRef="DEMO-OTHER-001";
  const r=reject(readFileSync(fixture,"utf8"),m);
  assert.equal(r.status,2);assert.match(r.stderr,/report project does not match compatibility manifest/);
});

test("missing section or QA row fails closed",()=>{
  for(const marker of ["## Fictional evidence tracker","| Privacy | NOT RUN |"]){
    const report=readFileSync(fixture,"utf8").replace(marker,"");const r=reject(report);
    assert.equal(r.status,2);assert.match(r.stderr,/missing required marker|QA row is not held/);
  }
});

test("real email, telephone, credential and external URL fail closed",()=>{
  for(const leak of ["person@example.com","07123 456789","Bearer abcdefghijklmnopqrstuvwxyz","https://example.com"]){
    const r=reject(readFileSync(fixture,"utf8")+"\n"+leak);assert.equal(r.status,2);
  }
});

test("false release, delivery, acceptance or payment claims fail closed",()=>{
  for(const claim of ["RELEASE APPROVED","CLIENT DELIVERED","CLIENT ACCEPTED","PAYMENT CLEARED","LIVE VERIFIED"]){
    const r=reject(readFileSync(fixture,"utf8")+"\n"+claim);assert.equal(r.status,2);assert.match(r.stderr,/forbidden completion claim/);
  }
});

test("incomplete or promoted compatibility manifest fails closed",()=>{
  for(const edit of [
    m=>delete m.enquiryId,
    m=>m.commercialBasis.priceGBP=194,
    m=>m.compatibleContracts.splice(1,1),
    m=>m.blockers.splice(3,1),
    m=>m.evidenceDigest="sha256:invalid",
    m=>m.customerDelivery="RELEASE",
    m=>m.paymentState="CLEARED",
    m=>m.live=true
  ]){
    const m=JSON.parse(readFileSync(compat,"utf8"));edit(m);const r=reject(readFileSync(fixture,"utf8"),m);
    assert.equal(r.status,2);assert.match(r.stderr,/incomplete or promoted beyond offline HOLD/);
  }
});

test("connection placeholders and approval must stay blank",()=>{
  for(const edit of [c=>c.deliveryRoute="email",c=>c.recipientRole="buyer",c=>c.ownerApproval="GRANTED",c=>c.liveEnabled=true]){
    const c=JSON.parse(readFileSync(template,"utf8"));edit(c);const r=reject(readFileSync(fixture,"utf8"),undefined,c);
    assert.equal(r.status,2);assert.match(r.stderr,/blank, disconnected, NOT_GRANTED and non-live/);
  }
});

test("report must be private mode",()=>{
  const dir=temp();try{
    const rp=join(dir,"report.md"),op=join(dir,"receipt.json");writeFileSync(rp,readFileSync(fixture,"utf8"),{mode:0o644});chmodSync(rp,0o644);
    const r=spawnSync(process.execPath,[script,"--report",rp,"--compatibility",compat,"--config",template,"--output",op],{encoding:"utf8"});
    assert.equal(r.status,2);assert.match(r.stderr,/private mode 0600/);
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test("destructive/send flags and symlink output are rejected",()=>{
  for(const flag of ["--send","--deliver","--invoice","--publish"]){const r=spawnSync(process.execPath,[script,flag,"yes"],{encoding:"utf8"});assert.equal(r.status,2)}
  const dir=temp();try{
    const report=join(dir,"report.md"),target=join(dir,"target.json"),link=join(dir,"link.json");
    writeFileSync(report,readFileSync(fixture,"utf8"),{mode:0o600});writeFileSync(target,"{}\n",{mode:0o600});symlinkSync(target,link);
    const r=spawnSync(process.execPath,[script,"--report",report,"--compatibility",compat,"--config",template,"--output",link],{encoding:"utf8"});
    assert.equal(r.status,2);assert.match(r.stderr,/unsafe/);
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test("documentation preserves connect-later and browser-not-run boundary",()=>{
  for(const marker of ["READY","TESTED_OFFLINE","NEEDS_CONNECTION","customer delivery HOLD","one owner action","NOT RUN"])
    assert.ok(doc.includes(marker),"missing marker: "+marker);
});
