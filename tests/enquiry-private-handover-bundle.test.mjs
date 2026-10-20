import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,readFileSync,writeFileSync,chmodSync,symlinkSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {createHash} from "node:crypto";
import {spawnSync} from "node:child_process";

const script=resolve("scripts/enquiry-private-handover-bundle.mjs");
const configTemplate=resolve("config/enquiry-private-handover-connect-later.template.json");
const sha=value=>createHash("sha256").update(value).digest("hex");
const report=`# Enquiry Ownership Diagnostic — FICTIONAL DEMONSTRATION\n\nNOT CLIENT WORK\n\nDelivery release: HOLD\n\n## 12-test QA execution record\n\n${"Synthetic evidence remains held for private review only. ".repeat(20)}\n`;
function write(path,value){writeFileSync(path,typeof value==="string"?value:JSON.stringify(value,null,2)+"\n",{mode:0o600});chmodSync(path,0o600)}
function setup(){
  const dir=mkdtempSync(join(tmpdir(),"handover-")),paths={report:join(dir,"report.md"),acceptance:join(dir,"acceptance.json"),compatibility:join(dir,"compatibility.json"),lifecycle:join(dir,"lifecycle.json"),config:join(dir,"config.json"),output:join(dir,"manifest.json")};
  const evidenceDigest="sha256:"+"a".repeat(64),projectRef="DEMO-DIAG-001";
  write(paths.report,report);
  write(paths.acceptance,{schema:"NEWTON_REDACTED_REPORT_ACCEPTANCE_V1",synthetic:true,projectRef,result:"REDACTED_REPORT_ACCEPTED_FOR_PRIVATE_REVIEW",reportSha256:sha(report),compatibilityEvidenceDigest:evidenceDigest,customerDelivery:"HOLD",connectionState:"NEEDS_CONNECTION",paymentState:"NOT_CLEARED",live:false,externalAction:false});
  write(paths.compatibility,{schema:"NEWTON_FULFILMENT_COMPATIBILITY_MANIFEST_V1",synthetic:true,projectRef,enquiryId:"synthetic-enquiry-001",commercialBasis:{priceGBP:195,vatTreatment:"VAT_INCLUDED",supplierAddressApproved:true,termsApproved:true},result:"READY_FOR_HUMAN_ASSISTED_PRIVATE_DRY_RUN",evidenceDigest,customerDelivery:"HOLD",paymentState:"NOT_CLEARED",connectionState:"NEEDS_CONNECTION",live:false,externalAction:false});
  write(paths.lifecycle,{schemaVersion:1,component:"ENQUIRY_LIFECYCLE_REVIEW",state:"STAGED",testMode:"OFFLINE_SYNTHETIC_ONLY",connectionStatus:"NEEDS_CONNECTION",live:false,decision:"RETAIN_UNTIL_POLICY_DATE",enquiryId:"synthetic-enquiry-001",emailClass:"SYNTHETIC_EXAMPLE_INVALID_REDACTED",createdAt:"2026-10-01T09:00:00.000Z",asOf:"2026-10-20T08:00:00.000Z",deleteEligibleAt:"2026-10-31T09:00:00.000Z",ownerApproval:"NOT_GRANTED",storageConnected:false,deletionExecuted:false,externalContact:false,inputFingerprintSha256:"b".repeat(64)});
  write(paths.config,readFileSync(configTemplate,"utf8"));
  return paths;
}
function run(paths,overrides={}){const p={...paths,...overrides};return spawnSync(process.execPath,[script,"--report",p.report,"--acceptance",p.acceptance,"--compatibility",p.compatibility,"--lifecycle",p.lifecycle,"--config",p.config,"--output",p.output],{encoding:"utf8"})}
function mutate(path,fn){const value=JSON.parse(readFileSync(path,"utf8"));fn(value);write(path,value)}

