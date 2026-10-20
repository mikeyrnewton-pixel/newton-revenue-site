#!/usr/bin/env node
/**
 * Cross-contract gate for PR11 delivery QA, PR29 commercial readiness,
 * PR30 acquisition handoff and PR43 lifecycle review evidence.
 * Offline-only: no network, storage, payment, delivery or approval capability.
 */
import { readFileSync, writeFileSync, chmodSync, lstatSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

const argv=process.argv.slice(2);
if(argv.includes("--help")){
  console.log("Usage: node scripts/enquiry-fulfilment-compatibility-gate.mjs --bundle <json> --config <json> --output <json>");
  console.log("Validates synthetic cross-PR contracts and writes a private HOLD manifest.");
  process.exit(0);
}
function fail(message){
  console.error("FULFILMENT COMPATIBILITY HOLD: "+message+"; no connection, delivery, payment or live change made.");
  process.exit(2);
}
const allowed=new Set(["--bundle","--config","--output"]), args=new Map();
for(let i=0;i<argv.length;i+=2){
  const flag=argv[i],value=argv[i+1];
  if(!allowed.has(flag)||!value||value.startsWith("--"))fail("unknown or incomplete argument");
  if(args.has(flag))fail("duplicate argument");
  args.set(flag,value);
}
if(args.size!==3)fail("all three arguments are required");

function load(path,label){
  try{
    const raw=readFileSync(resolve(path),"utf8");
    if(/(?:api.?key|token|secret|password|credential|cookie)\s*[:=]/i.test(raw))fail(label+" contains secret-like text");
    if(/\b[A-Z0-9._%+-]+@(?!example\.invalid\b)[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(raw))fail(label+" contains a non-fixture email");
    return {raw,value:JSON.parse(raw)};
  }catch(error){
    if(error?.code==="ENOENT")fail(label+" does not exist");
    if(error instanceof SyntaxError)fail(label+" is not valid JSON");
    throw error;
  }
}
const bundleFile=load(args.get("--bundle"),"bundle");
const configFile=load(args.get("--config"),"config");
const b=bundleFile.value,c=configFile.value;
const exact=(value,keys)=>value&&typeof value==="object"&&!Array.isArray(value)&&
  Object.keys(value).length===keys.length&&Object.keys(value).every(key=>keys.includes(key));
const iso=value=>typeof value==="string"&&!Number.isNaN(new Date(value).valueOf())&&new Date(value).toISOString()===value;
const project=value=>typeof value==="string"&&/^DEMO-[A-Z0-9-]{3,30}$/.test(value);

if(!exact(c,["schema","mode","acquisitionAdapter","cashEvidenceAdapter","qaRecordAdapter","lifecycleAdapter","previewUrl","ownerApproval","liveEnabled"]))fail("exact placeholder config required");
if(c.schema!=="NEWTON_FULFILMENT_CONNECT_LATER_V1"||c.mode!=="OFFLINE_REVIEW_ONLY"||
  c.acquisitionAdapter!==""||c.cashEvidenceAdapter!==""||c.qaRecordAdapter!==""||
  c.lifecycleAdapter!==""||c.previewUrl!==""||c.ownerApproval!=="NOT_GRANTED"||c.liveEnabled!==false)
  fail("config must remain blank, disconnected, NOT_GRANTED and non-live");
if(!exact(b,["schema","synthetic","projectRef","acquisition","commercial","qa","lifecycle"])||
  b.schema!=="NEWTON_FULFILMENT_COMPATIBILITY_INPUT_V1"||b.synthetic!==true||!project(b.projectRef))
  fail("exact fictional compatibility bundle required");

const a=b.acquisition;
if(!exact(a,["schema","synthetic","projectRef","handoffId","consent","workflow"])||
  a.schema!=="NEWTON_FICTIONAL_DISTRIBUTION_V1"||a.synthetic!==true||a.projectRef!==b.projectRef||
  !/^enquiry:[0-9a-f-]{36}$/i.test(a.handoffId||"")||
  !exact(a.consent,["purpose","capturedAt","marketing"])||a.consent.purpose!=="respond_to_enquiry"||
  !iso(a.consent.capturedAt)||a.consent.marketing!==false||
  !exact(a.workflow,["state","customerDelivery"])||a.workflow.state!=="STAGED_OFFLINE_ONLY"||a.workflow.customerDelivery!=="HOLD")
  fail("PR30 acquisition handoff contract mismatch");

const m=b.commercial;
if(!exact(m,["schema","synthetic","projectRef","state","recordedPaymentEvidenceGBP","clearedEvidenceGBP","commercialTruth","customerDelivery"])||
  m.schema!=="NEWTON_COMMERCIAL_READINESS_V1"||m.synthetic!==true||m.projectRef!==b.projectRef||
  m.state!=="COMMERCIAL_GATE_READY"||m.recordedPaymentEvidenceGBP!==0||m.clearedEvidenceGBP!==0||
  m.commercialTruth!=="FICTIONAL_ONLY_NOT_REVENUE"||m.customerDelivery!=="HOLD")
  fail("PR29 commercial readiness contract mismatch");

const q=b.qa;
const expectedTests=["Scope","Privacy","Completeness","Ownership","Action control","Status integrity","Duplicate control","Reconciliation","Fix quality","Claims","Human review","Client acceptance"];
if(!exact(q,["schema","synthetic","projectRef","outcomes","humanReview","clientAcceptance","overallGate"])||
  q.schema!=="NEWTON_DIAGNOSTIC_QA_V1"||q.synthetic!==true||q.projectRef!==b.projectRef||
  !exact(q.outcomes,Object.keys(q.outcomes))||Object.keys(q.outcomes).length!==12||
  !expectedTests.every(name=>q.outcomes[name]==="PASS")||q.humanReview!=="NOT_RUN"||
  q.clientAcceptance!=="NOT_RUN"||q.overallGate!=="HOLD")
  fail("PR11 twelve-test QA rehearsal contract mismatch");

const l=b.lifecycle;
if(!exact(l,["component","state","testMode","connectionStatus","live","decision","ownerApproval","storageConnected","deletionExecuted"])||
  l.component!=="ENQUIRY_LIFECYCLE_REVIEW"||l.state!=="STAGED"||l.testMode!=="OFFLINE_SYNTHETIC_ONLY"||
  l.connectionStatus!=="NEEDS_CONNECTION"||l.live!==false||l.decision!=="RETAIN_UNTIL_POLICY_DATE"||
  l.ownerApproval!=="NOT_GRANTED"||l.storageConnected!==false||l.deletionExecuted!==false)
  fail("PR43 lifecycle contract mismatch");

const digest=createHash("sha256").update(bundleFile.raw+"\n"+configFile.raw).digest("hex");
const manifest={
  schema:"NEWTON_FULFILMENT_COMPATIBILITY_MANIFEST_V1",
  synthetic:true,
  projectRef:b.projectRef,
  result:"READY_FOR_HUMAN_ASSISTED_PRIVATE_DRY_RUN",
  evidenceDigest:"sha256:"+digest,
  compatibleContracts:["PR11_QA","PR29_COMMERCIAL","PR30_ACQUISITION","PR43_LIFECYCLE"],
  blockers:["HUMAN_REVIEW_NOT_RUN","CLIENT_ACCEPTANCE_NOT_RUN","PAYMENT_NOT_CLEARED","OWNER_CONNECTION_NOT_APPROVED","LIVE_BROWSER_NOT_RUN"],
  customerDelivery:"HOLD",
  paymentState:"NOT_CLEARED",
  connectionState:"NEEDS_CONNECTION",
  live:false,
  externalAction:false
};
const output=resolve(args.get("--output"));
try{
  const existing=lstatSync(output);
  if(existing.isSymbolicLink()||!existing.isFile())fail("output path is unsafe");
}catch(error){if(error?.code!=="ENOENT")fail("output path is unsafe");}
writeFileSync(output,JSON.stringify(manifest,null,2)+"\n",{mode:0o600});
chmodSync(output,0o600);
console.log(JSON.stringify({result:manifest.result,outputMode:"0600",customerDelivery:"HOLD",connectionState:"NEEDS_CONNECTION",live:false}));
