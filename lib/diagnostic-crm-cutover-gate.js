// ATLAS / NEWTON: fail-closed planning gate for an EXISTING Supabase CRM.
// Accepts aggregate, non-PII operator observations only. NO network, SQL or writes.
// The calling process must independently verify provenance; caller-supplied metadata
// is NEVER authority to run a migration, enable a login or approve outreach.
const KEYS=["version","observedAt","reportedBy","opportunityRowCount",
  "authUserCount","rlsEnabled","policyCount","ownerColumnPresent"];
const ISO=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
function hold(ok,reason){if(!ok)throw Error("CRM CUTOVER HOLD: "+reason);}
function inert(x){
  if(!x||typeof x!=="object"||Array.isArray(x))return false;
  const p=Object.getPrototypeOf(x);
  if(p!==Object.prototype&&p!==null)return false;
  const keys=Reflect.ownKeys(x);
  return keys.length===KEYS.length&&keys.every(k=>typeof k==="string"&&KEYS.includes(k))&&
    keys.every(k=>{
      const d=Object.getOwnPropertyDescriptor(x,k);
      return d?.enumerable===true&&Object.hasOwn(d,"value");
    });
}
function count(n){return Number.isSafeInteger(n)&&n>=0&&n<=100000000;}
function iso(s){return typeof s==="string"&&ISO.test(s)&&
  !Number.isNaN(Date.parse(s))&&new Date(s).toISOString()===s;}

export function reviewExistingCrmCutover(observation){
  hold(inert(observation),"exact aggregate observation required; no customer rows");
  hold(observation.version===1,"version 1 required");
  hold(iso(observation.observedAt),"canonical observation timestamp required");
  hold(observation.reportedBy==="OWNER_READ_ONLY_RECONCILIATION",
    "only explicit operator provenance claim can be recorded");
  hold(count(observation.opportunityRowCount),"bounded opportunity count required");
  hold(count(observation.authUserCount),"bounded auth account count required");
  hold(count(observation.policyCount),"bounded policy count required");
  hold(typeof observation.rlsEnabled==="boolean"&&
    typeof observation.ownerColumnPresent==="boolean","boolean schema fields required");

  const blockers=[];
  if(!observation.rlsEnabled)blockers.push("EXISTING_RLS_NOT_ENABLED");
  if(observation.policyCount!==0)blockers.push("POLICY_DRIFT_NEEDS_FRESH_REVIEW");
  if(observation.ownerColumnPresent)blockers.push("OWNERSHIP_SCHEMA_DRIFT");
  if(observation.opportunityRowCount>0)
    blockers.push("PRESERVE_EXISTING_RECORDS_BEFORE_OWNERSHIP_MIGRATION");
  if(observation.authUserCount===0)
    blockers.push("NO_VERIFIED_OWNER_AUTH_SESSION");
  // Mandatory regardless of any checkbox or apparently favourable metadata.
  blockers.push("ISOLATED_REAL_POSTGRES_ROLE_TEST_NOT_EXECUTED");
  blockers.push("SCOPED_OWNER_SECURITY_APPROVAL_REQUIRED");

  return Object.freeze({
    schema:"NEWTON_EXISTING_CRM_CUTOVER_REVIEW_V1",
    observedAt:observation.observedAt,
    observedOpportunityRows:observation.opportunityRowCount,
    observedAuthUsers:observation.authUserCount,
    observedRlsEnabled:observation.rlsEnabled,
    observedPolicyCount:observation.policyCount,
    reportedProvenance:"OPERATOR_DECLARATION_NOT_REAUTHENTICATED",
    blockers:Object.freeze(blockers),
    outcome:"PRODUCTION_CRM_CUTOVER_HOLD",
    legacyRecordsWillBeDeleted:false,
    automaticOwnershipAssignment:false,
    currentRowsAccessibleToWebClient:false, // never infer access from an aggregate
    authSignInVerified:false,
    isolatedDbRoleTestsPassed:false,
    ownerApprovalRecorded:false,
    liveWritesAllowed:false,
    paymentsEnabled:false,
    outreachEnabled:false,
    verifiedClearedRevenueGBP:0,
    writeIntent:"NONE",
  });
}
