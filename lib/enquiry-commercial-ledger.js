// TASK011 acquisition -> shared commercial-ledger boundary.
// Converts a validated offline CRM export into PII-free enquiry-only seeds.
// It cannot quote, accept, invoice, record payment, clear cash or write anywhere.
import {createHash} from "node:crypto";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DIGEST=/^sha256:[0-9a-f]{64}$/;
const NOTICE_STATES=new Set(["pending","delivered","dead-letter"]);
const SOURCES=new Set(["ai-profit-brief","newton-reset","autopilot-8","enquiry-check","newton-revenue-site"]);
const CHANNELS=new Set(["facebook","instagram","youtube","search","partner","direct"]);

function hold(ok,message){
  if(!ok)throw new Error("TASK011 LEDGER HOLD: "+message);
}
function exact(value,keys){
  return value&&typeof value==="object"&&!Array.isArray(value)&&
    Object.keys(value).length===keys.length&&Object.keys(value).every(key=>keys.includes(key));
}
function iso(value){
  if(typeof value!=="string")return false;
  const parsed=new Date(value);
  return !Number.isNaN(parsed.getTime())&&parsed.toISOString()===value;
}

function validateConfig(config){
  hold(exact(config,["schema","mode","target","table"]),
    "exact placeholder-only ledger config required");
  hold(config.schema==="NEWTON_COMMERCIAL_LEDGER_EXPORT_CONFIG_V1",
    "ledger config schema required");
  hold(config.mode==="OFFLINE_EXPORT_ONLY","network and write modes are forbidden");
  hold(config.target==="COMMERCIAL_LEDGER_PLACEHOLDER",
    "approved placeholder target required");
  hold(config.table==="commercial_leads","approved placeholder table required");
}

function validateCrmRow(row){
  hold(exact(row,[
    "schema","synthetic","event_key","event_type","handoff_id","enquiry_ref",
    "source","channel","consent_purpose","consent_captured_at",
    "marketing_consent","owner_notice_status","state","customer_delivery",
  ]),"exact PII-free CRM row fields required");
  hold(row.schema==="NEWTON_FICTIONAL_CRM_ROW_V1"&&row.synthetic===true,
    "fictional CRM row required");
  hold(row.event_key==="crm:"+row.handoff_id&&
    /^crm:enquiry:[0-9a-f-]{36}$/i.test(row.event_key||""),
    "canonical event key required");
  hold(/^enquiry:[0-9a-f-]{36}$/i.test(row.handoff_id||"")&&
    UUID.test(row.enquiry_ref||""),"canonical enquiry identifiers required");
  hold(row.event_type==="ENQUIRY_CAPTURED","enquiry event required");
  hold(SOURCES.has(row.source)&&CHANNELS.has(row.channel),
    "approved attribution required");
  hold(row.consent_purpose==="respond_to_enquiry"&&
    iso(row.consent_captured_at)&&row.marketing_consent===false,
    "enquiry-response consent evidence required");
  hold(NOTICE_STATES.has(row.owner_notice_status),"owner-notice state required");
  hold(row.state==="STAGED_OFFLINE_ONLY"&&row.customer_delivery==="HOLD",
    "offline customer-delivery HOLD required");
}

function toLedgerRow(row){
  const sourceEvidenceDigest=createHash("sha256").update(JSON.stringify({
    schema:row.schema,
    eventKey:row.event_key,
    enquiryRef:row.enquiry_ref,
    source:row.source,
    channel:row.channel,
    consentPurpose:row.consent_purpose,
    consentCapturedAt:row.consent_captured_at,
  })).digest("hex");
  return Object.freeze({
    schema:"NEWTON_FICTIONAL_COMMERCIAL_LEAD_V1",
    synthetic:true,
    lead_key:"commercial:"+row.handoff_id,
    source_event_key:row.event_key,
    enquiry_ref:row.enquiry_ref,
    source_record_id:row.enquiry_ref,
    source_classification:"SYNTHETIC",
    source_evidence_digest:sourceEvidenceDigest,
    source:row.source,
    channel:row.channel,
    consent_purpose:"respond_to_enquiry",
    consent_captured_at:row.consent_captured_at,
    owner_notice_status:row.owner_notice_status,
    commercial_state:"ENQUIRY_ONLY",
    quote_state:"NOT_QUOTED",
    acceptance_state:"NOT_ACCEPTED",
    invoice_state:"NOT_INVOICED",
    payment_state:"NOT_RECORDED",
    recorded_payment_evidence_gbp:0,
    cleared_evidence_gbp:0,
    next_action:"OWNER_QUALIFICATION_REQUIRED",
    customer_delivery:"HOLD",
  });
}

export function buildOfflineCommercialLeadExport(crmExport,config){
  validateConfig(config);
  hold(exact(crmExport,[
    "schema","synthetic","target","table","connectionState","writeIntent",
    "rowCount","batchDigest","rows","customerDelivery",
  ]),"exact CRM export package required");
  hold(crmExport.schema==="NEWTON_FICTIONAL_CRM_EXPORT_V1"&&crmExport.synthetic===true,
    "fictional CRM export required");
  hold(crmExport.target==="SUPABASE_PLACEHOLDER"&&crmExport.table==="enquiry_events",
    "canonical CRM placeholder source required");
  hold(crmExport.connectionState==="NEEDS_CONNECTION"&&
    crmExport.writeIntent==="NONE"&&crmExport.customerDelivery==="HOLD",
    "offline no-write CRM source required");
  hold(Array.isArray(crmExport.rows)&&crmExport.rowCount===crmExport.rows.length&&
    DIGEST.test(crmExport.batchDigest||""),"valid CRM export evidence required");
  const expectedCrmDigest="sha256:"+createHash("sha256")
    .update(JSON.stringify(crmExport.rows)).digest("hex");
  hold(crmExport.batchDigest===expectedCrmDigest,
    "CRM export rows do not match batch evidence digest");

  const seen=new Set();
  const rows=[];
  for(const row of crmExport.rows){
    validateCrmRow(row);
    hold(!seen.has(row.event_key),"duplicate CRM event key forbidden");
    seen.add(row.event_key);
    rows.push(toLedgerRow(row));
  }
  rows.sort((a,b)=>a.consent_captured_at.localeCompare(b.consent_captured_at)||
    a.lead_key.localeCompare(b.lead_key));
  const digest=createHash("sha256").update(JSON.stringify(rows)).digest("hex");
  return Object.freeze({
    schema:"NEWTON_FICTIONAL_COMMERCIAL_LEAD_EXPORT_V1",
    synthetic:true,
    target:config.target,
    table:config.table,
    connectionState:"NEEDS_CONNECTION",
    writeIntent:"NONE",
    rowCount:rows.length,
    batchDigest:"sha256:"+digest,
    rows:Object.freeze(rows),
    commercialTruth:"ENQUIRIES_ONLY_NOT_REVENUE",
    recordedPaymentEvidenceGBP:0,
    clearedEvidenceGBP:0,
    customerDelivery:"HOLD",
  });
}
