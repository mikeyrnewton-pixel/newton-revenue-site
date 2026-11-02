import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {makeSnapshot} from "../scripts/atlas-observer-snapshot.mjs";
import {triageSnapshot,TRIAGE_SCHEMA} from "../scripts/atlas-observer-triage.mjs";

const NOW=Date.UTC(2026,9,24,21,0,0);
const baseline=()=>({
  schema:"ATLAS_CONNECTOR_CONTROL_V1",mode:"READ_ONLY_LOCAL_STATUS",
  computer:"MACOS",noWritesPerformed:true,docker:"RESPONDING",
  containers:{
    activepiecesApp:"RUNNING_HEALTHY",activepiecesWorker:"RUNNING_HEALTHY",
    postgres:"RUNNING_HEALTHY",redis:"RUNNING_HEALTHY",
    tunnelClient:"RUNNING_HEALTHY",
  },
  activepiecesHttp:"HTTP_200",
  watchdog:"LAUNCHAGENT_LOADED",
  watchdogHeartbeat:"FRESH_UNDER_3_MINUTES",
});
const snap=(change={},time=NOW)=>makeSnapshot({...baseline(),...change},new Date(time).toISOString());

test("Healthy snapshot produces no proposed intervention",()=>{
  const result=triageSnapshot(snap(),NOW);
  assert.equal(result.schema,TRIAGE_SCHEMA);
  assert.equal(result.state,"NO_REVIEW_SIGNAL");
  assert.deepEqual(result.findings,[]);
  assert.equal(result.next,"NONE");
  assert.equal(result.autoRepair,false);
  assert.equal(result.commandsExecuted,false);
  assert.equal(result.externalRequests,false);
  assert.equal(Object.isFrozen(result),true);
});

test("Stopped services are prioritised above watchdog stale signals",()=>{
  const raw=baseline();
  raw.containers.postgres="NOT_RUNNING";
  raw.watchdogHeartbeat="STALE_OVER_1_HOUR";
  const result=triageSnapshot(snap(raw),NOW);
  assert.equal(result.state,"NEEDS_REVIEW");
  assert.equal(result.priority,1);
  assert.equal(result.next,"REVIEW_CORE_SERVICES");
  assert.deepEqual(result.findings.map(x=>x.id),[
    "CORE_SERVICE_STOPPED","WATCHDOG_HEARTBEAT_UNHEALTHY"
  ]);
});

test("Nonresponsive Docker is a review flag, never an auto-restart",()=>{
  const result=triageSnapshot(snap({docker:"CLI_UNAVAILABLE_OR_DAEMON_OFFLINE"}),NOW);
  assert.equal(result.next,"REVIEW_DOCKER");
  assert.equal(result.autoRepair,false);
  assert.equal(result.action,"REVIEW_ONLY");
});

test("Missing tunnel is distinguished from a verified live remote tunnel",()=>{
  const b=baseline();
  b.containers.tunnelClient="NOT_RUNNING";
  const result=triageSnapshot(snap(b),NOW);
  assert.equal(result.next,"REVIEW_TUNNEL");
  assert.equal(result.autoRepair,false);
});

test("Stale, future, invalid or missing input fails closed",()=>{
  for(const bad of [
    undefined,null,{},{"status":"FRESH"},
    snap({},NOW-301000),
    snap({},NOW+31000),
    snap({docker:"RESPONDING"},NOW-300001),
  ]){
    const result=triageSnapshot(bad,NOW);
    assert.equal(result.state,"BLOCKED_UNVERIFIED_SNAPSHOT");
    assert.equal(result.next,"REVIEW_SNAPSHOT_FRESHNESS");
    assert.deepEqual(result.findings.map(x=>x.id),["SNAPSHOT_NOT_FRESH"]);
  }
});

test("Unexpected status value remains uncertain, without leakage",()=>{
  const b=baseline();
  b.activepiecesHttp="sk-CONFIDENTIAL";
  b.customer="Someone Private";
  b.secret="sk-CONFIDENTIAL";
  const result=triageSnapshot(snap(b),NOW);
  assert.equal(result.state,"NEEDS_REVIEW");
  assert.equal(result.next,"REVIEW_UNVERIFIED_STATE");
  const output=JSON.stringify(result);
  assert.equal(output.includes("CONFIDENTIAL"),false);
  assert.equal(output.includes("Someone Private"),false);
  assert.equal(output.includes("sk-"),false);
});

test("Triage module is inert and contains no live scheduling or action path",()=>{
  const s=readFileSync(new URL("../scripts/atlas-observer-triage.mjs",import.meta.url),"utf8");
  for(const disallowed of [
    /\bsetInterval\s*\(/,/\bsetTimeout\s*\(/,/\bfetch\s*\(/,
    /\bexec(?:Sync|File)?\s*\(/,/\bspawn(?:Sync)?\s*\(/,
    /\bwriteFile(?:Sync)?\s*\(/,/\bcreateServer\s*\(/,
    /\brestart\s*\(/,/\bprocess\.env\b/
  ]) assert.doesNotMatch(s,disallowed);
});
