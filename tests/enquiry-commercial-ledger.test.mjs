import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {toFictionalDeliveryHandoff} from "../lib/enquiry-handoff.js";
import {toFictionalCrmEvent} from "../lib/enquiry-crm-adapter.js";
import {buildOfflineCrmExport} from "../lib/enquiry-crm-export.js";
import {buildOfflineCommercialLeadExport,consolidateOfflineCommercialLeadExports,emptySyntheticCommercialLeadCursor} from "../lib/enquiry-commercial-ledger.js";

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
function consolidate(exports,priorCursor=emptySyntheticCommercialLeadCursor()){
  return consolidateOfflineCommercialLeadExports(exports,priorCursor);
}
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


test("final ledger rejects two event keys claiming one enquiry reference",()=>{
  const original=exportFor();
  const secondRow={
    ...original.rows[0],
    event_key:"crm:enquiry:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    handoff_id:"enquiry:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  };
  const rows=[original.rows[0],secondRow];
  const forged={
    ...original,
    rowCount:rows.length,
    batchDigest:"sha256:"+createHash("sha256")
      .update(JSON.stringify(rows)).digest("hex"),
    rows,
  };
  assert.throws(
    ()=>buildOfflineCommercialLeadExport(forged,ledgerConfig()),
    /one enquiry reference cannot map to multiple CRM event keys/,
    "a valid batch digest cannot override canonical enquiry ownership",
  );
});


