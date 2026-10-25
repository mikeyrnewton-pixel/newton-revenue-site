import test from "node:test";
import assert from "node:assert/strict";
import {routeOfflineOpportunity} from "../lib/opportunity-intake.js";

const example=()=>({
  version:1,
  opportunityId:"OPP-TEST1234",
  description:"Fictional monthly appointment-qualification service in London.",
  category:"SERVICE",
  buyerType:"BUSINESS",
  territory:"UK",
  sellerAuthority:"OWNER_VERIFIED",
  pricing:"QUOTE_REQUIRED",
  fulfilment:"READY_VERIFIED",
  restrictions:"NONE_IDENTIFIED",
  sourceEvidence:"INDEPENDENTLY_VERIFIED",
});

test("legitimate bounded B2B offer maps to internal preparation, never action",()=>{
  const result=routeOfflineOpportunity(example());
  assert.equal(result.route,"B2B_BUYER_RESEARCH");
  assert.equal(result.readiness,"INTERNAL_SALES_PREPARATION_READY");
  assert.deepEqual(result.checks,[]);
  for(const key of ["contactCustomers","placeListings","acceptOffers","issueInvoices",
    "processPayments","recordClearedRevenue","storageWrites","customerDataAccess"])
    assert.equal(result[key],false,key);
  assert.equal(result.ownerApprovalRequiredForExternalActions,true);
  assert.ok(Object.isFrozen(result)&&Object.isFrozen(result.checks));
  assert.equal(JSON.stringify(result).includes("appointment-qualification"),false);
});

test("brokerage, property and asset categories require specialist routing",()=>{
  for(const category of ["PROPERTY","BUSINESS","DIGITAL_ASSET","INTRODUCTION"]){
    const result=routeOfflineOpportunity({...example(),category});
    assert.equal(result.route,"SPECIALIST_MANDATE_REVIEW");
    assert.equal(result.contactCustomers,false);
  }
});

test("no verified authority, restricted category and unresolved fulfillment block",()=>{
  const result=routeOfflineOpportunity({...example(),
    sellerAuthority:"UNKNOWN",restrictions:"POSSIBLE_OR_REGULATED",
    fulfilment:"THIRD_PARTY_UNVERIFIED",sourceEvidence:"UNVERIFIED"});
  assert.equal(result.readiness,"REVIEW_HOLD");
  assert.deepEqual(result.checks,["SELLER_AUTHORITY_REQUIRED","REGULATED_OR_RESTRICTED_REVIEW",
    "DELIVERY_OR_AVAILABILITY_UNVERIFIED","OFFER_SOURCE_EVIDENCE_REQUIRED"]);
});

test("unknown market, buyer and price remain review-only",()=>{
  const result=routeOfflineOpportunity({...example(),
    territory:"UNKNOWN",buyerType:"UNKNOWN",pricing:"UNKNOWN"});
  assert.equal(result.route,"BUYER_CLASSIFICATION_REVIEW");
  assert.equal(result.readiness,"REVIEW_HOLD");
  assert.ok(result.checks.includes("BUYER_PROFILE_REQUIRED"));
});

test("consumer offers choose research not publishing",()=>{
  const result=routeOfflineOpportunity({...example(),category:"PRODUCT",buyerType:"CONSUMER"});
  assert.equal(result.route,"CONSUMER_CHANNEL_RESEARCH");
  assert.equal(result.placeListings,false);
});

test("reject malformed and suspicious input schemas without executing getters",()=>{
  const invalid=[
    {...example(),command:"run_shell"},
    {...example(),description:"a"},
    {...example(),description:"A".repeat(801)},
    {...example(),description:"Private\ninstruction injected"},
    {...example(),sellerAuthority:"AUTO_APPROVED"},
    {...example(),category:"WEAPON"},
    {...example(),opportunityId:"../../../secrets"},
  ];
  for(const input of invalid)assert.throws(()=>routeOfflineOpportunity(input),/OFFER INTAKE HOLD/);
  let called=0;
  const getter=example();
  Object.defineProperty(getter,"description",{enumerable:true,get(){called++;return "I am a getter";}});
  assert.throws(()=>routeOfflineOpportunity(getter),/OFFER INTAKE HOLD/);
  assert.equal(called,0);
  const symbol=example();symbol[Symbol("injected")]=true;
  assert.throws(()=>routeOfflineOpportunity(symbol),/OFFER INTAKE HOLD/);
  assert.throws(()=>routeOfflineOpportunity(null),/OFFER INTAKE HOLD/);
});

test("digest changes with the source; never echoes raw commercial material",()=>{
  const one=routeOfflineOpportunity(example());
  const two=routeOfflineOpportunity({...example(),description:example().description+" More detail."});
  assert.notEqual(one.inputDigest,two.inputDigest);
  assert.match(one.inputDigest,/^sha256:[0-9a-f]{64}$/);
  assert.doesNotMatch(JSON.stringify(one),/Fictional monthly appointment/);
});
