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
const zeroOriginClassCounts=()=>({
  DIRECT_INBOUND:0,
  REPLY_TO_OUTBOUND:0,
  SYSTEM_AUTOMATION:0,
  MARKETING_OR_NEWSLETTER:0,
  SUPPORT_OR_TRANSACTIONAL:0,
  UNKNOWN_ORIGIN:0,
});
const originClassCountsFor=source=>{
  const directInbound=source.observedCounts.GENUINE+
    source.observedCounts.CANDIDATE;
  const replyToOutbound=source.observedCounts.OUTBOUND_REPLY;
  const systemAutomation=source.observedCounts.NON_ENQUIRY_ACTIVITY;
  return {
    ...zeroOriginClassCounts(),
    DIRECT_INBOUND:directInbound,
    REPLY_TO_OUTBOUND:replyToOutbound,
    SYSTEM_AUTOMATION:systemAutomation,
    UNKNOWN_ORIGIN:source.observedRecordCount-directInbound-
      replyToOutbound-systemAutomation,
  };
};
const gmailQueryDigestFor=source=>createHash("sha256").update(JSON.stringify({
  sourceId:source.sourceId,
  accountIdentityDigest:source.accountIdentityDigest,
  coverageStartedAt:source.coverageStartedAt,
  coverageEndedAt:source.coverageEndedAt,
  searchScope:source.searchScope,
})).digest("hex");
const evidenceDigestFor=source=>createHash("sha256").update(JSON.stringify({
  sourceId:source.sourceId,
  accessState:source.accessState,
  coverage:source.coverage,
  coverageStartedAt:source.coverageStartedAt,
  coverageEndedAt:source.coverageEndedAt,
  evidenceLocator:source.evidenceLocator,
  searchScope:source.searchScope,
  accountIdentityDigest:source.accountIdentityDigest,
  searchQueryDigest:source.searchQueryDigest,
  paginationComplete:source.paginationComplete,
  terminalPageTokenAbsent:source.terminalPageTokenAbsent,
  paginationTraversalDigest:source.paginationTraversalDigest,
  paginationRecordAssignmentDigest:source.paginationRecordAssignmentDigest,
  pageRecordCounts:source.pageRecordCounts,
  deduplicatedRecordIdsDigest:source.deduplicatedRecordIdsDigest,
  deduplicatedRecordCount:source.deduplicatedRecordCount,
  recordTimestampDigest:source.recordTimestampDigest,
  recordIdTimestampPairsDigest:source.recordIdTimestampPairsDigest,
  recordIdClassificationPairsDigest:source.recordIdClassificationPairsDigest,
  recordIdInboxLabelPairsDigest:source.recordIdInboxLabelPairsDigest,
  recordIdOriginClassPairsDigest:source.recordIdOriginClassPairsDigest,
  recordIdClassificationOriginTriplesDigest:
    source.recordIdClassificationOriginTriplesDigest,
  recordIdTimestampClassificationOriginTuplesDigest:
    source.recordIdTimestampClassificationOriginTuplesDigest,
  originClassCounts:source.originClassCounts===null?null:
    Object.fromEntries(Object.keys(zeroOriginClassCounts()).map(key=>[
      key,source.originClassCounts[key],
    ])),
  allRecordsWithinCoverageWindow:source.allRecordsWithinCoverageWindow,
  observedRecordCount:source.observedRecordCount,
  observedCounts:Object.fromEntries(Object.keys(zeroCounts()).map(key=>[
    key,source.observedCounts[key],
  ])),
  verifiedAt:source.verifiedAt,
})).digest("hex");
const readable=(sourceId,overrides={})=>{
  const source={
    sourceId,
    accessState:"READ_VERIFIED",
    coverage:"COMPLETE",
    coverageStartedAt:"2026-10-01T00:00:00.000Z",
    coverageEndedAt:"2026-10-20T12:13:59.000Z",
    evidenceLocator:`private://${sourceId.toLowerCase().replaceAll("_","-")}/aggregate`,
    searchScope:["NEWTON_REVENUE_GMAIL","PERSONAL_GMAIL"].includes(sourceId)?
      "INBOX_ONLY_ALL_SENDERS_EXCLUDING_SPAM_TRASH":null,
    accountIdentityDigest:null,
    searchQueryDigest:null,
    paginationComplete:["NEWTON_REVENUE_GMAIL","PERSONAL_GMAIL"].includes(sourceId)?
      true:null,
    terminalPageTokenAbsent:["NEWTON_REVENUE_GMAIL","PERSONAL_GMAIL"].includes(sourceId)?
      true:null,
    paginationTraversalDigest:["NEWTON_REVENUE_GMAIL","PERSONAL_GMAIL"].includes(sourceId)?
      createHash("sha256").update(sourceId+":CURSOR-CHAIN").digest("hex"):null,
    paginationRecordAssignmentDigest:
      ["NEWTON_REVENUE_GMAIL","PERSONAL_GMAIL"].includes(sourceId)?
        createHash("sha256").update(sourceId+":PAGE-RECORD-ASSIGNMENTS").digest("hex"):
        null,
    pageRecordCounts:null,
    deduplicatedRecordIdsDigest:null,
    deduplicatedRecordCount:null,
    recordTimestampDigest:null,
    recordIdTimestampPairsDigest:null,
    recordIdClassificationPairsDigest:null,
    recordIdInboxLabelPairsDigest:null,
    recordIdOriginClassPairsDigest:null,
    recordIdClassificationOriginTriplesDigest:null,
    recordIdTimestampClassificationOriginTuplesDigest:null,
    originClassCounts:null,
    allRecordsWithinCoverageWindow:null,
    observedCounts:zeroCounts(),
    verifiedAt:"2026-10-20T12:14:00.000Z",
    ...overrides,
  };
  source.observedRecordCount=Object.hasOwn(overrides,"observedRecordCount")?
    overrides.observedRecordCount:
    Object.values(source.observedCounts).reduce((total,count)=>total+count,0);
  if(["NEWTON_REVENUE_GMAIL","PERSONAL_GMAIL"].includes(sourceId)){
    source.accountIdentityDigest=Object.hasOwn(overrides,"accountIdentityDigest")?
      overrides.accountIdentityDigest:createHash("sha256")
        .update(sourceId+":ACCOUNT").digest("hex");
    source.searchQueryDigest=Object.hasOwn(overrides,"searchQueryDigest")?
      overrides.searchQueryDigest:gmailQueryDigestFor(source);
    source.pageRecordCounts=Object.hasOwn(overrides,"pageRecordCounts")?
      overrides.pageRecordCounts:[source.observedRecordCount];
    source.deduplicatedRecordIdsDigest=Object.hasOwn(
      overrides,"deduplicatedRecordIdsDigest",
    )?overrides.deduplicatedRecordIdsDigest:createHash("sha256")
      .update(sourceId+":"+source.observedRecordCount).digest("hex");
    source.deduplicatedRecordCount=Object.hasOwn(
      overrides,"deduplicatedRecordCount",
    )?overrides.deduplicatedRecordCount:source.observedRecordCount;
    source.recordTimestampDigest=Object.hasOwn(
      overrides,"recordTimestampDigest",
    )?overrides.recordTimestampDigest:createHash("sha256")
      .update(sourceId+":"+source.coverageStartedAt+":"+
        source.coverageEndedAt+":"+source.observedRecordCount).digest("hex");
    source.recordIdTimestampPairsDigest=Object.hasOwn(
      overrides,"recordIdTimestampPairsDigest",
    )?overrides.recordIdTimestampPairsDigest:createHash("sha256")
      .update(sourceId+":ID-TIMESTAMP-PAIRS:"+source.observedRecordCount).digest("hex");
    source.recordIdClassificationPairsDigest=Object.hasOwn(
      overrides,"recordIdClassificationPairsDigest",
    )?overrides.recordIdClassificationPairsDigest:createHash("sha256")
      .update(sourceId+":ID-CLASSIFICATION-PAIRS:"+
        JSON.stringify(source.observedCounts)).digest("hex");
    source.recordIdInboxLabelPairsDigest=Object.hasOwn(
      overrides,"recordIdInboxLabelPairsDigest",
    )?overrides.recordIdInboxLabelPairsDigest:createHash("sha256")
      .update(sourceId+":ID-INBOX-LABEL-PAIRS:"+source.observedRecordCount)
      .digest("hex");
    source.recordIdOriginClassPairsDigest=Object.hasOwn(
      overrides,"recordIdOriginClassPairsDigest",
    )?overrides.recordIdOriginClassPairsDigest:createHash("sha256")
      .update(sourceId+":ID-ORIGIN-CLASS-PAIRS:"+source.observedRecordCount)
      .digest("hex");
    source.originClassCounts=Object.hasOwn(overrides,"originClassCounts")?
      overrides.originClassCounts:originClassCountsFor(source);
    source.recordIdClassificationOriginTriplesDigest=Object.hasOwn(
      overrides,"recordIdClassificationOriginTriplesDigest",
    )?overrides.recordIdClassificationOriginTriplesDigest:createHash("sha256")
      .update(sourceId+":ID-CLASSIFICATION-ORIGIN-TRIPLES:"+
        JSON.stringify(source.observedCounts)+":"+
        JSON.stringify(source.originClassCounts)).digest("hex");
    source.recordIdTimestampClassificationOriginTuplesDigest=Object.hasOwn(
      overrides,"recordIdTimestampClassificationOriginTuplesDigest",
    )?overrides.recordIdTimestampClassificationOriginTuplesDigest:
      createHash("sha256")
        .update(sourceId+":ID-TIMESTAMP-CLASSIFICATION-ORIGIN-TUPLES:"+
          source.recordIdTimestampPairsDigest+":"+
          source.recordIdClassificationOriginTriplesDigest).digest("hex");
    source.allRecordsWithinCoverageWindow=Object.hasOwn(
      overrides,"allRecordsWithinCoverageWindow",
    )?overrides.allRecordsWithinCoverageWindow:true;
  }
  source.evidenceDigest=Object.hasOwn(overrides,"evidenceDigest")?
    overrides.evidenceDigest:evidenceDigestFor(source);
  return source;
};
const unreadable=sourceId=>({
  sourceId,
  accessState:"UNKNOWN_UNREADABLE",
  coverage:"UNREADABLE",
  coverageStartedAt:null,
  coverageEndedAt:null,
  evidenceLocator:`private://${sourceId.toLowerCase().replaceAll("_","-")}/unreadable`,
  searchScope:null,
  accountIdentityDigest:null,
  searchQueryDigest:null,
  paginationComplete:null,
  terminalPageTokenAbsent:null,
  paginationTraversalDigest:null,
  paginationRecordAssignmentDigest:null,
  pageRecordCounts:null,
  deduplicatedRecordIdsDigest:null,
  deduplicatedRecordCount:null,
  recordTimestampDigest:null,
  recordIdTimestampPairsDigest:null,
  recordIdClassificationPairsDigest:null,
  recordIdInboxLabelPairsDigest:null,
  recordIdOriginClassPairsDigest:null,
  recordIdClassificationOriginTriplesDigest:null,
  recordIdTimestampClassificationOriginTuplesDigest:null,
  originClassCounts:null,
  allRecordsWithinCoverageWindow:null,
  observedRecordCount:null,
  observedCounts:Object.fromEntries(Object.keys(zeroCounts()).map(key=>[key,null])),
  verifiedAt:null,
  evidenceDigest:null,
});
const fixture=()=>({
  version:1,
  claimedEnquiries:30,
  reconciledAt:"2026-10-20T12:14:00.000Z",
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
  assert.equal(result.reconciledAt,"2026-10-20T12:14:00.000Z");
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
  salesDesk.observedRecordCount=3;
  salesDesk.evidenceDigest=evidenceDigestFor(salesDesk);
  const result=reconcileEnquirySourceInventory(input);
  assert.equal(result.classificationStatus,"UNKNOWN_CLASSIFICATION_REVIEW");
  assert.equal(result.accessibleCandidateObservations,1);
  assert.equal(result.accessibleUnknownObservations,2);
  assert.equal(result.unresolvedAccessibleClassifications,3);
  assert.equal(result.genuineEnquiries,null);
  assert.equal(result.automaticBuyerPromotion,false);
});

