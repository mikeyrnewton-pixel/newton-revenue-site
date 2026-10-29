import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const script=fileURLToPath(new URL('../scripts/atlas-observer-headless-cutover-20261029.sh',import.meta.url));
const body=fs.readFileSync(script,'utf8');

test('fallback Bash syntax is valid, no Node runtime needed on Mac',()=>{
  const r=spawnSync('bash',['-n',script],{encoding:'utf8',timeout:5000});
  assert.equal(r.status,0,r.stderr);
  assert.match(body,/^#!\/bin\/bash/);
  assert.match(body,/ATLAS_STAGE3_PREFLIGHT=LOCAL_TOPOLOGY_VERIFIED/);
  assert.match(body,/3d06691eaf200e5be3669d8e35da0394c15fb628/);
  assert.doesNotMatch(body,/\bnode\b\s+['"]/i);
});

test('Mac-only rule blocks preflight, apply and rollback on Linux before Docker',()=>{
  if(process.platform==='darwin')return;
  for(const mode of ['--preflight','--apply-readonly-observer','--rollback']){
    const result=spawnSync('bash',[script,mode],{
      encoding:'utf8',timeout:5000,
      env:{...process.env,ATLAS_REVIEWED_KEY_MATCH:'YES',
        ATLAS_WORKSPACE_MATCH:'YES'},
    });
    assert.equal(result.status,2);
    assert.match(result.stdout,/ATLAS=HOLD_OWNER_MAC_ONLY/);
    assert.doesNotMatch(result.stdout,/key|tunnel_/i);
  }
});

test('No arbitrary execution, external network activity, or root image upgrades',()=>{
  for(const re of [
    /\beval\s+/, /\bsource\s+/,/\bexec\s+/,/\bcurl\s+/,/\bwget\s+/,
    /docker\.sock/,/(\s|^)sudo\s+/,/--privileged/,
    /openai\/v1\/chat/,/submit_order/,/\bnpm install\b/,
  ])assert.doesNotMatch(body,re);
  assert.match(body,/--volumes-from "\$OLD:ro"/);
  assert.match(body,/--read-only --cap-drop ALL/);
  assert.match(body,/--security-opt no-new-privileges:true/);
  assert.match(body,/--restart no/);
  assert.match(body,/--network "container:\$CANARY"/);
});

test('Cutover explicitly requires separately verified restricted key and workspace',()=>{
  assert.match(body,/ATLAS_REVIEWED_KEY_MATCH/);
  assert.match(body,/ATLAS_WORKSPACE_MATCH/);
  assert.match(body,/PLATFORM_ROLE_AND_WORKSPACE_NOT_CONFIRMED/);
  assert.match(body,/ORIGINAL_STOP_FAILED/);
  assert.match(body,/CANDIDATE_START_FAILED_ORIGINAL_RESTORED/);
  assert.match(body,/--rollback/);
  assert.match(body,/GUARD_IDENTITY_MISMATCH/);
  assert.match(body,/ORIGINAL_CANARY_RESTORED/);
});

test('Scope is limited to original tunnel stop and candidate start/stop/remove',()=>{
  assert.doesNotMatch(body,/docker\s+rm\s+-f/);
  assert.doesNotMatch(body,/container\s+start\s+"\$CANARY"/);
  assert.doesNotMatch(body,/container\s+stop\s+"\$CANARY"/);
  assert.doesNotMatch(body,/container\s+(?:stop|rm|start)\s+"\$OBS"/);
  assert.match(body,/container start "\$OLD"/);
  assert.match(body,/container stop --time 10 "\$NEW"/);
  assert.match(body,/container rm "\$NEW"/);
});

test('Rejects malformed switches before platform-specific checks',()=>{
  const x=spawnSync('bash',[script,'--not-supported'],{
    encoding:'utf8',timeout:5000
  });
  assert.equal(x.status,2);
  assert.match(x.stdout,/ATLAS=HOLD_SWITCH/);
});
