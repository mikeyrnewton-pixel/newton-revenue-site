import test from "node:test";
import assert from "node:assert/strict";
import {
  previewOfflineOpportunityCrmRow,
  previewOfflineBuyerResearchCrmRows,
} from "../lib/opportunity-crm-preview.js";
const offer=()=>({
  version:1,opportunityId:"OPP-CRMPREVIEW",description:"Fictional private offer for a small UK service company.",
  category:"SERVICE",buyerType:"BUSINESS",territory:"UK",sellerAuthority:"UNKNOWN",
  pricing:"QUOTE_REQUIRED",fulfilment:"UNKNOWN",restrictions:"UNKNOWN",
  sourceEvidence:"UNVERIFIED",
});
test("existing opportunity table receives no write: only a structurally compatible preview",()=>{
  const res=previewOfflineOpportunityCrmRow(offer());
  assert.equal(res.table,"public.newton_opportunities");
  assert.equal(res.state,"REVIEW_ONLY_NEEDS_AUTH_AND_RLS");
  assert.equal(res.databaseConnected,false);
  assert.equal(res.writeIntent,"NONE");
  assert.equal(res.customerDataAccess,false);
  assert.equal(res.externalContact,false);
  assert.equal(res.invoices,false);
  assert.equal(res.clearedEvidenceGBP,0);
  assert.equal(res.synthetic,true);
  assert.equal(res.row.status,"discovered"); // NEVER 'qualified', 'won' or 'paid'
  assert.equal(res.row.estimated_value_gbp,null);
  assert.deepEqual(res.row.evidence,[]);
  assert.deepEqual(Object.keys(res.row).sort(),[
    "title","source","status","estimated_value_gbp","evidence","next_action",
    "next_action_due","metadata"].sort());
  assert.equal(res.row.metadata.independently_authenticated,false);
  assert.equal(res.row.metadata.prospect_contact_authorised,false);
  assert.equal(res.row.metadata.buyer_discovery_permitted,false);
  assert.equal(res.row.metadata.evidence_gate,"AUTHENTICATED_EVIDENCE_REQUIRED");
  assert.ok(res.row.metadata.evidence_requirement_codes.includes("SELLER_AUTHORITY_PROOF"));
  assert.ok(res.row.metadata.hold_codes.includes("SELLER_AUTHORITY_REQUIRED"));
  assert.ok(Object.isFrozen(res)&&Object.isFrozen(res.row)&&Object.isFrozen(res.row.metadata.hold_codes));
});
test("independently unchecked declarations never turn into a live buyer or payment",()=>{
  const passed=previewOfflineOpportunityCrmRow({...offer(),
    sellerAuthority:"OWNER_VERIFIED",fulfilment:"READY_VERIFIED",
    restrictions:"NONE_IDENTIFIED",sourceEvidence:"INDEPENDENTLY_VERIFIED"});
  assert.equal(passed.row.metadata.preliminary_readiness,"INTERNAL_SALES_PREPARATION_READY");
  assert.equal(passed.row.status,"discovered");
  assert.equal(passed.row.metadata.evidence_gate,"AUTHENTICATED_EVIDENCE_REQUIRED");
  assert.equal(passed.row.metadata.buyer_discovery_permitted,false);
  assert.match(passed.row.next_action,/authenticated evidence/i);
  assert.equal(passed.row.metadata.buyer_verified,false);
  assert.equal(passed.row.metadata.settled_cash_verified,false);
  assert.equal(passed.clearedEvidenceGBP,0);
});
test("private commercial text is neither echoed nor persisted",()=>{
  const plain=offer();
  plain.description="Fictional confidential pricing analysis for ten local firms.";
  const result=previewOfflineOpportunityCrmRow(plain);
  assert.doesNotMatch(JSON.stringify(result),/confidential pricing analysis/i);
  assert.match(result.row.metadata.declared_input_digest,/^sha256:[0-9a-f]{64}$/);
  assert.deepEqual(result,previewOfflineOpportunityCrmRow(plain));
  assert.throws(()=>previewOfflineOpportunityCrmRow({...plain,category:"UNKNOWN_CATEGORY"}),/OFFER INTAKE HOLD/);
});