test("unreadable stores cannot hide readable classification review",()=>{
  const input=fixture();
  const salesDesk=input.sources.find(source=>source.sourceId==="SALES_DESK");
  salesDesk.observedCounts={...zeroCounts(),CANDIDATE:1,UNKNOWN:2};
  salesDesk.observedRecordCount=3;
  salesDesk.evidenceDigest=evidenceDigestFor(salesDesk);
  const result=reconcileEnquirySourceInventory(input);
  assert.equal(
    result.classificationStatus,
    "UNKNOWN_UNREADABLE_AND_CLASSIFICATION_REVIEW",
  );
  assert.equal(result.unresolvedAccessibleClassifications,3);
  assert.ok(result.unreadableSources.length>0);
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
  negative.sources[1].evidenceDigest=evidenceDigestFor(negative.sources[1]);
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
  backwards.sources[1].searchQueryDigest=gmailQueryDigestFor(backwards.sources[1]);
  assert.throws(()=>reconcileEnquirySourceInventory(backwards),
    /coverage window must be non-empty and move forwards/);

  const emptyWindow=fixture();
  emptyWindow.sources[1]={
    ...emptyWindow.sources[1],
    coverageStartedAt:emptyWindow.sources[1].coverageEndedAt,
  };
  emptyWindow.sources[1].searchQueryDigest=gmailQueryDigestFor(emptyWindow.sources[1]);
  assert.throws(
    ()=>reconcileEnquirySourceInventory(emptyWindow),
    /coverage window must be non-empty and move forwards/,
    "a zero-duration query cannot support a verified source count",
  );

  const tinyGmailWindow=fixture();
  tinyGmailWindow.sources[1].coverageStartedAt="2026-10-20T12:13:58.000Z";
  tinyGmailWindow.sources[1].searchQueryDigest=
    gmailQueryDigestFor(tinyGmailWindow.sources[1]);
  tinyGmailWindow.sources[1].evidenceDigest=
    evidenceDigestFor(tinyGmailWindow.sources[1]);
  assert.throws(
    ()=>reconcileEnquirySourceInventory(tinyGmailWindow),
    /Gmail search window must cover at least one hour/,
    "a tiny zero-result inbox query cannot support a meaningful source snapshot",
  );

  const future=fixture();
  future.sources[1]={
    ...future.sources[1],coverageEndedAt:"2026-10-20T12:14:01.000Z",
  };
  future.sources[1].searchQueryDigest=gmailQueryDigestFor(future.sources[1]);
  assert.throws(()=>reconcileEnquirySourceInventory(future),
    /coverage cannot end after verification/);

  const unreadableWindow=fixture();
  unreadableWindow.sources[0]={
    ...unreadableWindow.sources[0],coverageStartedAt:"2026-10-01T00:00:00.000Z",
  };
  assert.throws(()=>reconcileEnquirySourceInventory(unreadableWindow),
    /unreadable source cannot claim a coverage window/);
});

