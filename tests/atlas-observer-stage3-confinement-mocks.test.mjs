import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,writeFileSync,chmodSync,mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const source=readFileSync(fileURLToPath(new URL("../scripts/atlas-observer-stage3-preflight-20261024.sh",import.meta.url)),"utf8");
const start=source.indexOf("observer_root=$(");
const endMarker="printf 'OBSERVER_EXISTING_READONLY_CONFINEMENT=VERIFIED\\n'";
const end=source.indexOf(endMarker,start);
assert.ok(start>0&&end>start,"existing Observer cutover confinement checks must exist");
const fragment=source.slice(start,end+endMarker.length);
const home=mkdtempSync(join(tmpdir(),"atlas-stage3-existing-observer-"));
const docker=join(home,"docker-inspect-only");
writeFileSync(docker,[
  "#!/bin/bash",
  '[ "$1" = inspect ] && [ "$2" = -f ] || exit 15',
  'case "$3" in',
  '  *ReadonlyRootfs*) printf "%s\\n" "$MOCK_ROOT" ;;',
  '  *Privileged*) printf "%s\\n" "$MOCK_PRIV" ;;',
  '  *RestartPolicy.Name*) printf "%s\\n" "$MOCK_RESTART" ;;',
  '  *PortBindings*) printf "%s\\n" "$MOCK_PORTS" ;;',
  '  *Config.User*) printf "%s\\n" "$MOCK_USER" ;;',
  '  *CapDrop*) printf "%s\\n" "$MOCK_CAPS" ;;',
  '  *"ne .Destination"*) printf "%s\\n" "$MOCK_EXTRA_MOUNTS" ;;',
  '  *CapAdd*) printf "%s\\n" "$MOCK_ADDED_CAPS" ;;',
  '  *SecurityOpt*) printf "%s\\n" "$MOCK_NNP" ;;',
  '  *"/opt/atlas-observer/scripts"*) printf "%s\\n" "$MOCK_SOURCE_RO" ;;',
  '  *"/run/atlas-observer"*) printf "%s\\n" "$MOCK_SNAPSHOT_RO" ;;',
  '  *) exit 16 ;;',
  'esac',
].join("\n"),{mode:0o700});
chmodSync(docker,0o700);
const baseline={
  MOCK_ROOT:"true",MOCK_PRIV:"false",MOCK_RESTART:"no",
  MOCK_PORTS:"null",MOCK_USER:"501:20",MOCK_CAPS:"yes",
  MOCK_SOURCE_RO:"yes",MOCK_SNAPSHOT_RO:"yes",
  MOCK_EXTRA_MOUNTS:"",MOCK_ADDED_CAPS:"0",MOCK_NNP:"yes"
};
function run(changes={}){
  return spawnSync("bash",["-c",
    "set -euo pipefail; hold(){ printf 'ATLAS_STAGE3_PREFLIGHT=HOLD_%s\\n' \"$1\"; exit 2; }; DOCKER=$1; OBSERVER=atlas-mcp-observer-review; "+fragment,
    "mock-stage3",docker
  ],{encoding:"utf8",timeout:4000,env:{...process.env,...baseline,...changes}});
}
test.after(()=>rmSync(home,{recursive:true,force:true}));
test("existing Observer exact stage2 nonroot readonly no-ports mount contract passes without modifications",()=>{
  const r=run();
  assert.equal(r.status,0,r.stderr+r.stdout);
  assert.match(r.stdout,/OBSERVER_EXISTING_READONLY_CONFINEMENT=VERIFIED/);
  assert.doesNotMatch(r.stdout,/501|20|\/Users\/|runtime-key/);
});
test("stage3 existing Observer drift: rootfs, privileged or restarts all HOLD",()=>{
  for(const changes of [
    {MOCK_ROOT:"false"},{MOCK_PRIV:"true"},{MOCK_RESTART:"always"},
    {MOCK_PORTS:'{"18788/tcp":[{"HostPort":"18788"}]}'},
  ]){
    const r=run(changes);
    assert.equal(r.status,2,JSON.stringify(changes)+r.stdout);
    assert.match(r.stdout,/HOLD_OBSERVER_RUNTIME_ISOLATION_DRIFT/);
  }
});
test("Stage3 root process uid, empty user or untrusted user names fail closed",()=>{
  for(const value of ["0","0:0","root","root:root","","501","001:0","501:0"]){
    const r=run({MOCK_USER:value});
    assert.equal(r.status,2,JSON.stringify(value)+r.stdout);
    assert.match(r.stdout,/HOLD_OBSERVER_NONROOT_USER_NOT_VERIFIED/);
  }
});
test("Stage3 refuses missing cap drop or writable Observer source and snapshot mounts",()=>{
  for(const changes of [
    {MOCK_CAPS:""},{MOCK_SOURCE_RO:""},{MOCK_SNAPSHOT_RO:""}
  ]){
    const r=run(changes);
    assert.equal(r.status,2);
    assert.match(r.stdout,/HOLD_OBSERVER_RUNTIME_ISOLATION_DRIFT/);
  }
});
test("Stage3 should inspect only, never change containers or reveal sensitive paths",()=>{
  const bad=/\"\\$DOCKER\"\\s+(?:run|exec|start|stop|restart|rm|kill|create|cp|pull|push|update)\\b/;
  assert.doesNotMatch(fragment,bad);
  assert.doesNotMatch(fragment,/\{\{(?:json )?\.(?:Config.Env|Config.Cmd|Args)\}\}/);
  assert.doesNotMatch(fragment,/echo.*(?:observer_user|observer_root|observer_ports)/);
  const r=run({MOCK_ROOT:"false",MOCK_USER:"123:20"});
  assert.doesNotMatch(r.stdout,/123:20/);
});


test("Stage3 fails closed on an extra mount even when the two expected mounts remain readonly",()=>{
  const r=run({MOCK_EXTRA_MOUNTS:"unexpected"});
  assert.equal(r.status,2,r.stdout+r.stderr);
  assert.match(r.stdout,/HOLD_OBSERVER_RUNTIME_ISOLATION_DRIFT/);
  assert.doesNotMatch(r.stdout,/unexpected|docker\.sock|\/Users\//);
});
test("Stage3 refuses added capabilities or missing no-new-privileges",()=>{
  for (const overrides of [
    {MOCK_ADDED_CAPS:"1"},
    {MOCK_NNP:""},
    {MOCK_NNP:"false"},
  ]) {
    const r=run(overrides);
    assert.equal(r.status,2,JSON.stringify(overrides)+r.stdout);
    assert.match(r.stdout,/HOLD_OBSERVER_RUNTIME_ISOLATION_DRIFT/);
  }
});
