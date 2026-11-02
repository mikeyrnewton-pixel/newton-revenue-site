import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const file=fileURLToPath(new URL('../scripts/atlas-observer-resume-stopped-candidate-20261101.sh',import.meta.url));
const code=readFileSync(file,'utf8');

test('existing-candidate resume script has strict Bash syntax and no Node',()=>{
  const p=spawnSync('bash',['-n',file],{encoding:'utf8',timeout:5000});
  assert.equal(p.status,0,p.stderr);
  assert.match(code,/^set -euo pipefail$/m);
  assert.match(code,/^umask 077$/m);
  assert.match(code,/--inspect-only\|--apply-existing-candidate/);
});

test('Linux and unintended modes fail closed before Docker',()=>{
  for(const mode of ['--delete','--rollback','--new','']){
    const p=spawnSync('bash',[file,mode],{encoding:'utf8',timeout:5000});
    assert.equal(p.status,2);
    assert.match(p.stdout,/ATLAS_RESUME=HOLD_MODE_UNRECOGNISED/);
  }
  if(process.platform==='darwin')return;
  const p=spawnSync('bash',[file,'--inspect-only'],{encoding:'utf8',timeout:5000});
  assert.equal(p.status,2);
  assert.match(p.stdout,/ATLAS_RESUME=HOLD_OWNER_MAC_ONLY/);
});

test('resume only uses already-created candidate, never builds or deletes services',()=>{
  assert.doesNotMatch(code,/container (?:create|rm|run) /);
  assert.doesNotMatch(code,/docker\.sock|--privileged|sudo |npm install|curl |wget /);
  assert.match(code,/atlas-tunnel-client-observer-candidate/);
  assert.match(code,/atlas-tunnel-client-canary/);
  assert.match(code,/container stop --time 10 "\$OLD"/);
  assert.match(code,/container start "\$NEW"/);
  assert.match(code,/container start "\$OLD"/);
  assert.ok(code.indexOf('container stop --time 10 "$OLD"')<code.indexOf('container start "$NEW"'));
});

test('fail-closed candidate equals original identity except explicitly reviewed URL',()=>{
  assert.match(code,/3d06691eaf200e5be3669d8e35da0394c15fb628/);
  assert.match(code,/ATLAS_STAGE3_PREFLIGHT=LOCAL_TOPOLOGY_VERIFIED/);
  assert.match(code,/"container:\$CANARY"\|"container:\$a"/);
  assert.match(code,/\.HostConfig.ReadonlyRootfs/);
  assert.match(code,/\.HostConfig.Privileged/);
  assert.match(code,/\.HostConfig.AutoRemove/);
  assert.match(code,/\.HostConfig.CapDrop/);
  assert.match(code,/\.HostConfig.CapAdd/);
  assert.match(code,/no-new-privileges/);
  assert.match(code,/\.HostConfig.PortBindings/);
  assert.match(code,/\.Mounts/);
  assert.match(code,/KEY_NOT_IDENTICAL/);
  assert.match(code,/ORIGINAL_IMAGE_OR_COMMAND_NOT_MATCHED/);
  assert.match(code,/ENVIRONMENT_MISMATCH/);
});

test('guard is private, written ahead of stopping and retained after errors',()=>{
  assert.match(code,/"\$DIR\/lock"/);
  assert.match(code,/chmod 600 "\$GUARD"/);
  assert.match(code,/mkdir -m 700 "\$DIR"/);
  assert.match(code,/ATLAS_REVIEWED_KEY_MATCH/);
  assert.match(code,/ATLAS_WORKSPACE_MATCH/);
  assert.ok(code.indexOf('printf \'%s\\n%s\\n%s\\n\'')<code.indexOf('container stop --time 10 "$OLD"'));
  assert.match(code,/LOCAL_CUTOVER_STARTED_REMOTE_NOT_VERIFIED/);
  assert.match(code,/CANDIDATE_START_FAILED_ORIGINAL_RESTORED_KEEP_GUARD/);
});
