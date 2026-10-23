import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {reconcileEnquirySourceInventory} from "../lib/enquiry-source-inventory.js";

const zeroCounts=()=>({
  GENUINE:0,
  CANDIDATE:0,
  SYNTHETIC:0,
  NON_ENQUIRY_ACTIVITY:0,
  OUTBOUND_PROSPECT:0,
  OUTBOUND_REPLY:0,
  UNKNOWN:0,
});
const readable=(sourceId,overrides={})=>({
  sourceId,
  accessState:"READ_VERIFIED",
  coverage:"COMPLETE",
  coverageStartedAt:"2026-10-01T00:00:00.000Z",
  coverageEndedAt:"2026-10-20T12:13:59.000Z",
  evidenceLocator:`private://${sourceId.toLowerCase().replaceAll("_","-")}/aggregate`,
  observedCounts:zeroCounts(),
  verifiedAt:"2026-10-20T12:14:00.000Z",
  evidenceDigest:createHash("sha256").update(sourceId).digest("hex"),
  ...overrides,
});
const unreadable=sourceId=>({
  sourceId,
  accessState:"UNKNOWN_UNREADABLE",
  coverage:"UNREADABLE",
  coverageStartedAt:null,
  coverageEndedAt:null,
  evidenceLocator:`private://${sourceId.toLowerCase().replaceAll("_","-")}/unreadable`,
  observedCounts:Object.fromEntries(Object.keys(zeroCounts()).map(key=>[key,null])),
  verifiedAt:null,
  evidenceDigest:null,
});
const fixture=()=>({
  version:1,
  claimedEnquiries:30,
  sources:[
    unreadable("CLOUDFLARE_KV"),
    readable("NEWTON_REVENUE_GMAIL",{coverage:"SEARCH_WINDOW"}),
    readable("PERSONAL_GMAIL",{coverage:"SEARCH_WINDOW",observedCounts:{...zeroCounts(),OUTBOUND_REPLY:1}}),
    unreadable("SOCIAL_BUSINESS_DMS"),
    readable("ATLAS_WATCH",{observedCounts:{
      ...zeroCounts(),
      SYNTHETIC:3,
      NON_ENQUIRY_ACTIVITY:29,
      OUTBOUND_PROSPECT:92,
    }}),
    readable("SALES_DESK"),
    unreadable("CANONICAL_SHEET"),
  ],
});

test("unreadable primary stores remain unknown instead of becoming zero",()=>{
  const result=reconcileEnquirySourceInventory(fixture());
  assert.equal(result.classificationStatus,"UNKNOWN_UNREADABLE");
  assert.equal(result.genuineEnquiries,null);
  assert.equal(result.accessibleGenuineObservations,0);
  assert.deepEqual(result.unreadableSources,[
    "CANONICAL_SHEET",
    "CLOUDFLARE_KV",
    "SOCIAL_BUSINESS_DMS",
  ]);
  assert.deepEqual(result.excludedFromGenuine,{
    syntheticFixtures:3,
    activityEvents:29,
    outboundProspects:92,
    outboundReplies:1,
  });
  assert.equal(result.automaticBuyerPromotion,false);
  assert.equal(result.customerDataCopied,false);
  assert.equal(result.productionMutation,false);
  assert.equal(result.customerDelivery,"HOLD");
});

test("authenticated reply to prior outreach cannot become a genuine enquiry",()=>{
  const result=reconcileEnquirySourceInventory(fixture());
  assert.equal(result.sourceCounts.PERSONAL_GMAIL.OUTBOUND_REPLY,1);
  assert.equal(result.sourceCounts.PERSONAL_GMAIL.GENUINE,0);
  assert.equal(result.accessibleGenuineObservations,0);
  assert.equal(result.excludedFromGenuine.outboundReplies,1);
  assert.equal(result.automaticBuyerPromotion,false);
});

