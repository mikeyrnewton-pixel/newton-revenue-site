import test from "node:test";
import assert from "node:assert/strict";
import {buildOfflineDiagnosticFirstSaleDesk} from "../lib/diagnostic-first-sale-desk.js";

const pilot=()=>({
  version:1,demoRef:"DEMO-FIRST-SALE195",channel:"Website",exampleLimit:12,
  vatTreatment:"UNKNOWN",supplierIdentityReviewed:false,
  tradingAddressApproved:false,termsAndCancellationReviewed:false,
  privateDataRouteApproved:false,deliveryCapacityConfirmed:false,
});
const publicResearch=()=>({
  version:1,candidateId:"ORG-EXAMPLEFIRM1",candidateType:"ORGANISATION",
  sourceId:"SRC-PUBLICBRIEF1",sourceKind:"PUBLIC_BRIEF",
  sourceUrl:"https://example.org/open/consultancy",
  publishedAt:"2026-10-24T11:00:00.000Z",
  observedAt:"2026-10-25T10:00:00.000Z",
  signalClass:"OPEN_PURCHASE_BRIEF",fit:"HIGH",
  notes:"Only a fictional public buyer example, not independently validated.",
});
const workspace=()=>({pilot:pilot(),publicResearch:[publicResearch()],
  asOf:"2026-10-25T11:00:00.000Z"});
test("connects the four existing offline modules in one fixed £195 pilot flow",()=>{
  const result=buildOfflineDiagnosticFirstSaleDesk(workspace());
  assert.equal(result.goal,"TEST_ONE_REAL_195_GBP_DIAGNOSTIC_ONLY_AFTER_SEPARATE_APPROVALS");
  assert.equal(result.pilot.proposedPriceGBP,195);
  assert.equal(result.buyerResearch.uniqueSourceCount,1);
  assert.equal(result.buyerResearch.publicBriefsForManualValidation,1);
  assert.equal(result.crmPreview.table,"public.newton_opportunities");
  assert.equal(result.crmPreview.row.status,"discovered");
  assert.equal(result.crmPreview.row.metadata.local_opportunity_ref,"OPP-DIAGNOSTIC195");
  assert.equal(result.crmPreview.row.metadata.evidence_gate,"AUTHENTICATED_EVIDENCE_REQUIRED");
  assert.equal(result.release,"INTERNAL_REVIEW_ONLY");
  assert.equal(result.ownerDecisionRequiredBeforeExternalUse,true);
  assert.equal(result.clearedCashGBP,0);
  assert.equal(result.customerMessagesSent,0);
  assert.equal(result.liveQuotesSent,0);
  assert.equal(result.liveInvoicesIssued,0);
  assert.equal(result.paymentsCapturedGBP,0);
  assert.equal(result.buyerQualifiedCount,0);
  assert.equal(result.writesPerformed,false);
  assert.equal(result.nextActions.length,3);
  assert.ok(Object.isFrozen(result)&&Object.isFrozen(result.nextActions));
});
test("buyer data is still explicitly unverified regardless of strong public signal",()=>{
  const result=buildOfflineDiagnosticFirstSaleDesk(workspace());
  assert.equal(result.buyerResearch.records[0].sourceClaimVerified,false);
  assert.equal(result.buyerResearch.records[0].realBuyerIdentified,false);
  assert.equal(result.buyerResearch.outreachApproved,false);
  assert.equal(result.crmPreview.row.metadata.prospect_contact_authorised,false);
  assert.equal(result.crmPreview.row.metadata.buyer_discovery_permitted,false);
  assert.doesNotMatch(JSON.stringify(result),/fictional public buyer example/);
});
test("even after every checkbox is declared complete, commercial action remains blocked",()=>{
  const config=workspace();
  config.pilot={...pilot(),vatTreatment:"VAT_INCLUDED",
    supplierIdentityReviewed:true,tradingAddressApproved:true,
    termsAndCancellationReviewed:true,privateDataRouteApproved:true,
    deliveryCapacityConfirmed:true};
  const result=buildOfflineDiagnosticFirstSaleDesk(config);
  assert.equal(result.pilot.internalPreflight,"DECLARED_GATES_PRESENT_UNVERIFIED");
  assert.equal(result.pilot.quoteOrPaymentReady,false);
  assert.equal(result.buyerQualifiedCount,0);
  assert.equal(result.nextActions.length,2);
  assert.equal(result.liveInvoicesIssued,0);
  assert.equal(result.clearedCashGBP,0);
});
test("empty research leads to a useful no-buyer owner handoff, not invented leads",()=>{
  const config=workspace();config.publicResearch=[];
  const result=buildOfflineDiagnosticFirstSaleDesk(config);
  assert.equal(result.buyerResearch.uniqueSourceCount,0);
  assert.equal(result.buyerQualifiedCount,0);
  assert.equal(result.nextActions[1].state,"NO_PILOT_FIT_BUYER_VERIFIED");
  assert.equal(result.buyerResearch.genuineBuyersVerified,0);
});
test("rejects unknown workflow fields and failing source provenance",()=>{
  assert.throws(()=>buildOfflineDiagnosticFirstSaleDesk({...workspace(),contactNow:true}),
    /PILOT DESK HOLD/);
  const attack=workspace();
  attack.publicResearch=[{...publicResearch(),sourceUrl:"https://example.org/public?secret=abc"}];
  assert.throws(()=>buildOfflineDiagnosticFirstSaleDesk(attack),/BUYER RESEARCH HOLD/);
  let calls=0;
  const obj=workspace();Object.defineProperty(obj,"pilot",
    {enumerable:true,get(){calls++;return pilot();}});
  assert.throws(()=>buildOfflineDiagnosticFirstSaleDesk(obj),/PILOT DESK HOLD/);
  assert.equal(calls,0);
});
