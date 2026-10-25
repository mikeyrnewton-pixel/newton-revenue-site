import test from "node:test";
import assert from "node:assert/strict";
import {assessDiagnosticPilotInvoiceReadiness} from
  "../lib/diagnostic-pilot-invoice-gate.js";

const base=()=>({
  version:1,
  pilotRef:"PILOT-DIAGNOSTIC-195",
  sourceRecordId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  sourceClassification:"GENUINE",
  quoteDraftId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  invoiceDraftId:"cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  quoteApprovedAt:"2026-10-25T10:00:00.000Z",
  quoteDeliveredAt:"2026-10-25T10:05:00.000Z",
  acceptedAt:"2026-10-25T10:30:00.000Z",
  quoteValidUntil:"2026-10-26T10:00:00.000Z",
  invoicePreparedAt:"2026-10-25T11:00:00.000Z",
  currency:"GBP",
  totalMinor:19500,
  vatTreatment:"VAT_INCLUDED",
  acceptanceMethod:"WRITTEN",
  procurementStatus:"VALIDATED_NOT_REQUIRED",
  sourceEvidenceDigest:"1".repeat(64),
  quoteEvidenceDigest:"2".repeat(64),
  acceptedQuoteEvidenceDigest:"2".repeat(64),
  invoiceQuoteEvidenceDigest:"2".repeat(64),
  quoteBindingEvidenceDigest:"c".repeat(64),
  quoteDeliveryEvidenceDigest:"3".repeat(64),
  acceptanceEvidenceDigest:"4".repeat(64),
  buyerAuthorityEvidenceDigest:"5".repeat(64),
  acceptedTermsEvidenceDigest:"6".repeat(64),
  billingEntityEvidenceDigest:"7".repeat(64),
  billingAddressEvidenceDigest:"8".repeat(64),
  procurementEvidenceDigest:"9".repeat(64),
  duplicateCheckEvidenceDigest:"a".repeat(64),
  invoiceDraftEvidenceDigest:"b".repeat(64),
});

test("complete evidence makes only an internal invoice ready for owner approval",()=>{
  const result=assessDiagnosticPilotInvoiceReadiness(base());
  assert.equal(result.state,"INVOICE_READY_FOR_OWNER_ISSUE_APPROVAL");
  assert.equal(result.quoteDraftId,base().quoteDraftId);
  assert.equal(result.invoiceDraftId,base().invoiceDraftId);
  assert.equal(result.quoteBindingVerified,true);
  assert.equal(result.invoiceReady,true);
  for(const key of ["invoiceIssued","paymentRequested","paymentRecorded",
    "deliveryReady","buyerContactPermitted","automaticTransition","networkCalled",
    "storageWrites"])assert.equal(result[key],false,key);
  assert.equal(result.clearedEvidenceGBP,0);
  assert.equal(result.customerDelivery,"HOLD");
  assert.deepEqual(result.blockers,[
    "OWNER_INVOICE_ISSUE_APPROVAL_REQUIRED",
    "VERIFIED_DESTINATION_AND_CHANNEL_REQUIRED",
    "INDEPENDENT_SETTLEMENT_EVIDENCE_REQUIRED",
    "DELIVERY_RELEASE_REMAINS_HELD",
  ]);
  assert.ok(Object.isFrozen(result)&&Object.isFrozen(result.blockers));
});

test("invoice readiness is bound to distinct source, quote and invoice records",()=>{
  assert.throws(
    ()=>assessDiagnosticPilotInvoiceReadiness({
      ...base(),quoteDraftId:"not-a-uuid",
    }),
    /canonical source, quote-draft and invoice-draft IDs/,
  );
  for(const overrides of [
    {quoteDraftId:base().sourceRecordId},
    {invoiceDraftId:base().quoteDraftId},
  ])assert.throws(
    ()=>assessDiagnosticPilotInvoiceReadiness({...base(),...overrides}),
    /distinct records/,
  );
  assert.throws(
    ()=>assessDiagnosticPilotInvoiceReadiness({
      ...base(),quoteBindingEvidenceDigest:base().quoteEvidenceDigest,
    }),
    /evidence must differ/,
  );
});