test("readable candidate and unknown rows remain explicit unresolved classifications",()=>{
  const input=fixture();
  input.sources=input.sources.map(source=>
    source.accessState==="READ_VERIFIED"?source:readable(source.sourceId,{
      coverage:source.sourceId==="CLOUDFLARE_KV"?"RETENTION_WINDOW":"COMPLETE",
    }));
  const salesDesk=input.sources.find(source=>source.sourceId==="SALES_DESK");
  salesDesk.observedCounts={...zeroCounts(),CANDIDATE:1,UNKNOWN:2};
  const result=reconcileEnquirySourceInventory(input);
  assert.equal(result.classificationStatus,"UNKNOWN_CLASSIFICATION_REVIEW");
  assert.equal(result.accessibleCandidateObservations,1);
  assert.equal(result.accessibleUnknownObservations,2);
  assert.equal(result.unresolvedAccessibleClassifications,3);
  assert.equal(result.genuineEnquiries,null);
  assert.equal(result.automaticBuyerPromotion,false);
});

test("bounded Gmail searches remain partial even when every source is readable",()=>{
  const input=fixture();
  input.sources=input.sources.map(source=>
    source.accessState==="READ_VERIFIED"?source:readable(source.sourceId,{
      coverage:source.sourceId==="CLOUDFLARE_KV"?"RETENTION_WINDOW":"COMPLETE",
    }));
  const result=reconcileEnquirySourceInventory(input);
  assert.equal(result.classificationStatus,"PARTIAL_COVERAGE_DEDUPE_REQUIRED");
  assert.equal(result.genuineEnquiries,null);
  assert.deepEqual(result.unreadableSources,[]);
  assert.deepEqual(result.partialCoverageSources,[
    "CLOUDFLARE_KV","NEWTON_REVENUE_GMAIL","PERSONAL_GMAIL",
  ]);
  assert.equal(result.historicalEnquiryCount,null);
  assert.match(result.historicalCloudflareKvCoverage,/30_DAY_LEAD_TTL/);
  assert.equal(result.automaticBuyerPromotion,false);
});

test("bounded Gmail evidence cannot claim complete historical coverage",()=>{
  for(const sourceId of ["NEWTON_REVENUE_GMAIL","PERSONAL_GMAIL"]){
    const input=fixture();
    const index=input.sources.findIndex(source=>source.sourceId===sourceId);
    input.sources[index]={...input.sources[index],coverage:"COMPLETE"};
    assert.throws(
      ()=>reconcileEnquirySourceInventory(input),
      /bounded Gmail evidence must remain a search window/,
      sourceId+" must not turn a bounded query into a historical zero",
    );
  }
});

test("retained KV plus bounded Gmail still cannot prove complete history",()=>{
  const input=fixture();
  input.sources=input.sources.map(source=>
    source.accessState==="READ_VERIFIED"?source:readable(source.sourceId,{
      coverage:source.sourceId==="CLOUDFLARE_KV"?"RETENTION_WINDOW":"COMPLETE",
    }));
  const result=reconcileEnquirySourceInventory(input);
  assert.equal(result.classificationStatus,"PARTIAL_COVERAGE_DEDUPE_REQUIRED");
  assert.deepEqual(result.partialCoverageSources,[
    "CLOUDFLARE_KV","NEWTON_REVENUE_GMAIL","PERSONAL_GMAIL",
  ]);
  assert.equal(result.genuineEnquiries,null);
  assert.equal(result.historicalEnquiryCount,null);
  assert.equal(result.automaticBuyerPromotion,false);
});

test("Cloudflare KV may never claim complete history from expiring records",()=>{
  const input=fixture();
  input.sources[0]=readable("CLOUDFLARE_KV",{coverage:"COMPLETE"});
  assert.throws(()=>reconcileEnquirySourceInventory(input),
    /expiring Cloudflare KV cannot claim complete historical coverage/);
});

test("an unreadable source cannot smuggle zero counts or verification claims",()=>{
  const input=fixture();
  input.sources[0]={...input.sources[0],observedCounts:zeroCounts()};
  assert.throws(()=>reconcileEnquirySourceInventory(input),
    /unreadable source counts must remain null/);

  const withTimestamp=fixture();
  withTimestamp.sources[0]={...withTimestamp.sources[0],verifiedAt:"2026-10-20T12:14:00.000Z"};
  assert.throws(()=>reconcileEnquirySourceInventory(withTimestamp),
    /cannot claim verification evidence/);
});

