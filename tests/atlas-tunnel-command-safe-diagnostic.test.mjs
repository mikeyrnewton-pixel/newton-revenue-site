import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const script=fileURLToPath(new URL('../scripts/atlas-tunnel-command-safe-diagnostic-20261031.sh',import.meta.url));
const source=readFileSync(script,'utf8');

test('Safe command-shape diagnostic passes Bash syntax',()=>{
  const r=spawnSync('bash',['-n',script],{encoding:'utf8',timeout:5000});
  assert.equal(r.status,0,r.stderr);
});

test('Diagnostic refuses unsupported flags before Docker access',()=>{
  const r=spawnSync('bash',[script,'--apply-readonly-observer'],{encoding:'utf8',timeout:5000});
  assert.equal(r.status,2);
  assert.match(r.stdout,/ATLAS_CMD_DIAG=HOLD_EXACT_FLAG_REQUIRED/);
});

test('Only real owner Mac can run read-only inspection',()=>{
  if(process.platform==='darwin')return;
  const r=spawnSync('bash',[script,'--inspect-only'],{encoding:'utf8',timeout:5000});
  assert.equal(r.status,2);
  assert.match(r.stdout,/ATLAS_CMD_DIAG=HOLD_OWNER_MAC_ONLY/);
});

test('Diagnostic does not change containers, send requests or print raw records',()=>{
  assert.doesNotMatch(source,/\b(?:eval|sudo|curl|wget|scp|sshpass|node|npm)\s/);
  assert.doesNotMatch(source,/\bcontainer\s+(?:stop|start|rm|kill|create|exec|restart)/);
  assert.doesNotMatch(source,/\b(?:run|exec|start|stop|restart|rm|kill|create|pull|push)\s+"\$T"/);
  assert.doesNotMatch(source,/\{\{(?:json )?\.(?:Config\.Cmd|Config\.Env|Args|Mounts)\}\}/);
  assert.match(source,/--inspect-only/);
  assert.match(source,/READ_ONLY_CLASSIFICATION_COMPLETE_NO_CUTOVER/);
});

test('Unknown arguments are marked as unknown, never accepted as trusted',()=>{
  assert.match(source,/CMD_UNRECOGNISED/);
  assert.match(source,/ENTRY_UNRECOGNISED/);
  assert.match(source,/\.Config\.Cmd/);
  assert.match(source,/\.Config\.Entrypoint/);
  assert.match(source,/\.Args/);
  assert.match(source,/\.Config\.Env/);
  assert.match(source,/KEY_NOT_READONLY/);
  assert.match(source,/TUNNEL_NOT_READONLY/);
  assert.doesNotMatch(source,/ATLAS_REVIEWED_KEY_MATCH=YES/);
  assert.doesNotMatch(source,/ATLAS_WORKSPACE_MATCH=YES/);
});
