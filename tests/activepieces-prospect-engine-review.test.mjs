import test from "node:test";
import assert from "node:assert/strict";
import {assessProspectEngineReadiness} from "../lib/activepieces-prospect-engine-review.js";

const sample=()=>({
  schema:"ATLAS_ACTIVEPIECES_PROSPECT_REVIEW_V1",
  evidenceKind:"SCREENSHOT_ONLY",
  flowName:"NEWTON REVENUE - Prospect Engine v1",
  flowStatus:"UNKNOWN",
  observedRuns:"NO_RUNS_DISPLAYED",
  webhookAuthentication:"NONE_DISPLAYED",
  steps:[
    {name:"New Prospect",type:"WEBHOOK"},
    {name:"Qualify Prospect",type:"CODE"},
    {name:"Draft Outreach",type:"CODE"},
    {name:"Build Follow-up",type:"CODE"},
  ],
});

test("actual 22 Oct screenshots yield HOLD, not a live commercial workflow",()=>{
  const report=assessProspectEngineReadiness(sample());
  assert.equal(report.status,"REVIEW_ONLY_HOLD");
  assert.equal(report.flowCodeVerified,false);
  assert.equal(report.directMacConnection,false);
  assert.equal(report.flowActivated,false);
  assert.equal(report.externalCommunication,false);
  assert.equal(report.buyerCount,null);
  assert.equal(report.invoicedGBP,0);
  assert.equal(report.clearedGBP,0);
  assert.equal(report.customerDelivery,"HOLD");
  assert.deepEqual(report.blockers,[
    "FULL_CODE_AND_CONFIGURATION_NOT_INSPECTED",
    "PUBLISHED_AND_ENABLED_STATUS_UNVERIFIED",
    "WEBHOOK_AUTHENTICATION_NONE_DISPLAYED",
    "NO_FLOW_EXECUTION_EVIDENCE_IN_SCREENSHOT",
    "OWNER_APPROVAL_REQUIRED_BEFORE_ACTIVATION_OR_OUTREACH",
  ]);
});

test("even if flow is enabled, unauthenticated webhook requires security HOLD",()=>{
  const result=assessProspectEngineReadiness({...sample(),flowStatus:"ENABLED"});
  assert.ok(result.blockers.includes("LIVE_FLOW_MUST_BE_PAUSED_FOR_SECURITY_REVIEW"));
  assert.ok(result.blockers.includes("WEBHOOK_AUTHENTICATION_NONE_DISPLAYED"));
  assert.equal(result.flowActivated,false);
  assert.equal(result.externalCommunication,false);
});

test("even verified configuration cannot authorise activation or revenue",()=>{
  const report=assessProspectEngineReadiness({
    ...sample(),
    evidenceKind:"VERIFIED_LOCAL_EXPORT",
    flowStatus:"DISABLED",
    observedRuns:"VERIFIED_RECENT_RUNS",
    webhookAuthentication:"VERIFIED_PROTECTED",
  });
  assert.equal(report.flowCodeVerified,false);
  assert.deepEqual(report.blockers,["OWNER_APPROVAL_REQUIRED_BEFORE_ACTIVATION_OR_OUTREACH"]);
  assert.equal(report.status,"REVIEW_ONLY_HOLD");
  assert.equal(report.clearedGBP,0);
});

test("rejects sensitive values, configuration, raw code and webhook URLs in evidence",()=>{
  for(const extra of [
    {apiKey:"sk_test_dummy"},
    {webhookUrl:"https://example.test/secret"},
    {customerEmail:"buyer@example.com"},
    {sourceCode:"export const run = async () => {}"},
    {token:"test"},
  ]){
    assert.throws(
      ()=>assessProspectEngineReadiness({...sample(),...extra}),
      /only bounded non-secret evidence fields allowed/,
    );
  }
  const rawCode=sample();
  rawCode.steps[1]={...rawCode.steps[1],code:"private code"};
  assert.throws(()=>assessProspectEngineReadiness(rawCode),/only step name and type allowed/);
});

test("rejects omitted or mismatched four-stage flow and unknown claims",()=>{
  const missing=sample();
  missing.steps.pop();
  assert.throws(()=>assessProspectEngineReadiness(missing),/exactly four/);
  const reordered=sample();
  reordered.steps.reverse();
  assert.throws(()=>assessProspectEngineReadiness(reordered),/unexpected or reordered/);
  assert.throws(()=>assessProspectEngineReadiness({...sample(),flowStatus:"RUNNING"}),/recognised flow status/);
  assert.throws(()=>assessProspectEngineReadiness({...sample(),observedRuns:"100 SALES"}),/recognised runs/);
  assert.throws(()=>assessProspectEngineReadiness({...sample(),webhookAuthentication:"TRUST ME"}),/recognised webhook/);
});
