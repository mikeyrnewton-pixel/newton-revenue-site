// Privacy-safe source inventory for enquiry truth reconciliation.
// It stores only non-secret locators, aggregate counts and evidence digests.
import {createHash} from "node:crypto";
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
const GMAIL_SEARCH_SCOPE="INBOX_ALL_SENDERS_EXCLUDING_SPAM_TRASH";
const DIGEST=/^[0-9a-f]{64}$/;
const MAX_READABLE_SOURCE_AGE_MS=15*60*1000;
const MIN_GMAIL_SEARCH_WINDOW_MS=60*60*1000;
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
  if(value===null||typeof value!=="object"||Array.isArray(value))return false;
  const prototype=Object.getPrototypeOf(value);
  if(prototype!==Object.prototype&&prototype!==null)return false;
  const ownKeys=Object.keys(value);
  if(ownKeys.length!==keys.length||!ownKeys.every(key=>keys.includes(key)))return false;
  const descriptors=Object.getOwnPropertyDescriptors(value);
  return ownKeys.every(key=>
    Object.hasOwn(descriptors,key)&&Object.hasOwn(descriptors[key],"value")
  );
}
function inertDenseArray(value,maxLength){
  if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||
    !Number.isSafeInteger(value.length)||value.length>maxLength)return false;
  const descriptors=Object.getOwnPropertyDescriptors(value);
  const ownKeys=Reflect.ownKeys(descriptors);
  if(ownKeys.length!==value.length+1||
    !Object.hasOwn(descriptors,"length")||
    !Object.hasOwn(descriptors.length,"value")||
    descriptors.length.value!==value.length)return false;
  for(let index=0;index<value.length;index+=1){
    const descriptor=descriptors[index];
    if(!descriptor||!Object.hasOwn(descriptor,"value")||
      descriptor.enumerable!==true)return false;
  }
  return true;
}

function canonicalIso(value){
  if(typeof value!=="string")return false;
  const parsed=new Date(value);
  return !Number.isNaN(parsed.getTime())&&parsed.toISOString()===value;
}
function validCount(value){return Number.isSafeInteger(value)&&value>=0}
function addSafeCount(current,value,label){
  const total=current+value;
  hold(Number.isSafeInteger(total),`${label} aggregate count exceeds safe integer range`);
  return total;
}
function observationDigest(source){
  return createHash("sha256").update(JSON.stringify({
    sourceId:source.sourceId,
    accessState:source.accessState,
    coverage:source.coverage,
    coverageStartedAt:source.coverageStartedAt,
    coverageEndedAt:source.coverageEndedAt,
    evidenceLocator:source.evidenceLocator,
    searchScope:source.searchScope,
    observedRecordCount:source.observedRecordCount,
    observedCounts:Object.fromEntries(COUNT_KEYS.map(key=>[key,source.observedCounts[key]])),
    verifiedAt:source.verifiedAt,
  })).digest("hex");
}

