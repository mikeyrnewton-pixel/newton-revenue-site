import test from "node:test";
import assert from "node:assert/strict";
import {READONLY_PATHS,VERIFIED_ORIGIN,assessReadOnlyResponses,
  probeNewtonPublicReadOnly} from "../lib/public-site-readonly-verifier.js";
const base=()=>READONLY_PATHS.map(x=>({path:x.path,status:x.status,
  body:x.content?"<main>"+x.content+"</main>":"",error:null}));
test("public read-only contract checks 7 fixed routes, never grants release",()=>{
  const r=assessReadOnlyResponses(base());
  assert.equal(r.checkedPaths.length,7);
  assert.equal(r.publicRoutingReady,true);
  assert.equal(r.newRuntimeErasureRouteConfirmed,true);
  assert.equal(r.endToEndEnquiryProven,false);
  assert.equal(r.authenticatedOwnerVerified,false);
  assert.equal(r.permissionToDeploy,false);
  assert.equal(r.privateRecordsRead,0);
  assert.equal(r.outcome,"PUBLIC_READONLY_CONTRACT_PASSED_NOT_RELEASED");
  assert.ok(Object.isFrozen(r)&&Object.isFrozen(r.checkedPaths));
});
test("existing production fallback for draft-only erasure route is a HOLD, not a 200 success",()=>{
  const x=base();x[6].status=200;x[6].body="<html>Homepage</html>";
  const r=assessReadOnlyResponses(x);
  assert.equal(r.checkedPaths[6].reason,"API_ROUTE_RETURNED_PUBLIC_FALLBACK");
  assert.equal(r.newRuntimeErasureRouteConfirmed,false);
  assert.equal(r.outcome,"PUBLIC_HTTP_RELEASE_HOLD");
  assert.equal(r.publicRoutingReady,false);
});
test("safe handling of private route exposure, redirected paths and absent public content",()=>{
  for(const index of [3,4,5]){
    const x=base();x[index].status=200;x[index].body="PRIVATE DATA WOULD HAVE BEEN EXPOSED";
    assert.equal(assessReadOnlyResponses(x).publicRoutingReady,false);
  }
  for(const index of [0,1,2]){
    const x=base();x[index].status=301;x[index].body="";
    assert.equal(assessReadOnlyResponses(x).publicRoutingReady,false);
    x[index].status=200;
    assert.equal(assessReadOnlyResponses(x).checkedPaths[index].reason,"EXPECTED_PAGE_CONTENT_MISSING");
  }
});
test("reject accessor traps, unbounded bodies, personal data fields and reordered paths",()=>{
  const x=base();
  x[0]={...x[0],email:"buyer@example.com"};
  assert.throws(()=>assessReadOnlyResponses(x),/PUBLIC_HTTP_RELEASE_HOLD/);
  const y=base();y[1].body="x".repeat(100001);
  assert.throws(()=>assessReadOnlyResponses(y),/PUBLIC_HTTP_RELEASE_HOLD/);
  const z=base();const temp=z[0];z[0]=z[1];z[1]=temp;
  assert.throws(()=>assessReadOnlyResponses(z),/PUBLIC_HTTP_RELEASE_HOLD/);
  const w=base();let calls=0;
  Object.defineProperty(w[0],"status",{get(){calls++;return 200;},enumerable:true});
  assert.throws(()=>assessReadOnlyResponses(w),/PUBLIC_HTTP_RELEASE_HOLD/);
  assert.equal(calls,0);
});
test("probe makes only seven authenticated-free GET requests to fixed host and reads no private body",async()=>{
  const seen=[];
  const fake=async(url,options)=>{
    seen.push({url,options});
    const path=new URL(url).pathname;
    const plan=READONLY_PATHS.find(x=>x.path===path);
    assert.ok(plan);
    return {
      status:plan.status,
      async text(){
        assert.ok(plan.content,"must not read private or restricted API bodies");
        return plan.content;
      },
    };
  };
  const r=await probeNewtonPublicReadOnly({fetchImpl:fake});
  assert.equal(seen.length,7);
  assert.equal(r.publicRoutingReady,true);
  for(const [i,c] of seen.entries()){
    assert.equal(c.url,VERIFIED_ORIGIN+READONLY_PATHS[i].path);
    assert.deepEqual(Object.keys(c.options).sort(),
      ["cache","credentials","method","redirect","signal"]);
    assert.equal(c.options.method,"GET");
    assert.equal(c.options.credentials,"omit");
    assert.equal(c.options.redirect,"manual");
    assert.equal(c.options.cache,"no-store");
    assert.ok(c.options.signal);
  }
});
test("probe fails closed if network fails and never attempts POST/fallback write",async()=>{
  let called=0;
  const r=await probeNewtonPublicReadOnly({fetchImpl:async()=>{
    called++;throw Error("DNS unavailable");
  }});
  assert.equal(called,7);
  assert.equal(r.publicRoutingReady,false);
  assert.equal(r.checkedPaths.every(x=>x.reason==="NETWORK_OR_CONTENT_UNVERIFIED"),true);
  assert.equal(r.formsSubmitted,0);
  assert.equal(r.moneyCapturedGBP,0);
  await assert.rejects(probeNewtonPublicReadOnly({timeoutMs:999}),/PUBLIC_HTTP_RELEASE_HOLD/);
});
