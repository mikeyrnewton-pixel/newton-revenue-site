// NEWTON £195 pilot: offline, privacy-safe public demand evidence triage.
// No browser/network/CRM/message/payment access, and no verification of publisher claims.
// A public problem statement is NOT a confirmed buyer, contact permission or a sale.
import {createHash} from "node:crypto";

const RECORD_KEYS=["version","candidateId","candidateType","sourceId","sourceKind",
  "sourceUrl","publishedAt","observedAt","signalClass","fit","notes"];
const SOURCE_KINDS=["PUBLIC_BRIEF","BUSINESS_WEBSITE","PUBLIC_RESEARCH"];
const SIGNALS=["OPEN_PURCHASE_BRIEF","PUBLIC_NEED_STATEMENT","GENERAL_SECTOR_FINDING"];
const FIT=["HIGH","MEDIUM","LOW","UNKNOWN"];
const CANDIDATES=["ORGANISATION","SECTOR"];
const ID=/^(?:ORG|SECTOR|SRC)-[A-Z0-9]{4,24}$/;
const ISO=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function hold(ok,message){if(!ok)throw Error("BUYER RESEARCH HOLD: "+message);}
function safeRecord(value,keys){
  if(value===null||typeof value!=="object"||Array.isArray(value))return false;
  const p=Object.getPrototypeOf(value);
  if(p!==Object.prototype&&p!==null)return false;
  const own=Reflect.ownKeys(value);
  if(own.length!==keys.length||!own.every(k=>typeof k==="string"&&keys.includes(k)))return false;
  return own.every(k=>{
    const d=Object.getOwnPropertyDescriptor(value,k);
    return d&&Object.hasOwn(d,"value")&&d.enumerable===true;
  });
}
function timestamp(value){
  return typeof value==="string"&&ISO.test(value)&&
    !Number.isNaN(Date.parse(value))&&new Date(value).toISOString()===value;
}
function sourceUrl(value){
  hold(typeof value==="string"&&value.length<=500&&
    /^https:\/\/[a-z0-9.-]+(?:\/[a-zA-Z0-9._~!$&'()*+,;=:@%/-]*)?$/u.test(value),
  "bounded public HTTPS URL with no query, fragment or userinfo required");
  let u;
  try{u=new URL(value);}catch{hold(false,"valid public source URL required");}
  hold(u.protocol==="https:"&&u.username===""&&u.password===""&&u.port===""&&
    u.search===""&&u.hash===""&&u.href===value,"canonical HTTPS source required");
  const host=u.hostname.toLowerCase();
  hold(host.includes(".")&&!host.endsWith(".local")&&!host.endsWith(".internal")&&
    !/^(?:localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|0\.|\[)/.test(host)&&
    !/^\d+(?:\.\d+){3}$/.test(host),"public DNS source required");
  hold(!/%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(value),"control byte encoding forbidden");
  return value;
}

function classify(record,now){
  hold(safeRecord(record,RECORD_KEYS),"exact inert source metadata required");
  hold(record.version===1,"version 1 required");
  hold(typeof record.candidateId==="string"&&ID.test(record.candidateId),"opaque candidate identifier required");
  hold(typeof record.sourceId==="string"&&ID.test(record.sourceId)&&record.sourceId.startsWith("SRC-"),
    "opaque source identifier required");
  hold(CANDIDATES.includes(record.candidateType),"approved candidate type required");
  hold(record.candidateId.startsWith(record.candidateType==="SECTOR"?"SECTOR-":"ORG-"),
    "candidate type/identifier mismatch");
  hold(SOURCE_KINDS.includes(record.sourceKind),"public source class required");
  hold(SIGNALS.includes(record.signalClass),"recognised signal class required");
  hold(FIT.includes(record.fit),"fit class required");
  hold(timestamp(record.observedAt),"canonical observation time required");
  hold(record.publishedAt===null||timestamp(record.publishedAt),"publishedAt must be canonical or unknown");
  hold(typeof record.notes==="string"&&record.notes.length<=240&&
    !/[\u0000-\u001f\u007f]/u.test(record.notes),"bounded non-sensitive source notes required");
  const url=sourceUrl(record.sourceUrl);
  const observed=Date.parse(record.observedAt);
  hold(observed<=now,"future observations forbidden");
  hold(record.publishedAt===null||Date.parse(record.publishedAt)<=observed,
    "source cannot have future publication relative to observation");
  hold(!(record.signalClass==="OPEN_PURCHASE_BRIEF"&&record.sourceKind!=="PUBLIC_BRIEF"),
    "purchase brief must cite a public brief");
  hold(!(record.signalClass==="GENERAL_SECTOR_FINDING"&&record.candidateType!=="SECTOR"),
    "sector findings are not individual buyer signals");
  const purchase=record.signalClass==="OPEN_PURCHASE_BRIEF";
  const hasPublishedTime=record.publishedAt!==null;
  const freshnessWindowMs=14*86400000;
  const staleObservation=now-observed>freshnessWindowMs;
  const stalePublication=hasPublishedTime&&
    now-Date.parse(record.publishedAt)>freshnessWindowMs;
  const desk=purchase&&record.fit!=="LOW"&&record.fit!=="UNKNOWN"&&
    !staleObservation&&!stalePublication&&hasPublishedTime&&
    record.candidateType==="ORGANISATION"
      ?"VALIDATE_PUBLIC_BRIEF_SCOPE":"RESEARCH_OR_HOLD";
  return Object.freeze({
    candidateId:record.candidateId,
    sourceId:record.sourceId,
    // A URL here is evidence of where someone claims a source exists, not verification that it exists.
    submittedPublicSourceUrl:url,
    observedAt:record.observedAt,
    publisherDateSupplied:hasPublishedTime,
    signalClass:record.signalClass,
    fitClaim:record.fit,
    triageDesk:desk,
    staleObservation,
    stalePublication,
    sourceClaimVerified:false,
    realBuyerIdentified:false,
    buyerPurchaseIntentVerified:false,
    contactPermissionVerified:false,
    externalOutreachApproved:false,
    clearedEvidenceGBP:0,
    evidenceDigest:"sha256:"+createHash("sha256").update(JSON.stringify(record)).digest("hex"),
  });
}

export function triageOfflineBuyerResearch(records,asOf){
  hold(timestamp(asOf),"fixed canonical review timestamp required");
  const now=Date.parse(asOf);
  hold(Array.isArray(records)&&records.length<=50,"up to 50 public research records required");
  const keys=new Map();
  const ownership=new Map();
  const sourceUrls=new Map();
  for(const record of records){
    const output=classify(record,now);
    const prior=keys.get(output.sourceId);
    hold(!prior||prior.evidenceDigest===output.evidenceDigest,
      "source identifier cannot change owner or evidence");
    const assigned=ownership.get(output.sourceId);
    hold(!assigned||assigned===output.candidateId,"source cannot be assigned to two buyers");
    const previousUrl=sourceUrls.get(output.submittedPublicSourceUrl);
    hold(!previousUrl||previousUrl===output.sourceId,
      "one URL cannot be counted as multiple independent buyer signals");
    keys.set(output.sourceId,output);
    ownership.set(output.sourceId,output.candidateId);
    sourceUrls.set(output.submittedPublicSourceUrl,output.sourceId);
  }
  const rows=Object.freeze([...keys.values()].sort((a,b)=>
    a.triageDesk.localeCompare(b.triageDesk)||a.candidateId.localeCompare(b.candidateId)||
    a.sourceId.localeCompare(b.sourceId)));
  const priorityRows=rows.filter(
    row=>row.triageDesk==="VALIDATE_PUBLIC_BRIEF_SCOPE",
  );
  const priorityCandidateIds=Object.freeze(
    [...new Set(priorityRows.map(row=>row.candidateId))].sort(),
  );
  return Object.freeze({
    schema:"NEWTON_BUYER_RESEARCH_TRIAGE_OFFLINE_V1",
    asOf,
    records:rows,
    uniqueSourceCount:rows.length,
    publicBriefsForManualValidation:priorityRows.length,
    uniqueOrganisationsForManualValidation:priorityCandidateIds.length,
    manualValidationCandidateIds:priorityCandidateIds,
    genuineBuyersVerified:0,
    contactPermissionsVerified:0,
    outreachApproved:false,
    CRMWriteIntent:"NONE",
    externalContact:false,
    sourceLinksFetched:false,
    clearedEvidenceGBP:0,
    release:"HOLD_PENDING_INDEPENDENT_REVIEW_AND_OWNER_APPROVAL",
  });
}
