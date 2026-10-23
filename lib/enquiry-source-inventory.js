// Privacy-safe source inventory for enquiry truth reconciliation.
// It stores only non-secret locators, aggregate counts and evidence digests.
const REQUIRED_SOURCES=[
  "CLOUDFLARE_KV",
  "NEWTON_REVENUE_GMAIL",
  "PERSONAL_GMAIL",
  "SOCIAL_BUSINESS_DMS",
  "ATLAS_WATCH",
  "SALES_DESK",
  "CANONICAL_SHEET",
];
const ACCESS=new Set(["READ_VERIFIED","UNKNOWN_UNREADABLE","NOT_CONNECTED"]);
const COVERAGE=new Set(["COMPLETE","SEARCH_WINDOW","RETENTION_WINDOW","UNREADABLE"]);
const BOUNDED_SEARCH_SOURCES=new Set([
  "NEWTON_REVENUE_GMAIL",
  "PERSONAL_GMAIL",
]);
const LOCATOR=/^private:\/\/[a-z0-9][a-z0-9/_-]{2,79}$/;
const DIGEST=/^[0-9a-f]{64}$/;
const COUNT_KEYS=[
  "GENUINE",
  "CANDIDATE",
  "SYNTHETIC",
  "NON_ENQUIRY_ACTIVITY",
  "OUTBOUND_PROSPECT",
  "OUTBOUND_REPLY",
  "UNKNOWN",
];

function hold(ok,message){if(!ok)throw new Error("ENQUIRY SOURCE HOLD: "+message)}
function exact(value,keys){
  return value&&typeof value==="object"&&!Array.isArray(value)&&
    Object.keys(value).length===keys.length&&Object.keys(value).every(key=>keys.includes(key));
}
function canonicalIso(value){
  if(typeof value!=="string")return false;
  const parsed=new Date(value);
  return !Number.isNaN(parsed.getTime())&&parsed.toISOString()===value;
}
function validCount(value){return Number.isSafeInteger(value)&&value>=0}

