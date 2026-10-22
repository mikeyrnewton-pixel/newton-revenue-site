// ATLAS Activepieces Prospect Engine: evidence-only release assessment.
// No network, Activepieces API, webhook, credentials, private customer data or writes.
// This reports what was actually observed; it does NOT execute or publish a flow.
const INPUT_KEYS=["schema","evidenceKind","flowName","flowStatus","observedRuns","webhookAuthentication","steps"];
const EXPECTED=[
  ["New Prospect","WEBHOOK"],
  ["Qualify Prospect","CODE"],
  ["Draft Outreach","CODE"],
  ["Build Follow-up","CODE"],
];
function exact(value,keys){
  return value!==null&&typeof value==="object"&&!Array.isArray(value)&&
    Object.keys(value).length===keys.length&&
    Object.keys(value).every(key=>keys.includes(key));
}
function hold(ok,detail){if(!ok)throw new Error("ATLAS ACTIVEPIECES REVIEW HOLD: "+detail);}
export function assessProspectEngineReadiness(input){
  hold(exact(input,INPUT_KEYS),"only bounded non-secret evidence fields allowed");
  hold(input.schema==="ATLAS_ACTIVEPIECES_PROSPECT_REVIEW_V1","review schema v1 required");
  hold(["SCREENSHOT_ONLY","VERIFIED_LOCAL_EXPORT"].includes(input.evidenceKind),
    "recognised evidence kind required");
  hold(input.flowName==="NEWTON REVENUE - Prospect Engine v1","exact original flow name required");
  hold(["UNKNOWN","ENABLED","DISABLED"].includes(input.flowStatus),
    "recognised flow status required");
  hold(["NO_RUNS_DISPLAYED","VERIFIED_RECENT_RUNS","UNKNOWN"].includes(input.observedRuns),
    "recognised runs observation required");
  hold(["NONE_DISPLAYED","VERIFIED_PROTECTED","UNKNOWN"].includes(input.webhookAuthentication),
    "recognised webhook authentication evidence required");
  hold(Array.isArray(input.steps)&&input.steps.length===4,
    "exactly four prospect steps required");
  input.steps.forEach((step,i)=>{
    hold(exact(step,["name","type"]),"only step name and type allowed");
    hold(step.name===EXPECTED[i][0]&&step.type===EXPECTED[i][1],
      "unexpected or reordered prospect step");
  });
  const blockers=[];
  if(input.evidenceKind!=="VERIFIED_LOCAL_EXPORT")
    blockers.push("FULL_CODE_AND_CONFIGURATION_NOT_INSPECTED");
  if(input.flowStatus==="UNKNOWN")blockers.push("PUBLISHED_AND_ENABLED_STATUS_UNVERIFIED");
  if(input.flowStatus==="ENABLED")blockers.push("LIVE_FLOW_MUST_BE_PAUSED_FOR_SECURITY_REVIEW");
  if(input.webhookAuthentication==="NONE_DISPLAYED")
    blockers.push("WEBHOOK_AUTHENTICATION_NONE_DISPLAYED");
  else if(input.webhookAuthentication==="UNKNOWN")
    blockers.push("WEBHOOK_AUTHENTICATION_UNVERIFIED");
  if(input.observedRuns==="NO_RUNS_DISPLAYED")
    blockers.push("NO_FLOW_EXECUTION_EVIDENCE_IN_SCREENSHOT");
  else if(input.observedRuns==="UNKNOWN")blockers.push("RUN_HISTORY_UNVERIFIED");
  // Even a privately reviewed source file is NOT approval to run or send.
  blockers.push("OWNER_APPROVAL_REQUIRED_BEFORE_ACTIVATION_OR_OUTREACH");
  return Object.freeze({
    schema:"ATLAS_ACTIVEPIECES_PROSPECT_REVIEW_RESULT_V1",
    flowName:input.flowName,
    status:"REVIEW_ONLY_HOLD",
    evidenceKind:input.evidenceKind,
    visibleStepCount:4,
    webhookAuthentication:input.webhookAuthentication,
    blockers:Object.freeze(blockers),
    // A supplied export is only a claim until actual code has been audited.
    flowCodeVerified:false,
    directMacConnection:false,
    flowActivated:false,
    externalCommunication:false,
    automaticCommercialTransition:false,
    buyerCount:null,
    invoicedGBP:0,
    clearedGBP:0,
    customerDelivery:"HOLD",
  });
}