test("missing, duplicate, PII-bearing and public-locator inventories fail closed",()=>{
  const missing=fixture();
  missing.sources.pop();
  assert.throws(()=>reconcileEnquirySourceInventory(missing),
    /all required primary sources/);

  const duplicate=fixture();
  duplicate.sources[1]={...duplicate.sources[1],sourceId:"CLOUDFLARE_KV"};
  assert.throws(()=>reconcileEnquirySourceInventory(duplicate),
    /duplicate source inventory entry/);

  const pii=fixture();
  pii.sources[1]={...pii.sources[1],email:"person@example.com"};
  assert.throws(()=>reconcileEnquirySourceInventory(pii),
    /exact source fields/);

  const publicUrl=fixture();
  publicUrl.sources[1]={...publicUrl.sources[1],evidenceLocator:"https://mail.google.com/private"};
  assert.throws(()=>reconcileEnquirySourceInventory(publicUrl),
    /non-secret private evidence locator/);
});

test("counts and evidence must be bounded and canonical",()=>{
  const negative=fixture();
  negative.sources[1].observedCounts.GENUINE=-1;
  assert.throws(()=>reconcileEnquirySourceInventory(negative),
    /GENUINE count must be a non-negative integer/);

  const badDigest=fixture();
  badDigest.sources[1]={...badDigest.sources[1],evidenceDigest:"raw-message"};
  assert.throws(()=>reconcileEnquirySourceInventory(badDigest),
    /SHA-256 evidence digest/);

  const uppercaseDigest=fixture();
  uppercaseDigest.sources[1]={
    ...uppercaseDigest.sources[1],
    evidenceDigest:uppercaseDigest.sources[1].evidenceDigest.toUpperCase(),
  };
  assert.throws(
    ()=>reconcileEnquirySourceInventory(uppercaseDigest),
    /SHA-256 evidence digest/,
    "uppercase digest aliases must fail at the source inventory boundary",
  );

  const extra=fixture();
  extra.ownerEmail="person@example.com";
  assert.throws(()=>reconcileEnquirySourceInventory(extra),
    /exact inventory fields/);
});


test("readable counts require a canonical bounded evidence window",()=>{
  const backwards=fixture();
  backwards.sources[1]={
    ...backwards.sources[1],
    coverageStartedAt:"2026-10-20T12:14:00.000Z",
    coverageEndedAt:"2026-10-01T00:00:00.000Z",
  };
  assert.throws(()=>reconcileEnquirySourceInventory(backwards),
    /coverage window must be non-empty and move forwards/);

  const emptyWindow=fixture();
  emptyWindow.sources[1]={
    ...emptyWindow.sources[1],
    coverageStartedAt:emptyWindow.sources[1].coverageEndedAt,
  };
  assert.throws(
    ()=>reconcileEnquirySourceInventory(emptyWindow),
    /coverage window must be non-empty and move forwards/,
    "a zero-duration query cannot support a verified source count",
  );

  const future=fixture();
  future.sources[1]={
    ...future.sources[1],coverageEndedAt:"2026-10-20T12:14:01.000Z",
  };
  assert.throws(()=>reconcileEnquirySourceInventory(future),
    /coverage cannot end after verification/);

  const unreadableWindow=fixture();
  unreadableWindow.sources[0]={
    ...unreadableWindow.sources[0],coverageStartedAt:"2026-10-01T00:00:00.000Z",
  };
  assert.throws(()=>reconcileEnquirySourceInventory(unreadableWindow),
    /unreadable source cannot claim a coverage window/);
});


test("one evidence snapshot cannot be counted under multiple primary sources",()=>{
  const duplicateLocator=fixture();
  duplicateLocator.sources[2]={
    ...duplicateLocator.sources[2],
    evidenceLocator:duplicateLocator.sources[1].evidenceLocator,
  };
  assert.throws(
    ()=>reconcileEnquirySourceInventory(duplicateLocator),
    /evidence locator cannot be reused across sources/,
  );

  const duplicateDigest=fixture();
  duplicateDigest.sources[2]={
    ...duplicateDigest.sources[2],
    evidenceDigest:duplicateDigest.sources[1].evidenceDigest,
  };
  assert.throws(
    ()=>reconcileEnquirySourceInventory(duplicateDigest),
    /evidence digest cannot be reused across sources/,
  );
});
