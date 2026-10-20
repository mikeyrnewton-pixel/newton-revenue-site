import test from "node:test";
import assert from "node:assert/strict";
import {reconcileCommercialReadiness} from "../lib/commercial-readiness.js";

const TYPES=["QUOTE_READY","WRITTEN_ACCEPTANCE","OWNER_APPROVED","INVOICE_READY","INVOICED","CLEARED"];
const ids=TYPES.map((_,index)=>`${index+1}1111111-1111-4111-8111-111111111111`);
const events=()=>TYPES.map((type,index)=>({
  version:1,
  synthetic:true,
  eventId:ids[index],
  type,
  occurredAt:`2026-10-20T08:0${index}:00.000Z`,
  evidenceDigest:String(index+1).repeat(64),
}));
const base=()=>({
  synthetic:true,
  projectRef:"DEMO-CASH-195",
  channel:"Website",
  priceGBP:195,
  vatTreatment:"VAT_INCLUDED",
  supplierAddressApproved:true,
  termsApproved:true,
  events:events(),
});

test("reconciles the exact quote-to-cleared evidence sequence without claiming revenue",()=>{
  const snapshot=reconcileCommercialReadiness(base());
  assert.equal(snapshot.state,"CLEARED");
  assert.equal(snapshot.clearedEvidenceGBP,195);
  assert.equal(snapshot.commercialTruth,"FICTIONAL_ONLY_NOT_REVENUE");
  assert.equal(snapshot.customerDelivery,"HOLD");
  assert.deepEqual(snapshot.acceptedEventIds,ids);
  const retry=base();
  retry.events.splice(1,0,{...retry.events[0]});
  assert.deepEqual(reconcileCommercialReadiness(retry),snapshot,
    "an exact replay is idempotent");
});

test("reports VAT, address and terms blockers before any commercial event",()=>{
  const input=base();
  input.vatTreatment="UNKNOWN";
  input.supplierAddressApproved=false;
  input.termsApproved=false;
  input.events=[];
  const snapshot=reconcileCommercialReadiness(input);
  assert.equal(snapshot.state,"COMMERCIAL_HOLD");
  assert.deepEqual(snapshot.blockers,[
    "VAT_TREATMENT_UNCONFIRMED",
    "SUPPLIER_ADDRESS_UNAPPROVED",
    "COMMERCIAL_TERMS_UNAPPROVED",
  ]);
  assert.equal(snapshot.clearedEvidenceGBP,0);
  assert.equal(snapshot.customerDelivery,"HOLD");
});

test("fails closed on skipped stages, conflicting replay and backwards evidence",()=>{
  const skipped=base();
  skipped.events.splice(1,1);
  assert.throws(()=>reconcileCommercialReadiness(skipped),/order skipped or repeated/);

  const conflict=base();
  conflict.events.splice(1,0,{...conflict.events[0],evidenceDigest:"f".repeat(64)});
  assert.throws(()=>reconcileCommercialReadiness(conflict),/conflicting replay/);

  const backwards=base();
  backwards.events[1]={...backwards.events[1],occurredAt:"2026-10-20T07:59:00.000Z"};
  assert.throws(()=>reconcileCommercialReadiness(backwards),/timeline moved backwards/);
});

test("refuses real activity, unknown evidence and activity while gates are blocked",()=>{
  assert.throws(()=>reconcileCommercialReadiness({...base(),synthetic:false}),/fictional rehearsal only/);
  const badDigest=base();
  badDigest.events[0]={...badDigest.events[0],evidenceDigest:"not-a-digest"};
  assert.throws(()=>reconcileCommercialReadiness(badDigest),/SHA-256 evidence digest/);
  const blocked=base();
  blocked.vatTreatment="UNKNOWN";
  assert.throws(()=>reconcileCommercialReadiness(blocked),/events forbidden/);
  const extra=base();
  extra.buyerEmail="person@example.com";
  assert.throws(()=>reconcileCommercialReadiness(extra),/exact readiness input/);
});
