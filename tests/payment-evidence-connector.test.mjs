import test from "node:test";
import assert from "node:assert/strict";
import {assessSyntheticPaymentObservation,preparePaymentEvidenceConnector} from "../lib/payment-evidence-connector.js";

const base=()=>({
  version:1,
  provider:"UNSET",
  credentialEnv:"NEWTON_PAYMENT_READ_TOKEN",
  accountRefEnv:"NEWTON_PAYMENT_ACCOUNT_REF",
  currency:"GBP",
  priceMinor:19500,
  readOnly:true,
  allowCharges:false,
  allowRefunds:false,
  allowPayouts:false,
});

test("unset provider is safe and explicitly needs connection",()=>{
  const result=preparePaymentEvidenceConnector(base());
  assert.equal(result.state,"NEEDS_CONNECTION");
  assert.deepEqual(result.blockers,["PAYMENT_PROVIDER_UNSET"]);
  assert.equal(result.networkCalled,false);
  assert.equal(result.connected,false);
  assert.equal(result.paymentRecorded,false);
  assert.equal(result.clearedEvidenceGBP,0);
  assert.equal(result.canCharge,false);
  assert.equal(result.canRefund,false);
  assert.equal(result.canPayout,false);
});

test("named provider is only ready for owner connection, never connected",()=>{
  const result=preparePaymentEvidenceConnector({...base(),provider:"OWNER_SELECTED_PROVIDER"});
  assert.equal(result.state,"READY_FOR_OWNER_CONNECTION");
  assert.deepEqual(result.blockers,[]);
  assert.equal(result.capability,"READ_PAYMENT_EVIDENCE_ONLY");
  assert.equal(result.connected,false);
  assert.equal(result.expectedAmountMinor,19500);
  assert.equal(result.expectedCurrency,"GBP");
});

test("money-moving permissions fail closed",()=>{
  for(const key of ["allowCharges","allowRefunds","allowPayouts"]){
    assert.throws(
      ()=>preparePaymentEvidenceConnector({...base(),[key]:true}),
      /money-moving permissions must remain disabled/,
    );
  }
  assert.throws(
    ()=>preparePaymentEvidenceConnector({...base(),readOnly:false}),
    /read-only access required/,
  );
});

test("raw-looking values and ambiguous placeholders are rejected",()=>{
  for(const value of [
    "sk_live_example",
    "https://provider.example/token",
    "actual secret",
    "TOKEN_VALUE",
  ]){
    assert.throws(
      ()=>preparePaymentEvidenceConnector({...base(),credentialEnv:value}),
      /credential environment name required/,
    );
  }
  assert.throws(
    ()=>preparePaymentEvidenceConnector({...base(),accountRefEnv:"NEWTON_PAYMENT_READ_TOKEN"}),
    /placeholders must differ/,
  );
});

test("price, currency, schema and extra fields fail closed",()=>{
  assert.throws(()=>preparePaymentEvidenceConnector({...base(),priceMinor:19499}),
    /fixed GBP 195.00/);
  assert.throws(()=>preparePaymentEvidenceConnector({...base(),currency:"USD"}),
    /fixed GBP 195.00/);
  assert.throws(()=>preparePaymentEvidenceConnector({...base(),version:2}),
    /version 1/);
  assert.throws(()=>preparePaymentEvidenceConnector({...base(),webhook:"secret"}),
    /exact non-secret configuration/);
});

const observation=(status)=>({
  version:1,
  synthetic:true,
  observationId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  provider:"OWNER_SELECTED_PROVIDER",
  currency:"GBP",
  amountMinor:19500,
  observedAt:"2026-10-20T11:00:00.000Z",
  status,
  evidenceDigest:"a".repeat(64),
});

test("pending evidence is review-only and cannot become cleared",()=>{
  const result=assessSyntheticPaymentObservation(observation("PENDING"));
  assert.equal(result.state,"PAYMENT_RECORDED_REVIEW");
  assert.equal(result.commercialEventCandidate,"PAYMENT_RECORDED");
  assert.deepEqual(result.blockers,[
    "PROVIDER_SETTLEMENT_NOT_OBSERVED",
    "OWNER_APPROVAL_REQUIRED",
  ]);
  assert.equal(result.automaticTransition,false);
  assert.equal(result.paymentRecorded,false);
  assert.equal(result.clearedEvidenceGBP,0);
  assert.equal(result.customerDelivery,"HOLD");
});

test("settled evidence remains an owner-reviewed candidate, never cash",()=>{
  const result=assessSyntheticPaymentObservation(observation("SETTLED"));
  assert.equal(result.state,"CLEARED_EVIDENCE_REVIEW");
  assert.equal(result.commercialEventCandidate,"CLEARED");
  assert.deepEqual(result.blockers,["OWNER_APPROVAL_REQUIRED"]);
  assert.equal(result.ownerApprovalRequired,true);
  assert.equal(result.connected,false);
  assert.equal(result.networkCalled,false);
  assert.equal(result.recordedPaymentEvidenceGBP,0);
  assert.equal(result.clearedEvidenceGBP,0);
  assert.equal(result.commercialTruth,"SYNTHETIC_OBSERVATION_NOT_REVENUE");
});

test("failed refunded and disputed observations enter reconciliation hold",()=>{
  for(const status of ["FAILED","REFUNDED","DISPUTED"]){
    const result=assessSyntheticPaymentObservation(observation(status));
    assert.equal(result.state,"PAYMENT_EXCEPTION_HOLD");
    assert.equal(result.commercialEventCandidate,null);
    assert.deepEqual(result.blockers,[`PAYMENT_${status}_REQUIRES_RECONCILIATION`]);
    assert.equal(result.automaticTransition,false);
    assert.equal(result.customerDelivery,"HOLD");
  }
});

test("observation boundary rejects real activity raw references and malformed evidence",()=>{
  assert.throws(
    ()=>assessSyntheticPaymentObservation({...observation("SETTLED"),synthetic:false}),
    /fictional observation/,
  );
  assert.throws(
    ()=>assessSyntheticPaymentObservation({...observation("SETTLED"),provider:"UNSET"}),
    /named provider/,
  );
  assert.throws(
    ()=>assessSyntheticPaymentObservation({...observation("SETTLED"),amountMinor:19501}),
    /fixed GBP 195.00/,
  );
  assert.throws(
    ()=>assessSyntheticPaymentObservation({...observation("SETTLED"),evidenceDigest:"raw-ref"}),
    /SHA-256 evidence digest/,
  );
  assert.throws(
    ()=>assessSyntheticPaymentObservation({...observation("SETTLED"),providerReference:"pi_secret"}),
    /exact synthetic observation/,
  );
});
