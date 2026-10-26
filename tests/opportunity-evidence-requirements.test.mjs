import test from "node:test";
import assert from "node:assert/strict";
import {buildOpportunityEvidenceRequirements} from "../lib/opportunity-evidence-requirements.js";

const offer=()=>({
  version:1,
  opportunityId:"OPP-EVIDENCE1",
  description:"Fictional owner-declared service opportunity for offline review.",
  category:"SERVICE",
  buyerType:"BUSINESS",
  territory:"UK",
  sellerAuthority:"OWNER_VERIFIED",
  pricing:"FIXED",
  fulfilment:"READY_VERIFIED",
  restrictions:"NONE_IDENTIFIED",
  sourceEvidence:"INDEPENDENTLY_VERIFIED",
});

test("owner declarations never satisfy the authenticated evidence gate",()=>{
  const result=buildOpportunityEvidenceRequirements(offer());
  assert.equal(result.preliminaryReadiness,"INTERNAL_SALES_PREPARATION_READY");
  assert.equal(result.evidenceGate,"AUTHENTICATED_EVIDENCE_REQUIRED");
  assert.equal(result.authenticatedSourceConnected,false);
  assert.equal(result.evidenceAccepted,false);
  assert.equal(result.buyerDiscoveryPermitted,false);
  assert.equal(result.externalActionPermitted,false);
  assert.equal(result.writeIntent,"NONE");
  assert.deepEqual(result.requirements.map(item=>item.code),[
    "SELLER_AUTHORITY_PROOF",
    "OFFER_SOURCE_PROOF",
    "FULFILMENT_OR_AVAILABILITY_PROOF",
    "RESTRICTIONS_AND_JURISDICTION_REVIEW",
    "OFFER_TERMS_PROOF",
  ]);
});

test("specialist categories add mandate and compliance review without enabling action",()=>{
  for(const category of ["PROPERTY","BUSINESS","DIGITAL_ASSET","INTRODUCTION"]){
    const result=buildOpportunityEvidenceRequirements({...offer(),category});
    assert.equal(result.requirements[0].code,"SPECIALIST_MANDATE_AND_COMPLIANCE_REVIEW");
    assert.equal(result.buyerDiscoveryPermitted,false);
  }
});

test("requirements are immutable, deterministic and reveal no commercial description",()=>{
  const input=offer();
  const first=buildOpportunityEvidenceRequirements(input);
  const second=buildOpportunityEvidenceRequirements(input);
  assert.deepEqual(first,second);
  assert.ok(Object.isFrozen(first)&&Object.isFrozen(first.requirements)&&Object.isFrozen(first.requirements[0]));
  assert.match(first.declaredInputDigest,/^sha256:[0-9a-f]{64}$/);
  assert.doesNotMatch(JSON.stringify(first),/owner-declared service opportunity/i);
  assert.throws(()=>buildOpportunityEvidenceRequirements({...input,command:"contact"}),/OFFER INTAKE HOLD/);
});
