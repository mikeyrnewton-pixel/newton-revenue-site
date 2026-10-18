import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {buildHandoff} from '../scripts/atlas-safe-result-handoff.mjs';

const script=path.resolve(import.meta.dirname,'..','scripts','atlas-safe-result-handoff.mjs');
const setup=()=>fs.mkdtempSync(path.join(os.tmpdir(),'atlas-handoff-'));
const digest=(status='COMPLETE_LOCAL_EVIDENCE')=>({
  schemaVersion:1,
  job:{id:'TASK-016',kind:'LOCAL_READINESS_DIGEST_V1',consequential:false},
  status,
  evidence:{
    salesDeskStartup:{state:status==='COMPLETE_LOCAL_EVIDENCE'?'VALID_LOCAL_EVIDENCE':'MISSING',file:'SALES_DESK_STARTUP.json',sha256:status==='COMPLETE_LOCAL_EVIDENCE'?'a'.repeat(64):null,sourceStatus:status==='COMPLETE_LOCAL_EVIDENCE'?'STARTED':null},
    salesDeskReconciliation:{state:'VALID_LOCAL_EVIDENCE',file:'SALES_DESK_RECONCILIATION.json',sha256:'b'.repeat(64),sourceStatus:'NO_LEDGER'},
    prospectOutputReview:{state:'VALID_LOCAL_EVIDENCE',file:'PROSPECT_OUTPUT_REVIEW.json',sha256:'c'.repeat(64),sourceStatus:'READY_FOR_OWNER_REVIEW_UNSENT'}
  },
  controls:{readOnlyInputs:true,aggregateOnly:true,externalNetworkUsed:false,modelOrApiUsed:false,externalCommunication:false},
  assertions:{customerDelivery:false,revenue:false,bankVerification:false,autonomousOperation:false},
  privatePayload:'DO_NOT_COPY_ME'
});

test('complete local evidence becomes import-ready but never DONE',()=>{
  const result=buildHandoff(digest(),'d'.repeat(64));
  assert.equal(result.result.state,'READY_FOR_ENGINE_IMPORT');
  assert.equal(result.queuePatch.done,false);
  assert.equal(result.assertions.engineExecuted,false);
  assert.equal(result.assertions.queueUpdated,false);
  assert.equal(result.assertions.done,false);
  assert.equal(JSON.stringify(result).includes('DO_NOT_COPY_ME'),false);
});

test('blocked evidence remains blocked and cannot propose DONE',()=>{
  const result=buildHandoff(digest('BLOCKED_MISSING_OR_INVALID_EVIDENCE'),'e'.repeat(64));
  assert.equal(result.result.state,'BLOCKED_LOCAL_EVIDENCE');
  assert.equal(result.queuePatch.done,false);
  assert.match(result.queuePatch.blocker,/do not import as DONE/);
});

test('rejects contradictory evidence and consequential claims',()=>{
  const contradictory=digest();
  contradictory.evidence.salesDeskStartup.state='MISSING';
  assert.throws(()=>buildHandoff(contradictory,'f'.repeat(64)),/contradicts/);
  const unsafe=digest();
  unsafe.assertions.revenue=true;
  assert.throws(()=>buildHandoff(unsafe,'f'.repeat(64)),/consequential claim/);
});

test('CLI writes a deterministic private handoff receipt',()=>{
  const root=setup();
  try{
    const input=path.join(root,'TASK016_READINESS_DIGEST.json');
    const raw=JSON.stringify(digest());
    fs.writeFileSync(input,raw,{mode:0o600});
    const expected=crypto.createHash('sha256').update(raw).digest('hex');
    const run=spawnSync(process.execPath,[script,'--results-dir',root],{encoding:'utf8'});
    assert.equal(run.status,0,run.stderr);
    const output=path.join(root,'TASK017_SAFE_RESULT_HANDOFF.json');
    const receipt=JSON.parse(fs.readFileSync(output,'utf8'));
    assert.equal(receipt.result.id,`TASK-017-${expected.slice(0,16)}`);
    assert.equal(receipt.source.sha256,expected);
    assert.equal(fs.statSync(output).mode&0o777,0o600);
    assert.equal(JSON.parse(run.stdout).done,false);
  }finally{fs.rmSync(root,{recursive:true,force:true})}
});

test('refuses symlinked, group-readable, or unsafe digest input',()=>{
  const root=setup();
  try{
    const actual=path.join(root,'actual.json');
    const input=path.join(root,'TASK016_READINESS_DIGEST.json');
    fs.writeFileSync(actual,JSON.stringify(digest()),{mode:0o600});
    fs.symlinkSync(actual,input);
    let run=spawnSync(process.execPath,[script,'--results-dir',root],{encoding:'utf8'});
    assert.notEqual(run.status,0);assert.match(run.stderr,/BLOCKED/);
    fs.unlinkSync(input);fs.renameSync(actual,input);fs.chmodSync(input,0o644);
    run=spawnSync(process.execPath,[script,'--results-dir',root],{encoding:'utf8'});
    assert.notEqual(run.status,0);assert.match(run.stderr,/permissions/);
  }finally{fs.rmSync(root,{recursive:true,force:true})}
});

test('unknown options cannot enable contact, models, or trigger changes',()=>{
  const root=setup();
  try{
    const run=spawnSync(process.execPath,[script,'--results-dir',root,'--send','yes'],{encoding:'utf8'});
    assert.notEqual(run.status,0);assert.match(run.stderr,/Unknown option/);
    assert.equal(fs.existsSync(path.join(root,'TASK017_SAFE_RESULT_HANDOFF.json')),false);
  }finally{fs.rmSync(root,{recursive:true,force:true})}
});
