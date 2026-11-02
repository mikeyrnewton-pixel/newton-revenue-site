import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import path from "node:path";
import {
  OBSERVER_LAUNCHD_LABEL, OBSERVER_REFRESH_SECONDS,
  OBSERVER_LAUNCHD_FILENAME, createObserverLaunchdPlist,
} from "../scripts/atlas-observer-launchd-plan.mjs";

const node = "/usr/local/bin/node";
const publisher="/Users/example/ATLAS/scripts/atlas-observer-publisher.mjs";
const render=opts=>createObserverLaunchdPlist({nodePath:node,publisherPath:publisher,...opts});

test("fixed 60-second user LaunchAgent runs only allowed private snapshot publisher",()=>{
  const xml=render();
  assert.equal(OBSERVER_REFRESH_SECONDS,60);
  assert.equal(OBSERVER_LAUNCHD_LABEL,"uk.newton.atlas-observer-snapshot");
  assert.equal(OBSERVER_LAUNCHD_FILENAME,"uk.newton.atlas-observer-snapshot.plist");
  assert.ok(xml.includes("<key>StartInterval</key><integer>60</integer>"));
  assert.ok(xml.includes("<string>--publish</string>"));
  assert.ok(xml.includes("<string>"+node+"</string>"));
  assert.ok(xml.includes("<string>"+publisher+"</string>"));
  assert.ok(xml.includes("<key>RunAtLoad</key><false/>"));
  assert.ok(xml.includes("<key>KeepAlive</key><false/>"));
  assert.equal(xml.includes("uk.newton.atlas-watchdog"),false);
  for(const dangerous of ["launchctl","docker.sock","--shell","--restart","--deploy","--install","NetworkState","UserName","EnvironmentVariables","WatchPaths","QueueDirectories"])
    assert.equal(xml.includes(dangerous),false,dangerous);
  assert.ok(xml.endsWith("</plist>\n"));
});

test("escapes XML metacharacters while retaining literal paths, never shell invokes",()=>{
  const xml=render({nodePath:"/tmp/a&<b>/node",publisherPath:"/tmp/my & <unsafe>/atlas-observer-publisher.mjs"});
  assert.ok(xml.includes("/tmp/a&amp;&lt;b&gt;/node"));
  assert.ok(xml.includes("/tmp/my &amp; &lt;unsafe&gt;/atlas-observer-publisher.mjs"));
  assert.equal(xml.includes("<unsafe>"),false);
  assert.equal(xml.includes("<b>"),false);
});

test("rejects relative paths, injection controls, excessive inputs, arbitrary executables",()=>{
  for(const nodePath of ["node","../node","/tmp/bash","/tmp/node\nlaunchctl","/tmp/node\0bad","/tmp/"+("x".repeat(2100))+"/node"])
    assert.throws(()=>render({nodePath}),/Invalid absolute/);
  for(const publisherPath of ["script.js","/tmp/run.sh","/tmp/a\n<key>RunAtLoad</key>/atlas-observer-publisher.mjs","/tmp/atlas-observer-publisher.mjs\r"])
    assert.throws(()=>render({publisherPath}),/Invalid absolute/);
});

test("unknown extra config cannot override immutable scheduling/security keys",()=>{
  const ordinary=render();
  const tampered=render({label:"evil.agent",interval:1,runAtLoad:true,keepAlive:true,
    shell:"/bin/bash",args:["-c","rm -rf /"],stdout:"/tmp/leak"});
  assert.equal(tampered,ordinary);
});

test("CLI is strictly preview-only; install/load/start flags are forbidden",()=>{
  const script=path.resolve(import.meta.dirname,"../scripts/atlas-observer-launchd-plan.mjs");
  const help=spawnSync(process.execPath,[script,"--help"],{encoding:"utf8"});
  assert.equal(help.status,0);
  assert.ok(help.stdout.includes("never writes/installs/enables"));
  const emit=spawnSync(process.execPath,[script,"--emit"],{encoding:"utf8"});
  assert.equal(emit.status,0);
  assert.ok(emit.stdout.startsWith("<?xml"));
  for(const args of [[],["--install"],["--load"],["--enable"],["--write"],["--emit","--install"],["--unload"]]){
    const p=spawnSync(process.execPath,[script,...args],{encoding:"utf8"});
    assert.equal(p.status,2);
    assert.equal(p.stdout,"");
  }
});
