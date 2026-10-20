import test from "node:test";
import assert from "node:assert/strict";
import {reconcileCommercialReadiness} from "../lib/commercial-readiness.js";

const TYPES=["QUOTE_READY","WRITTEN_ACCEPTANCE","OWNER_APPROVED","INVOICE_READY","INVOICED","PAYMENT_RECORDED","CLEARED"];
const ids=TYPES.map((_,index)=>`${index+1}1111111-1111-4111-8111-111111111111`);
const sourceRecordId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const events=()=>TYPES.map((type,index)=>({
  version:1,
  synthetic:true,
  eventId:ids[index],
  sourceRecordId,
  type,
  occurredAt:`2026-10-20T08:0${index}:00.000Z`,
  evidenceDigest:String(index+1).repeat(64),
}));
const base=()=>({
  synthetic:true,
  projectRef:"DEMO-CASH-195",
  sourceRecordId,
  sourceClassification:"SYNTHETIC",
  sourceEvidenceDigest:"a".repeat(64),
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
  assert.equal(snapshot.recordedPaymentEvidenceGBP,195);
  assert.equal(snapshot.clearedEvidenceGBP,195);
  assert.equal(snapshot.commercialTruth,"FICTIONAL_ONLY_NOT_REVENUE");
  assert.equal(snapshot.customerDelivery,"HOLD");
  assert.equal(snapshot.sourceRecordId,sourceRecordId);
  assert.equal(snapshot.sourceClassification,"SYNTHETIC");
  assert.equal(snapshot.priceGBP,195);
  assert.equal(snapshot.vatTreatment,"VAT_INCLUDED");
  assert.equal(snapshot.supplierAddressApproved,true);
  assert.equal(snapshot.termsApproved,true);
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
  assert.equal(snapshot.recordedPaymentEvidenceGBP,0);
  assert.equal(snapshot.clearedEvidenceGBP,0);
  assert.equal(snapshot.customerDelivery,"HOLD");
  assert.equal(snapshot.priceGBP,195);
  assert.equal(snapshot.vatTreatment,"UNKNOWN");
  assert.equal(snapshot.supplierAddressApproved,false);
  assert.equal(snapshot.termsApproved,false);
});

test("payment recorded remains distinct from cleared funds",()=>{
  const input=base();
  input.events=input.events.slice(0,-1);
  const recorded=reconcileCommercialReadiness(input);
  assert.equal(recorded.state,"PAYMENT_RECORDED");
  assert.equal(recorded.recordedPaymentEvidenceGBP,195);
  assert.equal(recorded.clearedEvidenceGBP,0);
  assert.equal(recorded.commercialTruth,"FICTIONAL_ONLY_NOT_REVENUE");
  assert.equal(recorded.customerDelivery,"HOLD");

  const skipped=base();
  skipped.events.splice(-2,1);
  assert.throws(()=>reconcileCommercialReadiness(skipped),
    /commercial event order skipped or repeated/);
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

  const reusedEvidence=base();
  reusedEvidence.events[5]={
    ...reusedEvidence.events[5],
    evidenceDigest:reusedEvidence.events[4].evidenceDigest,
  };
  assert.throws(
    ()=>reconcileCommercialReadiness(reusedEvidence),
    /evidence digest reused across commercial events/,
  );
});

test("binds every commercial event to one privacy-safe source record",()=>{
  const crossLead=base();
  crossLead.events[4]={...crossLead.events[4],
    sourceRecordId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"};
  assert.throws(()=>reconcileCommercialReadiness(crossLead),
    /commercial event source record mismatch/);

  assert.throws(
    ()=>reconcileCommercialReadiness({...base(),sourceClassification:"GENUINE"}),
    /synthetic source classification required/,
  );
  assert.throws(
    ()=>reconcileCommercialReadiness({...base(),sourceEvidenceDigest:"not-a-digest"}),
    /source SHA-256 evidence digest required/,
  );
  assert.throws(
    ()=>reconcileCommercialReadiness({...base(),sourceEvidenceDigest:"A".repeat(64)}),
    /source SHA-256 evidence digest required/,
    "source digest must match the canonical lowercase PR30 handoff",
  );
  assert.throws(
    ()=>reconcileCommercialReadiness({...base(),sourceRecordId:sourceRecordId.toUpperCase()}),
    /valid source record ID required/,
    "uppercase UUID aliases must not cross the PR30 to PR29 boundary",
  );
  const uppercaseEventId=base();
  uppercaseEventId.events[0]={...uppercaseEventId.events[0],
    eventId:uppercaseEventId.events[0].eventId.toUpperCase()};
  assert.throws(
    ()=>reconcileCommercialReadiness(uppercaseEventId),
    /valid event ID required/,
    "uppercase event UUID aliases must not bypass idempotency",
  );
});

test("refuses real activity, unknown evidence and activity while gates are blocked",()=>{
  assert.throws(()=>reconcileCommercialReadiness({...base(),synthetic:false}),/fictional rehearsal only/);
  const badDigest=base();
  badDigest.events[0]={...badDigest.events[0],evidenceDigest:"not-a-digest"};
  assert.throws(()=>reconcileCommercialReadiness(badDigest),/SHA-256 evidence digest/);
  const uppercaseDigest=base();
  uppercaseDigest.events[0]={...uppercaseDigest.events[0],evidenceDigest:"A".repeat(64)};
  assert.throws(
    ()=>reconcileCommercialReadiness(uppercaseDigest),
    /SHA-256 evidence digest/,
    "event digest must remain canonical lowercase",
  );
  const blocked=base();
  blocked.vatTreatment="UNKNOWN";
  assert.throws(()=>reconcileCommercialReadiness(blocked),/events forbidden/);
  const extra=base();
  extra.buyerEmail="person@example.com";
  assert.throws(()=>reconcileCommercialReadiness(extra),/exact readiness input/);
});

