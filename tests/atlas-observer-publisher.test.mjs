import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {makeSnapshot,assessSnapshot} from "../scripts/atlas-observer-snapshot.mjs";
import {publishSnapshot,OBSERVER_DIRNAME,OBSERVER_FILENAME} from "../scripts/atlas-observer-publisher.mjs";

const NOW=Date.UTC(2026,9,23,11,0,0);
const model=()=>({
  schema:"ATLAS_CONNECTOR_CONTROL_V1",mode:"READ_ONLY_LOCAL_STATUS",computer:"MACOS",
  docker:"RESPONDING",noWritesPerformed:true,
  containers:{activepiecesApp:"RUNNING_HEALTHY",activepiecesWorker:"RUNNING_HEALTHY",
    postgres:"RUNNING_NOT_HEALTH_CONFIRMED",redis:"RUNNING_NOT_HEALTH_CONFIRMED",
    tunnelClient:"RUNNING_HEALTHY",secretContainer:"sk-SHOULD-NOT-LEAK"},
  activepiecesHttp:"HTTP_200",watchdog:"LAUNCHAGENT_LOADED",watchdogHeartbeat:"FRESH_UNDER_3_MINUTES",
  rawSecret:"sk-private-secret",customer:"Private Person",macIp:"192.0.2.1",
});
const snapshot=(clock=NOW)=>makeSnapshot(model(),new Date(clock).toISOString());
const capture=()=>snapshot();
const opts=home=>({home,capture,now:()=>NOW});
async function withTemp(callback){
  const home=await fs.mkdtemp(path.join(tmpdir(),"atlas-observer-test-"));
  try {await callback(home,path.join(home,OBSERVER_DIRNAME),path.join(home,OBSERVER_DIRNAME,OBSERVER_FILENAME));}
  finally {await fs.rm(home,{recursive:true,force:true});}
}

test("atomic private snapshot publish creates owner-only directory and file, redacts secrets",async()=>{
  await withTemp(async(home,dir,dest)=>{
    const result=await publishSnapshot(opts(home));
    assert.equal(result.status,"PUBLISHED_PRIVATE_SNAPSHOT");
    assert.equal((await fs.stat(dir)).mode&0o777,0o700);
    assert.equal((await fs.stat(dest)).mode&0o777,0o600);
    const raw=await fs.readFile(dest,"utf8");
    const parsed=JSON.parse(raw);
    assert.equal(assessSnapshot(parsed,NOW).status,"FRESH");
    assert.equal(parsed.state.watchdogHeartbeat,"FRESH_UNDER_3_MINUTES");
    for(const banned of ["sk-","Private Person","192.0.2.1","secretContainer","rawSecret"])
      assert.equal(raw.includes(banned),false,banned);
    assert.deepEqual((await fs.readdir(dir)),[OBSERVER_FILENAME]);
  });
});

test("malicious extra fields from captured snapshot are dropped before disk persistence",async()=>{
  await withTemp(async(home,dir,dest)=>{
    const malicious={
      ...snapshot(), token:"sk-PRIVATE-TEST", customer:"Private Person",
      state:{...snapshot().state, extra:"sk-secret", docker:"sk-hidden"},
    };
    await publishSnapshot({home,capture:()=>malicious,now:()=>NOW});
    const text=await fs.readFile(dest,"utf8");
    assert.equal(text.includes("sk-"),false);
    assert.equal(text.includes("Private Person"),false);
    assert.equal(JSON.parse(text).state.docker,"NOT_VERIFIED");
    assert.deepEqual(Object.keys(JSON.parse(text)).sort(),["schema","capturedAt","state"].sort());
  });
});

test("second publish replaces file atomically and snapshot freshness persists",async()=>{
  await withTemp(async(home,dir,dest)=>{
    await publishSnapshot(opts(home));
    const before=await fs.stat(dest);
    await publishSnapshot({...opts(home),capture:()=>snapshot(NOW+1000),now:()=>NOW+1000});
    const after=await fs.stat(dest);
    assert.notEqual(before.ino,after.ino);
    assert.equal(JSON.parse(await fs.readFile(dest,"utf8")).capturedAt,new Date(NOW+1000).toISOString());
    assert.deepEqual((await fs.readdir(dir)),[OBSERVER_FILENAME]);
  });
});

