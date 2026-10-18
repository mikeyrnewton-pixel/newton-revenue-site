import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, lstatSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const builder = new URL("../scripts/task024-provider-request-builder.mjs", import.meta.url).pathname;
const gate = new URL("../scripts/task024-provider-route-gate.mjs", import.meta.url).pathname;
function temp() { return mkdtempSync(join(tmpdir(), "task024-request-")); }
function build(dir, extra=[]) {
  const output=join(dir,"request.json");
  const stdout=execFileSync(process.execPath,[builder,"--provider","Cerebras","--purpose","One bounded synthetic response-format test","--output",output,...extra],{encoding:"utf8",timeout:6000});
  return {output,status:JSON.parse(stdout),request:JSON.parse(readFileSync(output,"utf8"))};
}

test("creates a private zero-spend NOT_GRANTED request",()=>{
  const dir=temp();
  try {
    const out=build(dir);
    assert.equal(out.status.result,"PRIVATE_REQUEST_CREATED_NOT_GRANTED");
    assert.equal(out.request.ownerApproval,"NOT_GRANTED");
    assert.equal(out.request.syntheticOnly,true);
    assert.equal(out.request.maxCalls,1);
    assert.equal(out.request.maxSpendGBP,0);
    assert.equal(lstatSync(out.output).mode & 0o077,0);
    for (const key of ["personalData","externalContact","publishing","trading","accountChange"])
      assert.equal(out.request[key],false);
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test("builder output integrates with the gate as HOLD_OWNER_APPROVAL",()=>{
  const dir=temp();
  try {
    const out=build(dir);
    const inventoryPath=join(dir,"inventory.json"), receiptPath=join(dir,"receipt.json");
    writeFileSync(inventoryPath,JSON.stringify({
      result:"READ_ONLY_INVENTORY_COMPLETE",
      authorisation:"NO_PROVIDER_NETWORK_CALLS_NO_CHARGES",
      providers:[{provider:"Cerebras",inExistingRouter:true,routeType:"CORE_IN_SOURCE",credentialStatus:"PRESENT_UNTESTED"}]
    }),{mode:0o600});
    const receipt=JSON.parse(execFileSync(process.execPath,[gate,"--inventory",inventoryPath,"--request",out.output,"--output",receiptPath],{encoding:"utf8",timeout:6000}));
    assert.equal(receipt.result,"HOLD_OWNER_APPROVAL");
    assert.ok(Object.values(receipt.assertions).every(value=>value===false));
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test("purpose must explicitly be synthetic",()=>{
  const dir=temp();
  try {
    const output=join(dir,"request.json");
    const r=spawnSync(process.execPath,[builder,"--provider","Cerebras","--purpose","Run a model test","--output",output],{encoding:"utf8"});
    assert.equal(r.status,2);
    assert.match(r.stderr,/synthetic/);
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test("secret-like text is rejected",()=>{
  const dir=temp();
  try {
    const output=join(dir,"request.json");
    const r=spawnSync(process.execPath,[builder,"--provider","Cerebras","--purpose","Synthetic test api_key=DO_NOT_STORE","--output",output],{encoding:"utf8"});
    assert.equal(r.status,2);
    assert.match(r.stderr,/unsafe/);
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test("symlink output is rejected",()=>{
  const dir=temp();
  try {
    const target=join(dir,"target.json"), link=join(dir,"link.json");
    writeFileSync(target,"{}\n",{mode:0o600}); symlinkSync(target,link);
    const r=spawnSync(process.execPath,[builder,"--provider","Cerebras","--purpose","One synthetic test","--output",link],{encoding:"utf8"});
    assert.equal(r.status,2); assert.match(r.stderr,/unsafe/);
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test("approval, provider execution and spend flags are not accepted",()=>{
  for (const flag of ["--approve","--call-provider","--enable-route","--buy-credits","--max-spend"]) {
    const r=spawnSync(process.execPath,[builder,flag,"yes"],{encoding:"utf8"});
    assert.equal(r.status,2);
    assert.match(r.stderr,/no request, provider call, approval, or route change made/);
  }
});
