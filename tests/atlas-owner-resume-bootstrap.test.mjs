import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const file=fileURLToPath(new URL('../scripts/atlas-owner-resume-candidate-bootstrap-20261101.sh',import.meta.url));
const code=readFileSync(file,'utf8');
test('bootstrap is valid Bash, fixed immutable source, no Docker container operations',()=>{
  const p=spawnSync('bash',['-n',file],{encoding:'utf8'});
  assert.equal(p.status,0,p.stderr);
  assert.match(code,/16301b723f863c134592af32472f9513db631200/);
  assert.match(code,/147e2d3d7dcf64cf54023bdc0d75225b7aad9704/);
  assert.match(code,/d8f9948b9fb51412b453b170b6c5c9d619f39d8c/);
  assert.match(code,/3d06691eaf200e5be3669d8e35da0394c15fb628/);
  assert.doesNotMatch(code,/container (create|start|stop|rm|run)/);
  assert.match(code,/--apply-existing-candidate/);
  assert.match(code,/RESUME_FILE_ALREADY_PRESENT/);
});
test('bootstrap rejects arguments and non-Mac hosts before staging',()=>{
  const p=spawnSync('bash',[file,'--delete'],{encoding:'utf8'});
  assert.equal(p.status,2);
  assert.match(p.stdout,/HOLD_ARGUMENTS_NOT_ACCEPTED/);
  if(process.platform!=='darwin'){
    const q=spawnSync('bash',[file],{encoding:'utf8'});
    assert.equal(q.status,2);
    assert.match(q.stdout,/HOLD_OWNER_MAC_ONLY/);
  }
});
