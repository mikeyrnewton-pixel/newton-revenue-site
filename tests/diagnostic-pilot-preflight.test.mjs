import test from "node:test";
import assert from "node:assert/strict";
import {prepareDiagnosticPilotBrief} from "../lib/diagnostic-pilot-preflight.js";
const base=()=>({
  version:1,demoRef:"DEMO-DIAGNOSTIC-195",channel:"Website",exampleLimit:20,
  vatTreatment:"UNKNOWN",supplierIdentityReviewed:false,tradingAddressApproved:false,
  termsAndCancellationReviewed:false,privateDataRouteApproved:false,
  deliveryCapacityConfirmed:false,
});
test("approved objective creates a usable internal £195 sales brief, no commercial action",()=>{
  const result=prepareDiagnosticPilotBrief(base());
  assert.equal(result.pilotObjectiveApproved,true);
  assert.equal(result.proposedPriceGBP,195);
  assert.equal(result.commercialTarget,"GBP_195_DIAGNOSTIC");
  assert.equal(result.synthetic,true);
  assert.equal(result.internalPreflight,"BLOCKED_ON_DECLARED_GATES");
  assert.deepEqual(result.blockers,[
    "VAT_AND_FINAL_PRICE_UNCONFIRMED",
    "LEGAL_SUPPLIER_NOT_VERIFIED",
    "TRADING_AND_INVOICE_ADDRESS_NOT_APPROVED",
    "TERMS_CANCELLATION_REFUNDS_NOT_REVIEWED",
    "PRIVATE_DATA_TRANSFER_NOT_APPROVED",
    "DELIVERY_CAPACITY_NOT_CONFIRMED",
  ]);
  assert.match(result.draft,/two working days/i);
  assert.match(result.draft,/INTERNAL £195 PILOT SCOPE \(NOT FOR SENDING\)/);
  assert.equal(result.scope.length,5);
  assert.equal(result.exclusions.length,4);
  for(const key of ["quoteOrPaymentReady","sendOrListPermitted","buyerContactPermitted",
    "liveCustomerDataPermitted","invoicePermitted","bankOrProcessorCalled",
    "networkCalled","storageWrites"])assert.equal(result[key],false,key);
  assert.equal(result.clearedEvidenceGBP,0);
  assert.ok(Object.isFrozen(result)&&Object.isFrozen(result.scope)&&Object.isFrozen(result.blockers));
});
test("owner declarations cannot automatically authorise outreach, quote, invoice or payment",()=>{
  const ready=prepareDiagnosticPilotBrief({...base(),
    vatTreatment:"VAT_INCLUDED",supplierIdentityReviewed:true,tradingAddressApproved:true,
    termsAndCancellationReviewed:true,privateDataRouteApproved:true,
    deliveryCapacityConfirmed:true,
  });
  assert.deepEqual(ready.blockers,[]);
  assert.equal(ready.internalPreflight,"DECLARED_GATES_PRESENT_UNVERIFIED");
  assert.equal(ready.externalReadiness,"OWNER_REVIEW_AND_REAL_EVIDENCE_REQUIRED");
  assert.equal(ready.quoteOrPaymentReady,false);
  assert.equal(ready.sendOrListPermitted,false);
  assert.equal(ready.clearedEvidenceGBP,0);
});
test("all four approved enquiry channels are tightly scoped",()=>{
  for(const channel of ["Website","Email","Phone","WhatsApp"]){
    const result=prepareDiagnosticPilotBrief({...base(),channel,exampleLimit:1});
    assert.match(result.scope[0],new RegExp(channel));
    assert.match(result.scope[1],/Up to 1/);
  }
});
test("malformed schema, extra customer identity, wrong price or suspicious data fails closed",()=>{
  const invalid=[
    {...base(),customerEmail:"buyer@example.org"},
    {...base(),demoRef:"REAL-BUYER-123"},
    {...base(),channel:"All channels"},
    {...base(),exampleLimit:21},
    {...base(),exampleLimit:0},
    {...base(),exampleLimit:"20"},
    {...base(),vatTreatment:"VAT_UNVERIFIED_APPROVED"},
    {...base(),tradingAddressApproved:"yes"},
    null,
    Object.create({version:1}),
  ];
  for(const o of invalid)assert.throws(()=>prepareDiagnosticPilotBrief(o),/DIAGNOSTIC PILOT HOLD/);
  let getterCalls=0;
  const accessor=base();
  Object.defineProperty(accessor,"channel",{enumerable:true,get(){getterCalls++;return "Website";}});
  assert.throws(()=>prepareDiagnosticPilotBrief(accessor),/DIAGNOSTIC PILOT HOLD/);
  assert.equal(getterCalls,0);
  const withSymbol=base();withSymbol[Symbol("extra")]="test";
  assert.throws(()=>prepareDiagnosticPilotBrief(withSymbol),/DIAGNOSTIC PILOT HOLD/);
});
test("no buyer identities, company secrets or payment instructions can enter output",()=>{
  const result=prepareDiagnosticPilotBrief(base());
  assert.doesNotMatch(JSON.stringify(result),/example\.com|account number|sort code/i);
  assert.match(result.draft,/final VAT-inclusive\/exclusive position and total HOLD/);
});
