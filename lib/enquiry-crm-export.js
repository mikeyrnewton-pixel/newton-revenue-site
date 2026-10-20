// Deterministic PII-free CRM export package for TASK011 connector preparation.
// No URL, credential, network request or write operation is accepted or performed.
import {createHash} from "node:crypto";

const SOURCES=new Set(["ai-profit-brief","newton-reset","autopilot-8","enquiry-check","newton-revenue-site"]);
const CHANNELS=new Set(["facebook","instagram","youtube","search","partner","direct"]);
const NOTICE_STATES=new Set(["pending","delivered","dead-letter"]);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function hold(ok,message){
  if(!ok)throw new Error("TASK011 EXPORT HOLD: "+message);
}
function exact(value,keys){
  return value&&typeof value==="object"&&!Array.isArray(value)&&
    Object.keys(value).length===keys.length&&
    Object.keys(value).every(key=>keys.includes(key));
}
function iso(value){
  if(typeof value!=="string")return false;
  const parsed=new Date(value);
  return !Number.isNaN(parsed.getTime())&&parsed.toISOString()===value;
}

function validateConfig(config){
  hold(exact(config,["schema","mode","target","table"]),
    "exact placeholder-only connector config required");
  hold(config.schema==="NEWTON_CRM_EXPORT_CONFIG_V1",
    "connector config schema required");
  hold(config.mode==="OFFLINE_EXPORT_ONLY",
    "network and write modes are forbidden");
  hold(config.target==="SUPABASE_PLACEHOLDER",
    "approved placeholder target required");
  hold(config.table==="enquiry_events",
    "approved placeholder table required");
}

function validateEvent(event){
  hold(exact(event,[
    "schema","synthetic","eventKey","eventType","handoffId","enquiryRef",
    "attribution","consent","ownerNoticeStatus","state","customerDelivery",
  ]),"exact PII-free CRM event fields required");
  hold(event.schema==="NEWTON_FICTIONAL_CRM_EVENT_V1"&&event.synthetic===true,
    "fictional CRM event required");
  hold(/^crm:enquiry:[0-9a-f-]{36}$/i.test(event.eventKey||"")&&
    event.eventKey==="crm:"+event.handoffId,
    "canonical CRM event key required");
  hold(/^enquiry:[0-9a-f-]{36}$/i.test(event.handoffId||""),
    "canonical handoff ID required");
  hold(UUID.test(event.enquiryRef||""),"canonical enquiry reference required");
  hold(event.eventType==="ENQUIRY_CAPTURED","approved CRM event type required");
  hold(exact(event.attribution,["source","channel"])&&
    SOURCES.has(event.attribution.source)&&
    CHANNELS.has(event.attribution.channel),
    "approved attribution required");
  hold(exact(event.consent,["purpose","capturedAt","marketing"])&&
    event.consent.purpose==="respond_to_enquiry"&&
    iso(event.consent.capturedAt)&&event.consent.marketing===false,
    "enquiry-response consent evidence required");
  hold(NOTICE_STATES.has(event.ownerNoticeStatus),
    "recognised owner-notice state required");
  hold(event.state==="STAGED_OFFLINE_ONLY"&&event.customerDelivery==="HOLD",
    "offline customer-delivery HOLD required");
}

function toRow(event){
  return Object.freeze({
    schema:"NEWTON_FICTIONAL_CRM_ROW_V1",
    synthetic:true,
    event_key:event.eventKey,
    event_type:event.eventType,
    handoff_id:event.handoffId,
    enquiry_ref:event.enquiryRef,
    source:event.attribution.source,
    channel:event.attribution.channel,
    consent_purpose:event.consent.purpose,
    consent_captured_at:event.consent.capturedAt,
    marketing_consent:false,
    owner_notice_status:event.ownerNoticeStatus,
    state:"STAGED_OFFLINE_ONLY",
    customer_delivery:"HOLD",
  });
}

export function buildOfflineCrmExport(events,config){
  validateConfig(config);
  hold(Array.isArray(events),"CRM event array required");
  const byKey=new Map();
  for(const event of events){
    validateEvent(event);
    const serialized=JSON.stringify(event);
    const previous=byKey.get(event.eventKey);
    hold(!previous||previous.serialized===serialized,
      "conflicting CRM events share one event key");
    if(!previous)byKey.set(event.eventKey,{event,serialized});
  }
  const rows=[...byKey.values()].map(item=>toRow(item.event)).sort((a,b)=>
    a.consent_captured_at.localeCompare(b.consent_captured_at)||
    a.event_key.localeCompare(b.event_key));
  const digest=createHash("sha256").update(JSON.stringify(rows)).digest("hex");
  return Object.freeze({
    schema:"NEWTON_FICTIONAL_CRM_EXPORT_V1",
    synthetic:true,
    target:config.target,
    table:config.table,
    connectionState:"NEEDS_CONNECTION",
    writeIntent:"NONE",
    rowCount:rows.length,
    batchDigest:"sha256:"+digest,
    rows:Object.freeze(rows),
    customerDelivery:"HOLD",
  });
}

const ENV_NAME=/^[A-Z][A-Z0-9_]{2,63}$/;
const CRM_COLUMNS=Object.freeze([
  "event_key","event_type","handoff_id","enquiry_ref","source","channel",
  "consent_purpose","consent_captured_at","marketing_consent",
  "owner_notice_status","state","customer_delivery",
]);

function safeEnvName(value){
  return typeof value==="string"&&ENV_NAME.test(value)&&
    !/(SECRET_VALUE|TOKEN_VALUE|PASSWORD_VALUE|PRIVATE_KEY)/.test(value);
}

// Placeholder-only permission contract for a future owner-approved Supabase
// connection. This performs no DNS, authentication, schema query or data write.
export function prepareReadOnlyCrmConnector(config){
  const keys=["version","provider","projectRefEnv","credentialEnv","table",
    "readOnly","allowInsert","allowUpdate","allowDelete"];
  hold(exact(config,keys),"exact non-secret connector descriptor required");
  hold(config.version===1,"connector descriptor version 1 required");
  hold(config.provider==="SUPABASE","approved CRM provider required");
  hold(safeEnvName(config.projectRefEnv),"project reference environment name required");
  hold(safeEnvName(config.credentialEnv),"credential environment name required");
  hold(config.projectRefEnv!==config.credentialEnv,
    "project and credential placeholders must differ");
  hold(config.table==="enquiry_events","approved enquiry table required");
  hold(config.readOnly===true,"read-only permission required");
  hold(config.allowInsert===false&&config.allowUpdate===false&&config.allowDelete===false,
    "all CRM write permissions must remain disabled");

  return Object.freeze({
    schema:"NEWTON_CRM_CONNECTOR_READINESS_V1",
    state:"NEEDS_CONNECTION",
    provider:"SUPABASE",
    projectRefEnv:config.projectRefEnv,
    credentialEnv:config.credentialEnv,
    expectedTable:config.table,
    expectedColumns:CRM_COLUMNS,
    capability:"READ_SCHEMA_METADATA_ONLY",
    blockers:Object.freeze([
      "OWNER_APPROVED_READONLY_CREDENTIAL_REQUIRED",
      "MAC_RUNTIME_CONNECTIVITY_UNVERIFIED",
    ]),
    networkCalled:false,
    authenticated:false,
    connected:false,
    writeIntent:"NONE",
    customerDataAccess:false,
    customerDelivery:"HOLD",
  });
}
