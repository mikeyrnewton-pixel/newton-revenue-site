import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const doc = readFileSync(new URL('../docs/PUBLIC_MAC_BOOTSTRAP.md', import.meta.url), 'utf8');
const installer = readFileSync(new URL('../scripts/bootstrap_mac_builds.sh', import.meta.url));
const expected = 'a4c299d28ad66409f553da2bbee9dfd732d105667249f4b18188d6fc0eadf416';
const commit = '8c45c0993437603639e978af5124dff48e0c8d25';

test('iPhone bootstrap command pins exact immutable reviewed script SHA256', () => {
  const actual = createHash('sha256').update(installer).digest('hex');
  assert.equal(actual, expected, 'documented launcher checksum must equal actual bytes');
  assert.ok(doc.includes(commit + '/scripts/bootstrap_mac_builds.sh'));
  assert.ok(doc.includes(expected));
  assert.match(doc, /shasum -a 256 -c -/);
});

test('one controlled remote command fails closed, dry-runs then applies', () => {
  const section = doc.split('## Reviewed iPhone SSH handoff')[1] ?? '';
  assert.match(section, /set -eu/);
  assert.match(section, /curl -fsSL --proto '=https'/);
  assert.match(section, /trap 'rm -f/);
  assert.match(section, /bash "\$atlas_tmp" --dry-run/);
  assert.match(section, /bash "\$atlas_tmp" --apply/);
  assert.ok(section.indexOf('shasum -a 256 -c -') < section.indexOf('bash "$atlas_tmp" --apply'));
  assert.doesNotMatch(section, /raw\.githubusercontent\.com\/[^\s]+\/main\/scripts/);
  assert.match(section, /REAL_CUSTOMER_DELIVERY=HOLD/);
});