test("rejects malformed submission UUIDs at the final ledger boundary",()=>{
  const original=exportFor();
  const nil="00000000-0000-0000-0000-000000000000";
  const malformed={
    ...original.rows[0],
    event_key:"crm:enquiry:"+nil,
    handoff_id:"enquiry:"+nil,
  };
  assert.throws(
    ()=>buildOfflineCommercialLeadExport({...original,rows:[malformed]},ledgerConfig()),
    /canonical event key required/,
    "a digest mismatch must not be the only protection against malformed submission IDs",
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
  const uppercaseAlias={
    ...original.rows[0],
    enquiry_ref:"ABCDEFAB-CDEF-4ABC-8DEF-ABCDEFABCDEF",
  };
  assert.throws(
    ()=>buildOfflineCommercialLeadExport({...original,rows:[uppercaseAlias]},ledgerConfig()),
    /canonical enquiry identifiers required/,
    "uppercase UUID aliases must fail at the final ledger boundary",
  );
});


test("cross-batch consolidation is idempotent and remains enquiry-only",()=>{
  const batch=buildOfflineCommercialLeadExport(exportFor(),ledgerConfig());
  const result=consolidate([batch,batch]);
  assert.equal(result.state,"STAGED_OFFLINE_ONLY");
  assert.equal(result.connectionState,"NEEDS_CONNECTION");
  assert.equal(result.writeIntent,"NONE");
  assert.equal(result.sourceBatchCount,2);
  assert.equal(result.uniqueLeadCount,1);
  assert.match(result.batchDigest,/^sha256:[0-9a-f]{64}$/);
  assert.equal(result.commercialTruth,"ENQUIRIES_ONLY_NOT_REVENUE");
  assert.equal(result.recordedPaymentEvidenceGBP,0);
  assert.equal(result.clearedEvidenceGBP,0);
  assert.equal(result.customerDelivery,"HOLD");
});

test("cross-batch consolidation rejects changed enquiry ownership",()=>{
  const firstCrm=exportFor();
  const first=buildOfflineCommercialLeadExport(firstCrm,ledgerConfig());
  const changedRow={
    ...firstCrm.rows[0],
    event_key:"crm:enquiry:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    handoff_id:"enquiry:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  };
  const changedCrm={
    ...firstCrm,
    rows:[changedRow],
    batchDigest:"sha256:"+createHash("sha256")
      .update(JSON.stringify([changedRow])).digest("hex"),
  };
  const second=buildOfflineCommercialLeadExport(changedCrm,ledgerConfig());
  assert.throws(
    ()=>consolidate([first,second]),
    /one enquiry reference cannot change CRM event ownership across batches/,
    "separate valid batch digests cannot reassign an enquiry",
  );
  assert.throws(
    ()=>consolidate([{
      ...first,batchDigest:"sha256:"+"0".repeat(64),
    }]),
    /rows do not match batch evidence digest/,
  );
});

test("cross-batch source evidence cannot be reused for different leads",()=>{
  const first=buildOfflineCommercialLeadExport(exportFor(),ledgerConfig());
  const secondOriginal=buildOfflineCommercialLeadExport(exportFor({
    id:"22222222-2222-4222-8222-222222222222",
    submissionId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  }),ledgerConfig());
  const aliasedRow={
    ...secondOriginal.rows[0],
    source_evidence_digest:first.rows[0].source_evidence_digest,
  };
  const second={
    ...secondOriginal,
    rows:[aliasedRow],
    batchDigest:"sha256:"+createHash("sha256")
      .update(JSON.stringify([aliasedRow])).digest("hex"),
  };
  assert.throws(
    ()=>consolidate([first,second]),
    /one source evidence digest cannot prove multiple commercial leads/,
    "a fresh batch digest cannot authorise cross-lead source evidence reuse",
  );
});


test("cumulative commercial lead cursor is frozen and makes a later retry idempotent",()=>{
  const batch=buildOfflineCommercialLeadExport(exportFor(),ledgerConfig());
  const first=consolidate([batch]);
  assert.deepEqual(first.reconciliationCursor,{
    version:1,
    synthetic:true,
    rows:[batch.rows[0]],
  });
  assert.ok(Object.isFrozen(first.reconciliationCursor));
  assert.ok(Object.isFrozen(first.reconciliationCursor.rows));
  assert.ok(Object.isFrozen(first.reconciliationCursor.rows[0]));

  const retry=consolidate([batch],first.reconciliationCursor);
  assert.equal(retry.uniqueLeadCount,1);
  assert.deepEqual(retry.reconciliationCursor,first.reconciliationCursor);
});

test("commercial lead consolidation fails closed without an explicit prior cursor",()=>{
  const batch=buildOfflineCommercialLeadExport(exportFor(),ledgerConfig());
  assert.throws(
    ()=>consolidateOfflineCommercialLeadExports([batch]),
    /exact prior commercial lead cursor required/,
  );
  assert.throws(
    ()=>consolidate([batch],{version:1,synthetic:true,rows:[],extra:true}),
    /exact prior commercial lead cursor required/,
  );
});

test("cumulative cursor rejects changed enquiry ownership in a later invocation",()=>{
  const firstCrm=exportFor();
  const first=buildOfflineCommercialLeadExport(firstCrm,ledgerConfig());
  const staged=consolidate([first]);
  const changedRow={
    ...firstCrm.rows[0],
    event_key:"crm:enquiry:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    handoff_id:"enquiry:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  };
  const changedCrm={
    ...firstCrm,
    rows:[changedRow],
    batchDigest:"sha256:"+createHash("sha256")
      .update(JSON.stringify([changedRow])).digest("hex"),
  };
  const second=buildOfflineCommercialLeadExport(changedCrm,ledgerConfig());
  assert.throws(
    ()=>consolidate([second],staged.reconciliationCursor),
    /one enquiry reference cannot change CRM event ownership across batches/,
  );
});

test("cumulative cursor rejects source evidence reuse by a later lead",()=>{
  const first=buildOfflineCommercialLeadExport(exportFor(),ledgerConfig());
  const staged=consolidate([first]);
  const secondOriginal=buildOfflineCommercialLeadExport(exportFor({
    id:"22222222-2222-4222-8222-222222222222",
    submissionId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  }),ledgerConfig());
  const aliasedRow={
    ...secondOriginal.rows[0],
    source_evidence_digest:first.rows[0].source_evidence_digest,
  };
  const second={
    ...secondOriginal,
    rows:[aliasedRow],
    batchDigest:"sha256:"+createHash("sha256")
      .update(JSON.stringify([aliasedRow])).digest("hex"),
  };
  assert.throws(
    ()=>consolidate([second],staged.reconciliationCursor),
    /one source evidence digest cannot prove multiple commercial leads/,
  );
});