test("creates a four-file checksum-bound private HOLD manifest",()=>{const p=setup(),r=run(p);assert.equal(r.status,0,r.stderr);const out=JSON.parse(readFileSync(p.output));assert.equal(out.result,"READY_FOR_OWNER_PRIVATE_HANDOVER_REVIEW");assert.equal(out.files.length,4);assert.match(out.evidenceDigest,/^sha256:[a-f0-9]{64}$/);assert.equal(out.customerDelivery,"HOLD");assert.deepEqual(out.commercialBasis,{priceGBP:195,vatTreatment:"VAT_INCLUDED",supplierAddressApproved:true,termsApproved:true});assert.equal(out.live,false)});
test("accepts the actual lifecycle gate output end to end",()=>{const p=setup(),record=join(p.output+"-record.json"),policy=join(p.output+"-policy.json");write(record,{schemaVersion:1,enquiryId:"synthetic-enquiry-001",email:"qa@example.invalid",createdAt:"2026-10-01T09:00:00.000Z",syntheticOnly:true,personalData:false,deletionRequested:false});write(policy,{schemaVersion:1,retentionDays:30,deletionGraceDays:7,storageAdapter:"",deletionAdapter:"",connectionStatus:"NEEDS_CONNECTION",ownerApproval:"NOT_GRANTED",liveEnabled:false});const lifecycleRun=spawnSync(process.execPath,[resolve("scripts/enquiry-lifecycle-receipt.mjs"),"--record",record,"--policy",policy,"--as-of","2026-10-20T08:00:00.000Z","--output",p.lifecycle],{encoding:"utf8"});assert.equal(lifecycleRun.status,0,lifecycleRun.stderr);const r=run(p);assert.equal(r.status,0,r.stderr);const out=JSON.parse(readFileSync(p.output));assert.equal(out.lifecycleEnquiryId,"synthetic-enquiry-001");assert.equal(out.lifecycleDecision,"RETAIN_UNTIL_POLICY_DATE")});
test("blocks handover when the actual lifecycle gate records a deletion request",()=>{const p=setup(),record=join(p.output+"-delete-record.json"),policy=join(p.output+"-delete-policy.json");write(record,{schemaVersion:1,enquiryId:"synthetic-enquiry-001",email:"qa@example.invalid",createdAt:"2026-10-01T09:00:00.000Z",syntheticOnly:true,personalData:false,deletionRequested:true});write(policy,{schemaVersion:1,retentionDays:30,deletionGraceDays:7,storageAdapter:"",deletionAdapter:"",connectionStatus:"NEEDS_CONNECTION",ownerApproval:"NOT_GRANTED",liveEnabled:false});const lifecycleRun=spawnSync(process.execPath,[resolve("scripts/enquiry-lifecycle-receipt.mjs"),"--record",record,"--policy",policy,"--as-of","2026-10-20T08:00:00.000Z","--output",p.lifecycle],{encoding:"utf8"});assert.equal(lifecycleRun.status,0,lifecycleRun.stderr);assert.equal(JSON.parse(readFileSync(p.lifecycle)).decision,"HOLD_OWNER_APPROVAL_FOR_DELETION_REVIEW");const r=run(p);assert.equal(r.status,2);assert.match(r.stderr,/not current retention evidence/)});
test("blocks handover when the actual lifecycle gate records expired retention",()=>{const p=setup(),record=join(p.output+"-expired-record.json"),policy=join(p.output+"-expired-policy.json");write(record,{schemaVersion:1,enquiryId:"synthetic-enquiry-001",email:"qa@example.invalid",createdAt:"2026-09-01T09:00:00.000Z",syntheticOnly:true,personalData:false,deletionRequested:false});write(policy,{schemaVersion:1,retentionDays:30,deletionGraceDays:7,storageAdapter:"",deletionAdapter:"",connectionStatus:"NEEDS_CONNECTION",ownerApproval:"NOT_GRANTED",liveEnabled:false});const lifecycleRun=spawnSync(process.execPath,[resolve("scripts/enquiry-lifecycle-receipt.mjs"),"--record",record,"--policy",policy,"--as-of","2026-10-20T08:00:00.000Z","--output",p.lifecycle],{encoding:"utf8"});assert.equal(lifecycleRun.status,0,lifecycleRun.stderr);assert.equal(JSON.parse(readFileSync(p.lifecycle)).decision,"RETENTION_EXPIRED_HOLD_FOR_REVIEW");const r=run(p);assert.equal(r.status,2);assert.match(r.stderr,/not current retention evidence/)});
test("rejects a compatibility manifest with an altered commercial basis",()=>{const p=setup();mutate(p.compatibility,v=>{v.commercialBasis.priceGBP=295;v.commercialBasis.vatTreatment="UNKNOWN";v.commercialBasis.supplierAddressApproved=false;v.commercialBasis.termsApproved=false});const r=run(p);assert.equal(r.status,2);assert.match(r.stderr,/compatibility manifest does not match/)});
test("rejects a compatibility manifest for a different enquiry",()=>{const p=setup();mutate(p.compatibility,v=>{v.enquiryId="synthetic-enquiry-999"});const r=run(p);assert.equal(r.status,2);assert.match(r.stderr,/compatibility manifest does not match/)});
test("runs lifecycle through compatibility and report acceptance into handover",()=>{
  const dir=mkdtempSync(join(tmpdir(),"handover-chain-"));
  const record=join(dir,"record.json"),policy=join(dir,"policy.json"),lifecycle=join(dir,"lifecycle.json");
  const bundle=join(dir,"bundle.json"),compatibility=join(dir,"compatibility.json"),report=join(dir,"report.md");
  const acceptance=join(dir,"acceptance.json"),handoverConfig=join(dir,"handover-config.json"),output=join(dir,"handover.json");
  write(record,{schemaVersion:1,enquiryId:"11111111-2222-4333-8444-555555555555",email:"qa@example.invalid",createdAt:"2026-10-01T09:00:00.000Z",syntheticOnly:true,personalData:false,deletionRequested:false});
  write(policy,{schemaVersion:1,retentionDays:30,deletionGraceDays:7,storageAdapter:"",deletionAdapter:"",connectionStatus:"NEEDS_CONNECTION",ownerApproval:"NOT_GRANTED",liveEnabled:false});
  let r=spawnSync(process.execPath,[resolve("scripts/enquiry-lifecycle-receipt.mjs"),"--record",record,"--policy",policy,"--as-of","2026-10-20T08:00:00.000Z","--output",lifecycle],{encoding:"utf8"});
  assert.equal(r.status,0,r.stderr);
  const input=JSON.parse(readFileSync(resolve("fixtures/enquiry-fulfilment-compatibility.synthetic.json"),"utf8"));
  input.lifecycle=JSON.parse(readFileSync(lifecycle,"utf8"));write(bundle,input);
  r=spawnSync(process.execPath,[resolve("scripts/enquiry-fulfilment-compatibility-gate.mjs"),"--bundle",bundle,"--config",resolve("config/enquiry-fulfilment-connect-later.template.json"),"--output",compatibility],{encoding:"utf8"});
  assert.equal(r.status,0,r.stderr);
  write(report,readFileSync(resolve("fixtures/enquiry-redacted-report.synthetic.md"),"utf8"));
  r=spawnSync(process.execPath,[resolve("scripts/enquiry-redacted-report-acceptance.mjs"),"--report",report,"--compatibility",compatibility,"--config",resolve("config/enquiry-redacted-report-connect-later.template.json"),"--output",acceptance],{encoding:"utf8"});
  assert.equal(r.status,0,r.stderr);
  write(handoverConfig,readFileSync(configTemplate,"utf8"));
  r=spawnSync(process.execPath,[script,"--report",report,"--acceptance",acceptance,"--compatibility",compatibility,"--lifecycle",lifecycle,"--config",handoverConfig,"--output",output],{encoding:"utf8"});
  assert.equal(r.status,0,r.stderr);
  const receipt=JSON.parse(readFileSync(output,"utf8"));
  assert.equal(receipt.lifecycleEnquiryId,"11111111-2222-4333-8444-555555555555");
  assert.deepEqual(receipt.commercialBasis,{priceGBP:195,vatTreatment:"VAT_INCLUDED",supplierAddressApproved:true,termsApproved:true});
  assert.equal(receipt.customerDelivery,"HOLD");assert.equal(receipt.paymentState,"NOT_CLEARED");assert.equal(receipt.live,false);
});
test("rejects a report changed after acceptance",()=>{const p=setup();write(p.report,report+"changed\n");const r=run(p);assert.equal(r.status,2);assert.match(r.stderr,/checksum-bound/)});
test("rejects a missing evidence file",()=>{const p=setup(),r=run(p,{lifecycle:join(tmpdir(),"definitely-missing-lifecycle.json")});assert.equal(r.status,2);assert.match(r.stderr,/does not exist/)});
test("rejects duplicate paths and unsafe logical bundle membership",()=>{const p=setup(),r=run(p,{lifecycle:p.compatibility});assert.equal(r.status,2);assert.match(r.stderr,/distinct/)});
test("rejects symlinked evidence",()=>{const p=setup(),link=join(tmpdir(),`handover-link-${Date.now()}.json`);symlinkSync(p.lifecycle,link);const r=run(p,{lifecycle:link});assert.equal(r.status,2);assert.match(r.stderr,/non-symlink/)});
test("rejects non-private evidence permissions",()=>{const p=setup();chmodSync(p.report,0o644);const r=run(p);assert.equal(r.status,2);assert.match(r.stderr,/0600/)});
test("rejects PII and completion claims",()=>{const p=setup();mutate(p.lifecycle,v=>{v.note="real.person@example.com CLIENT DELIVERED"});const r=run(p);assert.equal(r.status,2);assert.match(r.stderr,/non-fixture email|forbidden completion claim/)});
test("rejects promoted lifecycle evidence",()=>{const p=setup();mutate(p.lifecycle,v=>{v.live=true});const r=run(p);assert.equal(r.status,2);assert.match(r.stderr,/actual offline output|promoted beyond HOLD/)});
test("rejects populated adapters or approval",()=>{const p=setup();mutate(p.config,v=>{v.deliveryRoute="email";v.ownerApproval="GRANTED"});const r=run(p);assert.equal(r.status,2);assert.match(r.stderr,/blank, disconnected/)});
test("documents one owner action, rollback and unrun live checks",()=>{const doc=readFileSync(resolve("docs/ENQUIRY_PRIVATE_HANDOVER_BUNDLE_CONNECT_LATER.md"),"utf8");for(const marker of ["One owner action only","Rollback","Live browser: **NOT RUN**","Cloudflare preview: **NOT RUN**","NEEDS_CONNECTION"])assert.ok(doc.includes(marker),marker)});
