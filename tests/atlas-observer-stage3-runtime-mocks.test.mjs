import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync, writeFileSync, chmodSync, mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const source=readFileSync(fileURLToPath(new URL("../scripts/atlas-observer-stage3-preflight-20261024.sh",import.meta.url)),"utf8");
const start=source.indexOf('endpoint=$("$DOCKER" inspect -f');
const last="printf 'ATLAS_STAGE3_PREFLIGHT=LOCAL_TOPOLOGY_VERIFIED\\n'";
const end=source.indexOf(last,start);
assert.ok(start>0&&end>start,"Stage 3 has the reviewed fixed-constant probe");
const fragment=source.slice(start,end+last.length);

const harness=mkdtempSync(join(tmpdir(),"atlas-stage3-mock-"));
const docker=join(harness,"docker");
writeFileSync(docker,[
  "#!/bin/bash",
  '[ "$1" = inspect ] && [ "$2" = -f ] || exit 17',
  'case "$3" in',
  '  *"range .Args"*)',
  '    case "$3" in',
  '      *"mcp.server-url"*) printf "%s\\n" "$MOCK_ENDPOINT_ARGS" ;;',
  '      *"control-plane.api-key"*) printf "%s\\n" "$MOCK_KEY_ARGS" ;;',
  '      *) exit 18 ;;',
  '    esac ;;',
  '  *"range .Config.Cmd"*) printf "%s\\n" "$MOCK_KEY_CMD" ;;',
  '  *"range .Config.Entrypoint"*) printf "%s\\n" "$MOCK_KEY_ENTRY" ;;',
  '  *"range .Mounts"*) printf "%s\\n" "$MOCK_KEY_MOUNT" ;;',
  '  *"range .Config.Env"*) printf "%s\\n" "$MOCK_ENDPOINT_ENV" ;;',
  '  *) exit 19 ;;',
  'esac',
].join("\n"),{mode:0o700});
chmodSync(docker,0o700);

function run(overrides={}){
  const baseline={
    MOCK_ENDPOINT_ARGS:"",
    MOCK_ENDPOINT_ENV:"yes",
    MOCK_KEY_ARGS:"",
    MOCK_KEY_CMD:"yes",
    MOCK_KEY_ENTRY:"",
    MOCK_KEY_MOUNT:"yes",
  };
  return spawnSync("bash",["-c",
    "set -euo pipefail; hold(){ printf 'ATLAS_STAGE3_PREFLIGHT=HOLD_%s\\n' \"$1\"; exit 2; }; DOCKER=$1; TUNNEL=atlas-tunnel-client-canary; "+fragment,
    "stage3-docker-test",docker],{
      encoding:"utf8",timeout:4000,env:{...process.env,...baseline,...overrides}
    });
}
test.after(()=>rmSync(harness,{recursive:true,force:true}));

test("Owner-observed ENV target and Cmd-based file-backed key with RO mount pass",()=>{
  const result=run();
  assert.equal(result.status,0,result.stderr+result.stdout);
  assert.match(result.stdout,/CURRENT_TUNNEL_TARGET=ORIGINAL_CANARY_18787/);
  assert.match(result.stdout,/RUNTIME_KEY=FILE_REFERENCED_READONLY_VALUE_NOT_READ/);
  assert.match(result.stdout,/ATLAS_STAGE3_PREFLIGHT=LOCAL_TOPOLOGY_VERIFIED/);
  assert.match(result.stdout,/CUTOVER=NOT_STARTED/);
});

test("Alias argument target + file-backed key in Args also pass",()=>{
  const result=run({MOCK_ENDPOINT_ENV:"",MOCK_ENDPOINT_ARGS:"yes",MOCK_KEY_CMD:"",MOCK_KEY_ARGS:"yes"});
  assert.equal(result.status,0,result.stderr+result.stdout);
});

test("Missing expected target never accepted",()=>{
  const result=run({MOCK_ENDPOINT_ENV:"",MOCK_ENDPOINT_ARGS:""});
  assert.equal(result.status,2);
  assert.match(result.stdout,/HOLD_EXPECTED_CANARY_ENDPOINT_NOT_VERIFIED/);
  assert.doesNotMatch(result.stdout,/LOCAL_TOPOLOGY_VERIFIED/);
});

test("Unknown runtime key reference or writable/missing mount always HOLD",()=>{
  for(const bad of [
    {MOCK_KEY_ARGS:"",MOCK_KEY_CMD:"",MOCK_KEY_ENTRY:""},
    {MOCK_KEY_MOUNT:""},
  ]){
    const result=run(bad);
    assert.equal(result.status,2,result.stdout+result.stderr);
    assert.match(result.stdout,/HOLD_(FILE_BACKED_KEY_REFERENCE_NOT_VERIFIED|READONLY_RUNTIME_KEY_MOUNT_NOT_VERIFIED)/);
    assert.doesNotMatch(result.stdout,/LOCAL_TOPOLOGY_VERIFIED/);
  }
});

test("Probe emits no raw credentials or container identity even on failure",()=>{
  const result=run({MOCK_KEY_MOUNT:""});
  assert.doesNotMatch(result.stdout,/sk-|tunnel_[0-9]|\/Users\/|token=/);
  assert.doesNotMatch(fragment,/"\$DOCKER" (?:run|stop|rm|restart|exec|create|pull)\b/);
  assert.doesNotMatch(fragment,/\{\{(?:json )?\.(?:Config\.Env|Config\.Cmd|Args|Mounts)\}\}/);
});