test("fresh attestation cannot disguise an obsolete source coverage window",()=>{
  const input=fixture();
  input.sources[1].coverageEndedAt="2026-10-20T11:58:59.000Z";
  input.sources[1].searchQueryDigest=gmailQueryDigestFor(input.sources[1]);
  input.sources[1].evidenceDigest=evidenceDigestFor(input.sources[1]);
  assert.throws(
    ()=>reconcileEnquirySourceInventory(input),
    /readable source coverage is stale at verification/,
    "a newly attested old query window must not support current source truth",
  );
});

test("readable source evidence must be fresh at reconciliation time",()=>{
  const stale=fixture();
  stale.reconciledAt="2026-10-20T12:30:01.000Z";
  assert.throws(
    ()=>reconcileEnquirySourceInventory(stale),
    /readable source evidence is stale for this reconciliation/,
  );

  const future=fixture();
  future.reconciledAt="2026-10-20T12:13:59.000Z";
  assert.throws(
    ()=>reconcileEnquirySourceInventory(future),
    /source verification cannot be in the reconciliation future/,
  );

  const malformed=fixture();
  malformed.reconciledAt="20 October 2026 12:14 UTC";
  assert.throws(
    ()=>reconcileEnquirySourceInventory(malformed),
    /canonical inventory reconciliation timestamp required/,
  );
});


test("evidence locator must remain scoped to its declared source",()=>{
  const input=fixture();
  const personal=input.sources.find(source=>source.sourceId==="PERSONAL_GMAIL");
  personal.evidenceLocator="private://newton-revenue-gmail/personal-window";
  personal.evidenceDigest=evidenceDigestFor(personal);
  assert.throws(
    ()=>reconcileEnquirySourceInventory(input),
    /evidence locator must be scoped to its declared source/,
  );
});

test("one evidence snapshot cannot be counted under multiple primary sources",()=>{
  const duplicateLocator=fixture();
  duplicateLocator.sources[2]={
    ...duplicateLocator.sources[2],
    evidenceLocator:duplicateLocator.sources[1].evidenceLocator,
  };
  assert.throws(
    ()=>reconcileEnquirySourceInventory(duplicateLocator),
    /evidence locator (must be scoped to its declared source|cannot be reused across sources)/,
  );

  const duplicateDigest=fixture();
  duplicateDigest.sources[2]={
    ...duplicateDigest.sources[2],
    evidenceDigest:duplicateDigest.sources[1].evidenceDigest,
  };
  assert.throws(
    ()=>reconcileEnquirySourceInventory(duplicateDigest),
    /evidence digest does not bind the exact source observation/,
    "copying another source's digest must fail before it can support counts",
  );
});



test("readable source digest binds counts and timestamps to the exact observation",()=>{
  const changedCount=fixture();
  changedCount.sources[1].observedCounts.GENUINE=1;
  changedCount.sources[1].observedRecordCount=1;
  changedCount.sources[1].pageRecordCounts=[1];
  changedCount.sources[1].deduplicatedRecordCount=1;
  changedCount.sources[1].originClassCounts={
    ...zeroOriginClassCounts(),
    DIRECT_INBOUND:1,
  };
  assert.throws(
    ()=>reconcileEnquirySourceInventory(changedCount),
    /evidence digest does not bind the exact source observation/,
    "changing a count without re-attesting the snapshot must fail closed",
  );

  const changedVerification=fixture();
  changedVerification.reconciledAt="2026-10-20T12:15:00.000Z";
  changedVerification.sources[1].verifiedAt="2026-10-20T12:14:01.000Z";
  assert.throws(
    ()=>reconcileEnquirySourceInventory(changedVerification),
    /evidence digest does not bind the exact source observation/,
    "changing evidence time without re-attesting the snapshot must fail closed",
  );
});


test("aggregate source counts cannot overflow the safe integer range",()=>{
  const input=fixture();
  for(const sourceId of ["NEWTON_REVENUE_GMAIL","PERSONAL_GMAIL"]){
    const source=input.sources.find(item=>item.sourceId===sourceId);
    source.observedCounts={...zeroCounts(),GENUINE:Number.MAX_SAFE_INTEGER};
    source.observedRecordCount=Number.MAX_SAFE_INTEGER;
    source.pageRecordCounts=[Number.MAX_SAFE_INTEGER];
    source.deduplicatedRecordCount=Number.MAX_SAFE_INTEGER;
    source.originClassCounts=originClassCountsFor(source);
    source.evidenceDigest=evidenceDigestFor(source);
  }
  assert.throws(
    ()=>reconcileEnquirySourceInventory(input),
    /GENUINE aggregate count exceeds safe integer range/,
    "individually valid source counts must not produce a rounded aggregate",
  );
});


test("combined unresolved classifications cannot overflow the safe integer range",()=>{
  const input=fixture();
  const revenue=input.sources.find(
    source=>source.sourceId==="NEWTON_REVENUE_GMAIL",
  );
  const personal=input.sources.find(
    source=>source.sourceId==="PERSONAL_GMAIL",
  );
  revenue.observedCounts={...zeroCounts(),CANDIDATE:Number.MAX_SAFE_INTEGER};
  revenue.observedRecordCount=Number.MAX_SAFE_INTEGER;
  revenue.pageRecordCounts=[Number.MAX_SAFE_INTEGER];
  revenue.deduplicatedRecordCount=Number.MAX_SAFE_INTEGER;
  revenue.originClassCounts=originClassCountsFor(revenue);
  revenue.evidenceDigest=evidenceDigestFor(revenue);
  personal.observedCounts={...zeroCounts(),UNKNOWN:1};
  personal.observedRecordCount=1;
  personal.pageRecordCounts=[1];
  personal.deduplicatedRecordCount=1;
  personal.originClassCounts=originClassCountsFor(personal);
  personal.evidenceDigest=evidenceDigestFor(personal);
  assert.throws(
    ()=>reconcileEnquirySourceInventory(input),
    /UNRESOLVED_CLASSIFICATION aggregate count exceeds safe integer range/,
    "candidate and unknown totals must not combine into a rounded unresolved count",
  );
});


test("one observed record cannot be counted in multiple classifications",()=>{
  const input=fixture();
  const personal=input.sources.find(
    source=>source.sourceId==="PERSONAL_GMAIL",
  );
  personal.observedCounts={
    ...zeroCounts(),
    GENUINE:1,
    OUTBOUND_REPLY:1,
  };
  personal.observedRecordCount=1;
  personal.evidenceDigest=evidenceDigestFor(personal);
  assert.throws(
    ()=>reconcileEnquirySourceInventory(input),
    /each observed record must have exactly one classification/,
    "one message cannot simultaneously inflate genuine and outbound-reply totals",
  );
});


test("bounded Gmail evidence cannot narrow the sender or category scope",()=>{
  const narrowed=fixture();
  narrowed.sources[1].searchScope="KNOWN_SENDERS_ONLY";
  narrowed.sources[1].evidenceDigest=evidenceDigestFor(narrowed.sources[1]);
  assert.throws(
    ()=>reconcileEnquirySourceInventory(narrowed),
    /source search scope must be complete and allowlisted/,
    "a filtered zero-result query cannot support a source-wide zero",
  );

  const nonGmailScope=fixture();
  const salesDesk=nonGmailScope.sources.find(source=>source.sourceId==="SALES_DESK");
  salesDesk.searchScope="INBOX_ONLY_ALL_SENDERS_EXCLUDING_SPAM_TRASH";
  salesDesk.evidenceDigest=evidenceDigestFor(salesDesk);
  assert.throws(
    ()=>reconcileEnquirySourceInventory(nonGmailScope),
    /source search scope must be complete and allowlisted/,
  );
});


