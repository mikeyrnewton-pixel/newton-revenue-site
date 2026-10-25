// ATLAS: read-only public Cloudflare Pages release contract.
// No POST, cookies, credentials, request bodies, provider APIs or customer records.
// A public GET can establish HTTP routing, NEVER private lead storage or real sales.
export const VERIFIED_ORIGIN="https://newton-revenue-site.pages.dev";
export const READONLY_PATHS=Object.freeze([
  Object.freeze({id:"home",path:"/",status:200,content:"Newton Revenue"}),
  Object.freeze({id:"diagnostic",path:"/enquiry-diagnostic/",status:200,content:"Enquiry Ownership Diagnostic"}),
  Object.freeze({id:"enquiryCheck",path:"/enquiry-check/",status:200,content:"Are your enquiries"}),
  Object.freeze({id:"enquiryPostRejectedByGet",path:"/api/enquiry",status:405,content:null}),
  Object.freeze({id:"privateLeadsRejectedByGet",path:"/api/leads",status:401,content:null}),
  Object.freeze({id:"retryNoticesPostRejectedByGet",path:"/api/retry-owner-notices",status:405,content:null}),
  Object.freeze({id:"erasurePostRejectedByGet",path:"/api/delete-lead",status:405,content:null}),
]);
const HTTP_STATUS_HOLD="PUBLIC_HTTP_RELEASE_HOLD";
const MAX_BODY=100_000;
const ERROR_SAFE=/^[A-Z][A-Z0-9_]{1,65}$/;
function result(id,path,expectedStatus,observedStatus,outcome,reason){
  return Object.freeze({id,path,expectedStatus,observedStatus,
    outcome,reason,method:"GET",privateDataAccess:false});
}
export function assessReadOnlyResponses(observations){
  if(!Array.isArray(observations)||observations.length!==READONLY_PATHS.length||
    Object.getPrototypeOf(observations)!==Array.prototype)throw Error(HTTP_STATUS_HOLD+": exact response set required");
  const rows=[];
  for(let i=0;i<READONLY_PATHS.length;i++){
    const plan=READONLY_PATHS[i];
    const o=observations[i];
    if(!o||typeof o!=="object"||Object.getPrototypeOf(o)!==Object.prototype||
      Reflect.ownKeys(o).length!==4||
      !["path","status","body","error"].every(k=>Object.hasOwn(o,k)&&
        Object.getOwnPropertyDescriptor(o,k)?.value!==undefined))
      throw Error(HTTP_STATUS_HOLD+": inert exact response schema required");
    if(o.path!==plan.path||!Number.isSafeInteger(o.status)||o.status<0||o.status>599||
      typeof o.body!=="string"||o.body.length>MAX_BODY||
      (o.error!==null&&(typeof o.error!=="string"||!ERROR_SAFE.test(o.error))))
      throw Error(HTTP_STATUS_HOLD+": invalid or reordered public observation");
    let outcome="PASS",reason="EXPECTED_GET_RESPONSE";
    if(o.error!==null){outcome="HOLD";reason="NETWORK_OR_CONTENT_UNVERIFIED";}
    else if(o.status!==plan.status){
      outcome="HOLD";
      reason=o.status===200&&plan.path.startsWith("/api/")?
        "API_ROUTE_RETURNED_PUBLIC_FALLBACK":"UNEXPECTED_HTTP_STATUS";
    }else if(plan.content&&!o.body.includes(plan.content)){
      outcome="HOLD";reason="EXPECTED_PAGE_CONTENT_MISSING";
    }
    rows.push(result(plan.id,plan.path,plan.status,o.status,outcome,reason));
  }
  const allPass=rows.every(r=>r.outcome==="PASS");
  return Object.freeze({
    schema:"ATLAS_PUBLIC_READONLY_CONTRACT_V1",origin:VERIFIED_ORIGIN,
    method:"GET",checkedPaths:Object.freeze(rows),
    publicRoutingReady:allPass,
    newRuntimeErasureRouteConfirmed:rows.at(-1).outcome==="PASS",
    leadsRead:0,privateRecordsRead:0,formsSubmitted:0,
    customerMessagesSent:0,moneyCapturedGBP:0,
    // Even a perfect GET contract never proves POST, secure KV, Auth or release approval.
    authenticatedOwnerVerified:false,
    endToEndEnquiryProven:false,
    databaseRoleTestsPerformed:false,
    permissionToDeploy:false,
    outcome:allPass?"PUBLIC_READONLY_CONTRACT_PASSED_NOT_RELEASED":HTTP_STATUS_HOLD
  });
}
export async function probeNewtonPublicReadOnly({fetchImpl=fetch,timeoutMs=8000}={}){
  if(typeof fetchImpl!=="function"||!Number.isSafeInteger(timeoutMs)||
    timeoutMs<1000||timeoutMs>20000)throw Error(HTTP_STATUS_HOLD+": explicit bounded fetch required");
  const observations=[];
  for(const entry of READONLY_PATHS){
    const url=VERIFIED_ORIGIN+entry.path;
    try{
      const response=await fetchImpl(url,{
        method:"GET",redirect:"manual",credentials:"omit",cache:"no-store",
        signal:AbortSignal.timeout(timeoutMs),
      });
      // Read only the public HTML pages. Never ingest private/route JSON bodies.
      const body=entry.content&&response.status===200?
        (await response.text()).slice(0,MAX_BODY):"";
      observations.push({path:entry.path,status:response.status,body,error:null});
    }catch{
      observations.push({path:entry.path,status:0,body:"",error:"FETCH_UNAVAILABLE"});
    }
  }
  return assessReadOnlyResponses(observations);
}
