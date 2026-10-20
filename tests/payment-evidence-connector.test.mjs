import test from "node:test";
import assert from "node:assert/strict";
import {preparePaymentEvidenceConnector} from "../lib/payment-evidence-connector.js";

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
