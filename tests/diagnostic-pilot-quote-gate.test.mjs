import test from "node:test";
import assert from "node:assert/strict";
import {assessDiagnosticPilotQuoteDraft} from "../lib/diagnostic-pilot-quote-gate.js";

const base=()=>({
  version:1,
  pilotRef:"PILOT-DIAGNOSTIC-195",
  sourceRecordId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  sourceClassification:"GENUINE",
  sourceEvidenceDigest:"1".repeat(64),
  verifiedAt:"2026-10-25T10:55:00.000Z",
  currency:"GBP",
  priceMinor:19500,
  vatTreatment:"VAT_INCLUDED",
  supplierIdentityEvidenceDigest:"2".repeat(64),
  tradingAddressEvidenceDigest:"3".repeat(64),
  termsEvidenceDigest:"4".repeat(64),
  privacyEvidenceDigest:"5".repeat(64),
  capacityEvidenceDigest:"6".repeat(64),
});

test("complete distinct evidence makes only an internal quote draft ready",()=>{
  const result=assessDiagnosticPilotQuoteDraft(base());
  assert.equal(result.state,"QUOTE_DRAFT_READY_FOR_OWNER_REVIEW");
  assert.equal(result.quoteDraftReady,true);
  for(const key of ["quoteSent","invoiceReady","invoiceIssued","paymentRequested",
    "paymentRecorded","buyerContactPermitted","automaticTransition","networkCalled",
    "storageWrites"])assert.equal(result[key],false,key);
  assert.equal(result.clearedEvidenceGBP,0);
  assert.equal(result.customerDelivery,"HOLD");
  assert.deepEqual(result.blockers,[
    "BUYER_SPECIFIC_SCOPE_AND_IDENTITY_REVIEW_REQUIRED",
    "OWNER_QUOTE_SEND_APPROVAL_REQUIRED",
    "WRITTEN_ACCEPTANCE_REQUIRED_BEFORE_INVOICE",
    "OWNER_INVOICE_APPROVAL_REQUIRED",
    "INDEPENDENT_SETTLEMENT_EVIDENCE_REQUIRED",
  ]);
  assert.ok(Object.isFrozen(result)&&Object.isFrozen(result.blockers));
});

test("synthetic, candidate or unknown source evidence cannot open the quote gate",()=>{
  for(const sourceClassification of ["SYNTHETIC","CANDIDATE","UNKNOWN"]){
    assert.throws(
      ()=>assessDiagnosticPilotQuoteDraft({...base(),sourceClassification}),
      /reviewed genuine inbound enquiry evidence required/,
    );
  }
});

test("price, currency and VAT must be fully resolved for this pilot",()=>{
  for(const overrides of [
    {priceMinor:19499},{currency:"USD"},{vatTreatment:"UNKNOWN"},
    {vatTreatment:"VAT_UNCONFIRMED"},
  ])assert.throws(()=>assessDiagnosticPilotQuoteDraft({...base(),...overrides}),
    /fixed GBP 195\.00|resolved VAT/);
});

test("every gate needs canonical distinct evidence",()=>{
  assert.throws(
    ()=>assessDiagnosticPilotQuoteDraft({...base(),termsEvidenceDigest:"not-evidence"}),
    /canonical SHA-256/,
  );
  assert.throws(
    ()=>assessDiagnosticPilotQuoteDraft({
      ...base(),privacyEvidenceDigest:base().termsEvidenceDigest,
    }),
    /distinct evidence/,
  );
  assert.throws(
    ()=>assessDiagnosticPilotQuoteDraft({...base(),verifiedAt:"25 October 2026"}),
    /canonical UTC/,
  );
});

test("PII, approval claims and active object shapes fail closed without getter execution",()=>{
  assert.throws(
    ()=>assessDiagnosticPilotQuoteDraft({...base(),buyerEmail:"person@example.org"}),
    /exact privacy-safe evidence metadata/,
  );
  assert.throws(
    ()=>assessDiagnosticPilotQuoteDraft({...base(),ownerApproved:true}),
    /exact privacy-safe evidence metadata/,
  );
  let getterCalls=0;
  const active=base();
  Object.defineProperty(active,"sourceClassification",{
    enumerable:true,
    get(){getterCalls++;return "GENUINE";},
  });
  assert.throws(()=>assessDiagnosticPilotQuoteDraft(active),
    /exact privacy-safe evidence metadata/);
  assert.equal(getterCalls,0);
  assert.throws(
    ()=>assessDiagnosticPilotQuoteDraft(Object.assign(Object.create({paid:true}),base())),
    /exact privacy-safe evidence metadata/,
  );
});
