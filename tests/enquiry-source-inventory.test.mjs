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
const evidenceDigestFor=source=>createHash("sha256").update(JSON.stringify({
  sourceId:source.sourceId,
  accessState:source.accessState,
  coverage:source.coverage,
  coverageStartedAt:source.coverageStartedAt,
  coverageEndedAt:source.coverageEndedAt,
  evidenceLocator:source.evidenceLocator,
  searchScope:source.searchScope,
  paginationComplete:source.paginationComplete,
  pageRecordCounts:source.pageRecordCounts,
  deduplicatedRecordIdsDigest:source.deduplicatedRecordIdsDigest,
  deduplicatedRecordCount:source.deduplicatedRecordCount,
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
      "INBOX_ALL_SENDERS_EXCLUDING_SPAM_TRASH":null,
    paginationComplete:["NEWTON_REVENUE_GMAIL","PERSONAL_GMAIL"].includes(sourceId)?
      true:null,
    pageRecordCounts:null,
    deduplicatedRecordIdsDigest:null,
    deduplicatedRecordCount:null,
    observedCounts:zeroCounts(),
    verifiedAt:"2026-10-20T12:14:00.000Z",
    ...overrides,
  };
  source.observedRecordCount=Object.hasOwn(overrides,"observedRecordCount")?
    overrides.observedRecordCount:
    Object.values(source.observedCounts).reduce((total,count)=>total+count,0);
  if(["NEWTON_REVENUE_GMAIL","PERSONAL_GMAIL"].includes(sourceId)){
    source.pageRecordCounts=Object.hasOwn(overrides,"pageRecordCounts")?
      overrides.pageRecordCounts:[source.observedRecordCount];
    source.deduplicatedRecordIdsDigest=Object.hasOwn(
      overrides,"deduplicatedRecordIdsDigest",
    )?overrides.deduplicatedRecordIdsDigest:createHash("sha256")
      .update(sourceId+":"+source.observedRecordCount).digest("hex");
    source.deduplicatedRecordCount=Object.hasOwn(
      overrides,"deduplicatedRecordCount",
    )?overrides.deduplicatedRecordCount:source.observedRecordCount;
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
  paginationComplete:null,
  pageRecordCounts:null,
  deduplicatedRecordIdsDigest:null,
  deduplicatedRecordCount:null,
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

  const tinyGmailWindow=fixture();
  tinyGmailWindow.sources[1].coverageStartedAt="2026-10-20T12:13:58.000Z";
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
  revenue.evidenceDigest=evidenceDigestFor(revenue);
  personal.observedCounts={...zeroCounts(),UNKNOWN:1};
  personal.observedRecordCount=1;
  personal.pageRecordCounts=[1];
  personal.deduplicatedRecordCount=1;
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
  salesDesk.searchScope="INBOX_ALL_SENDERS_EXCLUDING_SPAM_TRASH";
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
