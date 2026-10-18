import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {evaluateMacAdoptionStatus} from '../scripts/task022-mac-adoption-receipt.mjs';

const script=path.resolve(import.meta.dirname,'..','scripts','task022-mac-adoption-receipt.mjs');
const valid=()=>[
  'MAC_STAGED=YES','PUBLIC_SITE_TESTS=PASS','PRIVATE_BUILDS=FOUR_PINNED_PRIVATE_SYNTHETIC_BUILDS_RUN',
  'AI_PROVIDER_INVENTORY=COMPLETE_NO_API_CALLS','LOCAL_INTEGRATION_INVENTORY=COMPLETE_READ_ONLY_NOT_CONNECTED',
  'CREDENTIALS_PRESENT_UNTESTED=2','OPTIONAL_ROUTES_DISABLED=3','FULL_CUSTOMER_REHEARSAL=FICTIONAL_REHEARSAL_COMPLETE',
  'REAL_CUSTOMER_DELIVERY=HOLD','MAC_RUNNING_BOTS_CHANGED=NO','NEW_SERVICES_INSTALLED=NO','NEW_CHARGES=NONE',''
].join('\n');
const setup=()=>fs.mkdtempSync(path.join(os.tmpdir(),'task022-receipt-'));

test('qualifies a complete redacted status but preserves delivery and artifact holds',()=>{
  const result=evaluateMacAdoptionStatus(valid());
  assert.equal(result.status,'READY_LOCAL_OFFLINE_BUILD_ADOPTED');
  assert.equal(result.issues.length,0);
  assert.equal(result.assertions.realCustomerDelivery,false);
  assert.equal(result.assertions.individualBuildArtifactsIndependentlyVerified,false);
});

test('blocks authentication and outdated-builder states',()=>{
  for(const state of ['AUTH_REQUIRED','LOCAL_PRIVATE_CHECKOUT_FOUND_NEEDS_BUILD_CODE_UPDATE','PRIVATE_BUILDER_FINGERPRINT_MISMATCH']){
    const result=evaluateMacAdoptionStatus(valid().replace('FOUR_PINNED_PRIVATE_SYNTHETIC_BUILDS_RUN',state));
    assert.equal(result.status,'BLOCKED_MAC_ADOPTION');
    assert.ok(result.issues.some(x=>x.code==='PRIVATE_BUILDS'));
  }
});

test('blocks any customer release, changed bot, service or charge claim',()=>{
  const unsafe=valid().replace('REAL_CUSTOMER_DELIVERY=HOLD','REAL_CUSTOMER_DELIVERY=READY')
    .replace('MAC_RUNNING_BOTS_CHANGED=NO','MAC_RUNNING_BOTS_CHANGED=YES')
    .replace('NEW_SERVICES_INSTALLED=NO','NEW_SERVICES_INSTALLED=YES')
    .replace('NEW_CHARGES=NONE','NEW_CHARGES=PAID');
  const codes=evaluateMacAdoptionStatus(unsafe).issues.map(x=>x.code);
  for(const code of ['DELIVERY_HOLD','NO_BOT_CHANGE','NO_SERVICE_CHANGE','NO_CHARGES']) assert.ok(codes.includes(code));
});

test('rejects secret markers, unknown keys and duplicate keys',()=>{
  assert.throws(()=>evaluateMacAdoptionStatus(valid()+'API_KEY=PRESENT\n'),/secret marker/);
  assert.throws(()=>evaluateMacAdoptionStatus(valid()+'UNKNOWN=YES\n'),/unknown key/);
  assert.throws(()=>evaluateMacAdoptionStatus(valid()+'MAC_STAGED=YES\n'),/duplicate status key/);
});

test('CLI writes a private receipt and refuses loose or symlinked input',()=>{
  const root=setup();
  try{
    const input=path.join(root,'ATLAS_BUILD_STATUS.txt');
    const output=path.join(root,'private','receipt.json');
    fs.writeFileSync(input,valid(),{mode:0o600});
    let run=spawnSync(process.execPath,[script,'--input',input,'--output',output],{encoding:'utf8'});
    assert.equal(run.status,0,run.stderr);
    assert.equal(JSON.parse(fs.readFileSync(output,'utf8')).status,'READY_LOCAL_OFFLINE_BUILD_ADOPTED');
    assert.equal(fs.statSync(output).mode&0o777,0o600);
    fs.chmodSync(input,0o644);
    run=spawnSync(process.execPath,[script,'--input',input,'--output',output],{encoding:'utf8'});
    assert.notEqual(run.status,0);assert.match(run.stderr,/permissions/);
    fs.chmodSync(input,0o600);const actual=path.join(root,'actual.txt');fs.renameSync(input,actual);fs.symlinkSync(actual,input);
    run=spawnSync(process.execPath,[script,'--input',input,'--output',output],{encoding:'utf8'});
    assert.notEqual(run.status,0);assert.match(run.stderr,/non-symlink/);
  }finally{fs.rmSync(root,{recursive:true,force:true})}
});

test('unknown options cannot start workers or change services',()=>{
  const root=setup();
  try{
    const input=path.join(root,'status.txt');fs.writeFileSync(input,valid(),{mode:0o600});
    for(const flag of ['--start-workers','--install-service','--apply']){
      const run=spawnSync(process.execPath,[script,'--input',input,flag,'yes'],{encoding:'utf8'});
      assert.notEqual(run.status,0);assert.match(run.stderr,/Unknown option/);
    }
  }finally{fs.rmSync(root,{recursive:true,force:true})}
});
