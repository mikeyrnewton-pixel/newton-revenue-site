import test from "node:test";
import assert from "node:assert/strict";
import {assessSyntheticPaymentObservation,assessSyntheticPaymentObservationBatch,preparePaymentEvidenceConnector} from "../lib/payment-evidence-connector.js";

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
  sourceRecordId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  invoiceEventId:"ccccccec-cccc-4ccc-8ccc-cccccccccccc",
  provider:"OWNER_SELECTED_PROVIDER",
  currency:"GBP",
  amountMinor:19500,
  observedAt:"2026-10-20T11:00:00.000Z",
  status,
  evidenceDigest:"a".repeat(64),
});
const binding=()=>({
  sourceRecordId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  sourceEvidenceDigest:"b".repeat(64),
  invoiceEventId:"ccccccec-cccc-4ccc-8ccc-cccccccccccc",
  invoiceEvidenceDigest:"c".repeat(64),
  invoicedAt:"2026-10-20T10:59:59.000Z",
  provider:"OWNER_SELECTED_PROVIDER",
});

test("pending evidence is review-only and cannot become cleared",()=>{
  const result=assessSyntheticPaymentObservation(observation("PENDING"),binding());
  assert.equal(result.state,"PAYMENT_RECORDED_REVIEW");
  assert.equal(result.commercialEventCandidate,"PAYMENT_RECORDED");
  assert.equal(result.sourceRecordId,binding().sourceRecordId);
  assert.equal(result.invoiceEventId,binding().invoiceEventId);
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
  const result=assessSyntheticPaymentObservation(observation("SETTLED"),binding());
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
    const result=assessSyntheticPaymentObservation(observation(status),binding());
    assert.equal(result.state,"PAYMENT_EXCEPTION_HOLD");
    assert.equal(result.commercialEventCandidate,null);
    assert.deepEqual(result.blockers,[`PAYMENT_${status}_REQUIRES_RECONCILIATION`]);
    assert.equal(result.automaticTransition,false);
    assert.equal(result.customerDelivery,"HOLD");
  }
});

test("observation boundary rejects real activity raw references and malformed evidence",()=>{
  assert.throws(
    ()=>assessSyntheticPaymentObservation({...observation("SETTLED"),synthetic:false},binding()),
    /fictional observation/,
  );
  assert.throws(
    ()=>assessSyntheticPaymentObservation({...observation("SETTLED"),provider:"UNSET"},binding()),
    /named provider/,
  );
  assert.throws(
    ()=>assessSyntheticPaymentObservation({...observation("SETTLED"),amountMinor:19501},binding()),
    /fixed GBP 195.00/,
  );
  assert.throws(
    ()=>assessSyntheticPaymentObservation({...observation("SETTLED"),evidenceDigest:"raw-ref"},binding()),
    /SHA-256 evidence digest/,
  );
  assert.throws(
    ()=>assessSyntheticPaymentObservation({...observation("SETTLED"),evidenceDigest:"A".repeat(64)},binding()),
    /SHA-256 evidence digest/,
    "uppercase digest must not bypass the canonical lowercase cross-PR contract",
  );
  assert.throws(
    ()=>assessSyntheticPaymentObservation({...observation("SETTLED"),providerReference:"pi_secret"},binding()),
    /exact synthetic observation/,
  );
  for(const key of ["observationId","sourceRecordId","invoiceEventId"]){
    assert.throws(
      ()=>assessSyntheticPaymentObservation({
        ...observation("SETTLED"),
        [key]:observation("SETTLED")[key].toUpperCase(),
      },binding()),
      /valid .* ID required/,
      `uppercase ${key} aliases must fail closed`,
    );
  }
});