test("source inventory accepts inert null-prototype records",()=>{
  const input=Object.assign(Object.create(null),fixture());
  const result=reconcileEnquirySourceInventory(input);
  assert.equal(result.customerDelivery,"HOLD");
  assert.equal(result.productionMutation,false);
});

test("inventory and source records reject active object shapes without running getters",()=>{
  const inherited=Object.assign(Object.create({claimedEnquiries:999}),fixture());
  assert.throws(
    ()=>reconcileEnquirySourceInventory(inherited),
    /exact inventory fields required/,
  );

  const input=fixture();
  let accessed=false;
  const activeSource={...input.sources[1]};
  Object.defineProperty(activeSource,"sourceId",{
    enumerable:true,
    get(){
      accessed=true;
      return "NEWTON_REVENUE_GMAIL";
    },
  });
  input.sources[1]=activeSource;
  assert.throws(
    ()=>reconcileEnquirySourceInventory(input),
    /exact source fields required/,
  );
  assert.equal(accessed,false,"source getters must never execute at the trust boundary");
});

test("classification maps reject active object shapes without running getters",()=>{
  const inherited=fixture();
  inherited.sources[1].observedCounts=Object.assign(
    Object.create({GENUINE:999}),
    inherited.sources[1].observedCounts,
  );
  assert.throws(
    ()=>reconcileEnquirySourceInventory(inherited),
    /exact classification counts required/,
  );

  const input=fixture();
  let accessed=false;
  const activeCounts={...input.sources[1].observedCounts};
  Object.defineProperty(activeCounts,"GENUINE",{
    enumerable:true,
    get(){
      accessed=true;
      return 0;
    },
  });
  input.sources[1].observedCounts=activeCounts;
  assert.throws(
    ()=>reconcileEnquirySourceInventory(input),
    /exact classification counts required/,
  );
  assert.equal(accessed,false,"classification getters must never execute");
});

test("source arrays reject sparse or accessor-backed elements",()=>{
  const sparse=fixture();
  sparse.sources=Array(7);
  assert.throws(
    ()=>reconcileEnquirySourceInventory(sparse),
    /bounded inert source array required/,
    "array length alone cannot represent the seven required sources",
  );

  const active=fixture();
  let accessed=false;
  const activeSources=[...active.sources];
  Object.defineProperty(activeSources,"0",{
    enumerable:true,
    get(){
      accessed=true;
      return unreadable("CLOUDFLARE_KV");
    },
  });
  active.sources=activeSources;
  assert.throws(
    ()=>reconcileEnquirySourceInventory(active),
    /bounded inert source array required/,
  );
  assert.equal(accessed,false,"source-array getters must never execute");
});



test("inventory boundaries reject hidden symbol and non-enumerable fields",()=>{
  const symbolInventory=fixture();
  symbolInventory[Symbol("privatePayload")]="hidden";
  assert.throws(
    ()=>reconcileEnquirySourceInventory(symbolInventory),
    /exact inventory fields required/,
    "symbol-backed data cannot bypass the exact inventory schema",
  );

  const hiddenSource=fixture();
  Object.defineProperty(hiddenSource.sources[1],"privatePayload",{
    enumerable:false,
    value:"hidden",
  });
  assert.throws(
    ()=>reconcileEnquirySourceInventory(hiddenSource),
    /exact source fields required/,
    "non-enumerable source data cannot bypass the privacy-safe source schema",
  );

  const symbolCounts=fixture();
  symbolCounts.sources[1].observedCounts[Symbol("unclassified")]=1;
  assert.throws(
    ()=>reconcileEnquirySourceInventory(symbolCounts),
    /exact classification counts required/,
    "hidden classification buckets cannot evade record-count reconciliation",
  );
});

test("Gmail evidence is bound to the exact account and declared search window",()=>{
  const baseline=reconcileEnquirySourceInventory(fixture());
  assert.equal(baseline.sourceCoverage.NEWTON_REVENUE_GMAIL.accountIdentityBound,true);
  assert.equal(baseline.sourceCoverage.NEWTON_REVENUE_GMAIL.searchQueryBound,true);

  const missingAccount=fixture();
  const revenue=missingAccount.sources.find(
    source=>source.sourceId==="NEWTON_REVENUE_GMAIL",
  );
  revenue.accountIdentityDigest=null;
  revenue.searchQueryDigest=gmailQueryDigestFor(revenue);
  revenue.evidenceDigest=evidenceDigestFor(revenue);
  assert.throws(
    ()=>reconcileEnquirySourceInventory(missingAccount),
    /account identity digest required/,
  );

  const replayedWindow=fixture();
  const personal=replayedWindow.sources.find(
    source=>source.sourceId==="PERSONAL_GMAIL",
  );
  personal.coverageStartedAt="2026-10-20T10:00:00.000Z";
  personal.evidenceDigest=evidenceDigestFor(personal);
  assert.throws(
    ()=>reconcileEnquirySourceInventory(replayedWindow),
    /search-query digest must bind account, source and coverage window/,
    "a previously attested query cannot be replayed under another window",
  );

  const collapsedProof=fixture();
  const collapsed=collapsedProof.sources.find(
    source=>source.sourceId==="PERSONAL_GMAIL",
  );
  collapsed.searchQueryDigest=collapsed.accountIdentityDigest;
  collapsed.evidenceDigest=evidenceDigestFor(collapsed);
  assert.throws(
    ()=>reconcileEnquirySourceInventory(collapsedProof),
    /independently bound/,
  );

  const nonGmail=fixture();
  const salesDesk=nonGmail.sources.find(source=>source.sourceId==="SALES_DESK");
  salesDesk.accountIdentityDigest="e".repeat(64);
  salesDesk.searchQueryDigest="f".repeat(64);
  salesDesk.evidenceDigest=evidenceDigestFor(salesDesk);
  assert.throws(
    ()=>reconcileEnquirySourceInventory(nonGmail),
    /non-Gmail sources cannot claim Gmail pagination proof/,
  );
});

test("Gmail source truth fails closed until every result page is consumed",()=>{
  for(const paginationComplete of [false,null]){
    const input=fixture();
    input.sources[1].paginationComplete=paginationComplete;
    input.sources[1].evidenceDigest=evidenceDigestFor(input.sources[1]);
    assert.throws(
      ()=>reconcileEnquirySourceInventory(input),
      /Gmail evidence must be fully paginated/,
      "a first-page count cannot be attested as the complete bounded snapshot",
    );
  }

  const nonGmail=fixture();
  const salesDesk=nonGmail.sources.find(source=>source.sourceId==="SALES_DESK");
  salesDesk.paginationComplete=true;
  salesDesk.evidenceDigest=evidenceDigestFor(salesDesk);
  assert.throws(
    ()=>reconcileEnquirySourceInventory(nonGmail),
    /other sources must use null/,
    "pagination claims are reserved for bounded Gmail evidence",
  );
});

