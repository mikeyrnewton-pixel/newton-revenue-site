import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const script=fileURLToPath(new URL(
  '../scripts/atlas-observer-owner-bootstrap-20261030.sh',import.meta.url
));
const text=fs.readFileSync(script,'utf8');

test('one-step source stage & preflight is valid Bash, never cutover',()=>{
  const result=spawnSync('/bin/bash',['-n',script],{
    encoding:'utf8',timeout:5000
  });
  assert.equal(result.status,0,result.stderr);
  assert.match(text,/^#!\/bin\/bash/);
  assert.match(text,/^set -euo pipefail/m);
  assert.match(text,/\/bin\/bash "\$dir\/\$fileA" --preflight/);
  assert.doesNotMatch(text,/--apply-readonly-observer/);
  assert.doesNotMatch(text,/--rollback/);
  assert.doesNotMatch(text,/\b(docker|docker\.sock|sudo|node|npm|sshpass)\b/);
  assert.doesNotMatch(text,/\b(eval|exec)\s+/);
});

test('both dependencies are exact reviewed commit and SHA1 blobs',()=>{
  assert.match(text,/7abf51722e05a272d0b39bd7e415971c86716df0/);
  assert.match(text,/hashA=0b45a664b48f2538b9d9bbb73089b2a1b0e52bd5/);
  assert.match(text,/hashB=3d06691eaf200e5be3669d8e35da0394c15fb628/);
  assert.match(text,/\/usr\/bin\/git hash-object/);
  assert.match(text,/SOURCE_HASH_MISMATCH/);
  assert.match(text,/SOURCE_DESTINATION_SYMLINK/);
  assert.match(text,/STAGING_DIR_OWNER_MISMATCH/);
  assert.match(text,/^umask 077$/m);
  assert.match(text,/chmod 700 "\$dir"/);
  assert.match(text,/chmod 600 "\$temp"/);
});

test('new bootstrap does not expose credentials, tunnel ids or Docker configuration',()=>{
  for(const disallowed of [
    /CONTROL_PLANE_API_KEY/,/sk-proj-/,/tunnel_[A-Za-z0-9]/,
    /--control-plane\./,/\b(cat|less|head|tail)\s+.*(key|secret)/,
    /--privileged/,/docker\s+(stop|start|rm|inspect)/,
  ])assert.doesNotMatch(text,disallowed);
});

test('Linux CI cannot stage Mac files or continue even with arguments',()=>{
  if(process.platform==='darwin')return;
  const result=spawnSync('/bin/bash',[script],{
    encoding:'utf8',timeout:5000
  });
  assert.equal(result.status,2);
  assert.match(result.stdout,/ATLAS_BOOTSTRAP=HOLD_OWNER_MAC_ONLY/);
  const wrong=spawnSync('/bin/bash',[script,'--apply-readonly-observer'],{
    encoding:'utf8',timeout:5000
  });
  assert.equal(wrong.status,2);
  assert.match(wrong.stdout,/ATLAS_BOOTSTRAP=HOLD_NO_ARGUMENTS_ACCEPTED/);
});
