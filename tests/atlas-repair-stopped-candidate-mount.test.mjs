import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const file = fileURLToPath(new URL('../scripts/atlas-repair-stopped-candidate-mount-20261102.sh', import.meta.url));
const code = readFileSync(file, 'utf8');

test('candidate repair is Bash syntax valid and non-Mac fail closed', () => {
  const syntax = spawnSync('bash', ['-n', file], { encoding: 'utf8' });
  assert.equal(syntax.status, 0, syntax.stderr);
  const rejected = spawnSync('bash', [file, '--apply-existing-candidate'], { encoding: 'utf8' });
  assert.equal(rejected.status, 2);
  assert.match(rejected.stdout, /HOLD_EXACT_MODE_REQUIRED/);
  if (process.platform !== 'darwin') {
    const host = spawnSync('bash', [file, '--repair-stopped-candidate'], { encoding: 'utf8' });
    assert.equal(host.status, 2);
    assert.match(host.stdout, /HOLD_OWNER_MAC_ONLY/);
  }
});
test('only existing stopped candidate can be recreated; original never stopped or removed', () => {
  assert.match(code, /OLD=atlas-tunnel-client-canary/);
  assert.match(code, /NEW=atlas-tunnel-client-observer-candidate/);
  assert.match(code, /container rm "\$NEW"/);
  assert.match(code, /container create --name "\$NEW"/);
  assert.doesNotMatch(code, /container (start|stop|run|rm -f)/);
  assert.match(code, /\$\(fmt '\{\{\.State\.Running\}\}' "\$OLD"\)" = true/);
  assert.match(code, /\$\(fmt '\{\{\.State\.Running\}\}' "\$NEW"\)" = false/);
  assert.match(code, /ROLLBACK_GUARD_EXISTS/);
  assert.match(code, /ALREADY_RUNNING/);
});
test('bind source is the existing owner-private key, never copied, printed or rotated', () => {
  assert.match(code, /\$HOME\/\.atlas-tunnel\/runtime-key/);
  assert.match(code, /--mount "type=bind,source=\$src,target=\/run\/secrets\/runtime-key,readonly"/);
  assert.match(code, /CANDIDATE_SOURCE_NOT_EXPECTED_MISMATCH/);
  assert.match(code, /REPAIRED_SOURCE_NOT_IDENTICAL/);
  assert.match(code, /KEY_BIND_UNSAFE/);
  assert.doesNotMatch(code, /\b(cat|cp|mv|rm|shasum|sha256sum) "\$src"/);
  assert.doesNotMatch(code, /ATLAS_REVIEWED_KEY_MATCH=YES|ATLAS_WORKSPACE_MATCH=YES/);
  assert.match(code, /NO_CUTOVER_NO_KEY_ATTESTATION/);
});
test('keep prior topology and confinement gates rather than blanket docker restart', () => {
  for (const phrase of [
    'STAGE3_UNVERIFIED', 'STAGE3_INCOMPLETE', 'CANDIDATE_NETWORK_UNSAFE',
    'CONFINEMENT_CHANGED', 'ENV_MISMATCH', 'COMMAND_LAYOUT',
    'IMAGE_NOT_PINNED', 'PORTS_EXPOSED', 'POST_REPAIR_CONFINEMENT',
    'ORIGINAL_RUNNING_UNCHANGED'
  ]) assert.ok(code.includes(phrase), phrase);
  assert.match(code, /--cap-drop ALL/);
  assert.match(code, /--security-opt no-new-privileges:true/);
  assert.match(code, /--read-only/);
  assert.match(code, /--restart no/);
});
