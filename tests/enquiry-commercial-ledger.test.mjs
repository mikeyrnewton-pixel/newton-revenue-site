import test from "node:test";
import assert from "node:assert/strict";
import {toFictionalDeliveryHandoff} from "../lib/enquiry-handoff.js";
import {toFictionalCrmEvent} from "../lib/enquiry-crm-adapter.js";
import {buildOfflineCrmExport} from "../lib/enquiry-crm-export.js";
import {buildOfflineCommercialLeadExport} from "../lib/enquiry-commercial-ledger.js";

const crmConfig=()=>({
  schema:"NEWTON_CRM_EXPORT_CONFIG_V1",
  mode:"OFFLINE_EXPORT_ONLY",
  target:"SUPABASE_PLACEHOLDER",
  table:"enquiry_events",
});
const ledgerConfig=()=>({
  schema:"NEWTON_COMMERCIAL_LEDGER_EXPORT_CONFIG_V1",
  mode:"OFFLINE_EXPORT_ONLY",
  target:"COMMERCIAL_LEDGER_PLACEHOLDER",
  table:"commercial_leads",
});
function record(overrides={}){
  return {
    id:"11111111-1111-4111-8111-111111111111",
    submissionId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    createdAt:"2026-10-20T10:00:01.000Z",
    contactPermissionCapturedAt:"2026-10-20T10:00:00.000Z",
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
function exportFor(overrides={}){
  const handoff=toFictionalDeliveryHandoff(record(overrides));
  return buildOfflineCrmExport([toFictionalCrmEvent(handoff)],crmConfig());
}

test("creates deterministic enquiry-only ledger seed with every money state held",()=>{
  const first=buildOfflineCommercialLeadExport(exportFor(),ledgerConfig());
  const second=buildOfflineCommercialLeadExport(exportFor(),ledgerConfig());
  assert.deepEqual(first,second);
  assert.equal(first.connectionState,"NEEDS_CONNECTION");
  assert.equal(first.writeIntent,"NONE");
  assert.equal(first.commercialTruth,"ENQUIRIES_ONLY_NOT_REVENUE");
  assert.equal(first.recordedPaymentEvidenceGBP,0);
  assert.equal(first.clearedEvidenceGBP,0);
  assert.equal(first.customerDelivery,"HOLD");
  assert.equal(first.rowCount,1);
  assert.match(first.batchDigest,/^sha256:[0-9a-f]{64}$/);

  const row=first.rows[0];
  assert.equal(row.source_record_id,"11111111-1111-4111-8111-111111111111");
  assert.equal(row.source_classification,"SYNTHETIC");
  assert.match(row.source_evidence_digest,/^[0-9a-f]{64}$/);
  assert.equal(row.commercial_state,"ENQUIRY_ONLY");
  assert.equal(row.quote_state,"NOT_QUOTED");
  assert.equal(row.acceptance_state,"NOT_ACCEPTED");
  assert.equal(row.invoice_state,"NOT_INVOICED");
  assert.equal(row.payment_state,"NOT_RECORDED");
  assert.equal(row.recorded_payment_evidence_gbp,0);
  assert.equal(row.cleared_evidence_gbp,0);
  assert.equal(row.next_action,"OWNER_QUALIFICATION_REQUIRED");

  const serialized=JSON.stringify(first);
  for(const pii of [
    "Fictional Buyer","fictional@example.invalid","Synthetic Ltd",
    "Synthetic missed enquiry",
  ]) assert.equal(serialized.includes(pii),false);
});

test("emits deterministic PR29-compatible source bindings per lead",()=>{
  const first=buildOfflineCommercialLeadExport(exportFor(),ledgerConfig()).rows[0];
  const retry=buildOfflineCommercialLeadExport(exportFor(),ledgerConfig()).rows[0];
  assert.equal(first.source_record_id,retry.source_record_id);
  assert.equal(first.source_evidence_digest,retry.source_evidence_digest);

  const distinct=buildOfflineCommercialLeadExport(exportFor({
    id:"22222222-2222-4222-8222-222222222222",
    submissionId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  }),ledgerConfig()).rows[0];
  assert.notEqual(first.source_record_id,distinct.source_record_id);
  assert.notEqual(first.source_evidence_digest,distinct.source_evidence_digest);
  assert.equal(distinct.source_classification,"SYNTHETIC");
});

test("owner notice delivery never becomes buyer acceptance or payment evidence",()=>{
  const delivered=exportFor({
    notification:{
      version:1,
      status:"delivered",
      attempts:1,
      lastAttemptAt:"2026-10-20T10:01:00.000Z",
      deliveredAt:"2026-10-20T10:01:01.000Z",
    },
  });
  const output=buildOfflineCommercialLeadExport(delivered,ledgerConfig());
  assert.equal(output.rows[0].owner_notice_status,"delivered");
  assert.equal(output.rows[0].acceptance_state,"NOT_ACCEPTED");
  assert.equal(output.rows[0].payment_state,"NOT_RECORDED");
  assert.equal(output.clearedEvidenceGBP,0);
});

test("rejects live, writable, PII-bearing or duplicate CRM exports",()=>{
  const original=exportFor();
  assert.throws(
    ()=>buildOfflineCommercialLeadExport({...original,connectionState:"LIVE"},ledgerConfig()),
    /offline no-write CRM source required/,
  );
  assert.throws(
    ()=>buildOfflineCommercialLeadExport({...original,writeIntent:"INSERT"},ledgerConfig()),
    /offline no-write CRM source required/,
  );
  const piiRow={...original.rows[0],email:"person@example.invalid"};
  assert.throws(
    ()=>buildOfflineCommercialLeadExport({...original,rows:[piiRow]},ledgerConfig()),
    /exact PII-free CRM row fields required/,
  );
  assert.throws(
    ()=>buildOfflineCommercialLeadExport({
      ...original,rowCount:2,rows:[original.rows[0],original.rows[0]],
    },ledgerConfig()),
    /duplicate CRM event key forbidden/,
  );
});

test("rejects destination details, credentials and write modes",()=>{
  const original=exportFor();
  assert.throws(
    ()=>buildOfflineCommercialLeadExport(original,{
      ...ledgerConfig(),url:"https://example.invalid",
    }),
    /exact placeholder-only ledger config required/,
  );
  assert.throws(
    ()=>buildOfflineCommercialLeadExport(original,{
      ...ledgerConfig(),apiKey:"secret",
    }),
    /exact placeholder-only ledger config required/,
  );
  assert.throws(
    ()=>buildOfflineCommercialLeadExport(original,{
      ...ledgerConfig(),mode:"INSERT",
    }),
    /network and write modes are forbidden/,
  );
});

test("fails closed on altered CRM evidence metadata",()=>{
  const original=exportFor();
  assert.throws(
    ()=>buildOfflineCommercialLeadExport({...original,rowCount:2},ledgerConfig()),
    /valid CRM export evidence required/,
  );
  assert.throws(
    ()=>buildOfflineCommercialLeadExport({...original,batchDigest:"sha256:bad"},ledgerConfig()),
    /valid CRM export evidence required/,
  );
  assert.throws(
    ()=>buildOfflineCommercialLeadExport({...original,target:"LIVE_SUPABASE"},ledgerConfig()),
    /canonical CRM placeholder source required/,
  );
  assert.throws(
    ()=>buildOfflineCommercialLeadExport({
      ...original,
      rows:[{...original.rows[0],owner_notice_status:"delivered"}],
    },ledgerConfig()),
    /rows do not match batch evidence digest/,
  );
});


test("rejects source UUIDs incompatible with the PR29 commercial contract",()=>{
  const original=exportFor();
  const invalidVersion={
    ...original.rows[0],
    enquiry_ref:"00000000-0000-0000-0000-000000000000",
  };
  assert.throws(
    ()=>buildOfflineCommercialLeadExport({...original,rows:[invalidVersion]},ledgerConfig()),
    /canonical enquiry identifiers required/,
  );
});
