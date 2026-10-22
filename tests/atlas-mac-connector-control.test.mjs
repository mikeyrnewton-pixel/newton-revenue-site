import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {
  assessRuntimeSecretFile,
  readMacStatus,
  formatStatus,
  main
} from "../scripts/atlas-mac-connector-control.mjs";

const appContainer=()=>([
  "activepieces-app-1|Up 3 weeks (healthy)",
  "activepieces-worker-1|Up 8 hours (healthy)",
  "activepieces-postgres-1|Up 3 weeks",
  "activepieces-redis-1|Up 3 weeks",
].join("\n")+"\n");
const fakeStat=(age,now)=>({
  isSymbolicLink:()=>false,
  isFile:()=>true,
  mtimeMs:now-age,
});
function macFixture(opts={}){
  const now=Date.UTC(2026,9,22,20,30);
  const executed=[];
  const deps={
    platform:"darwin",arch:"arm64",uid:501,home:"/Users/safe-test",
    now,
    exists:p=>p==="/Applications/Docker.app/Contents/Resources/bin/docker",
    run:(bin,args)=>{
      executed.push([bin,...args]);
      if(bin.includes("/docker"))return {ok:true,output:appContainer()};
      if(bin==="/bin/launchctl")return {ok:true,output:"opaque-private-output-not-exposed"};
      throw Error("unexpected subprocess");
    },
    fetcher:async(url,opts)=>{
      assert.equal(url,"http://127.0.0.1:8080/");
      assert.equal(opts.redirect,"manual");
      return {status:200,body:{cancel:async()=>{}}};
    },
    stat:()=>fakeStat(40_000,now),
    ...opts,
  };
  return {deps,executed};
}

test("known Mac health checks are read-only, redact all output and hold deployment",async()=>{
  const {deps,executed}=macFixture();
  const state=await readMacStatus(deps);
  assert.equal(state.computer,"MACOS");
  assert.equal(state.processor,"ARM64");
  assert.equal(state.docker,"RESPONDING");
  assert.equal(state.containers.activepiecesApp,"RUNNING_HEALTHY");
  assert.equal(state.containers.activepiecesWorker,"RUNNING_HEALTHY");
  assert.equal(state.containers.postgres,"RUNNING_NOT_HEALTH_CONFIRMED");
  assert.equal(state.containers.redis,"RUNNING_NOT_HEALTH_CONFIRMED");
  assert.equal(state.containers.tunnelClient,"NOT_RUNNING");
  assert.equal(state.watchdog,"LAUNCHAGENT_LOADED");
  assert.equal(state.watchdogHeartbeat,"FRESH_UNDER_3_MINUTES");
  assert.equal(state.activepiecesHttp,"HTTP_200");
  assert.equal(state.noWritesPerformed,true);
  assert.equal(state.secureTunnel,"NOT_CONNECTED_BY_THIS_CHECK");
  assert.equal(state.customerOutreach,"HOLD");
  assert.equal(state.clearedCashGBP,0);
  const output=formatStatus(state);
  assert.ok(output.includes("Tunnel container: NOT_RUNNING"));
  assert.ok(!output.includes("opaque-private-output"));
  assert.ok(!output.includes("sk-"));
  assert.ok(!output.includes("100.86."));
  assert.deepEqual(executed.map(c=>c.slice(0,2)),[
    ["/Applications/Docker.app/Contents/Resources/bin/docker","ps"],
    ["/bin/launchctl","print"],
  ]);
  assert.equal(output.endsWith("=== COMPLETE ==="),true);
});

test("disconnected Docker/Mac still reports unknown rather than confirmed health",async()=>{
  const {deps}=macFixture({
    run:()=>({ok:false,output:""}),
    fetcher:async()=>{throw Error("connection refused")},
    stat:()=>{throw Error("not found")},
  });
  const state=await readMacStatus(deps);
  assert.equal(state.docker,"CLI_UNAVAILABLE_OR_DAEMON_OFFLINE");
  assert.equal(state.activepiecesHttp,"NO_RESPONSE");
  assert.equal(state.watchdog,"NOT_LOADED_OR_UNAVAILABLE");
  assert.equal(state.watchdogHeartbeat,"NOT_FOUND");
  assert.equal(state.containers.tunnelClient,"NOT_VERIFIED");
  assert.equal(state.secureTunnel,"NOT_CONNECTED_BY_THIS_CHECK");
});

