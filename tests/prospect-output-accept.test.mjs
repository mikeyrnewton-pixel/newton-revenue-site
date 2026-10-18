import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {acceptProspectOutput} from '../scripts/prospect-output-accept.mjs';

const script = path.resolve(import.meta.dirname, '..', 'scripts', 'prospect-output-accept.mjs');
const fixture = (overrides = {}) => ({
  schemaVersion:1,
  runId:'fixture-run-001',
  deliveryMode:'UNSENT_OWNER_REVIEW',
  controls:{externalCommunication:false, personalDataCollected:false, ownerApprovalRequired:true},
  source:{system:'NEWTON REVENUE — Prospect Engine v1', permissionBasis:'PUBLIC_BUSINESS_WEBSITE', capturedAt:'2026-10-18T01:00:00.000Z'},
  records:[{
    businessName:'Fictional Repairs Ltd',
    website:'https://fictional-repairs.example/',
    sourceUrls:['https://fictional-repairs.example/services','https://fictional-repairs.example/services'],
    researchSummary:'Fictional business-site evidence for acceptance testing only.',
    fitReason:'Fictional fit statement; no real prospect or personal data.',
    draft:{subject:'Fictional diagnostic idea',body:'This is a fictional unsent draft for owner review only.'},
    state:'UNSENT'
  }],
  ...overrides
});

test('accepts, canonicalises and deduplicates fictional business-only output', () => {
  const doc = fixture();
  doc.records.push({...doc.records[0], website:'https://www.fictional-repairs.example/'});
  const result = acceptProspectOutput(JSON.stringify(doc));
  assert.equal(result.status, 'READY_FOR_OWNER_REVIEW_UNSENT');
  assert.deepEqual(result.counts, {input:2, accepted:1, duplicatesRemoved:1});
  assert.deepEqual(result.records[0].sourceUrls, ['https://fictional-repairs.example/services']);
  assert.equal(result.controls.externalCommunication, false);
});

test('fails closed on personal contact data or send instructions', () => {
  const withEmail = fixture();
  withEmail.records[0].researchSummary = 'Email owner@example.com';
  assert.throws(() => acceptProspectOutput(JSON.stringify(withEmail)), /Personal contact data/);
  const withRecipient = fixture();
  withRecipient.records[0].recipient = 'Named person';
  assert.throws(() => acceptProspectOutput(JSON.stringify(withRecipient)), /field is forbidden/);
  const sent = fixture(); sent.records[0].state = 'SENT';
  assert.throws(() => acceptProspectOutput(JSON.stringify(sent)), /must be UNSENT/);
});

test('rejects personal/social sources and off-domain evidence', () => {
  const social = fixture(); social.records[0].website = 'https://linkedin.com/company/example';
  assert.throws(() => acceptProspectOutput(JSON.stringify(social)), /personal\/social host/);
  const offDomain = fixture(); offDomain.records[0].sourceUrls = ['https://directory.example/listing'];
  assert.throws(() => acceptProspectOutput(JSON.stringify(offDomain)), /evidence must come from/);
});

test('CLI writes a private reusable owner-review artifact without network activity', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prospect-accept-'));
  try {
    const input = path.join(root, 'input.json');
    const output = path.join(root, 'private', 'review.json');
    fs.writeFileSync(input, JSON.stringify(fixture()), {mode:0o600});
    const run = spawnSync(process.execPath, [script, '--input', input, '--output', output], {encoding:'utf8'});
    assert.equal(run.status, 0, run.stderr);
    const saved = JSON.parse(fs.readFileSync(output, 'utf8'));
    assert.equal(saved.status, 'READY_FOR_OWNER_REVIEW_UNSENT');
    assert.equal(saved.records.length, 1);
    assert.equal(fs.statSync(output).mode & 0o777, 0o600);
  } finally { fs.rmSync(root, {recursive:true, force:true}); }
});

test('CLI refuses group-readable input and creates no output', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prospect-accept-'));
  try {
    const input = path.join(root, 'input.json');
    const output = path.join(root, 'review.json');
    fs.writeFileSync(input, JSON.stringify(fixture()), {mode:0o644});
    const run = spawnSync(process.execPath, [script, '--input', input, '--output', output], {encoding:'utf8'});
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /permissions/);
    assert.equal(fs.existsSync(output), false);
  } finally { fs.rmSync(root, {recursive:true, force:true}); }
});