test("acceptance and invoice draft must reference the exact quote artifact",()=>{
  for(const overrides of [
    {acceptedQuoteEvidenceDigest:"d".repeat(64)},
    {invoiceQuoteEvidenceDigest:"e".repeat(64)},
    {acceptedQuoteEvidenceDigest:"not-a-digest"},
  ])assert.throws(
    ()=>assessDiagnosticPilotInvoiceReadiness({...base(),...overrides}),
    /canonical quote-reference|exact quote evidence/,
  );
});

test("only a reviewed genuine £195 GBP source with resolved VAT can enter",()=>{
  for(const overrides of [
    {sourceClassification:"SYNTHETIC"},{sourceClassification:"CANDIDATE"},
    {currency:"USD"},{totalMinor:19501},{vatTreatment:"UNKNOWN"},
  ])assert.throws(
    ()=>assessDiagnosticPilotInvoiceReadiness({...base(),...overrides}),
    /reviewed genuine|fixed GBP 195\.00|resolved VAT/,
  );
});

test("written acceptance and a resolved procurement route are mandatory",()=>{
  assert.throws(
    ()=>assessDiagnosticPilotInvoiceReadiness({...base(),acceptanceMethod:"VERBAL"}),
    /written acceptance/,
  );
  for(const procurementStatus of ["UNKNOWN","PENDING","EMAIL_RECEIVED"]){
    assert.throws(
      ()=>assessDiagnosticPilotInvoiceReadiness({...base(),procurementStatus}),
      /procurement route/,
    );
  }
});

test("quote approval, delivery, acceptance, validity and preparation chronology is bound",()=>{
  for(const overrides of [
    {quoteDeliveredAt:"2026-10-25T09:59:59.000Z"},
    {acceptedAt:"2026-10-25T10:04:59.000Z"},
    {invoicePreparedAt:"2026-10-25T10:29:59.000Z"},
    {quoteValidUntil:"2026-10-25T10:29:59.000Z"},
    {acceptedAt:"25 October 2026"},
  ])assert.throws(
    ()=>assessDiagnosticPilotInvoiceReadiness({...base(),...overrides}),
    /chronology|required|validity|canonical UTC/,
  );
});

test("all source, acceptance, billing, duplicate-check and draft evidence is distinct",()=>{
  assert.throws(
    ()=>assessDiagnosticPilotInvoiceReadiness({
      ...base(),duplicateCheckEvidenceDigest:"not-evidence",
    }),
    /canonical SHA-256/,
  );
  assert.throws(
    ()=>assessDiagnosticPilotInvoiceReadiness({
      ...base(),invoiceDraftEvidenceDigest:base().acceptanceEvidenceDigest,
    }),
    /evidence must differ/,
  );
});

test("PII, approval claims and active records fail before getter execution",()=>{
  assert.throws(
    ()=>assessDiagnosticPilotInvoiceReadiness({
      ...base(),buyerEmail:"person@example.org",
    }),
    /exact privacy-safe/,
  );
  assert.throws(
    ()=>assessDiagnosticPilotInvoiceReadiness({...base(),ownerApproved:true}),
    /exact privacy-safe/,
  );
  let getterCalls=0;
  const active=base();
  Object.defineProperty(active,"acceptedAt",{
    enumerable:true,
    get(){getterCalls++;return "2026-10-25T10:30:00.000Z";},
  });
  assert.throws(()=>assessDiagnosticPilotInvoiceReadiness(active),
    /exact privacy-safe/);
  assert.equal(getterCalls,0);
  assert.throws(
    ()=>assessDiagnosticPilotInvoiceReadiness(
      Object.assign(Object.create({issued:true}),base()),
    ),
    /exact privacy-safe/,
  );
});
