import test from "node:test";
import assert from "node:assert/strict";
import {reviewExistingCrmCutover} from "../lib/diagnostic-crm-cutover-gate.js";
const base=()=>({
  version:1,observedAt:"2026-10-25T12:30:00.000Z",
  reportedBy:"OWNER_READ_ONLY_RECONCILIATION",opportunityRowCount:21,
  authUserCount:0,rlsEnabled:true,policyCount:0,ownerColumnPresent:false,
});
test("nonempty legacy CRM and zero auth accounts both prevent migration",()=>{
  const review=reviewExistingCrmCutover(base());
  assert.equal(review.outcome,"PRODUCTION_CRM_CUTOVER_HOLD");
  assert.equal(review.observedOpportunityRows,21);
  assert.equal(review.observedAuthUsers,0);
  assert.ok(review.blockers.includes("PRESERVE_EXISTING_RECORDS_BEFORE_OWNERSHIP_MIGRATION"));
  assert.ok(review.blockers.includes("NO_VERIFIED_OWNER_AUTH_SESSION"));
  assert.equal(review.legacyRecordsWillBeDeleted,false);
  assert.equal(review.automaticOwnershipAssignment,false);
  assert.equal(review.liveWritesAllowed,false);
  assert.equal(review.verifiedClearedRevenueGBP,0);
  assert.ok(Object.isFrozen(review)&&Object.isFrozen(review.blockers));
});
test("even an empty database and existing owner account do NOT imply release authority",()=>{
  const review=reviewExistingCrmCutover({...base(),opportunityRowCount:0,authUserCount:1});
  assert.ok(!review.blockers.includes("PRESERVE_EXISTING_RECORDS_BEFORE_OWNERSHIP_MIGRATION"));
  assert.ok(!review.blockers.includes("NO_VERIFIED_OWNER_AUTH_SESSION"));
  assert.ok(review.blockers.includes("ISOLATED_REAL_POSTGRES_ROLE_TEST_NOT_EXECUTED"));
  assert.ok(review.blockers.includes("SCOPED_OWNER_SECURITY_APPROVAL_REQUIRED"));
  assert.equal(review.authSignInVerified,false);
  assert.equal(review.isolatedDbRoleTestsPassed,false);
  assert.equal(review.ownerApprovalRecorded,false);
  assert.equal(review.outcome,"PRODUCTION_CRM_CUTOVER_HOLD");
});
test("policy drift, previous ownership-column change and disabled RLS are rejected",()=>{
  const review=reviewExistingCrmCutover({...base(),
    rlsEnabled:false,policyCount:1,ownerColumnPresent:true});
  assert.ok(review.blockers.includes("EXISTING_RLS_NOT_ENABLED"));
  assert.ok(review.blockers.includes("POLICY_DRIFT_NEEDS_FRESH_REVIEW"));
  assert.ok(review.blockers.includes("OWNERSHIP_SCHEMA_DRIFT"));
});
test("fails before evaluating getters, extra personal data, fake counts or bad dates",()=>{
  const attacks=[
    null,[],{...base(),clientEmail:"buyer@example.org"},
    {...base(),authUserCount:-1},{...base(),opportunityRowCount:"21"},
    {...base(),rlsEnabled:"true"},{...base(),observedAt:"2026-10-25"},
    {...base(),observedAt:"2026-99-25T12:30:00.000Z"},
    {...base(),reportedBy:"LIVE_AUTH_AND_GO"},
  ];
  for(const x of attacks)assert.throws(()=>reviewExistingCrmCutover(x),/CRM CUTOVER HOLD/);
  let calls=0;const x=base();
  Object.defineProperty(x,"observedAt",{enumerable:true,get(){calls++;return "2026-10-25T12:30:00.000Z";}});
  assert.throws(()=>reviewExistingCrmCutover(x),/CRM CUTOVER HOLD/);
  assert.equal(calls,0);
});
test("reported provenance alone cannot be treated as authenticated evidence",()=>{
  const review=reviewExistingCrmCutover(base());
  assert.equal(review.reportedProvenance,"OPERATOR_DECLARATION_NOT_REAUTHENTICATED");
  assert.equal(review.outreachEnabled,false);
  assert.equal(review.paymentsEnabled,false);
  assert.equal(review.writeIntent,"NONE");
});
