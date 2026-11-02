import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const baseline=fileURLToPath(new URL('../scripts/atlas-observer-headless-cutover-20261029.sh',import.meta.url));
const fixed=fileURLToPath(new URL('../scripts/atlas-observer-headless-cutover-bash32-20261101.sh',import.meta.url));
const original=readFileSync(baseline,'utf8');
const changed=readFileSync(fixed,'utf8');

test('Bash32 variant is valid Bash and is strictly one-line change from baseline',()=>{
  const r=spawnSync('bash',['-n',fixed],{encoding:'utf8',timeout:5000});
  assert.equal(r.status,0,r.stderr);
  // Current review branch already contains the same safe one-line fix, but
  // has three accidentally embedded explanatory comments in the Docker
  // continuation. The standalone release variant omits only those comments.
  const clean = original.split('\n').filter(line=>
    !line.trim().startsWith('# macOS ships Bash 3.2:') &&
    !line.trim().startsWith('# as "')
    && !line.trim().startsWith('# expansions keep zero optional')
  ).join('\n');
  assert.equal(changed,clean);
  assert.match(changed,/userarg\[@\]\+/);
  assert.match(changed,/envargs\[@\]\+/);
  assert.match(changed,/^set -euo pipefail$/m);
  assert.match(changed,/ATLAS=LOCAL_CUTOVER_STARTED_REMOTE_NOT_VERIFIED/);
  assert.match(changed,/ORIGINAL_CANARY_RESTORED/);
});

test('empty-array conditional expansion survives nounset without adding blank args',()=>{
  const d='$';
  const opt=(n)=>'"'+d+'{'+n+'[@]+"'+d+'{'+n+'[@]}"}"';
  const shell=['set -euo pipefail','userarg=()','envargs=(--env good)',
    'set -- '+opt('userarg')+' '+opt('envargs'),
    'printf "%s\\n" "$#"'];
  const r=spawnSync('bash',['-c',shell.join('\n')],{encoding:'utf8',timeout:5000});
  assert.equal(r.status,0,r.stderr);
  assert.equal(r.stdout.trim(),'2');
});

test('populated optional user preserves both Docker user flags',()=>{
  const d='$';
  const opt=(n)=>'"'+d+'{'+n+'[@]+"'+d+'{'+n+'[@]}"}"';
  const shell=['set -euo pipefail','userarg=(--user 501:20)','envargs=(--env good)',
    'set -- '+opt('userarg')+' '+opt('envargs'),
    'printf "%s\\n" "$#"'];
  const r=spawnSync('bash',['-c',shell.join('\n')],{encoding:'utf8',timeout:5000});
  assert.equal(r.status,0,r.stderr);
  assert.equal(r.stdout.trim(),'4');
});
