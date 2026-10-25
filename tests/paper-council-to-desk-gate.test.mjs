import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reviewPaperCouncilHandoff} from '../lib/paper-council-to-desk-gate.js';

// Sanitised exact receipt from original Newton-Empire GitHub CI artifact.
// This is NOT proof that five paid model providers actually ran.
const receipt=()=>JSON.parse(readFileSync(
  new URL('../fixtures/atlastest/btc-paper-council-20261025-ci-receipt.json',import.meta.url),'utf8'));
const now=()=>new Date('2026-10-25T21:10:00Z');
const qualifiedPaperSpec=()=>({
  schemaVersion:1,mode:'VIRTUAL_PAPER_ONLY',capitalGBP:50,
  execution:{realMoney:false,brokerConnected:false,walletConnected:false,ordersSubmitted:0,externalNetworkUsed:false},
  strategy:{ruleId:'PREDECLARED-BTC-TEST-ONLY',signalInput:'COMPLETED_BARS_ONLY',fillModel:'NEXT_BAR_OPEN',parametersFrozenBeforeHoldout:true,holdoutImmutable:true},
  costs:{feeRateEachSide:.006,slippageRateEachSide:.002,appliedToHoldout:true},
  sizing:{maxPositionFraction:.10,minOrderGBP:5,allocations:[{asset:'BTC',virtualGBP:50}]},
  windows:{trainingEnd:'2025-12-31T23:59:59Z',holdoutStart:'2026-01-01T00:00:00Z',holdoutEnd:'2026-09-30T23:59:59Z',forwardStart:'2026-10-15T00:00:00Z'},
  dataProvenance:{provider:'SYNTHETIC_FIXTURE',interval:'1d',timezone:'UTC',rawSha256:'a'.repeat(64),retrievedAt:'2026-10-15T01:00:00Z',completedThrough:'2026-10-14T23:59:59Z'},
  holdout:{closedTrades:30,costsIncluded:true,dataLeakageChecksPassed:true,maxDrawdownFraction:.1},
});

test('ACTUAL BTC 25 Oct CI receipt is WAIT even if toy 30-trade spec claims to qualify',()=>{
  const output=reviewPaperCouncilHandoff(receipt(),qualifiedPaperSpec(),now());
  assert.equal(output.status,'VIRTUAL_LEDGER_REVIEW_HOLD');
  assert.equal(output.deskQualityStatus,'QUALIFIED_FOR_FORWARD_PAPER_LEDGER');
  assert.equal(output.researchDigest,'a88e26a3007deab5f434d21f71fcd07eadc806aadfeee5eeb14abbac35ea7bcd');
  assert.ok(output.blockers.includes('COUNCIL_WAIT'));
  assert.ok(output.blockers.includes('COUNCIL_INSUFFICIENT_REVIEW_CONFIDENCE'));
  assert.equal(output.automaticPaperExecutionAllowed,false);
  assert.equal(output.virtualBalanceChangedGBP,0);
  assert.equal(output.paperOrdersCreated,0);
  assert.equal(output.realOrdersCreated,0);
  assert.equal(output.humanApprovalStillRequired,true);
});

test('risk REJECT vetoes even an otherwise qualified paper strategy',()=>{
  const x=receipt();
  x.disposition='REJECT';
  x.blockers=['DISAGREEMENT_OR_REJECTION','RISK_HARD_STOP'];
  const result=reviewPaperCouncilHandoff(x,qualifiedPaperSpec(),now());
  assert.equal(result.status,'VIRTUAL_LEDGER_REVIEW_HOLD');
  assert.ok(result.blockers.includes('COUNCIL_RISK_REJECT'));
});

test('even five unanimous source-labelled supporters are REVIEW ONLY, not an order',()=>{
  const x=receipt();x.disposition='RESEARCH_CANDIDATE_ONLY';x.blockers=[];
  const result=reviewPaperCouncilHandoff(x,qualifiedPaperSpec(),now());
  assert.equal(result.status,'REVIEW_ONLY_VIRTUAL_LEDGER_CANDIDATE');
  assert.equal(result.automaticPaperExecutionAllowed,false);
  assert.equal(result.liveTradingAllowed,false);
  assert.equal(result.holdoutTradeProvenanceVerified,false);
  assert.equal(result.evidenceAuthenticityVerified,false);
  assert.equal(result.modelCallsMade,0);
});

test('desk gate independently blocks proposed £25+£25 allocation and weak holdout',()=>{
  const x=receipt();x.disposition='RESEARCH_CANDIDATE_ONLY';x.blockers=[];
  const y=qualifiedPaperSpec();
  y.sizing.allocations=[{asset:'BTC',virtualGBP:25},{asset:'ETH',virtualGBP:25}];
  y.holdout.closedTrades=1;
  const result=reviewPaperCouncilHandoff(x,y,now());
  assert.equal(result.status,'VIRTUAL_LEDGER_REVIEW_HOLD');
  assert.ok(result.blockers.includes('DESK_UNTRADEABLE_SIZING'));
  assert.ok(result.blockers.includes('DESK_HOLDOUT_TRADES'));
});

test('BTC review can never bootstrap an ETH-only virtual allocation',()=>{
  const x=receipt();x.disposition='RESEARCH_CANDIDATE_ONLY';x.blockers=[];
  const y=qualifiedPaperSpec();y.sizing.allocations=[{asset:'ETH',virtualGBP:50}];
  const result=reviewPaperCouncilHandoff(x,y,now());
  assert.equal(result.status,'VIRTUAL_LEDGER_REVIEW_HOLD');
  assert.ok(result.blockers.includes('NO_CORRESPONDING_VIRTUAL_ASSET_ALLOCATION'));
});

test('stale and future-dated council receipts always block paper consideration',()=>{
  const x=receipt();x.disposition='RESEARCH_CANDIDATE_ONLY';x.blockers=[];
  for(const date of ['2026-10-28T18:40:01Z','2026-10-25T18:39:59Z']){
    const output=reviewPaperCouncilHandoff(x,qualifiedPaperSpec(),new Date(date));
    assert.equal(output.status,'VIRTUAL_LEDGER_REVIEW_HOLD');
    assert.ok(output.blockers.includes('COUNCIL_STALE_OR_FUTURE'));
  }
});

test('rejects forged financial status, anonymous input, getters, customer fields and real execution',()=>{
  const original=receipt();
  for(const update of [
    {trade_execution_authorised:true},{real_order_created:true},{model_runs_independently_verified:true},
    {paper_order_created:true},{paid_model_calls:1},{reported_pnl_gbp:999},
    {broker_calls:1},{market:'GBP-USD'},{schema:'BROKER_ORDER_V1'},
    {blockers:['NOT_REAL']},{research_digest:'notsha'}
  ]){
    const x={...original,...update};
    assert.throws(()=>reviewPaperCouncilHandoff(x,qualifiedPaperSpec(),now()),/PAPER_COUNCIL_BRIDGE_HOLD/);
  }
  assert.throws(()=>reviewPaperCouncilHandoff({...original,customerEmail:'buyer@example.org'},qualifiedPaperSpec(),now()),/PAPER_COUNCIL_BRIDGE_HOLD/);
  const accessor={...original};let getterCalled=0;
  Object.defineProperty(accessor,'market',{get(){getterCalled++;return 'BTC-USD';},enumerable:true});
  assert.throws(()=>reviewPaperCouncilHandoff(accessor,qualifiedPaperSpec(),now()),/PAPER_COUNCIL_BRIDGE_HOLD/);
  assert.equal(getterCalled,0);
});
