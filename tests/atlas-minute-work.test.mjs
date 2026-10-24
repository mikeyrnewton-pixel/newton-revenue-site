import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import * as fs from "node:fs/promises";
import {mkdtempSync,readFileSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {makeSnapshot} from "../scripts/atlas-observer-snapshot.mjs";
import {minuteWork,auditPinnedSources,PINNED,STAGE,MINUTE_SCHEMA} from "../scripts/atlas-minute-work.mjs";

const NOW=Date.UTC(2026,9,24,22,0,0);
const sourceNames=Object.keys(PINNED);
const sha=buf=>createHash("sha1").update("blob "+buf.length+"\0").update(buf).digest("hex");
const baseStatus=()=>({
  schema:"ATLAS_CONNECTOR_CONTROL_V1",mode:"READ_ONLY_LOCAL_STATUS",
  computer:"MACOS",noWritesPerformed:true,docker:"RESPONDING",
  containers:{
    activepiecesApp:"RUNNING_HEALTHY",activepiecesWorker:"RUNNING_HEALTHY",
    postgres:"RUNNING_HEALTHY",redis:"RUNNING_HEALTHY",tunnelClient:"RUNNING_HEALTHY"
  },
  activepiecesHttp:"HTTP_200",watchdog:"LAUNCHAGENT_LOADED",
  watchdogHeartbeat:"FRESH_UNDER_3_MINUTES",
});
async function fixture(cb){
  const home=mkdtempSync(path.join(tmpdir(),"atlas-minute-test-"));
  const root=path.join(home,STAGE);
  const observer=path.join(home,".atlas-observer");
  await fs.mkdir(path.join(root,"scripts"),{recursive:true,mode:0o700});
  await fs.mkdir(path.join(root,"tests"),{recursive:true,mode:0o700});
  await fs.mkdir(observer,{mode:0o700});
  await fs.chmod(root,0o700);
  await fs.chmod(path.join(root,"scripts"),0o700);
  await fs.chmod(path.join(root,"tests"),0o700);
  await fs.chmod(observer,0o700);
  const manifest={};
  for(const [index,name] of sourceNames.entries()){
    const bytes=Buffer.from("synthetic reviewed fixture number "+index);
    const filename=path.join(root,name);
    await fs.writeFile(filename,bytes,{mode:0o600});
    await fs.chmod(filename,0o600);
    manifest[name]=sha(bytes);
  }
  const statusPath=path.join(observer,"status.json");
  async function writeStatus(raw=baseStatus(),when=NOW){
    await fs.writeFile(statusPath,JSON.stringify(makeSnapshot(raw,new Date(when).toISOString())),{mode:0o600});
    await fs.chmod(statusPath,0o600);
  }
  await writeStatus();
  const go=()=>minuteWork({home,uid:process.getuid(),now:NOW,manifest});
  try{await cb({go,root,home,observer,statusPath,manifest,writeStatus});}
  finally{await fs.rm(home,{recursive:true,force:true});}
}
test("One-shot minute work verifies only private source integrity and health, with no changes",async()=>{
  await fixture(async({go})=>{
    const result=go();
    assert.equal(result.schema,MINUTE_SCHEMA);
    assert.equal(result.state,"NO_REVIEW_SIGNAL");
    assert.equal(result.next,"NONE");
    assert.equal(result.sourceAudit.state,"PINNED_SOURCES_VERIFIED");
    assert.equal(result.sourceAudit.checked,3);
    assert.equal(result.triage.state,"NO_REVIEW_SIGNAL");
    assert.equal(result.changesApplied,false);
    assert.equal(result.networkCalls,false);
    assert.equal(result.moneySpentGBP,0);
    assert.equal(result.autoRepair,false);
  });
});
test("Tampered or missing stage file fails closed without printing its contents",async()=>{
  await fixture(async({go,root})=>{
    const target=path.join(root,sourceNames[0]);
    await fs.writeFile(target,"test tampering",{mode:0o600});
    let result=go();
    assert.equal(result.sourceAudit.state,"SOURCE_HASH_MISMATCH");
    assert.equal(result.next,"REVIEW_PINNED_SOURCE_INTEGRITY");
    await fs.unlink(target);
    result=go();
    assert.equal(result.sourceAudit.state,"SOURCE_UNAVAILABLE");
    assert.equal(JSON.stringify(result).includes("test tampering"),false);
  });
});
test("Symlinks and unsafe permissions do not pass",async()=>{
  await fixture(async({go,root,home})=>{
    const target=path.join(root,sourceNames[1]);
    const external=path.join(home,"other");
    await fs.copyFile(target,external);
    await fs.unlink(target);
    await fs.symlink(external,target);
    assert.equal(go().sourceAudit.state,"SOURCE_UNAVAILABLE");
    await fs.unlink(target);
    await fs.rename(external,target);
    await fs.chmod(target,0o644);
    assert.equal(go().sourceAudit.state,"SOURCE_UNAVAILABLE");
  });
});
test("A stale health snapshot never becomes healthy just because source integrity is fine",async()=>{
  await fixture(async({go,writeStatus})=>{
    await writeStatus(baseStatus(),NOW-301000);
    const result=go();
    assert.equal(result.state,"REVIEW_REQUIRED");
    assert.equal(result.triage.state,"BLOCKED_UNVERIFIED_SNAPSHOT");
    assert.equal(result.next,"REVIEW_SNAPSHOT_FRESHNESS");
  });
});
test("Review finding creates no actual repair or provider request",async()=>{
  await fixture(async({go,writeStatus})=>{
    const bad=baseStatus();
    bad.containers.activepiecesWorker="NOT_RUNNING";
    await writeStatus(bad);
    const r=go();
    assert.equal(r.next,"REVIEW_CORE_SERVICES");
    assert.equal(r.changesApplied,false);
    assert.equal(r.autoRepair,false);
    assert.equal(r.networkCalls,false);
  });
});
test("Minute worker CLI has no daemon/start/repair action",()=>{
  const p=fileURLToPath(new URL("../scripts/atlas-minute-work.mjs",import.meta.url));
  for(const args of [[],["--daemon"],["--repair"],["--install"],["--schedule"],["--run-once","--write"]]){
    const r=spawnSync(process.execPath,[p,...args],{encoding:"utf8",timeout:4000});
    assert.equal(r.status,2);
    assert.equal(r.stdout,"");
  }
  const help=spawnSync(process.execPath,[p,"--help"],{encoding:"utf8",timeout:4000});
  assert.equal(help.status,0);
  assert.match(help.stdout,/no service changes or built-in scheduler/);
  const source=readFileSync(p,"utf8");
  for(const forbidden of [/\bsetInterval\s*\(/,/\bfetch\s*\(/,
    /\bspawn(?:Sync)?\s*\(/,/\bexec(?:Sync|File)?\s*\(/,
    /\bwriteFile(?:Sync)?\s*\(/,/\bcreateServer\s*\(/]){
    assert.doesNotMatch(source,forbidden);
  }
});
