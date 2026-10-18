import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {evaluatePaperSpec} from '../scripts/paper-desk-quality-gate.mjs';

const script=path.resolve(import.meta.dirname,'..','scripts','paper-desk-quality-gate.mjs');
const valid=()=>({
  schemaVersion:1,mode:'VIRTUAL_PAPER_ONLY',capitalGBP:50,
  execution:{realMoney:false,brokerConnected:false,walletConnected:false,ordersSubmitted:0,externalNetworkUsed:false},
  strategy:{ruleId:'SMA-20-60-v1',signalInput:'COMPLETED_BARS_ONLY',fillModel:'NEXT_BAR_OPEN',parametersFrozenBeforeHoldout:true,holdoutImmutable:true},
  costs:{feeRateEachSide:0.006,slippageRateEachSide:0.002,appliedToHoldout:true},
  sizing:{maxPositionFraction:0.10,minOrderGBP:5,allocations:[{asset:'BTC',virtualGBP:50}]},
  windows:{trainingEnd:'2025-12-31T23:59:59Z',holdoutStart:'2026-01-01T00:00:00Z',holdoutEnd:'2026-09-30T23:59:59Z',forwardStart:'2026-10-15T00:00:00Z'},
  dataProvenance:{provider:'FIXTURE',interval:'1d',timezone:'UTC',rawSha256:'a'.repeat(64),retrievedAt:'2026-10-15T01:00:00Z',completedThrough:'2026-10-14T23:59:59Z'},
  holdout:{closedTrades:30,costsIncluded:true,dataLeakageChecksPassed:true,maxDrawdownFraction:0.10}
});
const setup=()=>fs.mkdtempSync(path.join(os.tmpdir(),'paper-gate-'));

test('qualifies a complete paper-only specification without executing an order',()=>{
  const result=evaluatePaperSpec(valid());
  assert.equal(result.status,'QUALIFIED_FOR_FORWARD_PAPER_LEDGER');
  assert.equal(result.issues.length,0);
  assert.equal(result.controls.ordersSubmitted,0);
  assert.equal(result.assertions.forwardOrderExecuted,false);
  assert.equal(result.assertions.profitableStrategy,false);
});

test('canonical combined £25/£25 sizing is blocked below the £5 minimum',()=>{
  const doc=valid();
  doc.sizing.allocations=[{asset:'BTC',virtualGBP:25},{asset:'ETH',virtualGBP:25}];
  const result=evaluatePaperSpec(doc);
  assert.equal(result.status,'BLOCKED_QUALITY_GATE');
  assert.equal(result.issues.filter(x=>x.code==='UNTRADEABLE_SIZING').length,2);
});

test('historical 0/1-trade holdouts cannot qualify',()=>{
  for(const count of [0,1]){
    const doc=valid();doc.holdout.closedTrades=count;
    const result=evaluatePaperSpec(doc);
    assert.equal(result.status,'BLOCKED_QUALITY_GATE');
    assert.ok(result.issues.some(x=>x.code==='HOLDOUT_TRADES'));
  }
});

test('rejects leakage, incomplete bars and optimistic costs',()=>{
  const doc=valid();
  doc.strategy.signalInput='LIVE_BAR';
  doc.strategy.parametersFrozenBeforeHoldout=false;
  doc.costs={feeRateEachSide:0,slippageRateEachSide:0,appliedToHoldout:false};
  doc.holdout.dataLeakageChecksPassed=false;
  const codes=evaluatePaperSpec(doc).issues.map(x=>x.code);
  for(const expected of ['COMPLETED_BARS','FROZEN_PARAMETERS','FEE','SLIPPAGE','COST_APPLICATION','HOLDOUT_CONTROLS']) assert.ok(codes.includes(expected));
});

test('rejects any real execution, broker, wallet, network or submitted order claim',()=>{
  const doc=valid();
  doc.execution={realMoney:true,brokerConnected:true,walletConnected:true,ordersSubmitted:1,externalNetworkUsed:true};
  const result=evaluatePaperSpec(doc);
  assert.ok(result.issues.some(x=>x.code==='NO_REAL_EXECUTION'));
  assert.equal(result.controls.ordersSubmitted,0);
});

test('CLI persists a private blocked receipt and refuses loose or symlinked input',()=>{
  const root=setup();
  try{
    const input=path.join(root,'spec.json');
    const output=path.join(root,'out','receipt.json');
    const doc=valid();doc.holdout.closedTrades=1;
    fs.writeFileSync(input,JSON.stringify(doc),{mode:0o600});
    let run=spawnSync(process.execPath,[script,'--input',input,'--output',output],{encoding:'utf8'});
    assert.equal(run.status,0,run.stderr);
    const result=JSON.parse(fs.readFileSync(output,'utf8'));
    assert.equal(result.status,'BLOCKED_QUALITY_GATE');
    assert.equal(fs.statSync(output).mode&0o777,0o600);
    fs.chmodSync(input,0o644);
    run=spawnSync(process.execPath,[script,'--input',input,'--output',output],{encoding:'utf8'});
    assert.notEqual(run.status,0);assert.match(run.stderr,/permissions/);
    fs.chmodSync(input,0o600);const actual=path.join(root,'actual.json');fs.renameSync(input,actual);fs.symlinkSync(actual,input);
    run=spawnSync(process.execPath,[script,'--input',input,'--output',output],{encoding:'utf8'});
    assert.notEqual(run.status,0);assert.match(run.stderr,/non-symlink/);
  }finally{fs.rmSync(root,{recursive:true,force:true})}
});

test('unknown options cannot enable trading or broker connections',()=>{
  const root=setup();
  try{
    const input=path.join(root,'spec.json');fs.writeFileSync(input,JSON.stringify(valid()),{mode:0o600});
    const run=spawnSync(process.execPath,[script,'--input',input,'--place-order','yes'],{encoding:'utf8'});
    assert.notEqual(run.status,0);assert.match(run.stderr,/Unknown option/);
  }finally{fs.rmSync(root,{recursive:true,force:true})}
});