test("refuses existing symlink directory without overwriting target",async()=>{
  await withTemp(async(home,dir)=>{
    const victim=path.join(home,"victim");
    await fs.mkdir(victim,{mode:0o700});
    await fs.symlink(victim,dir);
    await assert.rejects(publishSnapshot(opts(home)),/not private/);
    assert.deepEqual(await fs.readdir(victim),[]);
  });
});

test("refuses existing shared directory and does not create snapshot",async()=>{
  await withTemp(async(home,dir,dest)=>{
    await fs.mkdir(dir,{mode:0o755});
    // Explicitly set unsafe permissions: the runner may inherit umask 077.
    await fs.chmod(dir,0o755);
    await assert.rejects(publishSnapshot(opts(home)),/not private/);
    await assert.rejects(fs.stat(dest),{code:"ENOENT"});
  });
});

test("refuses replacing symlink file, leaves target untouched",async()=>{
  await withTemp(async(home,dir,dest)=>{
    await fs.mkdir(dir,{mode:0o700});
    const victim=path.join(home,"victim");
    await fs.writeFile(victim,"keep me",{mode:0o600});
    await fs.symlink(victim,dest);
    await assert.rejects(publishSnapshot(opts(home)),/not a private regular/);
    assert.equal(await fs.readFile(victim,"utf8"),"keep me");
    assert.deepEqual(await fs.readdir(dir),[OBSERVER_FILENAME]);
  });
});

test("refuses replacing hardlinked and broadly readable files",async()=>{
  await withTemp(async(home,dir,dest)=>{
    await fs.mkdir(dir,{mode:0o700});
    const victim=path.join(home,"victim");
    await fs.writeFile(victim,"keep me",{mode:0o600});
    await fs.link(victim,dest);
    await assert.rejects(publishSnapshot(opts(home)),/not a private regular/);
    assert.equal(await fs.readFile(victim,"utf8"),"keep me");
    await fs.unlink(dest);
    await fs.writeFile(dest,"keep me",{mode:0o644});
    await fs.chmod(dest,0o644);
    await assert.rejects(publishSnapshot(opts(home)),/not a private regular/);
  });
});

test("invalid, future and stale snapshots never create a file",async()=>{
  await withTemp(async(home,dir,dest)=>{
    for(const capture of [()=>({}),()=>snapshot(NOW+60000),()=>snapshot(NOW-600000)])
      await assert.rejects(publishSnapshot({home,capture,now:()=>NOW}),/stale/);
    await assert.rejects(fs.stat(dest),{code:"ENOENT"});
  });
});

test("owner mismatch rejects directory or file without disclosure",async()=>{
  await withTemp(async(home,dir,dest)=>{
    await fs.mkdir(dir,{mode:0o700});
    await assert.rejects(publishSnapshot({...opts(home),uid:999999999}),/not private/);
    assert.equal((await fs.readdir(dir)).length,0);
    await publishSnapshot(opts(home));
    await assert.rejects(publishSnapshot({...opts(home),uid:999999999}),/not private/);
    assert.equal(JSON.parse(await fs.readFile(dest,"utf8")).schema,"atlas.observer.snapshot.v1");
  });
});

test("CLI cannot publish without explicit --publish flag",()=>{
  const script=new URL("../scripts/atlas-observer-publisher.mjs",import.meta.url).pathname;
  for(const args of [[],["--install"],["--daemon"],["--public"],["--shell"]]){
    const p=spawnSync(process.execPath,[script,...args],{encoding:"utf8"});
    assert.equal(p.status,2);
    assert.equal(p.stdout,"");
  }
  const help=spawnSync(process.execPath,[script,"--help"],{encoding:"utf8"});
  assert.equal(help.status,0);
  assert.ok(help.stdout.includes("owner-approved"));
});
