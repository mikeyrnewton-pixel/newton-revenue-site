import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';

const script = path.resolve(import.meta.dirname,'sales-desk-readonly-reconcile.mjs');
const setup = () => fs.mkdtempSync(path.join(os.tmpdir(),'atlas-reconcile-test-'));
const run = (root) => spawnSync(process.execPath,[script,'--data-dir',path.join(root,'data'),'--output',path.join(root,'out','receipt.json')],{encoding:'utf8'});
const record = (overrides={}) => ({id:crypto.randomUUID(),company:'Fixture Ltd',state:'NEW',synthetic:false,events:[],...overrides});

test('writes aggregate-only private receipt and excludes synthetics',()=>{
  const root=setup();
  try {
    const data=path.join(root,'data'); fs.mkdirSync(data,{mode:0o700});
    const leads=[
      record({id:'real-cleared',company:'PRIVATE CUSTOMER',sourceRef:'PRIVATE REF',state:'CLEARED',amountPence:19500,termsApproved:true,vatTreatment:'NOT_VAT_REGISTERED_CONFIRMED'}),
      record({id:'real-invoice',state:'INVOICED',amountPence:50000,termsApproved:true,vatTreatment:'VAT_AMOUNT_CONFIRMED'}),
      record({id:'synthetic',synthetic:true})
    ];
    fs.writeFileSync(path.join(data,'pipeline.json'),JSON.stringify({version:1,leads}),{mode:0o600});
    const result=run(root); assert.equal(result.status,0,result.stderr);
    const output=path.join(root,'out','receipt.json');
    const raw=fs.readFileSync(output,'utf8'); const receipt=JSON.parse(raw);
    assert.equal(receipt.status,'RECONCILED_LOCAL_EVIDENCE');
    assert.equal(receipt.totals.clearedPence,19500);
    assert.equal(receipt.totals.invoicedNotClearedPence,50000);
    assert.equal(receipt.totals.syntheticExcluded,1);
    assert.equal(raw.includes('PRIVATE CUSTOMER'),false);
    assert.equal(raw.includes('PRIVATE REF'),false);
    assert.equal(fs.statSync(output).mode & 0o777,0o600);
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});

test('missing ledger yields explicit zero receipt without creating data directory',()=>{
  const root=setup();
  try {
    const result=run(root); assert.equal(result.status,0,result.stderr);
    const receipt=JSON.parse(fs.readFileSync(path.join(root,'out','receipt.json'),'utf8'));
    assert.equal(receipt.status,'NO_LEDGER');
    assert.equal(receipt.totals.genuineRecords,0);
    assert.equal(fs.existsSync(path.join(root,'data')),false);
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});

test('fails closed on a synthetic paid record',()=>{
  const root=setup();
  try {
    const data=path.join(root,'data'); fs.mkdirSync(data,{mode:0o700});
    const leads=[record({id:'synthetic-paid',synthetic:true,state:'CLEARED',amountPence:1,termsApproved:true,vatTreatment:'NOT_VAT_REGISTERED_CONFIRMED'})];
    fs.writeFileSync(path.join(data,'pipeline.json'),JSON.stringify({version:1,leads}),{mode:0o600});
    const result=run(root); assert.notEqual(result.status,0); assert.match(result.stderr,/Synthetic record/);
    assert.equal(fs.existsSync(path.join(root,'out','receipt.json')),false);
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});

test('refuses symlinked ledger and group-readable private data',()=>{
  const root=setup();
  try {
    const data=path.join(root,'data'); fs.mkdirSync(data,{mode:0o700});
    const actual=path.join(root,'actual.json'); fs.writeFileSync(actual,JSON.stringify({version:1,leads:[]}),{mode:0o600});
    fs.symlinkSync(actual,path.join(data,'pipeline.json'));
    let result=run(root); assert.notEqual(result.status,0); assert.match(result.stderr,/symbolic link/);
    fs.unlinkSync(path.join(data,'pipeline.json'));
    fs.writeFileSync(path.join(data,'pipeline.json'),JSON.stringify({version:1,leads:[]}),{mode:0o644});
    result=run(root); assert.notEqual(result.status,0); assert.match(result.stderr,/permissions/);
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});
