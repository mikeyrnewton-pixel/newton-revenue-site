import test from "node:test";
import assert from "node:assert/strict";
import {toFictionalDeliveryHandoff} from "../lib/enquiry-handoff.js";
import {toFictionalCrmEvent} from "../lib/enquiry-crm-adapter.js";
import {buildOfflineCrmExport,prepareReadOnlyCrmConnector} from "../lib/enquiry-crm-export.js";

const config=()=>({
  schema:"NEWTON_CRM_EXPORT_CONFIG_V1",
  mode:"OFFLINE_EXPORT_ONLY",
  target:"SUPABASE_PLACEHOLDER",
  table:"enquiry_events",
});
function record(overrides={}){
  return {
    id:"11111111-1111-4111-8111-111111111111",
    submissionId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    createdAt:"2026-10-20T09:00:01.000Z",
    contactPermissionCapturedAt:"2026-10-20T09:00:00.000Z",
    contactPermission:true,
    marketingConsent:false,
    source:"newton-revenue-site",
    channel:"direct",
    name:"Fictional Buyer",
    email:"fictional@example.invalid",
    company:"Synthetic Ltd",
    problem:"Synthetic missed enquiry",
    notification:{
      version:1,status:"pending",attempts:0,lastAttemptAt:null,deliveredAt:null,
    },
    ...overrides,
  };
}
const event=(overrides={})=>
  toFictionalCrmEvent(toFictionalDeliveryHandoff(record(overrides)));

test("builds deterministic placeholder-only export with no PII or write intent",()=>{
  const crmEvent=event();
  const first=buildOfflineCrmExport([crmEvent],config());
  const second=buildOfflineCrmExport([crmEvent],config());

  assert.deepEqual(first,second);
  assert.equal(first.connectionState,"NEEDS_CONNECTION");
  assert.equal(first.writeIntent,"NONE");
  assert.equal(first.customerDelivery,"HOLD");
  assert.equal(first.rowCount,1);
  assert.match(first.batchDigest,/^sha256:[0-9a-f]{64}$/);
  assert.equal(first.rows[0].event_key,
    "crm:enquiry:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  assert.equal(first.rows[0].marketing_consent,false);

  const serialized=JSON.stringify(first);
  for(const pii of [
    "Fictional Buyer","fictional@example.invalid","Synthetic Ltd",
    "Synthetic missed enquiry",
  ]) assert.equal(serialized.includes(pii),false);
});

test("dedupes exact retries and sorts rows canonically",()=>{
  const later=event({
    id:"22222222-2222-4222-8222-222222222222",
    submissionId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    createdAt:"2026-10-20T09:01:01.000Z",
    contactPermissionCapturedAt:"2026-10-20T09:01:00.000Z",
  });
  const earlier=event();
  const output=buildOfflineCrmExport([later,earlier,earlier],config());
  assert.equal(output.rowCount,2);
  assert.deepEqual(output.rows.map(row=>row.event_key),[
    earlier.eventKey,later.eventKey,
  ]);
});

test("rejects connection details, credentials and write modes",()=>{
  assert.throws(
    ()=>buildOfflineCrmExport([],{...config(),url:"https://example.supabase.co"}),
    /exact placeholder-only connector config required/,
  );
  assert.throws(
    ()=>buildOfflineCrmExport([],{...config(),apiKey:"secret"}),
    /exact placeholder-only connector config required/,
  );
  assert.throws(
    ()=>buildOfflineCrmExport([],{...config(),mode:"INSERT"}),
    /network and write modes are forbidden/,
  );
});

test("rejects live, PII-bearing or conflicting CRM events",()=>{
  const original=event();
  assert.throws(
    ()=>buildOfflineCrmExport([{...original,state:"LIVE"}],config()),
    /offline customer-delivery HOLD required/,
  );
  assert.throws(
    ()=>buildOfflineCrmExport([{...original,email:"person@example.invalid"}],config()),
    /exact PII-free CRM event fields required/,
  );
  assert.throws(
    ()=>buildOfflineCrmExport([
      original,
      {...original,ownerNoticeStatus:"dead-letter"},
    ],config()),
    /conflicting CRM events share one event key/,
  );
});


test("rejects uppercase and non-RFC UUID aliases at the CRM export boundary",()=>{
  // Use a UUID with a-f characters: uppercasing an all-numeric UUID is a no-op.
  const original=event({id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"});
  const uppercase=original.enquiryRef.toUpperCase();
  assert.throws(
    ()=>buildOfflineCrmExport([{
      ...original,
      enquiryRef:uppercase,
    }],config()),
    /canonical enquiry reference required/,
  );
  const nil="00000000-0000-0000-0000-000000000000";
  assert.throws(
    ()=>buildOfflineCrmExport([{
      ...original,
      eventKey:"crm:enquiry:"+nil,
      handoffId:"enquiry:"+nil,
      enquiryRef:nil,
    }],config()),
    /canonical CRM event key|required|reference/,
  );
});


const connectorConfig=()=>({
  version:1,
  provider:"SUPABASE",
  projectRefEnv:"NEWTON_SUPABASE_PROJECT_REF",
  credentialEnv:"NEWTON_SUPABASE_READ_TOKEN",
  table:"enquiry_events",
  readOnly:true,
  allowInsert:false,
  allowUpdate:false,
  allowDelete:false,
});

test("prepares a non-secret read-only CRM contract without claiming connection",()=>{
  const result=prepareReadOnlyCrmConnector(connectorConfig());
  assert.equal(result.state,"NEEDS_CONNECTION");
  assert.equal(result.capability,"READ_SCHEMA_METADATA_ONLY");
  assert.equal(result.expectedTable,"enquiry_events");
  assert.deepEqual(result.expectedColumns,[
    "event_key","event_type","handoff_id","enquiry_ref","source","channel",
    "consent_purpose","consent_captured_at","marketing_consent",
    "owner_notice_status","state","customer_delivery",
  ]);
  assert.deepEqual(result.blockers,[
    "OWNER_APPROVED_READONLY_CREDENTIAL_REQUIRED",
    "MAC_RUNTIME_CONNECTIVITY_UNVERIFIED",
  ]);
  assert.equal(result.networkCalled,false);
  assert.equal(result.authenticated,false);
  assert.equal(result.connected,false);
  assert.equal(result.writeIntent,"NONE");
  assert.equal(result.customerDataAccess,false);
  assert.equal(result.customerDelivery,"HOLD");
});

test("CRM connector contract rejects writes secrets and ambiguous placeholders",()=>{
  for(const permission of ["allowInsert","allowUpdate","allowDelete"]){
    assert.throws(
      ()=>prepareReadOnlyCrmConnector({...connectorConfig(),[permission]:true}),
      /write permissions must remain disabled/,
    );
  }
  assert.throws(
    ()=>prepareReadOnlyCrmConnector({...connectorConfig(),readOnly:false}),
    /read-only permission required/,
  );
  for(const value of ["https://example.supabase.co","actual token","TOKEN_VALUE"]){
    assert.throws(
      ()=>prepareReadOnlyCrmConnector({...connectorConfig(),credentialEnv:value}),
      /credential environment name required/,
    );
  }
  assert.throws(
    ()=>prepareReadOnlyCrmConnector({
      ...connectorConfig(),credentialEnv:"NEWTON_SUPABASE_PROJECT_REF",
    }),
    /placeholders must differ/,
  );
  assert.throws(
    ()=>prepareReadOnlyCrmConnector({...connectorConfig(),apiKey:"secret"}),
    /exact non-secret connector descriptor required/,
  );
});