test("payment observation cannot be reused across leads or invoices",()=>{
  assert.throws(
    ()=>assessSyntheticPaymentObservation(observation("SETTLED"),{
      ...binding(),sourceRecordId:"dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    }),
    /source record mismatch/,
  );
  assert.throws(
    ()=>assessSyntheticPaymentObservation(observation("SETTLED"),{
      ...binding(),invoiceEventId:"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    }),
    /invoice event mismatch/,
  );
  assert.throws(
    ()=>assessSyntheticPaymentObservation(observation("SETTLED")),
    /expected commercial binding/,
  );
});


test("payment observation cannot switch the selected provider",()=>{
  assert.throws(
    ()=>assessSyntheticPaymentObservation({
      ...observation("SETTLED"),
      provider:"OTHER_PROVIDER",
    },binding()),
    /provider mismatch/,
  );
  assert.throws(
    ()=>assessSyntheticPaymentObservation(observation("SETTLED"),{
      ...binding(),
      provider:"UNSET",
    }),
    /named expected provider/,
  );
});

test("payment evidence cannot reuse source or invoice-stage evidence",()=>{
  for(const key of ["sourceEvidenceDigest","invoiceEvidenceDigest"]){
    assert.throws(
      ()=>assessSyntheticPaymentObservation({
        ...observation("SETTLED"),
        evidenceDigest:binding()[key],
      },binding()),
      /reused from an earlier commercial stage/,
      `${key} must identify a distinct artefact`,
    );
  }
  assert.throws(
    ()=>assessSyntheticPaymentObservation(observation("SETTLED"),{
      ...binding(),invoiceEvidenceDigest:"C".repeat(64),
    }),
    /canonical source and invoice evidence digests/,
  );
});


test("source and invoice evidence bindings must remain distinct",()=>{
  assert.throws(
    ()=>assessSyntheticPaymentObservation(observation("SETTLED"),{
      ...binding(),
      invoiceEvidenceDigest:binding().sourceEvidenceDigest,
    }),
    /source and invoice evidence digests must differ/,
    "one artefact cannot prove both intake provenance and invoicing",
  );
});


test("payment observation must follow its bound invoice event",()=>{
  assert.throws(
    ()=>assessSyntheticPaymentObservation(observation("SETTLED"),{
      ...binding(),invoicedAt:"2026-10-20T11:00:01.000Z",
    }),
    /cannot predate invoice event/,
  );
  assert.throws(
    ()=>assessSyntheticPaymentObservation(observation("SETTLED"),{
      ...binding(),invoicedAt:"20 October 2026 10:59:59 UTC",
    }),
    /canonical UTC invoice timestamp/,
  );
});


test("synthetic payment batch remains review-only and records no cash",()=>{
  const result=assessSyntheticPaymentObservationBatch([{
    providerTransactionDigest:"d".repeat(64),
    observation:observation("SETTLED"),
    expectedBinding:binding(),
  }]);
  assert.equal(result.state,"PAYMENT_BATCH_REVIEW");
  assert.equal(result.observationCount,1);
  assert.equal(result.candidates[0].state,"CLEARED_EVIDENCE_REVIEW");
  assert.equal(result.automaticTransition,false);
  assert.equal(result.networkCalled,false);
  assert.equal(result.paymentRecorded,false);
  assert.equal(result.clearedEvidenceGBP,0);
  assert.equal(result.commercialTruth,"SYNTHETIC_BATCH_NOT_REVENUE");
  assert.equal(result.customerDelivery,"HOLD");
});

test("one provider transaction cannot create multiple payment observations",()=>{
  const first={
    providerTransactionDigest:"d".repeat(64),
    observation:observation("SETTLED"),
    expectedBinding:binding(),
  };
  const second={
    providerTransactionDigest:first.providerTransactionDigest,
    observation:{
      ...observation("SETTLED"),
      observationId:"dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      evidenceDigest:"e".repeat(64),
    },
    expectedBinding:binding(),
  };
  assert.throws(
    ()=>assessSyntheticPaymentObservationBatch([first,second]),
    /provider transaction reused across payment observations/,
  );
  assert.throws(
    ()=>assessSyntheticPaymentObservationBatch([{
      ...first,providerTransactionDigest:first.observation.evidenceDigest,
    }]),
    /distinct evidence boundary/,
  );
  assert.throws(
    ()=>assessSyntheticPaymentObservationBatch([first,{...first}]),
    /duplicate payment observation ID/,
  );
});
