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
  assert.equal(snapshot.recordedPaymentEvidenceGBP,0);
  assert.equal(snapshot.simulatedRecordedPaymentEvidenceGBP,195);
  assert.equal(snapshot.clearedEvidenceGBP,0);
  assert.equal(snapshot.simulatedClearedEvidenceGBP,195);
  assert.equal(snapshot.automaticCommercialTransition,false);
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
  assert.equal(snapshot.simulatedRecordedPaymentEvidenceGBP,0);
  assert.equal(snapshot.simulatedClearedEvidenceGBP,0);
  assert.equal(snapshot.automaticCommercialTransition,false);
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
  assert.equal(recorded.recordedPaymentEvidenceGBP,0);
  assert.equal(recorded.simulatedRecordedPaymentEvidenceGBP,195);
  assert.equal(recorded.simulatedClearedEvidenceGBP,0);
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
    eventId:"AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA"};
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
  const sourceDigestReuse=base();
  sourceDigestReuse.events[0]={
    ...sourceDigestReuse.events[0],
    evidenceDigest:sourceDigestReuse.sourceEvidenceDigest,
  };
  assert.throws(
    ()=>reconcileCommercialReadiness(sourceDigestReuse),
    /evidence digest reused across commercial events/,
    "source evidence cannot be replayed as stage evidence",
  );
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



test("every fictional commercial stage leaves real cleared/recorded money at zero",()=>{
  for(let length=0;length<=TYPES.length;length++){
    const input=base();
    input.events=input.events.slice(0,length);
    const result=reconcileCommercialReadiness(input);
    assert.equal(result.synthetic,true);
    assert.equal(result.recordedPaymentEvidenceGBP,0);
    assert.equal(result.clearedEvidenceGBP,0);
    assert.equal(result.customerDelivery,"HOLD");
    assert.equal(result.automaticCommercialTransition,false);
    assert.equal(result.commercialTruth,"FICTIONAL_ONLY_NOT_REVENUE");
    assert.equal(result.simulatedRecordedPaymentEvidenceGBP,length>=6?195:0);
    assert.equal(result.simulatedClearedEvidenceGBP,length===7?195:0);
  }
});

test("commercial readiness rejects active object shapes without executing getters",()=>{
  let getterRuns=0;
  const activeInput=base();
  Object.defineProperty(activeInput,"projectRef",{
    enumerable:true,
    get(){
      getterRuns++;
      return "DEMO-CASH-195";
    },
  });
  assert.throws(
    ()=>reconcileCommercialReadiness(activeInput),
    /exact readiness input required/,
  );
  assert.equal(getterRuns,0,"input getter must not execute");

  const customInput=Object.assign(Object.create({polluted:true}),base());
  assert.throws(
    ()=>reconcileCommercialReadiness(customInput),
    /exact readiness input required/,
  );

  const activeEvent=base();
  Object.defineProperty(activeEvent.events[0],"type",{
    enumerable:true,
    get(){
      getterRuns++;
      return "QUOTE_READY";
    },
  });
  assert.throws(
    ()=>reconcileCommercialReadiness(activeEvent),
    /exact event fields required/,
  );
  assert.equal(getterRuns,0,"event getter must not execute");

  const customEvent=base();
  customEvent.events[0]=Object.assign(
    Object.create({polluted:true}),customEvent.events[0],
  );
  assert.throws(
    ()=>reconcileCommercialReadiness(customEvent),
    /exact event fields required/,
  );

  const sparse=base();
  sparse.events=Array(7);
  sparse.events[0]=events()[0];
  assert.throws(
    ()=>reconcileCommercialReadiness(sparse),
    /bounded inert dense event array required/,
  );

  class CommercialEvents extends Array {}
  const subclassed=base();
  subclassed.events=CommercialEvents.from(events());
  assert.throws(
    ()=>reconcileCommercialReadiness(subclassed),
    /bounded inert dense event array required/,
  );

  const hidden=base();
  Object.defineProperty(hidden.events[0],"hidden",{
    value:true,
    enumerable:false,
  });
  assert.throws(
    ()=>reconcileCommercialReadiness(hidden),
    /exact event fields required/,
  );

  const symbolBacked=base();
  symbolBacked.events[0][Symbol("hidden")]=true;
  assert.throws(
    ()=>reconcileCommercialReadiness(symbolBacked),
    /exact event fields required/,
  );
});