test("Gmail pagination proof binds dense page totals and deduplicated IDs",()=>{
  const mismatched=fixture();
  const source=mismatched.sources.find(
    item=>item.sourceId==="NEWTON_REVENUE_GMAIL",
  );
  source.pageRecordCounts=[1];
  source.evidenceDigest=evidenceDigestFor(source);
  assert.throws(
    ()=>reconcileEnquirySourceInventory(mismatched),
    /Gmail page totals must equal the observed record count/,
  );

  const emptyPages=fixture();
  const emptySource=emptyPages.sources.find(
    item=>item.sourceId==="NEWTON_REVENUE_GMAIL",
  );
  emptySource.pageRecordCounts=[];
  emptySource.evidenceDigest=evidenceDigestFor(emptySource);
  assert.throws(
    ()=>reconcileEnquirySourceInventory(emptyPages),
    /bounded dense per-page record counts/,
  );

  let getterRuns=0;
  const activePages=fixture();
  const activeSource=activePages.sources.find(
    item=>item.sourceId==="NEWTON_REVENUE_GMAIL",
  );
  const pages=[0];
  Object.defineProperty(pages,"0",{
    enumerable:true,
    get(){
      getterRuns++;
      return 0;
    },
  });
  activeSource.pageRecordCounts=pages;
  activeSource.evidenceDigest=evidenceDigestFor(activeSource);
  getterRuns=0;
  assert.throws(
    ()=>reconcileEnquirySourceInventory(activePages),
    /bounded dense per-page record counts/,
  );
  assert.equal(getterRuns,0,"page-count getter must not execute");

  const noIdDigest=fixture();
  const noDigestSource=noIdDigest.sources.find(
    item=>item.sourceId==="NEWTON_REVENUE_GMAIL",
  );
  noDigestSource.deduplicatedRecordIdsDigest=null;
  noDigestSource.evidenceDigest=evidenceDigestFor(noDigestSource);
  assert.throws(
    ()=>reconcileEnquirySourceInventory(noIdDigest),
    /deduplicated record ID digest required/,
  );

  const nonGmailProof=fixture();
  const salesDesk=nonGmailProof.sources.find(
    item=>item.sourceId==="SALES_DESK",
  );
  salesDesk.pageRecordCounts=[salesDesk.observedRecordCount];
  salesDesk.deduplicatedRecordIdsDigest="f".repeat(64);
  salesDesk.evidenceDigest=evidenceDigestFor(salesDesk);
  assert.throws(
    ()=>reconcileEnquirySourceInventory(nonGmailProof),
    /non-Gmail sources cannot claim Gmail pagination proof/,
  );

  const unreadableProof=fixture();
  unreadableProof.sources[0]={
    ...unreadableProof.sources[0],
    pageRecordCounts:[0],
    deduplicatedRecordIdsDigest:"f".repeat(64),
  };
  assert.throws(
    ()=>reconcileEnquirySourceInventory(unreadableProof),
    /unreadable source cannot claim pagination proof/,
  );
});



test("Gmail pagination proof requires the deduplicated ID count to match classifications",()=>{
  const duplicated=fixture();
  const gmail=duplicated.sources.find(
    source=>source.sourceId==="PERSONAL_GMAIL",
  );
  gmail.deduplicatedRecordCount=0;
  gmail.evidenceDigest=evidenceDigestFor(gmail);
  assert.throws(
    ()=>reconcileEnquirySourceInventory(duplicated),
    /deduplicated record count must equal the observed record count/,
    "duplicate IDs across pages cannot inflate classified enquiry evidence",
  );

  const invalidCount=fixture();
  const revenue=invalidCount.sources.find(
    source=>source.sourceId==="NEWTON_REVENUE_GMAIL",
  );
  revenue.deduplicatedRecordCount=-1;
  revenue.evidenceDigest=evidenceDigestFor(revenue);
  assert.throws(
    ()=>reconcileEnquirySourceInventory(invalidCount),
    /deduplicated record count must be a non-negative integer/,
  );

  const nonGmail=fixture();
  const salesDesk=nonGmail.sources.find(
    source=>source.sourceId==="SALES_DESK",
  );
  salesDesk.deduplicatedRecordCount=0;
  salesDesk.evidenceDigest=evidenceDigestFor(salesDesk);
  assert.throws(
    ()=>reconcileEnquirySourceInventory(nonGmail),
    /non-Gmail sources cannot claim Gmail pagination proof/,
  );
});


test("Gmail records must be cryptographically bound inside the declared window",()=>{
  const missingDigest=fixture();
  const revenue=missingDigest.sources.find(
    source=>source.sourceId==="NEWTON_REVENUE_GMAIL",
  );
  revenue.recordTimestampDigest=null;
  revenue.evidenceDigest=evidenceDigestFor(revenue);
  assert.throws(
    ()=>reconcileEnquirySourceInventory(missingDigest),
    /record timestamp digest required/,
  );

  const outsideWindow=fixture();
  const personal=outsideWindow.sources.find(
    source=>source.sourceId==="PERSONAL_GMAIL",
  );
  personal.allRecordsWithinCoverageWindow=false;
  personal.evidenceDigest=evidenceDigestFor(personal);
  assert.throws(
    ()=>reconcileEnquirySourceInventory(outsideWindow),
    /every Gmail record must be proven inside the declared coverage window/,
    "a complete page traversal cannot count records outside its attested window",
  );

  const nonGmail=fixture();
  const salesDesk=nonGmail.sources.find(source=>source.sourceId==="SALES_DESK");
  salesDesk.recordTimestampDigest="f".repeat(64);
  salesDesk.allRecordsWithinCoverageWindow=true;
  salesDesk.evidenceDigest=evidenceDigestFor(salesDesk);
  assert.throws(
    ()=>reconcileEnquirySourceInventory(nonGmail),
    /non-Gmail sources cannot claim Gmail pagination proof/,
  );
});

test("Gmail pagination evidence binds ordered traversal and terminal cursor exhaustion",()=>{
  const missingTraversal=fixture();
  const missing=missingTraversal.sources.find(
    source=>source.sourceId==="NEWTON_REVENUE_GMAIL",
  );
  missing.paginationTraversalDigest=null;
  missing.evidenceDigest=evidenceDigestFor(missing);
  assert.throws(
    ()=>reconcileEnquirySourceInventory(missingTraversal),
    /ordered pagination traversal digest required/,
    "page totals and an ID-set digest cannot prove that the cursor chain was traversed",
  );

  const unterminated=fixture();
  const gmail=unterminated.sources.find(
    source=>source.sourceId==="PERSONAL_GMAIL",
  );
  gmail.terminalPageTokenAbsent=false;
  gmail.evidenceDigest=evidenceDigestFor(gmail);
  assert.throws(
    ()=>reconcileEnquirySourceInventory(unterminated),
    /terminate without a next-page token/,
    "a remaining next-page token means the bounded search is incomplete",
  );

  const nonGmail=fixture();
  const salesDesk=nonGmail.sources.find(source=>source.sourceId==="SALES_DESK");
  salesDesk.terminalPageTokenAbsent=true;
  salesDesk.paginationTraversalDigest="f".repeat(64);
  salesDesk.evidenceDigest=evidenceDigestFor(salesDesk);
  assert.throws(
    ()=>reconcileEnquirySourceInventory(nonGmail),
    /non-Gmail sources cannot claim Gmail pagination proof/,
  );

  const unreadableProof=fixture();
  unreadableProof.sources[0]={
    ...unreadableProof.sources[0],
    terminalPageTokenAbsent:true,
    paginationTraversalDigest:"f".repeat(64),
  };
  assert.throws(
    ()=>reconcileEnquirySourceInventory(unreadableProof),
    /unreadable source cannot claim pagination proof/,
  );
});



