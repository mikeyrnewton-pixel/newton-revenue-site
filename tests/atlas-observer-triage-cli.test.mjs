import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import {mkdtempSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {makeSnapshot} from "../scripts/atlas-observer-snapshot.mjs";
import {triageOwnerSnapshot} from "../scripts/atlas-observer-triage-cli.mjs";

const T=Date.UTC(2026,9,24,22,0,0);
const raw=()=>({
  schema:"ATLAS_CONNECTOR_CONTROL_V1",
  mode:"READ_ONLY_LOCAL_STATUS",
  computer:"MACOS",noWritesPerformed:true,
  docker:"RESPONDING",
  containers:{
    activepiecesApp:"RUNNING_HEALTHY",
    activepiecesWorker:"RUNNING_HEALTHY",
    postgres:"RUNNING_HEALTHY",
    redis:"RUNNING_HEALTHY",
    tunnelClient:"RUNNING_HEALTHY"
  },
  activepiecesHttp:"HTTP_200",
  watchdog:"LAUNCHAGENT_LOADED",
  watchdogHeartbeat:"FRESH_UNDER_3_MINUTES",
});
async function fixture(cb){
  const home=mkdtempSync(path.join(tmpdir(),"atlas-triage-"));
  const dir=path.join(home,".atlas-observer");
  const file=path.join(dir,"status.json");
  await fs.mkdir(dir,{mode:0o700});
  await fs.chmod(dir,0o700);
  await fs.writeFile(file,JSON.stringify(makeSnapshot(raw(),new Date(T).toISOString())),{mode:0o600});
  await fs.chmod(file,0o600);
  const evaluate=()=>triageOwnerSnapshot({home,uid:process.getuid(),now:T});
  try{await cb({home,dir,file,evaluate});}
  finally{await fs.rm(home,{recursive:true,force:true});}
}
const blocked=r=>{
  assert.equal(r.state,"BLOCKED_UNVERIFIED_SNAPSHOT");
  assert.equal(r.next,"REVIEW_SNAPSHOT_FRESHNESS");
  assert.equal(r.autoRepair,false);
  assert.equal(r.externalRequests,false);
};
test("Reads only the fixed owner-private snapshot once and returns healthy review state",async()=>{
  await fixture(async({evaluate})=>{
    const result=evaluate();
    assert.equal(result.state,"NO_REVIEW_SIGNAL");
    assert.equal(result.next,"NONE");
    assert.equal(result.action,"REVIEW_ONLY");
    assert.equal(result.commandsExecuted,false);
  });
});
test("A stopped service becomes review work but cannot trigger an automatic restart",async()=>{
  await fixture(async({file,evaluate})=>{
    const data=raw();data.containers.postgres="NOT_RUNNING";
    await fs.writeFile(file,JSON.stringify(makeSnapshot(data,new Date(T).toISOString())));
    const result=evaluate();
    assert.equal(result.state,"NEEDS_REVIEW");
    assert.equal(result.next,"REVIEW_CORE_SERVICES");
    assert.equal(result.autoRepair,false);
  });
});
test("Rejects symlink, hardlink and broadened access without reading the target",async()=>{
  await fixture(async({home,dir,file,evaluate})=>{
    const victim=path.join(home,"victim");
    await fs.writeFile(victim,"keep me",{mode:0o600});
    await fs.unlink(file);
    await fs.symlink(victim,file);
    blocked(evaluate());
    assert.equal(await fs.readFile(victim,"utf8"),"keep me");
    await fs.unlink(file);
    await fs.link(victim,file);
    blocked(evaluate());
    await fs.unlink(file);
    await fs.writeFile(file,JSON.stringify(makeSnapshot(raw(),new Date(T).toISOString())));
    await fs.chmod(file,0o644);
    blocked(evaluate());
    await fs.chmod(file,0o600);
    await fs.chmod(dir,0o755);
    blocked(evaluate());
  });
});
test("Stale, malformed, oversized and wrong-identity snapshots fail closed",async()=>{
  await fixture(async({file,evaluate,home})=>{
    await fs.writeFile(file,JSON.stringify(makeSnapshot(raw(),new Date(T-301000).toISOString())));
    blocked(evaluate());
    await fs.writeFile(file,"not-json");
    blocked(evaluate());
    await fs.writeFile(file,"x".repeat(4097));
    blocked(evaluate());
    blocked(triageOwnerSnapshot({home,uid:process.getuid()+1000,now:T}));
  });
});
test("Diagnostic strips invented secrets and identifiers from its output",async()=>{
  await fixture(async({file,evaluate})=>{
    const b=raw();
    b.containers.activepiecesApp="sk-DO-NOT-SHOW";
    b.secret="private-key";
    const snapshot=makeSnapshot(b,new Date(T).toISOString());
    snapshot.EXTRA="Private Customer";
    await fs.writeFile(file,JSON.stringify(snapshot));
    const result=evaluate();
    assert.equal(result.state,"NEEDS_REVIEW");
    const output=JSON.stringify(result);
    for(const banned of ["sk-","private-key","Private Customer"])
      assert.equal(output.includes(banned),false);
  });
});
test("CLI rejects other flags; help never accepts user-chosen path",()=>{
  const entry=fileURLToPath(new URL("../scripts/atlas-observer-triage-cli.mjs",import.meta.url));
  for(const args of [[],["--repair"],["--path","/tmp"],["--triage-once","/tmp"],["--daemon"]]){
    const run=spawnSync(process.execPath,[entry,...args],{encoding:"utf8",timeout:4000});
    assert.equal(run.status,2);
    assert.equal(run.stdout,"");
  }
  const help=spawnSync(process.execPath,[entry,"--help"],{encoding:"utf8",timeout:4000});
  assert.equal(help.status,0);
  assert.match(help.stdout,/no scheduling, repairs or path arguments/);
});
