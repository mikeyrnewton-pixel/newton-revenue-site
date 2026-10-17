import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const doc = readFileSync(new URL('../docs/PUBLIC_MAC_BOOTSTRAP.md', import.meta.url), 'utf8');
const installer = readFileSync(new URL('../scripts/bootstrap_mac_builds.sh', import.meta.url));
const expected = '133bb312b4a4f30b743aab72aaf42252ad544571ea927a1e8ded02d906fe12f1';
const commit = 'd900efde1c5753a3f627bb780c9d89163a6efb43';

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