export function reconcileEnquirySourceInventory(input){
  hold(exact(input,["version","claimedEnquiries","sources"]),
    "exact inventory fields required");
  hold(input.version===1,"inventory version 1 required");
  hold(validCount(input.claimedEnquiries),"non-negative claimed enquiry count required");
  hold(Array.isArray(input.sources),"source array required");

  const seen=new Set();
  const seenEvidenceLocators=new Set();
  const seenEvidenceDigests=new Set();
  const sourceCounts={};
  const sourceCoverage={};
  const unreadable=[];
  const partialCoverage=[];
  let accessibleGenuineObservations=0;
  let accessibleCandidateObservations=0;
  let accessibleUnknownObservations=0;
  let syntheticExcluded=0;
  let activityEventsExcluded=0;
  let outboundProspectsExcluded=0;
  let outboundRepliesExcluded=0;

  for(const source of input.sources){
    const keys=["sourceId","accessState","coverage","coverageStartedAt",
      "coverageEndedAt","evidenceLocator","observedCounts","verifiedAt","evidenceDigest"];
    hold(exact(source,keys),"exact source fields required");
    hold(REQUIRED_SOURCES.includes(source.sourceId),"recognised source required");
    hold(!seen.has(source.sourceId),"duplicate source inventory entry");
    seen.add(source.sourceId);
    hold(ACCESS.has(source.accessState),"recognised access state required");
    hold(COVERAGE.has(source.coverage),"recognised coverage required");
    hold(LOCATOR.test(source.evidenceLocator||""),"non-secret private evidence locator required");
    hold(!seenEvidenceLocators.has(source.evidenceLocator),
      "evidence locator cannot be reused across sources");
    seenEvidenceLocators.add(source.evidenceLocator);
    hold(exact(source.observedCounts,COUNT_KEYS),"exact classification counts required");

    const readable=source.accessState==="READ_VERIFIED";
    if(readable){
      hold(source.coverage!=="UNREADABLE","read source requires bounded coverage");
      // The live Pages handler retains lead: keys for 30 days and receipt: keys
      // for 24 hours. A KV snapshot cannot prove a complete historical count.
      hold(source.sourceId!=="CLOUDFLARE_KV"||source.coverage!=="COMPLETE",
        "expiring Cloudflare KV cannot claim complete historical coverage");
      hold(!BOUNDED_SEARCH_SOURCES.has(source.sourceId)||
        source.coverage==="SEARCH_WINDOW",
        "bounded Gmail evidence must remain a search window");
      hold(canonicalIso(source.coverageStartedAt)&&canonicalIso(source.coverageEndedAt),
        "canonical coverage window required");
      hold(Date.parse(source.coverageStartedAt)<Date.parse(source.coverageEndedAt),
        "coverage window must be non-empty and move forwards");
      hold(canonicalIso(source.verifiedAt),"canonical verification timestamp required");
      hold(Date.parse(source.coverageEndedAt)<=Date.parse(source.verifiedAt),
        "coverage cannot end after verification");
      hold(DIGEST.test(source.evidenceDigest||""),"SHA-256 evidence digest required");
      hold(!seenEvidenceDigests.has(source.evidenceDigest.toLowerCase()),
        "evidence digest cannot be reused across sources");
      seenEvidenceDigests.add(source.evidenceDigest.toLowerCase());
      if(source.coverage==="SEARCH_WINDOW"||source.coverage==="RETENTION_WINDOW")
        partialCoverage.push(source.sourceId);
      for(const key of COUNT_KEYS)hold(validCount(source.observedCounts[key]),
        `${key} count must be a non-negative integer`);
      accessibleGenuineObservations+=source.observedCounts.GENUINE;
      accessibleCandidateObservations+=source.observedCounts.CANDIDATE;
      accessibleUnknownObservations+=source.observedCounts.UNKNOWN;
      syntheticExcluded+=source.observedCounts.SYNTHETIC;
      activityEventsExcluded+=source.observedCounts.NON_ENQUIRY_ACTIVITY;
      outboundProspectsExcluded+=source.observedCounts.OUTBOUND_PROSPECT;
      outboundRepliesExcluded+=source.observedCounts.OUTBOUND_REPLY;
    }else{
      hold(source.coverage==="UNREADABLE","unreadable source must say UNREADABLE");
      hold(source.coverageStartedAt===null&&source.coverageEndedAt===null,
        "unreadable source cannot claim a coverage window");
      hold(source.verifiedAt===null&&source.evidenceDigest===null,
        "unreadable source cannot claim verification evidence");
      for(const key of COUNT_KEYS)hold(source.observedCounts[key]===null,
        "unreadable source counts must remain null");
      unreadable.push(source.sourceId);
    }
    sourceCounts[source.sourceId]=Object.freeze({...source.observedCounts});
    sourceCoverage[source.sourceId]=Object.freeze({
      coverage:source.coverage,
      startedAt:source.coverageStartedAt,
      endedAt:source.coverageEndedAt,
      verifiedAt:source.verifiedAt,
    });
  }

  hold(seen.size===REQUIRED_SOURCES.length&&
    REQUIRED_SOURCES.every(sourceId=>seen.has(sourceId)),
    "all required primary sources must be represented");

  const unresolvedAccessibleClassifications=
    accessibleCandidateObservations+accessibleUnknownObservations;
  const classificationStatus=unreadable.length>0&&
    unresolvedAccessibleClassifications>0?
      "UNKNOWN_UNREADABLE_AND_CLASSIFICATION_REVIEW":
    unreadable.length>0?"UNKNOWN_UNREADABLE":
      unresolvedAccessibleClassifications>0?"UNKNOWN_CLASSIFICATION_REVIEW":
        partialCoverage.length>0?"PARTIAL_COVERAGE_DEDUPE_REQUIRED":
          "ALL_SOURCES_READ_DEDUPE_REQUIRED";
  return Object.freeze({
    schema:"NEWTON_ENQUIRY_SOURCE_INVENTORY_V1",
    claimedEnquiries:input.claimedEnquiries,
    classificationStatus,
    genuineEnquiries:null,
    historicalEnquiryCount:null,
    historicalCloudflareKvCoverage:"UNPROVEN_30_DAY_LEAD_TTL_24_HOUR_RECEIPT_TTL",
    accessibleGenuineObservations,
    accessibleCandidateObservations,
    accessibleUnknownObservations,
    unresolvedAccessibleClassifications,
    unreadableSources:Object.freeze([...unreadable].sort()),
    partialCoverageSources:Object.freeze([...partialCoverage].sort()),
    sourceCounts:Object.freeze(sourceCounts),
    sourceCoverage:Object.freeze(sourceCoverage),
    excludedFromGenuine:Object.freeze({
      syntheticFixtures:syntheticExcluded,
      activityEvents:activityEventsExcluded,
      outboundProspects:outboundProspectsExcluded,
      outboundReplies:outboundRepliesExcluded,
    }),
    automaticBuyerPromotion:false,
    customerDataCopied:false,
    productionMutation:false,
    customerDelivery:"HOLD",
  });
}

