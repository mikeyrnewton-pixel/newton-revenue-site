// TASK011 acquisition -> shared commercial-ledger boundary.
// Converts a validated offline CRM export into PII-free enquiry-only seeds.
// It cannot quote, accept, invoice, record payment, clear cash or write anywhere.
import {createHash} from "node:crypto";

const UUID_TEXT="[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const UUID=new RegExp("^"+UUID_TEXT+"$");
const HANDOFF_ID=new RegExp("^enquiry:"+UUID_TEXT+"$");
const EVENT_KEY=new RegExp("^crm:enquiry:"+UUID_TEXT+"$");
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
  hold(EVENT_KEY.test(row.event_key||"")&&
    row.event_key==="crm:"+row.handoff_id,
    "canonical event key required");
  hold(HANDOFF_ID.test(row.handoff_id||"")&&
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
  const seen=new Set();
  const eventKeyByEnquiryRef=new Map();
  const rows=[];
  for(const row of crmExport.rows){
    validateCrmRow(row);
    hold(!seen.has(row.event_key),"duplicate CRM event key forbidden");
    const boundEventKey=eventKeyByEnquiryRef.get(row.enquiry_ref);
    hold(!boundEventKey||boundEventKey===row.event_key,
      "one enquiry reference cannot map to multiple CRM event keys");
    seen.add(row.event_key);
    eventKeyByEnquiryRef.set(row.enquiry_ref,row.event_key);
    rows.push(toLedgerRow(row));
  }
  const expectedCrmDigest="sha256:"+createHash("sha256")
    .update(JSON.stringify(crmExport.rows)).digest("hex");
  hold(crmExport.batchDigest===expectedCrmDigest,
    "CRM export rows do not match batch evidence digest");
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


const LEDGER_ROW_KEYS=[
  "schema","synthetic","lead_key","source_event_key","enquiry_ref",
  "source_record_id","source_classification","source_evidence_digest","source",
  "channel","consent_purpose","consent_captured_at","owner_notice_status",
  "commercial_state","quote_state","acceptance_state","invoice_state",
  "payment_state","recorded_payment_evidence_gbp","cleared_evidence_gbp",
  "next_action","customer_delivery",
];

function validateLedgerRow(row){
  hold(exact(row,LEDGER_ROW_KEYS),"exact PII-free commercial row fields required");
  hold(row.schema==="NEWTON_FICTIONAL_COMMERCIAL_LEAD_V1"&&row.synthetic===true,
    "fictional commercial row required");
  hold(EVENT_KEY.test(row.source_event_key||"")&&UUID.test(row.enquiry_ref||"")&&
    row.source_record_id===row.enquiry_ref&&
    row.lead_key==="commercial:enquiry:"+row.source_event_key.slice(12),
    "canonical commercial ownership binding required");
  hold(/^[0-9a-f]{64}$/.test(row.source_evidence_digest||""),
    "canonical source evidence digest required");
  hold(row.source_classification==="SYNTHETIC"&&SOURCES.has(row.source)&&
    CHANNELS.has(row.channel)&&row.consent_purpose==="respond_to_enquiry"&&
    iso(row.consent_captured_at)&&NOTICE_STATES.has(row.owner_notice_status),
    "canonical synthetic source and consent evidence required");
  hold(row.commercial_state==="ENQUIRY_ONLY"&&row.quote_state==="NOT_QUOTED"&&
    row.acceptance_state==="NOT_ACCEPTED"&&row.invoice_state==="NOT_INVOICED"&&
    row.payment_state==="NOT_RECORDED"&&row.recorded_payment_evidence_gbp===0&&
    row.cleared_evidence_gbp===0&&
    row.next_action==="OWNER_QUALIFICATION_REQUIRED"&&
    row.customer_delivery==="HOLD",
    "commercial promotion is forbidden at acquisition boundary");
}

// A cursor carries only validated, PII-free synthetic rows. It lets separate
// reconciliation invocations retain identifier ownership without a live CRM.
export function emptySyntheticCommercialLeadCursor(){
  return Object.freeze({
    version:1,
    synthetic:true,
    rows:Object.freeze([]),
  });
}

function commercialLeadCursor(value){
  hold(exact(value,["version","synthetic","rows"]),
    "exact prior commercial lead cursor required");
  hold(value.version===1&&value.synthetic===true&&Array.isArray(value.rows)&&
    value.rows.length<=1000,
    "bounded synthetic prior commercial lead cursor required");
  const eventOwners=new Map();
  const enquiryOwners=new Map();
  const evidenceOwners=new Map();
  const leadRows=new Map();
  let priorSortKey="";
  for(const row of value.rows){
    validateLedgerRow(row);
    const sortKey=row.consent_captured_at+"\n"+row.lead_key;
    hold(!priorSortKey||priorSortKey<sortKey,
      "prior commercial lead cursor rows must be strictly sorted and unique");
    priorSortKey=sortKey;
    const eventOwner=eventOwners.get(row.source_event_key);
    hold(!eventOwner||eventOwner===row.enquiry_ref,
      "prior cursor CRM event key has conflicting enquiry ownership");
    const enquiryOwner=enquiryOwners.get(row.enquiry_ref);
    hold(!enquiryOwner||enquiryOwner===row.source_event_key,
      "prior cursor enquiry has conflicting CRM event ownership");
    const evidenceOwner=evidenceOwners.get(row.source_evidence_digest);
    hold(!evidenceOwner||evidenceOwner===row.lead_key,
      "prior cursor source evidence proves multiple commercial leads");
    const serialized=JSON.stringify(row);
    const prior=leadRows.get(row.lead_key);
    hold(!prior||prior===serialized,
      "prior cursor has a conflicting commercial lead replay");
    eventOwners.set(row.source_event_key,row.enquiry_ref);
    enquiryOwners.set(row.enquiry_ref,row.source_event_key);
    evidenceOwners.set(row.source_evidence_digest,row.lead_key);
    leadRows.set(row.lead_key,serialized);
  }
  return {eventOwners,enquiryOwners,evidenceOwners,leadRows};
}

// Reconciles independently valid offline exports without writing anywhere.
// Exact retries are idempotent; cross-run ownership changes fail closed via
// the required cumulative cursor.
export function consolidateOfflineCommercialLeadExports(exports,priorCursor){
  hold(Array.isArray(exports)&&exports.length>0&&exports.length<=100,
    "one to 100 offline commercial exports required");
  const {
    eventOwners,enquiryOwners,evidenceOwners,leadRows,
  }=commercialLeadCursor(priorCursor);
  for(const batch of exports){
    hold(exact(batch,[
      "schema","synthetic","target","table","connectionState","writeIntent",
      "rowCount","batchDigest","rows","commercialTruth",
      "recordedPaymentEvidenceGBP","clearedEvidenceGBP","customerDelivery",
    ]),"exact commercial export package required");
    hold(batch.schema==="NEWTON_FICTIONAL_COMMERCIAL_LEAD_EXPORT_V1"&&
      batch.synthetic===true&&batch.target==="COMMERCIAL_LEDGER_PLACEHOLDER"&&
      batch.table==="commercial_leads"&&batch.connectionState==="NEEDS_CONNECTION"&&
      batch.writeIntent==="NONE"&&batch.commercialTruth==="ENQUIRIES_ONLY_NOT_REVENUE"&&
      batch.recordedPaymentEvidenceGBP===0&&batch.clearedEvidenceGBP===0&&
      batch.customerDelivery==="HOLD",
      "offline enquiry-only commercial export required");
    hold(Array.isArray(batch.rows)&&batch.rowCount===batch.rows.length&&
      DIGEST.test(batch.batchDigest||""),"valid commercial export evidence required");
    const expected="sha256:"+createHash("sha256")
      .update(JSON.stringify(batch.rows)).digest("hex");
    hold(batch.batchDigest===expected,
      "commercial export rows do not match batch evidence digest");
    for(const row of batch.rows){
      validateLedgerRow(row);
      const eventOwner=eventOwners.get(row.source_event_key);
      hold(!eventOwner||eventOwner===row.enquiry_ref,
        "one CRM event key cannot map to multiple enquiry references");
      const enquiryOwner=enquiryOwners.get(row.enquiry_ref);
      hold(!enquiryOwner||enquiryOwner===row.source_event_key,
        "one enquiry reference cannot change CRM event ownership across batches");
      const evidenceOwner=evidenceOwners.get(row.source_evidence_digest);
      hold(!evidenceOwner||evidenceOwner===row.lead_key,
        "one source evidence digest cannot prove multiple commercial leads");
      const serialized=JSON.stringify(row);
      const prior=leadRows.get(row.lead_key);
      hold(!prior||prior===serialized,
        "conflicting cross-batch replay for one commercial lead");
      eventOwners.set(row.source_event_key,row.enquiry_ref);
      enquiryOwners.set(row.enquiry_ref,row.source_event_key);
      evidenceOwners.set(row.source_evidence_digest,row.lead_key);
      leadRows.set(row.lead_key,serialized);
    }
  }
  hold(leadRows.size<=1000,
    "commercial lead cursor capacity exceeded");
  const rows=[...leadRows.values()].map(value=>JSON.parse(value))
    .sort((a,b)=>a.consent_captured_at.localeCompare(b.consent_captured_at)||
      a.lead_key.localeCompare(b.lead_key));
  const cursorRows=Object.freeze(rows.map(row=>Object.freeze(row)));
  return Object.freeze({
    schema:"NEWTON_FICTIONAL_COMMERCIAL_LEAD_CONSOLIDATION_V1",
    synthetic:true,
    state:"STAGED_OFFLINE_ONLY",
    connectionState:"NEEDS_CONNECTION",
    writeIntent:"NONE",
    sourceBatchCount:exports.length,
    uniqueLeadCount:rows.length,
    batchDigest:"sha256:"+createHash("sha256")
      .update(JSON.stringify(rows)).digest("hex"),
    reconciliationCursor:Object.freeze({
      version:1,
      synthetic:true,
      rows:cursorRows,
    }),
    commercialTruth:"ENQUIRIES_ONLY_NOT_REVENUE",
    recordedPaymentEvidenceGBP:0,
    clearedEvidenceGBP:0,
    customerDelivery:"HOLD",
  });
}