test("Gmail pagination binds every record identity to its ordered page",()=>{
  const missingAssignment=fixture();
  const revenue=missingAssignment.sources.find(
    source=>source.sourceId==="NEWTON_REVENUE_GMAIL",
  );
  revenue.paginationRecordAssignmentDigest=null;
  revenue.evidenceDigest=evidenceDigestFor(revenue);
  assert.throws(
    ()=>reconcileEnquirySourceInventory(missingAssignment),
    /ordered page\/record assignment digest required/,
    "a cursor chain and separate ID set cannot prove which page returned each record",
  );

  const collapsedTraversal=fixture();
  const personal=collapsedTraversal.sources.find(
    source=>source.sourceId==="PERSONAL_GMAIL",
  );
  personal.paginationRecordAssignmentDigest=personal.paginationTraversalDigest;
  personal.evidenceDigest=evidenceDigestFor(personal);
  assert.throws(
    ()=>reconcileEnquirySourceInventory(collapsedTraversal),
    /page\/record assignment evidence must be independently bound/,
  );

  const collapsedIds=fixture();
  const collapsed=collapsedIds.sources.find(
    source=>source.sourceId==="PERSONAL_GMAIL",
  );
  collapsed.paginationRecordAssignmentDigest=collapsed.deduplicatedRecordIdsDigest;
  collapsed.evidenceDigest=evidenceDigestFor(collapsed);
  assert.throws(
    ()=>reconcileEnquirySourceInventory(collapsedIds),
    /page\/record assignment evidence must be independently bound/,
  );

  const nonGmail=fixture();
  const salesDesk=nonGmail.sources.find(source=>source.sourceId==="SALES_DESK");
  salesDesk.paginationRecordAssignmentDigest="a".repeat(64);
  salesDesk.evidenceDigest=evidenceDigestFor(salesDesk);
  assert.throws(
    ()=>reconcileEnquirySourceInventory(nonGmail),
    /non-Gmail sources cannot claim Gmail pagination proof/,
  );

  const baseline=reconcileEnquirySourceInventory(fixture());
  assert.equal(
    baseline.sourceCoverage.PERSONAL_GMAIL.paginationRecordAssignmentBound,
    true,
  );
});


test("Gmail evidence binds record identities to their timestamps",()=>{
  const missingPairDigest=fixture();
  const revenue=missingPairDigest.sources.find(
    source=>source.sourceId==="NEWTON_REVENUE_GMAIL",
  );
  revenue.recordIdTimestampPairsDigest=null;
  revenue.evidenceDigest=evidenceDigestFor(revenue);
  assert.throws(
    ()=>reconcileEnquirySourceInventory(missingPairDigest),
    /record ID\/timestamp pair digest required/,
    "separate ID and timestamp sets cannot prove which timestamp belongs to each message",
  );

  const collapsedPairProof=fixture();
  const personal=collapsedPairProof.sources.find(
    source=>source.sourceId==="PERSONAL_GMAIL",
  );
  personal.recordIdTimestampPairsDigest=personal.recordTimestampDigest;
  personal.evidenceDigest=evidenceDigestFor(personal);
  assert.throws(
    ()=>reconcileEnquirySourceInventory(collapsedPairProof),
    /record-pair evidence must be independently bound/,
    "a timestamp-only digest cannot also stand in for identity/timestamp pairing",
  );

  const nonGmail=fixture();
  const salesDesk=nonGmail.sources.find(source=>source.sourceId==="SALES_DESK");
  salesDesk.recordIdTimestampPairsDigest="f".repeat(64);
  salesDesk.evidenceDigest=evidenceDigestFor(salesDesk);
  assert.throws(
    ()=>reconcileEnquirySourceInventory(nonGmail),
    /non-Gmail sources cannot claim Gmail pagination proof/,
  );

  const baseline=reconcileEnquirySourceInventory(fixture());
  assert.equal(
    baseline.sourceCoverage.PERSONAL_GMAIL.recordIdentityTimeBound,
    true,
  );
});


test("Gmail evidence binds every record identity to its classification",()=>{
  const missingPairDigest=fixture();
  const revenue=missingPairDigest.sources.find(
    source=>source.sourceId==="NEWTON_REVENUE_GMAIL",
  );
  revenue.recordIdClassificationPairsDigest=null;
  revenue.evidenceDigest=evidenceDigestFor(revenue);
  assert.throws(
    ()=>reconcileEnquirySourceInventory(missingPairDigest),
    /record ID\/classification pair digest required/,
    "aggregate labels cannot prove which message received each classification",
  );

  const collapsedPairProof=fixture();
  const personal=collapsedPairProof.sources.find(
    source=>source.sourceId==="PERSONAL_GMAIL",
  );
  personal.recordIdClassificationPairsDigest=personal.deduplicatedRecordIdsDigest;
  personal.evidenceDigest=evidenceDigestFor(personal);
  assert.throws(
    ()=>reconcileEnquirySourceInventory(collapsedPairProof),
    /classification-pair evidence must be independently bound/,
    "an ID-set digest cannot also stand in for per-record classification evidence",
  );

  const nonGmail=fixture();
  const salesDesk=nonGmail.sources.find(source=>source.sourceId==="SALES_DESK");
  salesDesk.recordIdClassificationPairsDigest="f".repeat(64);
  salesDesk.evidenceDigest=evidenceDigestFor(salesDesk);
  assert.throws(
    ()=>reconcileEnquirySourceInventory(nonGmail),
    /non-Gmail sources cannot claim Gmail pagination proof/,
  );

  const baseline=reconcileEnquirySourceInventory(fixture());
  assert.equal(
    baseline.sourceCoverage.NEWTON_REVENUE_GMAIL.recordIdentityClassificationBound,
    true,
  );
});


test("Gmail page assignment proof cannot be replayed across source snapshots",()=>{
  const input=fixture();
  const revenue=input.sources.find(
    source=>source.sourceId==="NEWTON_REVENUE_GMAIL",
  );
  const personal=input.sources.find(
    source=>source.sourceId==="PERSONAL_GMAIL",
  );

  // Preserve the second snapshot's otherwise-valid aggregate observation and
  // recompute its outer digest after transplanting the first snapshot's
  // assignment proof. The inner proof must still be rejected as replayed.
  personal.paginationRecordAssignmentDigest=
    revenue.paginationRecordAssignmentDigest;
  personal.evidenceDigest=evidenceDigestFor(personal);

  assert.throws(
    ()=>reconcileEnquirySourceInventory(input),
    /page\/record assignment digest cannot be replayed across sources/,
    "an assignment proof from one Gmail snapshot cannot attest another",
  );
});


test("distinct Gmail source roles require distinct account identities",()=>{
  const input=fixture();
  const revenue=input.sources.find(
    source=>source.sourceId==="NEWTON_REVENUE_GMAIL",
  );
  const personal=input.sources.find(
    source=>source.sourceId==="PERSONAL_GMAIL",
  );

  // Recompute every outer binding after reusing the revenue account identity.
  // One physical inbox still must not masquerade as both required source roles.
  personal.accountIdentityDigest=revenue.accountIdentityDigest;
  personal.searchQueryDigest=gmailQueryDigestFor(personal);
  personal.evidenceDigest=evidenceDigestFor(personal);

  assert.throws(
    ()=>reconcileEnquirySourceInventory(input),
    /account identity digest cannot be reused across sources/,
    "one Gmail account cannot satisfy both personal and revenue source coverage",
  );
});


test("Gmail record ID-set proof cannot be replayed across account snapshots",()=>{
  const input=fixture();
  const revenue=input.sources.find(
    source=>source.sourceId==="NEWTON_REVENUE_GMAIL",
  );
  const personal=input.sources.find(
    source=>source.sourceId==="PERSONAL_GMAIL",
  );

  // Keep the personal snapshot's own classifications and per-record
  // classification proof, but transplant the revenue snapshot's ID-set proof
  // and recompute the outer observation digest.
  personal.deduplicatedRecordIdsDigest=revenue.deduplicatedRecordIdsDigest;
  personal.evidenceDigest=evidenceDigestFor(personal);

  assert.throws(
    ()=>reconcileEnquirySourceInventory(input),
    /record ID-set digest cannot be replayed across sources/,
    "one Gmail snapshot's ID set cannot attest another account's records",
  );
});


