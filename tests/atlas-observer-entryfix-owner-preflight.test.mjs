import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const path=fileURLToPath(new URL('../scripts/atlas-observer-owner-entryfix-preflight-20261031.sh',import.meta.url));
const script=readFileSync(path,'utf8');

test('Entryfix owner wrapper is syntax valid',()=>{
  const r=spawnSync('bash',['-n',path],{encoding:'utf8',timeout:4000});
  assert.equal(r.status,0,r.stderr);
});
test('Only stages pinned files and performs read-only preflight',()=>{
  assert.match(script,/38336c1e33d416866749a7544b0ded4bac4a4846/);
  assert.match(script,/aff88a85b5cac2d93958ce4aca6d333fae6e8196/);
  assert.match(script,/3d06691eaf200e5be3669d8e35da0394c15fb628/);
  assert.match(script,/--preflight/);
  assert.match(script,/NO_MAC_CUTOVER/);
  assert.doesNotMatch(script,/--apply-readonly-observer|--rollback|docker\s+(?:run|stop|start|rm|create|exec)/);
  assert.doesNotMatch(script,/\b(?:eval|sudo|node|npm|sshpass)\b/);
  assert.doesNotMatch(script,/CONTROL_PLANE_TUNNEL_ID|sk-proj-|secret.*cat/);
});
test('Linux cannot run or stage owner preflight',()=>{
  if(process.platform==='darwin')return;
  const r=spawnSync('bash',[path],{encoding:'utf8',timeout:4000});
  assert.equal(r.status,2);
  assert.match(r.stdout,/ATLAS_ENTRYFIX=HOLD_OWNER_MAC_ONLY/);
});
test('Cannot ask bootstrap to switch connection',()=>{
  const r=spawnSync('bash',[path,'--apply-readonly-observer'],{encoding:'utf8',timeout:4000});
  assert.equal(r.status,2);
  assert.match(r.stdout,/ATLAS_ENTRYFIX=HOLD_NO_ARGUMENTS_ALLOWED/);
});
