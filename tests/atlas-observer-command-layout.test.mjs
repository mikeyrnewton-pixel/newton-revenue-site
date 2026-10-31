import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const script=fileURLToPath(new URL('../scripts/atlas-observer-headless-cutover-20261029.sh',import.meta.url));
const source=readFileSync(script,'utf8');
const begin=source.indexOf('  local entrycount cmdtext argstext entrysecond');
const end=source.indexOf('  echo "ATLAS=LOCAL_PREFLIGHT_VERIFIED_NODE_NOT_NEEDED"',begin);
assert.ok(begin>0 && end>begin,'reviewed exact-layout command contract must exist');
const fragment=source.slice(begin,end);

function check(overrides={}){
  const fixture={
    MOCK_ENTRYCOUNT:'2',
    MOCK_ENTRYSECOND:'run',
    MOCK_CMD:'["--control-plane.api-key=file:/run/secrets/runtime-key"]',
    MOCK_ARGS:'["run","--control-plane.api-key=file:/run/secrets/runtime-key"]',
    ...overrides,
  };
  const shell=`set -euo pipefail
hold(){ printf 'ATLAS=HOLD_%s\\n' "$1"; exit 2; }
fmt(){
  case "$1" in
    '{{len .Config.Entrypoint}}') printf '%s\\n' "$MOCK_ENTRYCOUNT";;
    '{{index .Config.Entrypoint 1}}') printf '%s\\n' "$MOCK_ENTRYSECOND";;
    '{{json .Config.Cmd}}') printf '%s\\n' "$MOCK_CMD";;
    '{{json .Args}}') printf '%s\\n' "$MOCK_ARGS";;
    *) exit 15;;
  esac
}
${fragment}
printf 'VERIFIED_CMD_COUNT=%s\\n' "${#cmdargs[@]}"
printf 'VERIFIED_CMD=%s\\n' "${cmdargs[*]}"
`;
  return spawnSync('bash',['-c',shell],{encoding:'utf8',timeout:4000,env:{...process.env,...fixture}});
}

test('31 Oct owner-confirmed entrypoint includes run; candidate does not duplicate it',()=>{
  const r=check();
  assert.equal(r.status,0,r.stderr+r.stdout);
  assert.match(r.stdout,/ATLAS_COMMAND_LAYOUT=ENTRYPOINT_RUN_EXACT/);
  assert.match(r.stdout,/VERIFIED_CMD_COUNT=1/);
  assert.match(r.stdout,/VERIFIED_CMD=--control-plane.api-key=file:\/run\/secrets\/runtime-key/);
  assert.doesNotMatch(r.stdout,/VERIFIED_CMD=run /);
});

test('Legacy image entrypoint-only form keeps single run in Cmd',()=>{
  const r=check({MOCK_ENTRYCOUNT:'1',
    MOCK_CMD:'["run","--control-plane.api-key=file:/run/secrets/runtime-key"]'});
  assert.equal(r.status,0,r.stdout+r.stderr);
  assert.match(r.stdout,/ATLAS_COMMAND_LAYOUT=COMMAND_RUN_EXACT/);
  assert.match(r.stdout,/VERIFIED_CMD_COUNT=2/);
  assert.match(r.stdout,/VERIFIED_CMD=run --control-plane.api-key=/);
});

test('Unknown flags or additional command items fail closed',()=>{
  for(const bad of [
    {MOCK_CMD:'["--control-plane.api-key=file:/run/secrets/runtime-key","--debug"]'},
    {MOCK_CMD:'["run","--control-plane.api-key=file:/run/secrets/runtime-key"]'},
    {MOCK_ARGS:'["run","--debug","--control-plane.api-key=file:/run/secrets/runtime-key"]'},
    {MOCK_ENTRYCOUNT:'3'},
    {MOCK_ENTRYSECOND:'other'},
  ]){
    const r=check(bad);
    assert.equal(r.status,2,JSON.stringify(bad)+r.stdout+r.stderr);
    assert.match(r.stdout,/ATLAS=HOLD_(CUSTOM_COMMAND|CUSTOM_ARGS|CUSTOM_ENTRYPOINT_LAYOUT)/);
  }
});

test('Operator mirrors verified command array and keeps original entrypoint identity check',()=>{
  assert.match(source,/\[ "\$existing_entry" = "\$actual_entry" \] \|\| hold CUSTOM_ENTRYPOINT/);
  assert.match(source,/\$img" "\$\{cmdargs\[@\]\}"/);
  assert.doesNotMatch(source,/\$img" run --control-plane\.api-key=/);
  assert.match(source,/COMMAND_LAYOUT_NOT_VERIFIED/);
  assert.match(source,/ATLAS_REVIEWED_KEY_MATCH/);
  assert.match(source,/ATLAS_WORKSPACE_MATCH/);
  assert.match(source,/--rollback/);
});
