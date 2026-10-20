import test from "node:test";
import assert from "node:assert/strict";
import {reconcileEnquirySourceInventory} from "../lib/enquiry-source-inventory.js";

const zeroCounts=()=>({
  GENUINE:0,
  CANDIDATE:0,
  SYNTHETIC:0,
  NON_ENQUIRY_ACTIVITY:0,
  OUTBOUND_PROSPECT:0,
  UNKNOWN:0,
});
const readable=(sourceId,overrides={})=>({
  sourceId,
  accessState:"READ_VERIFIED",
  coverage:"COMPLETE",
  evidenceLocator:`private://${sourceId.toLowerCase().replaceAll("_","-")}/aggregate`,
  observedCounts:zeroCounts(),
  verifiedAt:"2026-10-20T12:14:00.000Z",
  evidenceDigest:"a".repeat(64),
  ...overrides,
});
const unreadable=sourceId=>({
  sourceId,
  accessState:"UNKNOWN_UNREADABLE",
  coverage:"UNREADABLE",
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
    readable("PERSONAL_GMAIL",{coverage:"SEARCH_WINDOW",observedCounts:{...zeroCounts(),UNKNOWN:1}}),
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
  });
  assert.equal(result.automaticBuyerPromotion,false);
  assert.equal(result.customerDataCopied,false);
  assert.equal(result.productionMutation,false);
  assert.equal(result.customerDelivery,"HOLD");
});

test("bounded Gmail searches remain partial even when every source is readable",()=>{
  const input=fixture();
  input.sources=input.sources.map(source=>
    source.accessState==="READ_VERIFIED"?source:readable(source.sourceId));
  const result=reconcileEnquirySourceInventory(input);
  assert.equal(result.classificationStatus,"PARTIAL_COVERAGE_DEDUPE_REQUIRED");
  assert.equal(result.genuineEnquiries,null);
  assert.deepEqual(result.unreadableSources,[]);
  assert.deepEqual(result.partialCoverageSources,[
    "NEWTON_REVENUE_GMAIL","PERSONAL_GMAIL",
  ]);
  assert.equal(result.automaticBuyerPromotion,false);
});

test("all sources fully read still require cross-source deduplication",()=>{
  const input=fixture();
  input.sources=input.sources.map(source=>readable(source.sourceId));
  const result=reconcileEnquirySourceInventory(input);
  assert.equal(result.classificationStatus,"ALL_SOURCES_READ_DEDUPE_REQUIRED");
  assert.deepEqual(result.partialCoverageSources,[]);
  assert.equal(result.genuineEnquiries,null);
  assert.equal(result.automaticBuyerPromotion,false);
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

  const extra=fixture();
  extra.ownerEmail="person@example.com";
  assert.throws(()=>reconcileEnquirySourceInventory(extra),
    /exact inventory fields/);
});