test("Gmail classification-pair proof cannot be replayed across account snapshots",()=>{
  const input=fixture();
  const revenue=input.sources.find(
    source=>source.sourceId==="NEWTON_REVENUE_GMAIL",
  );
  const personal=input.sources.find(
    source=>source.sourceId==="PERSONAL_GMAIL",
  );

  // Keep the personal snapshot's own account, IDs and aggregate counts, but
  // transplant the revenue snapshot's per-record classification proof and
  // recompute the outer observation digest. The inner proof must fail closed.
  personal.recordIdClassificationPairsDigest=
    revenue.recordIdClassificationPairsDigest;
  personal.evidenceDigest=evidenceDigestFor(personal);

  assert.throws(
    ()=>reconcileEnquirySourceInventory(input),
    /classification-pair digest cannot be replayed across sources/,
    "one Gmail account's per-record labels cannot attest another account",
  );
});


test("Gmail ID/timestamp proof cannot be replayed across account snapshots",()=>{
  const input=fixture();
  const revenue=input.sources.find(
    source=>source.sourceId==="NEWTON_REVENUE_GMAIL",
  );
  const personal=input.sources.find(
    source=>source.sourceId==="PERSONAL_GMAIL",
  );

  // Keep the personal account, coverage window, raw timestamp digest and
  // classifications, but transplant the revenue account's ID/timestamp proof
  // and recompute the outer observation digest.
  personal.recordIdTimestampPairsDigest=
    revenue.recordIdTimestampPairsDigest;
  personal.evidenceDigest=evidenceDigestFor(personal);

  assert.throws(
    ()=>reconcileEnquirySourceInventory(input),
    /ID\/timestamp-pair digest cannot be replayed across sources/,
    "one account's record timing proof cannot attest another source window",
  );
});


test("Gmail evidence rejects all-mail scope that can include sent messages and drafts",()=>{
  const input=fixture();
  const personal=input.sources.find(
    source=>source.sourceId==="PERSONAL_GMAIL",
  );

  // Recompute both digests after weakening the declared search scope. The
  // allowlist must still reject evidence that can count the owner's own mail.
  personal.searchScope="INBOX_ALL_SENDERS_EXCLUDING_SPAM_TRASH";
  personal.searchQueryDigest=gmailQueryDigestFor(personal);
  personal.evidenceDigest=evidenceDigestFor(personal);

  assert.throws(
    ()=>reconcileEnquirySourceInventory(input),
    /search scope must be complete and allowlisted/,
    "drafts and sent messages cannot support inbound buyer counts",
  );
});


test("Gmail evidence binds every counted record identity to its inbox label",()=>{
  const missingProof=fixture();
  const revenue=missingProof.sources.find(
    source=>source.sourceId==="NEWTON_REVENUE_GMAIL",
  );
  revenue.recordIdInboxLabelPairsDigest=null;
  revenue.evidenceDigest=evidenceDigestFor(revenue);
  assert.throws(
    ()=>reconcileEnquirySourceInventory(missingProof),
    /record ID\/inbox-label pair digest required/,
    "declaring inbox-only scope cannot prove that every counted message was received",
  );

  const collapsedProof=fixture();
  const personal=collapsedProof.sources.find(
    source=>source.sourceId==="PERSONAL_GMAIL",
  );
  personal.recordIdInboxLabelPairsDigest=
    personal.recordIdClassificationPairsDigest;
  personal.evidenceDigest=evidenceDigestFor(personal);
  assert.throws(
    ()=>reconcileEnquirySourceInventory(collapsedProof),
    /inbox-label-pair evidence must be independently bound/,
  );

  const replayedProof=fixture();
  const first=replayedProof.sources.find(
    source=>source.sourceId==="NEWTON_REVENUE_GMAIL",
  );
  const second=replayedProof.sources.find(
    source=>source.sourceId==="PERSONAL_GMAIL",
  );
  second.recordIdInboxLabelPairsDigest=first.recordIdInboxLabelPairsDigest;
  second.evidenceDigest=evidenceDigestFor(second);
  assert.throws(
    ()=>reconcileEnquirySourceInventory(replayedProof),
    /inbox-label-pair digest cannot be replayed across sources/,
  );

  const nonGmail=fixture();
  const salesDesk=nonGmail.sources.find(
    source=>source.sourceId==="SALES_DESK",
  );
  salesDesk.recordIdInboxLabelPairsDigest="f".repeat(64);
  salesDesk.evidenceDigest=evidenceDigestFor(salesDesk);
  assert.throws(
    ()=>reconcileEnquirySourceInventory(nonGmail),
    /non-Gmail sources cannot claim Gmail pagination proof/,
  );

  const baseline=reconcileEnquirySourceInventory(fixture());
  assert.equal(
    baseline.sourceCoverage.PERSONAL_GMAIL.recordIdentityInboxLabelBound,
    true,
  );
});


test("Gmail evidence binds every counted record identity to a privacy-safe origin class",()=>{
  const missingProof=fixture();
  const revenue=missingProof.sources.find(
    source=>source.sourceId==="NEWTON_REVENUE_GMAIL",
  );
  revenue.recordIdOriginClassPairsDigest=null;
  revenue.evidenceDigest=evidenceDigestFor(revenue);
  assert.throws(
    ()=>reconcileEnquirySourceInventory(missingProof),
    /record ID\/origin-class pair digest required/,
    "inbox receipt alone cannot distinguish buyer-origin mail from automated notices",
  );

  const collapsedProof=fixture();
  const personal=collapsedProof.sources.find(
    source=>source.sourceId==="PERSONAL_GMAIL",
  );
  personal.recordIdOriginClassPairsDigest=
    personal.recordIdClassificationPairsDigest;
  personal.evidenceDigest=evidenceDigestFor(personal);
  assert.throws(
    ()=>reconcileEnquirySourceInventory(collapsedProof),
    /origin-class-pair evidence must be independently bound/,
  );

  const replayedProof=fixture();
  const first=replayedProof.sources.find(
    source=>source.sourceId==="NEWTON_REVENUE_GMAIL",
  );
  const second=replayedProof.sources.find(
    source=>source.sourceId==="PERSONAL_GMAIL",
  );
  second.recordIdOriginClassPairsDigest=first.recordIdOriginClassPairsDigest;
  second.evidenceDigest=evidenceDigestFor(second);
  assert.throws(
    ()=>reconcileEnquirySourceInventory(replayedProof),
    /origin-class-pair digest cannot be replayed across sources/,
  );

  const nonGmail=fixture();
  const salesDesk=nonGmail.sources.find(
    source=>source.sourceId==="SALES_DESK",
  );
  salesDesk.recordIdOriginClassPairsDigest="e".repeat(64);
  salesDesk.evidenceDigest=evidenceDigestFor(salesDesk);
  assert.throws(
    ()=>reconcileEnquirySourceInventory(nonGmail),
    /non-Gmail sources cannot claim Gmail pagination proof/,
  );

  const baseline=reconcileEnquirySourceInventory(fixture());
  assert.equal(
    baseline.sourceCoverage.PERSONAL_GMAIL.recordIdentityOriginClassBound,
    true,
  );
  assert.equal(
    baseline.sourceCoverage.PERSONAL_GMAIL.originClassCountsBound,
    true,
  );
});

