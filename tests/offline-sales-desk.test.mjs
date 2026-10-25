import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {routeOfflineOpportunity} from "../lib/opportunity-intake.js";

// This file is outside public/ and is not deployed by the Pages build.
const html=readFileSync(new URL("../tools/atlas-sales-desk-offline.html",import.meta.url),"utf8");
const match=/function assess\(o\)\{[\s\S]*?\n\}\nfunction buildPlan\(\)/u.exec(html);
assert.ok(match,"expected auditable self-contained browser routing function");
const assess=runInNewContext("("+match[0].replace("\nfunction buildPlan()","")+")",Object.create(null));

const base=()=>({
  ref:"OPP-PREVIEW123",category:"SERVICE",
  description:"Fictional appointment follow-up service for a UK service firm.",
  buyerType:"BUSINESS",territory:"UK",sellerAuthority:"OWNER_VERIFIED",
  pricing:"QUOTE_REQUIRED",fulfilment:"READY_VERIFIED",restrictions:"NONE_IDENTIFIED",
  sourceEvidence:"INDEPENDENTLY_VERIFIED",
});
function fromBrowserToRouter(o){
  return {version:1,opportunityId:o.ref,description:o.description,category:o.category,
    buyerType:o.buyerType,territory:o.territory,sellerAuthority:o.sellerAuthority,
    pricing:o.pricing,fulfilment:o.fulfilment,restrictions:o.restrictions,
    sourceEvidence:o.sourceEvidence};
}
test("offline preview is outside public site and denies network and stored state",()=>{
  assert.match(html,/<meta http-equiv="Content-Security-Policy"/);
  assert.match(html,/default-src 'none'/);
  assert.match(html,/connect-src 'none'/);
  assert.match(html,/form-action 'none'/);
  assert.doesNotMatch(html,/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|localStorage|sessionStorage|indexedDB)\s*\(/);
  assert.match(html,/not independently checked/i);
  assert.match(html,/Not a public customer intake form/i);
});
test("offline browser route agrees with canonical Node intake checks",()=>{
  const samples=[
    base(),
    {...base(),category:"PRODUCT",buyerType:"CONSUMER"},
    {...base(),category:"PROPERTY"},
    {...base(),category:"BUSINESS",sellerAuthority:"WRITTEN_MANDATE_VERIFIED"},
    {...base(),category:"DIGITAL_ASSET"},
    {...base(),category:"INTRODUCTION"},
    {...base(),category:"OTHER",buyerType:"UNKNOWN"},
    {...base(),sellerAuthority:"UNKNOWN",restrictions:"POSSIBLE_OR_REGULATED",fulfilment:"UNKNOWN"},
    {...base(),territory:"UNKNOWN",buyerType:"UNKNOWN",pricing:"UNKNOWN",sourceEvidence:"UNVERIFIED"},
    {...base(),restrictions:"UNKNOWN",fulfilment:"THIRD_PARTY_UNVERIFIED"},
  ];
  for(const input of samples){
    const browser=assess(input),router=routeOfflineOpportunity(fromBrowserToRouter(input));
    assert.equal(browser.route,router.route);
    assert.equal(browser.readiness,router.readiness);
    assert.deepEqual(Array.from(browser.checks),Array.from(router.checks));
    assert.equal(router.contactCustomers,false);
    assert.equal(router.recordClearedRevenue,false);
  }
});
test("offline browser rejects malformed IDs and short descriptions",()=>{
  assert.throws(()=>assess({...base(),ref:"../../secrets"}),/Use an ID/);
  assert.throws(()=>assess({...base(),description:"oops"}),/12–800/);
  assert.throws(()=>assess({...base(),description:"Line\nbreak inserted"}),/12–800/);
});