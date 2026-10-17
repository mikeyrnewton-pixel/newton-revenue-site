import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const command = new URL('../scripts/atlas-local-integration-readiness.mjs', import.meta.url).pathname;
const run = home => JSON.parse(execFileSync(process.execPath, [command, '--json', '--no-probes'], {
  encoding: 'utf8', timeout: 5000, env: { HOME: home, PATH: process.env.PATH || '', API_KEY: 'HIDDEN_TEST_SECRET_38492' }
}));

test('no-probes inventory is read-only and never claims integrations are connected', () => {
  const home = mkdtempSync(join(tmpdir(), 'atlas-local-empty-'));
  try {
    const data = run(home);
    assert.equal(data.result, 'LOCAL_INTEGRATION_READ_ONLY_COMPLETE');
    assert.equal(data.authorisation, 'NO_EXTERNAL_NETWORK_NO_PAID_API_NO_CHANGES');
    assert.equal(data.checkedOnMac, false);
    for (const key of ['tailscale', 'activepiecesDocker', 'activepiecesLoopback', 'salesDeskLoopback'])
      assert.equal(data[key], 'NOT_CHECKED_REQUESTED');
    assert.equal(data.privateMacCheckout, 'NOT_DETECTED');
    assert.ok(!JSON.stringify(data).includes('HIDDEN_TEST_SECRET_38492'));
  } finally { rmSync(home, {recursive:true,force:true}); }
});

test('recognises only genuine stage paths and refuses symlink false positives', () => {
  const home = mkdtempSync(join(tmpdir(), 'atlas-local-stage-'));
  try {
    mkdirSync(join(home, 'Newton-Empire'));
    mkdirSync(join(home, 'ATLAS-SALES-DESK-v1.2'));
    mkdirSync(join(home, 'ATLAS-BUILD-READY', 'results'), {recursive:true});
    writeFileSync(join(home, 'ATLAS-BUILD-READY', 'results', 'ATLAS_BUILD_STATUS.txt'), 'FAKE_SENSITIVE_CONTENT=HIDDEN');
    const data = run(home);
    assert.equal(data.privateMacCheckout, 'DIRECTORY_PRESENT_CODE_UNVERIFIED');
    assert.equal(data.buildStageReceipt, 'FILE_PRESENT_CONTENT_NOT_VERIFIED');
    assert.equal(data.salesDeskStage, 'DIRECTORY_PRESENT_SERVICE_UNVERIFIED');
    assert.ok(!JSON.stringify(data).includes('FAKE_SENSITIVE_CONTENT'));
    rmSync(join(home, 'Newton-Empire'), {recursive:true});
    symlinkSync(join(home, 'ATLAS-SALES-DESK-v1.2'), join(home, 'Newton-Empire'));
    assert.equal(run(home).privateMacCheckout, 'NOT_DETECTED');
  } finally { rmSync(home, {recursive:true,force:true}); }
});

test('unknown options fail closed and --help performs no local inventory', () => {
  const bad = spawnSync(process.execPath, [command, '--enable-paid-models'], {encoding:'utf8', timeout:5000});
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /BLOCKED/);
  const help = execFileSync(process.execPath, [command, '--help'], {encoding:'utf8'});
  assert.match(help, /Read-only/);
});
