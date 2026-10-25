// Privacy-safe commercial evidence classification for the £195 diagnostic.
// Consumes metadata and evidence digests only; never email addresses, message bodies or live customer data.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DIGEST=/^[0-9a-f]{64}$/i;
const SOURCES=new Set(["ORIGINAL_INBOX","WEBSITE_SUBMISSION","ACTIVITY_EVENT","OUTBOUND_PROSPECT","SYNTHETIC_FIXTURE"]);
const DIRECTIONS=new Set(["INBOUND","OUTBOUND","INTERNAL"]);
const CONSENT=new Set(["RECORDED","NOT_RECORDED","NOT_APPLICABLE"]);
const INTENT=new Set(["EXPLICIT_PAID_DIAGNOSTIC_ENQUIRY","GENERAL_SERVICE_ENQUIRY","NO_BUYER_INTENT_EVIDENCE"]);
const ORIGINAL_SOURCES=new Set(["ORIGINAL_INBOX","WEBSITE_SUBMISSION"]);

function hold(ok,message){if(!ok)throw new Error("COMMERCIAL EVIDENCE HOLD: "+message)}
function exact(value,keys){
  return value&&typeof value==="object"&&!Array.isArray(value)&&
    Object.keys(value).length===keys.length&&Object.keys(value).every(key=>keys.includes(key));
}
function count(value){return Number.isSafeInteger(value)&&value>=0}
function iso(value){
  if(typeof value!=="string")return false;
  const parsed=new Date(value);
  return !Number.isNaN(parsed.getTime())&&parsed.toISOString()===value;
}

export function classifyCommercialSourceRecord(input){
  const keys=["version","recordId","createdAt","contactPermissionCapturedAt","sourceKind","direction","synthetic","consentState",
    "humanReviewed","intentEvidence","evidenceDigest"];
  hold(exact(input,keys),"exact privacy-safe metadata required");
  hold(input.version===1,"record version 1 required");
  hold(UUID.test(input.recordId||""),"valid record ID required");
  hold(iso(input.createdAt),"canonical UTC record creation timestamp required");
  hold(iso(input.contactPermissionCapturedAt),"canonical UTC contact-permission timestamp required");
  hold(input.contactPermissionCapturedAt===input.createdAt,
    "contact permission must be captured with record creation");
  hold(SOURCES.has(input.sourceKind),"recognised source kind required");
  hold(DIRECTIONS.has(input.direction),"recognised direction required");
  hold(typeof input.synthetic==="boolean","synthetic flag required");
  hold(CONSENT.has(input.consentState),"recognised consent state required");
  hold(typeof input.humanReviewed==="boolean","human review flag required");
  hold(INTENT.has(input.intentEvidence),"recognised intent evidence required");
  hold(DIGEST.test(input.evidenceDigest||""),"SHA-256 evidence digest required");
  hold((input.sourceKind==="SYNTHETIC_FIXTURE")===input.synthetic,
    "synthetic fixture and flag must agree");

  let classification="UNKNOWN";
  if(input.synthetic){
    classification="SYNTHETIC";
  }else if(
    ORIGINAL_SOURCES.has(input.sourceKind)&&input.direction==="INBOUND"&&
    input.consentState==="RECORDED"&&input.humanReviewed===true&&
    input.intentEvidence==="EXPLICIT_PAID_DIAGNOSTIC_ENQUIRY"
  ){
    classification="GENUINE";
  }else if(
    ORIGINAL_SOURCES.has(input.sourceKind)&&input.direction==="INBOUND"&&
    input.intentEvidence!=="NO_BUYER_INTENT_EVIDENCE"
  ){
    classification="CANDIDATE";
  }

  return Object.freeze({
    schema:"NEWTON_COMMERCIAL_SOURCE_CLASSIFICATION_V1",
    recordId:input.recordId,
    classification,
    sourceKind:input.sourceKind,
    evidenceDigest:input.evidenceDigest,
    buyer:false,
    agreed:false,
    invoiced:false,
    clearedEvidenceGBP:0,
    automaticCommercialTransition:false,
    customerDelivery:"HOLD",
  });
}

export function reconcileCommercialEvidenceCounts(input){
  const keys=["version","claimedEnquiries","verifiedGenuine","verifiedCandidate",
    "syntheticFixtures","activityEvents","outboundProspects"];
  hold(exact(input,keys),"exact aggregate evidence counts required");
  hold(input.version===1,"aggregate version 1 required");
  for(const key of keys.slice(1))hold(count(input[key]),`${key} must be a non-negative integer`);
  const classified=input.verifiedGenuine+input.verifiedCandidate+input.syntheticFixtures;
  hold(classified<=input.claimedEnquiries,
    "classified enquiry evidence exceeds the claimed total");
  return Object.freeze({
    schema:"NEWTON_COMMERCIAL_EVIDENCE_RECONCILIATION_V1",
    classifications:Object.freeze({
      GENUINE:input.verifiedGenuine,
      CANDIDATE:input.verifiedCandidate,
      SYNTHETIC:input.syntheticFixtures,
      UNKNOWN:input.claimedEnquiries-classified,
    }),
    nonEnquiryActivityEvents:input.activityEvents,
    outboundProspectsNotBuyers:input.outboundProspects,
    buyerCount:0,
    agreedCount:0,
    invoicedCount:0,
    clearedEvidenceGBP:0,
    commercialTruth:"ACTIVITY_AND_PROSPECTS_ARE_NOT_ENQUIRIES_OR_REVENUE",
    customerDelivery:"HOLD",
  });
}