test("Gmail buyer classifications require matching direct-inbound origin counts",()=>{
  const input=fixture();
  const personal=input.sources.find(
    source=>source.sourceId==="PERSONAL_GMAIL",
  );
  personal.observedCounts={...zeroCounts(),CANDIDATE:1};
  personal.recordIdClassificationPairsDigest=createHash("sha256")
    .update("PERSONAL_GMAIL:RELABELLED-AS-CANDIDATE").digest("hex");
  personal.originClassCounts={
    ...zeroOriginClassCounts(),
    REPLY_TO_OUTBOUND:1,
  };
  personal.evidenceDigest=evidenceDigestFor(personal);
  assert.throws(
    ()=>reconcileEnquirySourceInventory(input),
    /buyer classifications require direct-inbound origin evidence/,
    "a reply to our outreach cannot be relabelled as buyer-origin evidence",
  );

  const accepted=fixture();
  const direct=accepted.sources.find(
    source=>source.sourceId==="PERSONAL_GMAIL",
  );
  direct.observedCounts={...zeroCounts(),CANDIDATE:1};
  direct.recordIdClassificationPairsDigest=createHash("sha256")
    .update("PERSONAL_GMAIL:DIRECT-CANDIDATE").digest("hex");
  direct.originClassCounts={
    ...zeroOriginClassCounts(),
    DIRECT_INBOUND:1,
  };
  direct.evidenceDigest=evidenceDigestFor(direct);
  const result=reconcileEnquirySourceInventory(accepted);
  assert.equal(result.accessibleCandidateObservations,1);
  assert.equal(result.genuineEnquiries,null);
});

test("Gmail origin-class aggregates must be complete, exact and Gmail-only",()=>{
  const missing=fixture();
  missing.sources[1].originClassCounts=null;
  missing.sources[1].evidenceDigest=evidenceDigestFor(missing.sources[1]);
  assert.throws(
    ()=>reconcileEnquirySourceInventory(missing),
    /exact Gmail origin-class counts required/,
  );

  const incomplete=fixture();
  incomplete.sources[2].originClassCounts={
    ...zeroOriginClassCounts(),
    REPLY_TO_OUTBOUND:0,
  };
  incomplete.sources[2].evidenceDigest=evidenceDigestFor(incomplete.sources[2]);
  assert.throws(
    ()=>reconcileEnquirySourceInventory(incomplete),
    /each Gmail record must have exactly one origin class/,
  );

  const nonGmail=fixture();
  const salesDesk=nonGmail.sources.find(source=>source.sourceId==="SALES_DESK");
  salesDesk.originClassCounts=zeroOriginClassCounts();
  salesDesk.evidenceDigest=evidenceDigestFor(salesDesk);
  assert.throws(
    ()=>reconcileEnquirySourceInventory(nonGmail),
    /non-Gmail sources cannot claim Gmail pagination proof/,
  );
});

test("Gmail evidence jointly binds each record classification to its origin",()=>{
  const missingProof=fixture();
  const revenue=missingProof.sources.find(
    source=>source.sourceId==="NEWTON_REVENUE_GMAIL",
  );
  revenue.recordIdClassificationOriginTriplesDigest=null;
  revenue.evidenceDigest=evidenceDigestFor(revenue);
  assert.throws(
    ()=>reconcileEnquirySourceInventory(missingProof),
    /record ID\/classification\/origin triple digest required/,
    "separate per-record classification and origin proofs can be swapped between IDs",
  );

  const collapsedProof=fixture();
  const personal=collapsedProof.sources.find(
    source=>source.sourceId==="PERSONAL_GMAIL",
  );
  personal.recordIdClassificationOriginTriplesDigest=
    personal.recordIdClassificationPairsDigest;
  personal.evidenceDigest=evidenceDigestFor(personal);
  assert.throws(
    ()=>reconcileEnquirySourceInventory(collapsedProof),
    /classification\/origin triple evidence must be independently bound/,
  );

  const replayedProof=fixture();
  const first=replayedProof.sources.find(
    source=>source.sourceId==="NEWTON_REVENUE_GMAIL",
  );
  const second=replayedProof.sources.find(
    source=>source.sourceId==="PERSONAL_GMAIL",
  );
  second.recordIdClassificationOriginTriplesDigest=
    first.recordIdClassificationOriginTriplesDigest;
  second.evidenceDigest=evidenceDigestFor(second);
  assert.throws(
    ()=>reconcileEnquirySourceInventory(replayedProof),
    /classification\/origin triple digest cannot be replayed across sources/,
  );

  const nonGmail=fixture();
  const salesDesk=nonGmail.sources.find(source=>source.sourceId==="SALES_DESK");
  salesDesk.recordIdClassificationOriginTriplesDigest="d".repeat(64);
  salesDesk.evidenceDigest=evidenceDigestFor(salesDesk);
  assert.throws(
    ()=>reconcileEnquirySourceInventory(nonGmail),
    /non-Gmail sources cannot claim Gmail pagination proof/,
  );

  const baseline=reconcileEnquirySourceInventory(fixture());
  assert.equal(
    baseline.sourceCoverage.PERSONAL_GMAIL
      .recordIdentityClassificationOriginBound,
    true,
  );
});



test("Gmail evidence jointly binds time, classification and origin per record",()=>{
  const missingProof=fixture();
  const revenue=missingProof.sources.find(
    source=>source.sourceId==="NEWTON_REVENUE_GMAIL",
  );
  revenue.recordIdTimestampClassificationOriginTuplesDigest=null;
  revenue.evidenceDigest=evidenceDigestFor(revenue);
  assert.throws(
    ()=>reconcileEnquirySourceInventory(missingProof),
    /record ID\/timestamp\/classification\/origin tuple digest required/,
    "separate timestamp and classification/origin proofs can describe different snapshots",
  );

  const collapsedProof=fixture();
  const personal=collapsedProof.sources.find(
    source=>source.sourceId==="PERSONAL_GMAIL",
  );
  personal.recordIdTimestampClassificationOriginTuplesDigest=
    personal.recordIdClassificationOriginTriplesDigest;
  personal.evidenceDigest=evidenceDigestFor(personal);
  assert.throws(
    ()=>reconcileEnquirySourceInventory(collapsedProof),
    /timestamp\/classification\/origin tuple evidence must be independently bound/,
  );

  const replayedProof=fixture();
  const first=replayedProof.sources.find(
    source=>source.sourceId==="NEWTON_REVENUE_GMAIL",
  );
  const second=replayedProof.sources.find(
    source=>source.sourceId==="PERSONAL_GMAIL",
  );
  second.recordIdTimestampClassificationOriginTuplesDigest=
    first.recordIdTimestampClassificationOriginTuplesDigest;
  second.evidenceDigest=evidenceDigestFor(second);
  assert.throws(
    ()=>reconcileEnquirySourceInventory(replayedProof),
    /timestamp\/classification\/origin tuple digest cannot be replayed across sources/,
  );

  const nonGmail=fixture();
  const salesDesk=nonGmail.sources.find(source=>source.sourceId==="SALES_DESK");
  salesDesk.recordIdTimestampClassificationOriginTuplesDigest="c".repeat(64);
  salesDesk.evidenceDigest=evidenceDigestFor(salesDesk);
  assert.throws(
    ()=>reconcileEnquirySourceInventory(nonGmail),
    /non-Gmail sources cannot claim Gmail pagination proof/,
  );

  const baseline=reconcileEnquirySourceInventory(fixture());
  assert.equal(
    baseline.sourceCoverage.PERSONAL_GMAIL
      .recordIdentityTimeClassificationOriginBound,
    true,
  );
});
