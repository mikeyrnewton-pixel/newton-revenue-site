import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {buildDigest} from '../scripts/atlas-readiness-digest-job.mjs';

const script=path.resolve(import.meta.dirname,'..','scripts','atlas-readiness-digest-job.mjs');
const setup=()=>fs.mkdtempSync(path.join(os.tmpdir(),'atlas-digest-'));
const save=(dir,name,doc)=>fs.writeFileSync(path.join(dir,name),JSON.stringify(doc),{mode:0o600});
const fixtures=(dir)=>{
  save(dir,'SALES_DESK_STARTUP.json',{schemaVersion:1,status:'STARTED',listener:{host:'127.0.0.1',port:3777,verified:true,public:false},controls:{externalNetworkUsed:false,manualOwnerInvocation:true},privateNote:'DO_NOT_COPY_ME'});
  save(dir,'SALES_DESK_RECONCILIATION.json',{schemaVersion:1,status:'NO_LEDGER',controls:{readOnly:true,aggregateOnly:true,syntheticExcluded:true,externalBankVerification:false},privateNote:'DO_NOT_COPY_ME'});
  save(dir,'PROSPECT_OUTPUT_REVIEW.json',{schemaVersion:1,status:'READY_FOR_OWNER_REVIEW_UNSENT',controls:{externalCommunication:false,personalDataCollected:false,ownerApprovalRequired:true,networkAccessUsed:false},records:[{privateNote:'DO_NOT_COPY_ME'}]});
};

test('builds an aggregate-only complete digest from three valid private receipts',()=>{
  const root=setup();
  try{
    fixtures(root);
    const digest=buildDigest(root);
    assert.equal(digest.status,'COMPLETE_LOCAL_EVIDENCE');
    assert.equal(Object.values(digest.evidence).every(item=>item.state==='VALID_LOCAL_EVIDENCE'),true);
    assert.equal(JSON.stringify(digest).includes('DO_NOT_COPY_ME'),false);
    assert.equal(digest.assertions.revenue,false);
    assert.equal(digest.controls.modelOrApiUsed,false);
  }finally{fs.rmSync(root,{recursive:true,force:true})}
});

test('missing evidence produces a useful persisted blocker instead of a false READY',()=>{
  const root=setup();
  try{
    save(root,'SALES_DESK_RECONCILIATION.json',{schemaVersion:1,status:'NO_LEDGER',controls:{readOnly:true,aggregateOnly:true,syntheticExcluded:true,externalBankVerification:false}});
    const run=spawnSync(process.execPath,[script,'--results-dir',root],{encoding:'utf8'});
    assert.equal(run.status,0,run.stderr);
    const output=path.join(root,'TASK016_READINESS_DIGEST.json');
    const digest=JSON.parse(fs.readFileSync(output,'utf8'));
    assert.equal(digest.status,'BLOCKED_MISSING_OR_INVALID_EVIDENCE');
    assert.equal(digest.evidence.salesDeskStartup.state,'MISSING');
    assert.equal(digest.evidence.salesDeskReconciliation.state,'VALID_LOCAL_EVIDENCE');
    assert.equal(fs.statSync(output).mode&0o777,0o600);
  }finally{fs.rmSync(root,{recursive:true,force:true})}
});

test('unsupported claims are marked invalid and never promoted to complete',()=>{
  const root=setup();
  try{
    fixtures(root);
    save(root,'SALES_DESK_STARTUP.json',{schemaVersion:1,status:'STARTED',listener:{host:'0.0.0.0',port:3777,verified:true,public:true},controls:{externalNetworkUsed:true,manualOwnerInvocation:false}});
    const digest=buildDigest(root);
    assert.equal(digest.status,'BLOCKED_MISSING_OR_INVALID_EVIDENCE');
    assert.equal(digest.evidence.salesDeskStartup.state,'INVALID_OR_UNSUPPORTED');
  }finally{fs.rmSync(root,{recursive:true,force:true})}
});

test('refuses symlinked or group-readable evidence',()=>{
  const root=setup();
  try{
    fixtures(root);
    const target=path.join(root,'SALES_DESK_STARTUP.json');
    const actual=path.join(root,'actual.json');
    fs.renameSync(target,actual);fs.symlinkSync(actual,target);
    assert.throws(()=>buildDigest(root),/non-symlink/);
    fs.unlinkSync(target);fs.renameSync(actual,target);fs.chmodSync(target,0o644);
    assert.throws(()=>buildDigest(root),/permissions/);
  }finally{fs.rmSync(root,{recursive:true,force:true})}
});

test('unknown CLI options fail closed without writing output',()=>{
  const root=setup();
  try{
    const run=spawnSync(process.execPath,[script,'--enable-model','yes','--results-dir',root],{encoding:'utf8'});
    assert.notEqual(run.status,0);assert.match(run.stderr,/BLOCKED/);
    assert.equal(fs.existsSync(path.join(root,'TASK016_READINESS_DIGEST.json')),false);
  }finally{fs.rmSync(root,{recursive:true,force:true})}
});
