import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyCommercialSourceRecord,
  reconcileCommercialEvidenceCounts,
} from "../lib/commercial-source-evidence.js";

const record=(overrides={})=>({
  version:1,
  recordId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  sourceKind:"ORIGINAL_INBOX",
  direction:"INBOUND",
  synthetic:false,
  consentState:"RECORDED",
  humanReviewed:true,
  intentEvidence:"EXPLICIT_PAID_DIAGNOSTIC_ENQUIRY",
  evidenceDigest:"a".repeat(64),
  ...overrides,
});

test("only reviewed consented original inbound evidence is genuine",()=>{
  const result=classifyCommercialSourceRecord(record());
  assert.equal(result.classification,"GENUINE");
  assert.equal(result.buyer,false);
  assert.equal(result.agreed,false);
  assert.equal(result.invoiced,false);
  assert.equal(result.clearedEvidenceGBP,0);
  assert.equal(result.automaticCommercialTransition,false);
  assert.equal(result.customerDelivery,"HOLD");
});

test("unreviewed or unconsented inbound interest remains candidate",()=>{
  for(const overrides of [
    {humanReviewed:false},
    {consentState:"NOT_RECORDED"},
    {intentEvidence:"GENERAL_SERVICE_ENQUIRY"},
  ]){
    const result=classifyCommercialSourceRecord(record(overrides));
    assert.equal(result.classification,"CANDIDATE");
    assert.equal(result.clearedEvidenceGBP,0);
  }
});

test("synthetic fixtures are explicit and never revenue",()=>{
  const result=classifyCommercialSourceRecord(record({
    sourceKind:"SYNTHETIC_FIXTURE",
    direction:"INTERNAL",
    synthetic:true,
    consentState:"NOT_APPLICABLE",
    humanReviewed:false,
    intentEvidence:"NO_BUYER_INTENT_EVIDENCE",
  }));
  assert.equal(result.classification,"SYNTHETIC");
  assert.equal(result.buyer,false);
  assert.equal(result.clearedEvidenceGBP,0);
});

test("activity events and outbound prospects are not enquiries or buyers",()=>{
  for(const sourceKind of ["ACTIVITY_EVENT","OUTBOUND_PROSPECT"]){
    const result=classifyCommercialSourceRecord(record({
      sourceKind,
      direction:sourceKind==="OUTBOUND_PROSPECT"?"OUTBOUND":"INTERNAL",
      consentState:"NOT_APPLICABLE",
      intentEvidence:"NO_BUYER_INTENT_EVIDENCE",
    }));
    assert.equal(result.classification,"UNKNOWN");
    assert.equal(result.buyer,false);
    assert.equal(result.agreed,false);
    assert.equal(result.invoiced,false);
  }
});

test("reconciles disputed counts without promoting activity or prospects",()=>{
  const result=reconcileCommercialEvidenceCounts({
    version:1,
    claimedEnquiries:30,
    verifiedGenuine:0,
    verifiedCandidate:0,
    syntheticFixtures:3,
    activityEvents:29,
    outboundProspects:92,
  });
  assert.deepEqual(result.classifications,{
    GENUINE:0,
    CANDIDATE:0,
    SYNTHETIC:3,
    UNKNOWN:27,
  });
  assert.equal(result.nonEnquiryActivityEvents,29);
  assert.equal(result.outboundProspectsNotBuyers,92);
  assert.equal(result.buyerCount,0);
  assert.equal(result.agreedCount,0);
  assert.equal(result.invoicedCount,0);
  assert.equal(result.clearedEvidenceGBP,0);
  assert.equal(result.customerDelivery,"HOLD");
});

test("malformed, PII-bearing and inconsistent records fail closed",()=>{
  assert.throws(
    ()=>classifyCommercialSourceRecord({...record(),email:"person@example.com"}),
    /exact privacy-safe metadata/,
  );
  assert.throws(
    ()=>classifyCommercialSourceRecord(record({evidenceDigest:"raw-message"})),
    /SHA-256 evidence digest/,
  );
  assert.throws(
    ()=>classifyCommercialSourceRecord(record({sourceKind:"SYNTHETIC_FIXTURE"})),
    /synthetic fixture and flag must agree/,
  );
  assert.throws(
    ()=>reconcileCommercialEvidenceCounts({
      version:1,
      claimedEnquiries:2,
      verifiedGenuine:0,
      verifiedCandidate:0,
      syntheticFixtures:3,
      activityEvents:29,
      outboundProspects:92,
    }),
    /exceeds the claimed total/,
  );
});
