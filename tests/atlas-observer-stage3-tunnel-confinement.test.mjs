import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,chmodSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const source=readFileSync(fileURLToPath(new URL('../scripts/atlas-observer-stage3-preflight-20261024.sh',import.meta.url)),'utf8');
const start=source.indexOf('image=$(');
const marker="printf 'TUNNEL_IMAGE_AND_RUNTIME_CONFINEMENT=VERIFIED\\n'";
const end=source.indexOf(marker,start);
assert.ok(start>0 && end>start,'existing Stage3 tunnel inspection must be present');
const fragment=source.slice(start,end+marker.length);
const home=mkdtempSync(join(tmpdir(),'atlas-tunnel-stage3-confinement-'));
const docker=join(home,'docker-fake');
writeFileSync(docker,[
  '#!/bin/bash',
  '[ "$1" = inspect ] && [ "$2" = -f ] || exit 15',
  'case "$3" in',
  '  *"Config.Image"*) printf "%s\n" "$MOCK_IMAGE" ;;',
  '  *"ReadonlyRootfs"*) printf "%s\n" "$MOCK_ROOT" ;;',
  '  *"Privileged"*) printf "%s\n" "$MOCK_PRIV" ;;',
  '  *"RestartPolicy.Name"*) printf "%s\n" "$MOCK_RESTART" ;;',
  '  *"PortBindings"*) printf "%s\n" "$MOCK_PORTS" ;;',
  '  *"len .Mounts"*) printf "%s\n" "$MOCK_MOUNT_COUNT" ;;',
  '  *"range .Mounts"*) printf "%s\n" "$MOCK_KEY_RO_BIND" ;;',
  '  *"CapDrop"*) printf "%s\n" "$MOCK_CAP_DROP" ;;',
  '  *"CapAdd"*) printf "%s\n" "$MOCK_CAP_ADD" ;;',
  '  *"SecurityOpt"*) printf "%s\n" "$MOCK_NNP" ;;',
  '  *) exit 16 ;;',
  'esac',
].join('\n'),{mode:0o700});
chmodSync(docker,0o700);
const base={
  MOCK_IMAGE:'ghcr.io/openai/tunnel-client:v0.0.17',
  MOCK_ROOT:'true',MOCK_PRIV:'false',MOCK_RESTART:'no',
  MOCK_PORTS:'null',MOCK_MOUNT_COUNT:'1',MOCK_KEY_RO_BIND:'yes',
  MOCK_CAP_DROP:'yes',MOCK_CAP_ADD:'0',MOCK_NNP:'yes',
};
const run=(overrides={})=>spawnSync('bash',['-c',
  "set -euo pipefail; hold(){ printf 'ATLAS_STAGE3_PREFLIGHT=HOLD_%s\\n' \"$1\"; exit 2; }; DOCKER=$1; TUNNEL=atlas-tunnel-client-canary; "+fragment,
  'stage3-fixture',docker],{
  encoding:'utf8',timeout:4000,env:{...process.env,...base,...overrides},
});
test.after(()=>rmSync(home,{recursive:true,force:true}));
test('exact existing sealed tunnel accepts inspect-only fixture',()=>{
  const result=run();
  assert.equal(result.status,0,result.stderr+result.stdout);
  assert.match(result.stdout,/TUNNEL_IMAGE_AND_RUNTIME_CONFINEMENT=VERIFIED/);
  assert.doesNotMatch(result.stdout,/\/Users\/|sk-|api.key|runtime-key/);
});
test('extra or missing key bind mount cannot pass cutover preflight',()=>{
  for(const bad of [
    {MOCK_MOUNT_COUNT:'2'},
    {MOCK_MOUNT_COUNT:'0'},
    {MOCK_KEY_RO_BIND:''},
    {MOCK_MOUNT_COUNT:'malformed'},
  ]){
    const result=run(bad);
    assert.equal(result.status,2,result.stderr+result.stdout);
    assert.match(result.stdout,/HOLD_TUNNEL_RUNTIME_ISOLATION_DRIFT/);
  }
});
test('all unexpected privilege, image, ports and restart changes hold',()=>{
  for(const bad of [
    {MOCK_CAP_DROP:''},
    {MOCK_CAP_ADD:'1'},
    {MOCK_NNP:''},
    {MOCK_ROOT:'false'},
    {MOCK_PRIV:'true'},
    {MOCK_RESTART:'always'},
    {MOCK_PORTS:'{"18787/tcp":[{"HostPort":"18787"}]}'},
    {MOCK_IMAGE:'latest'},
  ]){
    const result=run(bad);
    assert.equal(result.status,2,result.stderr+result.stdout);
    assert.doesNotMatch(result.stdout,/TUNNEL_IMAGE_AND_RUNTIME_CONFINEMENT=VERIFIED/);
  }
});
test('inspection cannot write containers or expose raw configuration',()=>{
  assert.doesNotMatch(fragment,/"\$DOCKER"\s+(?:run|exec|start|stop|restart|rm|create|cp|pull)\b/);
  assert.doesNotMatch(fragment,/\{\{(?:json )?\.(?:Config\.Env|Config\.Cmd|Args)\}\}/);
  assert.doesNotMatch(fragment,/echo.*(?:MOUNT|IMAGE|ARGS|ENV)/);
});
