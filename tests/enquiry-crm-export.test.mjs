import test from "node:test";
import assert from "node:assert/strict";
import {toFictionalDeliveryHandoff} from "../lib/enquiry-handoff.js";
import {toFictionalCrmEvent} from "../lib/enquiry-crm-adapter.js";
import {buildOfflineCrmExport} from "../lib/enquiry-crm-export.js";

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
