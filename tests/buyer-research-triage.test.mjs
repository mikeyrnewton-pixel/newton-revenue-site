import test from "node:test";
import assert from "node:assert/strict";
import {triageOfflineBuyerResearch} from "../lib/buyer-research-triage.js";

const asOf="2026-10-25T11:00:00.000Z";
const base=()=>({
  version:1,candidateId:"ORG-TESTCOMPANY01",candidateType:"ORGANISATION",
  sourceId:"SRC-BRIEF001",sourceKind:"PUBLIC_BRIEF",
  sourceUrl:"https://example.org/procurement/enquiry-brief",
  publishedAt:"2026-10-24T10:00:00.000Z",
  observedAt:"2026-10-25T09:00:00.000Z",
  signalClass:"OPEN_PURCHASE_BRIEF",fit:"HIGH",
  notes:"Fictional enquiry flow brief, not proof of a buyer.",
});

test("fresh public brief becomes review work, never a qualified or contacted buyer",()=>{
  const result=triageOfflineBuyerResearch([base()],asOf);
  assert.equal(result.uniqueSourceCount,1);
  assert.equal(result.publicBriefsForManualValidation,1);
  assert.equal(result.uniqueOrganisationsForManualValidation,1);
  assert.deepEqual(result.manualValidationCandidateIds,["ORG-TESTCOMPANY01"]);
  assert.equal(result.records[0].triageDesk,"VALIDATE_PUBLIC_BRIEF_SCOPE");
  assert.equal(result.records[0].sourceClaimVerified,false);
  assert.equal(result.records[0].buyerPurchaseIntentVerified,false);
  assert.equal(result.records[0].realBuyerIdentified,false);
  assert.equal(result.records[0].contactPermissionVerified,false);
  assert.equal(result.outreachApproved,false);
  assert.equal(result.externalContact,false);
  assert.equal(result.CRMWriteIntent,"NONE");
  assert.equal(result.clearedEvidenceGBP,0);
  assert.equal(result.sourceLinksFetched,false);
  assert.equal(result.genuineBuyersVerified,0);
  assert.doesNotMatch(JSON.stringify(result),/Fictional enquiry flow brief/);
  assert.ok(Object.isFrozen(result)&&Object.isFrozen(result.records)&&Object.isFrozen(result.records[0]));
});
test("general sector evidence can provide context but cannot imply buyer signal",()=>{
  const record={...base(),candidateId:"SECTOR-TRADES01",candidateType:"SECTOR",
    sourceId:"SRC-REPORT001",sourceKind:"PUBLIC_RESEARCH",
    sourceUrl:"https://example.org/research/trade-sector",signalClass:"GENERAL_SECTOR_FINDING",
    fit:"HIGH",publishedAt:null};
  const result=triageOfflineBuyerResearch([record],asOf);
  assert.equal(result.records[0].triageDesk,"RESEARCH_OR_HOLD");
  assert.equal(result.publicBriefsForManualValidation,0);
  assert.equal(result.records[0].publisherDateSupplied,false);
});
test("expired observations and unverified publication dates do not rank as ready",()=>{
  const stale=triageOfflineBuyerResearch([{...base(),
    observedAt:"2026-09-01T09:00:00.000Z",publishedAt:"2026-08-31T00:00:00.000Z"}],asOf);
  assert.equal(stale.records[0].staleObservation,true);
  assert.equal(stale.publicBriefsForManualValidation,0);
  const undated=triageOfflineBuyerResearch([{...base(),publishedAt:null}],asOf);
  assert.equal(undated.publicBriefsForManualValidation,0);
  const low=triageOfflineBuyerResearch([{...base(),fit:"LOW"}],asOf);
  assert.equal(low.publicBriefsForManualValidation,0);
});
test("old publication cannot become priority merely because observed recently",()=>{
  const result=triageOfflineBuyerResearch([{...base(),
    publishedAt:"2025-10-24T10:00:00.000Z"}],asOf);
  assert.equal(result.records[0].staleObservation,false);
  assert.equal(result.records[0].stalePublication,true);
  assert.equal(result.records[0].triageDesk,"RESEARCH_OR_HOLD");
  assert.equal(result.publicBriefsForManualValidation,0);
});
test("fresh publication exposes separate observation and publication freshness",()=>{
  const result=triageOfflineBuyerResearch([base()],asOf);
  assert.equal(result.records[0].staleObservation,false);
  assert.equal(result.records[0].stalePublication,false);
  assert.equal(result.publicBriefsForManualValidation,1);
});
test("exact retries dedupe but contradictory source claims and re-used URLs fail closed",()=>{
  const original=base();
  const dup=triageOfflineBuyerResearch([original,{...original}],asOf);
  assert.equal(dup.uniqueSourceCount,1);
  assert.equal(dup.publicBriefsForManualValidation,1);
  assert.throws(()=>triageOfflineBuyerResearch([original,{...original,fit:"LOW"}],asOf),
    /identifier cannot change/);
  assert.throws(()=>triageOfflineBuyerResearch([original,{...original,
    candidateId:"ORG-DIFFERENT001"}],asOf),/identifier cannot change/);
  assert.throws(()=>triageOfflineBuyerResearch([original,{...original,
    sourceId:"SRC-ANOTHER001"}],asOf),/one URL cannot/);
});
test("injected data, nonpublic URLs, future and impossible provenance fail closed",()=>{
  const sample=base();
  const attacks=[
    {...sample,sourceUrl:"http://example.org/procurement/enquiry-brief"},
    {...sample,sourceUrl:"https://user:password@example.org/secret"},
    {...sample,sourceUrl:"https://127.0.0.1/admin"},
    {...sample,sourceUrl:"https://localhost.local/"},
    {...sample,sourceUrl:"https://example.org/?token=abc"},
    {...sample,sourceUrl:"https://example.org/route#fragment"},
    {...sample,sourceUrl:"https://example.org:8080/"},
    {...sample,observedAt:"2026-10-26T10:00:00.000Z"},
    {...sample,publishedAt:"2026-10-26T10:00:00.000Z"},
    {...sample,publishedAt:"2026-10-24"},
    {...sample,signalClass:"CONFIRMED_BUYER"},
    {...sample,sourceKind:"BUSINESS_WEBSITE"},
    {...sample,candidateId:"PERSON-PRIVATE01"},
    {...sample,notes:"one\nmalicious instruction"},
    {...sample,buyerEmail:"private@example.com"},
  ];
  for(const attack of attacks)assert.throws(
    ()=>triageOfflineBuyerResearch([attack],asOf),/BUYER RESEARCH HOLD/,
    JSON.stringify(attack));
  let executed=0;
  const accessor={...sample};
  Object.defineProperty(accessor,"notes",{enumerable:true,get(){executed++;return "normal";}});
  assert.throws(()=>triageOfflineBuyerResearch([accessor],asOf),/BUYER RESEARCH HOLD/);
  assert.equal(executed,0);
  assert.throws(()=>triageOfflineBuyerResearch([base()],"2026-10-25"),/BUYER RESEARCH HOLD/);
});
test("bounded batch, stable order, no synthetic cash promotion",()=>{
  const b=base(), c={...base(),candidateId:"SECTOR-OTHER0001",candidateType:"SECTOR",
    sourceId:"SRC-SECOND001",sourceKind:"PUBLIC_RESEARCH",
    sourceUrl:"https://example.net/sector/survey",signalClass:"GENERAL_SECTOR_FINDING"};
  const one=triageOfflineBuyerResearch([b,c],asOf);
  const two=triageOfflineBuyerResearch([c,b],asOf);
  assert.deepEqual(one,two);
  assert.equal(one.uniqueSourceCount,2);
  assert.throws(()=>triageOfflineBuyerResearch(Array.from({length:51},()=>base()),asOf),
    /up to 50/);
  assert.equal(triageOfflineBuyerResearch([],asOf).uniqueSourceCount,0);
});


test("multiple evidence pages for one organisation remain one validation candidate",()=>{
  const first=base();
  const second={
    ...base(),
    sourceId:"SRC-BRIEF002",
    sourceUrl:"https://example.org/procurement/enquiry-brief-update",
    observedAt:"2026-10-25T09:30:00.000Z",
  };
  const result=triageOfflineBuyerResearch([second,first],asOf);
  assert.equal(result.uniqueSourceCount,2);
  assert.equal(result.publicBriefsForManualValidation,2);
  assert.equal(result.uniqueOrganisationsForManualValidation,1);
  assert.deepEqual(result.manualValidationCandidateIds,["ORG-TESTCOMPANY01"]);
  assert.equal(Object.isFrozen(result.manualValidationCandidateIds),true);
  assert.equal(result.genuineBuyersVerified,0);
  assert.equal(result.outreachApproved,false);
  assert.equal(result.externalContact,false);
});