export function reconcileEnquirySourceInventory(input){
  hold(exact(input,["version","claimedEnquiries","reconciledAt","sources"]),
    "exact inventory fields required");
  hold(input.version===1,"inventory version 1 required");
  hold(validCount(input.claimedEnquiries),"non-negative claimed enquiry count required");
  hold(canonicalIso(input.reconciledAt),
    "canonical inventory reconciliation timestamp required");
  hold(inertDenseArray(input.sources,REQUIRED_SOURCES.length),
    "bounded inert source array required");

  const seen=new Set();
  const seenEvidenceLocators=new Set();
  const seenEvidenceDigests=new Set();
  const sourceCounts={};
  const sourceCoverage={};
  const observedRecordCounts={};
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
      "coverageEndedAt","evidenceLocator","searchScope","observedRecordCount",
      "observedCounts","verifiedAt","evidenceDigest"];
    hold(exact(source,keys),"exact source fields required");
    hold(REQUIRED_SOURCES.includes(source.sourceId),"recognised source required");
    hold(!seen.has(source.sourceId),"duplicate source inventory entry");
    seen.add(source.sourceId);
    hold(ACCESS.has(source.accessState),"recognised access state required");
    hold(COVERAGE.has(source.coverage),"recognised coverage required");
    hold(LOCATOR.test(source.evidenceLocator||""),"non-secret private evidence locator required");
    const sourceLocatorPrefix=
      `private://${source.sourceId.toLowerCase().replaceAll("_","-")}/`;
    hold(source.evidenceLocator.startsWith(sourceLocatorPrefix),
      "evidence locator must be scoped to its declared source");
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
      hold(BOUNDED_SEARCH_SOURCES.has(source.sourceId)?
        source.searchScope===GMAIL_SEARCH_SCOPE:source.searchScope===null,
        "source search scope must be complete and allowlisted");
      hold(canonicalIso(source.coverageStartedAt)&&canonicalIso(source.coverageEndedAt),
        "canonical coverage window required");
      hold(Date.parse(source.coverageStartedAt)<Date.parse(source.coverageEndedAt),
        "coverage window must be non-empty and move forwards");
      hold(!BOUNDED_SEARCH_SOURCES.has(source.sourceId)||
        Date.parse(source.coverageEndedAt)-Date.parse(source.coverageStartedAt)>=
          MIN_GMAIL_SEARCH_WINDOW_MS,
        "Gmail search window must cover at least one hour");
      hold(canonicalIso(source.verifiedAt),"canonical verification timestamp required");
      hold(Date.parse(source.coverageEndedAt)<=Date.parse(source.verifiedAt),
        "coverage cannot end after verification");
      hold(Date.parse(source.verifiedAt)-Date.parse(source.coverageEndedAt)<=
        MAX_READABLE_SOURCE_AGE_MS,
        "readable source coverage is stale at verification");
      hold(Date.parse(source.verifiedAt)<=Date.parse(input.reconciledAt),
        "source verification cannot be in the reconciliation future");
      hold(Date.parse(input.reconciledAt)-Date.parse(source.verifiedAt)<=
        MAX_READABLE_SOURCE_AGE_MS,
        "readable source evidence is stale for this reconciliation");
      hold(DIGEST.test(source.evidenceDigest||""),"SHA-256 evidence digest required");
      hold(source.evidenceDigest===observationDigest(source),
        "evidence digest does not bind the exact source observation");
      hold(!seenEvidenceDigests.has(source.evidenceDigest),
        "evidence digest cannot be reused across sources");
      seenEvidenceDigests.add(source.evidenceDigest);
      if(source.coverage==="SEARCH_WINDOW"||source.coverage==="RETENTION_WINDOW")
        partialCoverage.push(source.sourceId);
      for(const key of COUNT_KEYS)hold(validCount(source.observedCounts[key]),
        `${key} count must be a non-negative integer`);
      hold(validCount(source.observedRecordCount),
        "observed record count must be a non-negative integer");
      const classifiedRecordCount=COUNT_KEYS.reduce(
        (total,key)=>addSafeCount(total,source.observedCounts[key],"CLASSIFIED_RECORD"),
        0,
      );
      hold(classifiedRecordCount===source.observedRecordCount,
        "each observed record must have exactly one classification");
      accessibleGenuineObservations=addSafeCount(accessibleGenuineObservations,
        source.observedCounts.GENUINE,"GENUINE");
      accessibleCandidateObservations=addSafeCount(accessibleCandidateObservations,
        source.observedCounts.CANDIDATE,"CANDIDATE");
      accessibleUnknownObservations=addSafeCount(accessibleUnknownObservations,
        source.observedCounts.UNKNOWN,"UNKNOWN");
      syntheticExcluded=addSafeCount(syntheticExcluded,
        source.observedCounts.SYNTHETIC,"SYNTHETIC");
      activityEventsExcluded=addSafeCount(activityEventsExcluded,
        source.observedCounts.NON_ENQUIRY_ACTIVITY,"NON_ENQUIRY_ACTIVITY");
      outboundProspectsExcluded=addSafeCount(outboundProspectsExcluded,
        source.observedCounts.OUTBOUND_PROSPECT,"OUTBOUND_PROSPECT");
      outboundRepliesExcluded=addSafeCount(outboundRepliesExcluded,
        source.observedCounts.OUTBOUND_REPLY,"OUTBOUND_REPLY");
    }else{
      hold(source.coverage==="UNREADABLE","unreadable source must say UNREADABLE");
      hold(source.coverageStartedAt===null&&source.coverageEndedAt===null,
        "unreadable source cannot claim a coverage window");
      hold(source.searchScope===null,
        "unreadable source cannot claim a search scope");
      hold(source.verifiedAt===null&&source.evidenceDigest===null,
        "unreadable source cannot claim verification evidence");
      hold(source.observedRecordCount===null,
        "unreadable source record count must remain null");
      for(const key of COUNT_KEYS)hold(source.observedCounts[key]===null,
        "unreadable source counts must remain null");
      unreadable.push(source.sourceId);
    }
    sourceCounts[source.sourceId]=Object.freeze({...source.observedCounts});
    observedRecordCounts[source.sourceId]=source.observedRecordCount;
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
    reconciledAt:input.reconciledAt,
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
    observedRecordCounts:Object.freeze(observedRecordCounts),
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


