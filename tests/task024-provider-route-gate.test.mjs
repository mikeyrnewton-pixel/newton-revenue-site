import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, lstatSync, symlinkSync, rmSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const command = new URL("../scripts/task024-provider-route-gate.mjs", import.meta.url).pathname;
const inventory = (providers) => ({
  result:"READ_ONLY_INVENTORY_COMPLETE",
  authorisation:"NO_PROVIDER_NETWORK_CALLS_NO_CHARGES",
  providers
});
const request = (changes={}) => ({
  schemaVersion:1, taskId:"TASK-024", provider:"Cerebras",
  purpose:"One bounded synthetic response-format test", syntheticOnly:true,
  ownerApproval:"NOT_GRANTED", maxCalls:1, maxSpendGBP:0,
  personalData:false, externalContact:false, publishing:false, trading:false,
  accountChange:false, ...changes
});
function fixture(inv, req) {
  const dir=mkdtempSync(join(tmpdir(),"task024-gate-"));
  const inventoryPath=join(dir,"inventory.json"), requestPath=join(dir,"request.json"), outputPath=join(dir,"receipt.json");
  writeFileSync(inventoryPath, JSON.stringify(inv), {mode:0o600});
  writeFileSync(requestPath, JSON.stringify(req), {mode:0o600});
  return {dir,inventoryPath,requestPath,outputPath};
}
function run(f) {
  return JSON.parse(execFileSync(process.execPath,[command,"--inventory",f.inventoryPath,"--request",f.requestPath,"--output",f.outputPath],{encoding:"utf8",timeout:6000}));
}

test("core route can become ready only as an uncalled decision receipt",()=>{
  const f=fixture(inventory([{provider:"Cerebras",inExistingRouter:true,routeType:"CORE_IN_SOURCE",credentialStatus:"PRESENT_UNTESTED"}]),request({ownerApproval:"GRANTED_FOR_ONE_ZERO_COST_TEST"}));
  try {
    const out=run(f);
    assert.equal(out.result,"READY_FOR_SEPARATE_ONE_CALL_TEST_UNCALLED");
    assert.deepEqual(new Set(Object.values(out.assertions)),new Set([false]));
    assert.equal(lstatSync(f.outputPath).mode & 0o077,0);
    assert.deepEqual(out,JSON.parse(readFileSync(f.outputPath,"utf8")));
  } finally {rmSync(f.dir,{recursive:true,force:true});}
});

test("missing credential remains held",()=>{
  const f=fixture(inventory([{provider:"Cerebras",inExistingRouter:true,routeType:"CORE_IN_SOURCE",credentialStatus:"MISSING_OR_NOT_DISCOVERED"}]),request({ownerApproval:"GRANTED_FOR_ONE_ZERO_COST_TEST"}));
  try {assert.equal(run(f).result,"HOLD_CREDENTIAL_NOT_DISCOVERED");}
  finally {rmSync(f.dir,{recursive:true,force:true});}
});

test("optional route remains disabled even with a detected credential and approval",()=>{
  const f=fixture(inventory([{provider:"xAI (Grok API)",inExistingRouter:false,routeType:"OPTIONAL_DISABLED_IN_SOURCE",credentialStatus:"PRESENT_UNTESTED"}]),request({provider:"xAI (Grok API)",ownerApproval:"GRANTED_FOR_ONE_ZERO_COST_TEST"}));
  try {assert.equal(run(f).result,"HOLD_OPTIONAL_ROUTE_DISABLED");}
  finally {rmSync(f.dir,{recursive:true,force:true});}
});

test("absence of owner approval is explicit and fail-closed",()=>{
  const f=fixture(inventory([{provider:"Cerebras",inExistingRouter:true,routeType:"CORE_IN_SOURCE",credentialStatus:"PRESENT_UNTESTED"}]),request());
  try {assert.equal(run(f).result,"HOLD_OWNER_APPROVAL");}
  finally {rmSync(f.dir,{recursive:true,force:true});}
});

test("spend, personal data, external action and secret-like fields are rejected",()=>{
  for (const changes of [{maxSpendGBP:0.01},{personalData:true},{externalContact:true},{apiKey:"never"}]) {
    const f=fixture(inventory([]),request(changes));
    try {
      const r=spawnSync(process.execPath,[command,"--inventory",f.inventoryPath,"--request",f.requestPath,"--output",f.outputPath],{encoding:"utf8",timeout:6000});
      assert.equal(r.status,2); assert.match(r.stderr,/no provider call or route change made/);
    } finally {rmSync(f.dir,{recursive:true,force:true});}
  }
});

test("unsafe files and execution-like CLI flags are rejected",()=>{
  const f=fixture(inventory([]),request());
  try {
    const loose=fixture(inventory([]),request());
    try {
      writeFileSync(loose.requestPath,JSON.stringify(request()),{mode:0o644});
      chmodSync(loose.requestPath,0o644);
      const r=spawnSync(process.execPath,[command,"--inventory",loose.inventoryPath,"--request",loose.requestPath,"--output",loose.outputPath],{encoding:"utf8"});
      assert.equal(r.status,2); assert.match(r.stderr,/permissions/);
    } finally {rmSync(loose.dir,{recursive:true,force:true});}
    const link=join(f.dir,"linked.json"); symlinkSync(f.requestPath,link);
    const linked=spawnSync(process.execPath,[command,"--inventory",f.inventoryPath,"--request",link,"--output",f.outputPath],{encoding:"utf8"});
    assert.equal(linked.status,2); assert.match(linked.stderr,/unsafe/);
    for (const flag of ["--call-provider","--enable-route","--buy-credits"]) {
      const r=spawnSync(process.execPath,[command,flag,"yes"],{encoding:"utf8"});
      assert.equal(r.status,2); assert.match(r.stderr,/no provider call or route change made/);
    }
  } finally {rmSync(f.dir,{recursive:true,force:true});}
});
