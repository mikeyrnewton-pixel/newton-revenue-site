import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, lstatSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const script = new URL("../scripts/enquiry-lifecycle-receipt.mjs", import.meta.url).pathname;
const template = new URL("../config/enquiry-lifecycle.template.json", import.meta.url).pathname;
const doc = readFileSync(new URL("../docs/ENQUIRY_LIFECYCLE_CONNECT_LATER.md", import.meta.url), "utf8");
const temp = () => mkdtempSync(join(tmpdir(), "enquiry-lifecycle-"));
const baseRecord = overrides => ({
  schemaVersion: 1,
  enquiryId: "synthetic-enquiry-001",
  email: "qa@example.invalid",
  createdAt: "2026-10-01T09:00:00.000Z",
  syntheticOnly: true,
  personalData: false,
  deletionRequested: false,
  ...overrides
});
function run(dir, record, asOf="2026-10-20T08:00:00.000Z") {
  const recordPath=join(dir,"record.json"), output=join(dir,"receipt.json");
  writeFileSync(recordPath,JSON.stringify(record),{mode:0o600});
  const summary=JSON.parse(execFileSync(process.execPath,[script,"--record",recordPath,"--policy",template,"--as-of",asOf,"--output",output],{encoding:"utf8",timeout:6000}));
  return {summary,receipt:JSON.parse(readFileSync(output,"utf8")),output};
}

test("creates a private redacted retain receipt without connecting or deleting",()=>{
  const dir=temp();
  try {
    const out=run(dir,baseRecord());
    assert.equal(out.summary.result,"PRIVATE_REDACTED_LIFECYCLE_RECEIPT_CREATED");
    assert.equal(out.receipt.decision,"RETAIN_UNTIL_POLICY_DATE");
    assert.equal(out.receipt.connectionStatus,"NEEDS_CONNECTION");
    assert.equal(out.receipt.live,false);
    assert.equal(out.receipt.deletionExecuted,false);
    assert.equal(out.receipt.email,undefined);
    assert.match(out.receipt.inputFingerprintSha256,/^[a-f0-9]{64}$/);
    assert.equal(lstatSync(out.output).mode & 0o077,0);
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test("deletion request is held for owner review and never executed",()=>{
  const dir=temp();
  try {
    const out=run(dir,baseRecord({deletionRequested:true}));
    assert.equal(out.receipt.decision,"HOLD_OWNER_APPROVAL_FOR_DELETION_REVIEW");
    assert.equal(out.receipt.ownerApproval,"NOT_GRANTED");
    assert.equal(out.receipt.deletionExecuted,false);
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test("expired retention is a review hold, not automatic deletion",()=>{
  const dir=temp();
  try {
    const out=run(dir,baseRecord(),"2026-11-15T09:00:00.000Z");
    assert.equal(out.receipt.decision,"RETENTION_EXPIRED_HOLD_FOR_REVIEW");
    assert.equal(out.receipt.deletionExecuted,false);
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test("real email and personal-data claims fail closed",()=>{
  for (const edit of [{email:"person@example.com"},{personalData:true}]) {
    const dir=temp();
    try {
      const recordPath=join(dir,"record.json"), output=join(dir,"receipt.json");
      writeFileSync(recordPath,JSON.stringify(baseRecord(edit)),{mode:0o600});
      const r=spawnSync(process.execPath,[script,"--record",recordPath,"--policy",template,"--as-of","2026-10-20T08:00:00.000Z","--output",output],{encoding:"utf8"});
      assert.equal(r.status,2);
      assert.match(r.stderr,/no connection, deletion, approval or live change made/);
    } finally {rmSync(dir,{recursive:true,force:true});}
  }
});

test("connected, approved or live policy values fail closed",()=>{
  for (const edit of [{storageAdapter:"kv-live"},{deletionAdapter:"delete-live"},{ownerApproval:"GRANTED"},{liveEnabled:true}]) {
    const dir=temp();
    try {
      const recordPath=join(dir,"record.json"), policyPath=join(dir,"policy.json"), output=join(dir,"receipt.json");
      writeFileSync(recordPath,JSON.stringify(baseRecord()),{mode:0o600});
      writeFileSync(policyPath,JSON.stringify({...JSON.parse(readFileSync(template,"utf8")),...edit}),{mode:0o600});
      const r=spawnSync(process.execPath,[script,"--record",recordPath,"--policy",policyPath,"--as-of","2026-10-20T08:00:00.000Z","--output",output],{encoding:"utf8"});
      assert.equal(r.status,2); assert.match(r.stderr,/disconnected, NOT_GRANTED and non-live/);
    } finally {rmSync(dir,{recursive:true,force:true});}
  }
});

test("destructive and connection flags are unsupported",()=>{
  for (const flag of ["--delete","--connect","--approve","--live","--credential"]) {
    const r=spawnSync(process.execPath,[script,flag,"yes"],{encoding:"utf8"});
    assert.equal(r.status,2);
    assert.match(r.stderr,/no connection, deletion, approval or live change made/);
  }
});

test("symlink output is rejected",()=>{
  const dir=temp();
  try {
    const recordPath=join(dir,"record.json"), target=join(dir,"target.json"), link=join(dir,"link.json");
    writeFileSync(recordPath,JSON.stringify(baseRecord()),{mode:0o600});
    writeFileSync(target,"{}\n",{mode:0o600}); symlinkSync(target,link);
    const r=spawnSync(process.execPath,[script,"--record",recordPath,"--policy",template,"--as-of","2026-10-20T08:00:00.000Z","--output",link],{encoding:"utf8"});
    assert.equal(r.status,2); assert.match(r.stderr,/unsafe/);
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test("template and documentation preserve CONNECT LATER state labels",()=>{
  const policy=JSON.parse(readFileSync(template,"utf8"));
  assert.equal(policy.storageAdapter,"");
  assert.equal(policy.deletionAdapter,"");
  assert.equal(policy.connectionStatus,"NEEDS_CONNECTION");
  assert.equal(policy.ownerApproval,"NOT_GRANTED");
  assert.equal(policy.liveEnabled,false);
  for (const marker of ["BUILT", "TESTED_OFFLINE", "STAGED", "NEEDS_CONNECTION", "not LIVE", "one owner action"])
    assert.ok(doc.includes(marker),"missing documentation marker: "+marker);
});
