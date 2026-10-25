import test from "node:test";
import assert from "node:assert/strict";
import {previewOfflineOpportunityCrmRow} from "../lib/opportunity-crm-preview.js";
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
