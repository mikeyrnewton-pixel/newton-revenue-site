import test from "node:test";
import assert from "node:assert/strict";
import {assessDiagnosticPilotSettlementEvidence} from
  "../lib/diagnostic-pilot-settlement-gate.js";

const base=()=>({
  version:1,
  pilotRef:"PILOT-DIAGNOSTIC-195",
  sourceRecordId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  quoteDraftId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  invoiceDraftId:"cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  settlementObservationId:"dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  evidenceSource:"PROVIDER_READONLY_RECEIPT",
  receiptAuthenticated:true,
  provider:"REVOLUT",
  readOnly:true,
  currency:"GBP",
  amountMinor:19500,
  invoiceIssuedAt:"2026-10-25T12:00:00.000Z",
  paymentObservedAt:"2026-10-25T12:30:00.000Z",
  verifiedAt:"2026-10-25T12:35:00.000Z",
  providerStatus:"SETTLED",
  invoiceIssuedEvidenceDigest:"1".repeat(64),
  providerReceiptDigest:"2".repeat(64),
  providerTransactionDigest:"3".repeat(64),
  accountBindingDigest:"4".repeat(64),
  payerBindingDigest:"5".repeat(64),
});

test("authenticated settled metadata is review-ready but cannot recognise cash",()=>{
  const result=assessDiagnosticPilotSettlementEvidence(base());
  assert.equal(result.state,"SETTLEMENT_EVIDENCE_READY_FOR_OWNER_REVIEW");
  assert.equal(result.independentReceiptMetadataPresent,true);
  assert.equal(result.settlementEvidenceReadyForOwnerReview,true);
  assert.deepEqual(result.blockers,[
    "OWNER_CASH_RECOGNITION_APPROVAL_REQUIRED",
    "CANONICAL_LEDGER_WRITE_SEPARATELY_APPROVED",
  ]);
  for(const key of [
    "invoiceIssuedByThisGate","paymentRecorded","cashRecognised",
    "ledgerWriteAllowed","buyerContactPermitted","deliveryReady",
    "automaticTransition","networkCalled","storageWrites",
  ])assert.equal(result[key],false,key);
  assert.equal(result.clearedEvidenceGBP,0);
  assert.equal(result.customerDelivery,"HOLD");
  assert.ok(Object.isFrozen(result)&&Object.isFrozen(result.blockers));
});

test("owner declaration cannot become independent settlement evidence",()=>{
  const result=assessDiagnosticPilotSettlementEvidence({
    ...base(),
    evidenceSource:"OWNER_DECLARATION",
    receiptAuthenticated:false,
  });
  assert.equal(result.state,"SETTLEMENT_EVIDENCE_HOLD");
  assert.equal(result.independentReceiptMetadataPresent,false);
  assert.equal(result.settlementEvidenceReadyForOwnerReview,false);
  assert.deepEqual(result.blockers,[
    "INDEPENDENT_PROVIDER_RECEIPT_REQUIRED",
    "OWNER_REVIEW_REQUIRED",
  ]);
  assert.equal(result.clearedEvidenceGBP,0);
  assert.equal(result.cashRecognised,false);
});

test("owner declaration cannot claim receipt authentication",()=>{
  assert.throws(
    ()=>assessDiagnosticPilotSettlementEvidence({
      ...base(),
      evidenceSource:"OWNER_DECLARATION",
      receiptAuthenticated:true,
    }),
    /owner declaration cannot claim/,
  );
});

test("pending and exception statuses remain on hold",()=>{
  const pending=assessDiagnosticPilotSettlementEvidence({
    ...base(),providerStatus:"PENDING",
  });
  assert.equal(pending.state,"SETTLEMENT_PENDING_HOLD");
  assert.equal(pending.settlementEvidenceReadyForOwnerReview,false);
  assert.match(pending.blockers[0],/PENDING_NOT_CLEARED/);

  for(const providerStatus of ["FAILED","REFUNDED","DISPUTED"]){
    const result=assessDiagnosticPilotSettlementEvidence({
      ...base(),providerStatus,
    });
    assert.equal(result.state,"SETTLEMENT_EXCEPTION_HOLD");
    assert.equal(result.clearedEvidenceGBP,0);
    assert.equal(result.paymentRecorded,false);
  }
});

test("fixed GBP 195 read-only named-provider scope is mandatory",()=>{
  for(const overrides of [
    {provider:"UNSET"},{provider:"revolut"},{readOnly:false},
    {currency:"USD"},{amountMinor:30000},{providerStatus:"UNKNOWN"},
  ])assert.throws(
    ()=>assessDiagnosticPilotSettlementEvidence({...base(),...overrides}),
    /named provider|read-only|fixed GBP 195\.00|recognised provider status/,
  );
});

test("invoice observation and verification chronology is bounded",()=>{
  for(const overrides of [
    {paymentObservedAt:"2026-10-25T11:59:59.000Z"},
    {verifiedAt:"2026-10-25T12:29:59.000Z"},
    {verifiedAt:"2026-10-25T12:45:00.001Z"},
    {verifiedAt:"25 October 2026"},
  ])assert.throws(
    ()=>assessDiagnosticPilotSettlementEvidence({...base(),...overrides}),
    /chronology|stale|canonical UTC/,
  );
});

test("all five evidence roles require distinct canonical digests",()=>{
  assert.throws(
    ()=>assessDiagnosticPilotSettlementEvidence({
      ...base(),providerReceiptDigest:"not-a-digest",
    }),
    /canonical SHA-256/,
  );
  assert.throws(
    ()=>assessDiagnosticPilotSettlementEvidence({
      ...base(),payerBindingDigest:base().accountBindingDigest,
    }),
    /evidence must differ/,
  );
});

test("source quote invoice and observation identities must be distinct",()=>{
  assert.throws(
    ()=>assessDiagnosticPilotSettlementEvidence({
      ...base(),settlementObservationId:"not-a-uuid",
    }),
    /canonical source, quote, invoice and observation IDs/,
  );
  assert.throws(
    ()=>assessDiagnosticPilotSettlementEvidence({
      ...base(),settlementObservationId:base().invoiceDraftId,
    }),
    /must be distinct/,
  );
});

test("PII extra fields and active records fail before getter execution",()=>{
  assert.throws(
    ()=>assessDiagnosticPilotSettlementEvidence({
      ...base(),payerName:"Private Person",
    }),
    /exact privacy-safe/,
  );
  let getterCalls=0;
  const active=base();
  Object.defineProperty(active,"providerReceiptDigest",{
    enumerable:true,
    get(){getterCalls++;return "2".repeat(64);},
  });
  assert.throws(
    ()=>assessDiagnosticPilotSettlementEvidence(active),
    /exact privacy-safe/,
  );
  assert.equal(getterCalls,0);
  assert.throws(
    ()=>assessDiagnosticPilotSettlementEvidence(
      Object.assign(Object.create({cashRecognised:true}),base()),
    ),
    /exact privacy-safe/,
  );
});