test("not on Mac skips Docker, network and watchdog entirely",async()=>{
  let called=false;
  const state=await readMacStatus({
    platform:"linux",arch:"x64",
    exists:()=>{called=true;throw Error("must not be called")},
    run:()=>{called=true;throw Error("must not be called")},
    fetcher:()=>{called=true;throw Error("must not be called")},
    stat:()=>{called=true;throw Error("must not be called")},
  });
  assert.equal(state.computer,"NOT_MACOS");
  assert.equal(state.docker,"NOT_VERIFIED");
  assert.equal(state.activepiecesHttp,"NOT_VERIFIED");
  assert.equal(called,false);
});

test("stale heartbeat and unresponsive services do not pass health",async()=>{
  const now=Date.UTC(2026,9,22,20,30);
  const {deps}=macFixture({
    now,stat:()=>fakeStat(7200000,now),
    fetcher:async()=>({status:503,body:{cancel:async()=>{}}}),
  });
  const state=await readMacStatus(deps);
  assert.equal(state.watchdogHeartbeat,"STALE_OVER_1_HOUR");
  assert.equal(state.activepiecesHttp,"HTTP_UNEXPECTED");
});

test("runtime key check inspects metadata only and rejects unsafe files",()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),"atlas-connector-secret-"));
  try{
    const file=path.join(temp,"keyfile");
    fs.writeFileSync(file,"not-a-real-key",{mode:0o600});
    assert.equal(assessRuntimeSecretFile(file),"METADATA_OK_KEY_CONTENT_NOT_READ");
    fs.chmodSync(file,0o644);
    assert.equal(assessRuntimeSecretFile(file),"PERMISSIONS_TOO_BROAD");
    fs.chmodSync(file,0o600);
    fs.symlinkSync(file,path.join(temp,"link"));
    assert.equal(assessRuntimeSecretFile(path.join(temp,"link")),"NOT_REGULAR_FILE");
    assert.equal(assessRuntimeSecretFile("relative"),"INVALID_PATH");
    assert.equal(assessRuntimeSecretFile(path.join(temp,"missing")),"NOT_FOUND");
    fs.writeFileSync(file,"");
    assert.equal(assessRuntimeSecretFile(file),"INVALID_SIZE");
    fs.writeFileSync(file,"x".repeat(4097));
    assert.equal(assessRuntimeSecretFile(file),"INVALID_SIZE");
    fs.writeFileSync(file,"x");
    const uid=process.getuid?.()??0;
    assert.equal(assessRuntimeSecretFile(file,uid+1),"NOT_OWNER_CONTROLLED");
  }finally{fs.rmSync(temp,{recursive:true,force:true})}
});

test("plan never claims connected and never requests a billable model API",async()=>{
  const report=JSON.parse(await main(["--plan"]));
  assert.equal(report.mode,"PLAN_ONLY");
  assert.equal(report.productionRelease,"HOLD");
  assert.equal(report.directChatGPTMacConnection,"NOT_VERIFIED");
  assert.equal(report.apiModelCalls,false);
  assert.equal(report.newSpend,false);
  assert.ok(report.steps.includes("READ_ONLY_LIVE_FLOW_LIST_AND_STRUCTURE_WITH_EVIDENCE"));
  await assert.rejects(main(["--activate"]),/Supported commands/);
  await assert.rejects(main(["--install"]),/Supported commands/);
  await assert.rejects(main(["--run"]),/Supported commands/);
});

test("CLI status prints fixed labels and does not leak untrusted Docker names",async()=>{
  const {deps}=macFixture({
    run:(bin)=>{
      if(bin.includes("/docker"))
        return {ok:true,output:appContainer()+"unrelated-secret-project|Up 1 hour\n"};
      return {ok:true,output:"secret-service-token"};
    },
  });
  const out=await main(["--status"],deps);
  assert.ok(out.includes("Activepieces app: RUNNING_HEALTHY"));
  assert.equal(out.includes("unrelated-secret-project"),false);
  assert.equal(out.includes("secret-service-token"),false);
  assert.ok(out.includes("System modified: NO"));
  const proc=spawnSync(process.execPath,[
    path.resolve(import.meta.dirname,"../scripts/atlas-mac-connector-control.mjs"),
    "--plan"
  ],{encoding:"utf8"});
  assert.equal(proc.status,0,proc.stderr);
  assert.equal(JSON.parse(proc.stdout).newSpend,false);
});