const publicBrief=(overrides={})=>({
  version:1,
  candidateId:"ORG-CRMTEST001",
  candidateType:"ORGANISATION",
  sourceId:"SRC-CRMTEST001",
  sourceKind:"PUBLIC_BRIEF",
  sourceUrl:"https://example.org/procurement/enquiry-brief",
  publishedAt:"2026-10-24T10:00:00.000Z",
  observedAt:"2026-10-25T09:00:00.000Z",
  signalClass:"OPEN_PURCHASE_BRIEF",
  fit:"HIGH",
  notes:"Public brief metadata only; not proof of a buyer.",
  ...overrides,
});

test("deduplicated public buyer signals map to one no-write CRM preview row",()=>{
  const second=publicBrief({
    sourceId:"SRC-CRMTEST002",
    sourceUrl:"https://example.org/procurement/enquiry-brief-update",
    observedAt:"2026-10-25T09:30:00.000Z",
  });
  const result=previewOfflineBuyerResearchCrmRows(
    [second,publicBrief()],"2026-10-25T11:00:00.000Z",
  );
  assert.equal(result.table,"public.newton_opportunities");
  assert.equal(result.state,"REVIEW_ONLY_NEEDS_AUTH_RLS_AND_SOURCE_VALIDATION");
  assert.equal(result.sourceTruth,"UNVERIFIED_PUBLIC_CLAIMS");
  assert.equal(result.writeIntent,"NONE");
  assert.equal(result.databaseConnected,false);
  assert.equal(result.customerDataAccess,false);
  assert.equal(result.externalContact,false);
  assert.equal(result.invoices,false);
  assert.equal(result.clearedEvidenceGBP,0);
  assert.equal(result.uniqueOrganisationCount,1);
  assert.equal(result.sourceEvidenceCount,2);
  assert.equal(result.rows.length,1);
  assert.equal(result.rows[0].status,"discovered");
  assert.equal(result.rows[0].metadata.source_count,2);
  assert.equal(result.rows[0].evidence.length,2);
  assert.equal(result.rows[0].metadata.source_claim_verified,false);
  assert.equal(result.rows[0].metadata.buyer_purchase_intent_verified,false);
  assert.equal(result.rows[0].metadata.contact_permission_verified,false);
  assert.equal(result.rows[0].metadata.lawful_channel_verified,false);
  assert.equal(result.rows[0].metadata.outreach_approved,false);
  assert.doesNotMatch(JSON.stringify(result),/example\.org|Public brief metadata/i);
  assert.ok(Object.isFrozen(result)&&Object.isFrozen(result.rows)&&
    Object.isFrozen(result.rows[0])&&Object.isFrozen(result.rows[0].evidence));
});

test("stale, sector-only and low-fit research never enters the CRM preview",()=>{
  const records=[
    publicBrief({candidateId:"SECTOR-CRMTEST01",candidateType:"SECTOR",
      sourceId:"SRC-SECTOR001",sourceKind:"PUBLIC_RESEARCH",
      sourceUrl:"https://example.net/research/sector",
      signalClass:"GENERAL_SECTOR_FINDING",publishedAt:null}),
    publicBrief({sourceId:"SRC-STALE0001",
      sourceUrl:"https://example.org/procurement/stale",
      observedAt:"2026-09-01T09:00:00.000Z",
      publishedAt:"2026-08-31T10:00:00.000Z"}),
    publicBrief({sourceId:"SRC-LOWFIT001",
      sourceUrl:"https://example.org/procurement/low-fit",fit:"LOW"}),
  ];
  const result=previewOfflineBuyerResearchCrmRows(
    records,"2026-10-25T11:00:00.000Z",
  );
  assert.equal(result.uniqueOrganisationCount,0);
  assert.equal(result.sourceEvidenceCount,0);
  assert.deepEqual(result.rows,[]);
  assert.equal(result.writeIntent,"NONE");
});

test("CRM preview inherits buyer-research provenance and privacy denials",()=>{
  assert.throws(
    ()=>previewOfflineBuyerResearchCrmRows([
      publicBrief({sourceUrl:"https://127.0.0.1/admin"}),
    ],"2026-10-25T11:00:00.000Z"),
    /BUYER RESEARCH HOLD/,
  );
  assert.throws(
    ()=>previewOfflineBuyerResearchCrmRows([
      {...publicBrief(),buyerEmail:"private@example.org"},
    ],"2026-10-25T11:00:00.000Z"),
    /BUYER RESEARCH HOLD/,
  );
});

