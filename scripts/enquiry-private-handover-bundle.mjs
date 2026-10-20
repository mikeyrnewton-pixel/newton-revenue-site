#!/usr/bin/env node
/** Bind the four offline fulfilment artefacts into a private, checksum-locked review manifest. */
import {createHash} from "node:crypto";
import {chmodSync,lstatSync,readFileSync,writeFileSync} from "node:fs";
import {basename,resolve} from "node:path";

const argv=process.argv.slice(2);
if(argv.includes("--help")){
  console.log("Usage: node scripts/enquiry-private-handover-bundle.mjs --report <md> --acceptance <json> --compatibility <json> --lifecycle <json> --config <json> --output <json>");
  console.log("Creates an offline private-review manifest only; it never sends, releases, invoices or connects anything.");
  process.exit(0);
}
function fail(message){console.error("PRIVATE HANDOVER HOLD: "+message+"; no delivery, contact, payment or live change made.");process.exit(2);}
const flags=["--report","--acceptance","--compatibility","--lifecycle","--config","--output"],allowed=new Set(flags),args=new Map();
for(let i=0;i<argv.length;i+=2){const flag=argv[i],value=argv[i+1];if(!allowed.has(flag)||!value||value.startsWith("--"))fail("unknown or incomplete argument");if(args.has(flag))fail("duplicate argument");args.set(flag,value);}
if(args.size!==flags.length)fail("all six arguments are required");

const paths=flags.map(flag=>resolve(args.get(flag)));
if(new Set(paths).size!==paths.length)fail("every artefact and output path must be distinct");
function privateFile(path,label){
  let stat;try{stat=lstatSync(path)}catch(error){if(error?.code==="ENOENT")fail(label+" does not exist");throw error;}
  if(stat.isSymbolicLink()||!stat.isFile())fail(label+" must be a regular non-symlink file");
  if((stat.mode&0o077)!==0)fail(label+" must be private mode 0600");
  if(stat.size<2||stat.size>250000)fail(label+" size is outside the handover contract");
  return readFileSync(path,"utf8");
}
function json(path,label){const raw=privateFile(path,label);try{return {raw,value:JSON.parse(raw)}}catch{fail(label+" is not valid JSON")}}
function sha(raw){return createHash("sha256").update(raw).digest("hex")}
function safeText(raw,label){
  if(/\b[A-Z0-9._%+-]+@(?!example\.invalid\b)[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(raw))fail(label+" contains a non-fixture email");
  if(/(?:^|[^\d])(?:\+44|0[127])[\d \-()]{8,}\d(?:$|[^\d])/m.test(raw))fail(label+" contains a possible telephone number");
  if(/\b(?:sk-proj-|sk-[A-Za-z0-9_-]{16}|BEGIN PRIVATE KEY|Bearer [A-Za-z0-9_-]{16})/i.test(raw))fail(label+" contains credential-like text");
  if(/\b(?:CLIENT DELIVERED|CLIENT ACCEPTED|PAYMENT CLEARED|CLEARED REVENUE|LIVE VERIFIED)\b/i.test(raw))fail(label+" contains a forbidden completion claim");
}

const reportPath=paths[0],report=privateFile(reportPath,"report");safeText(report,"report");
for(const marker of ["FICTIONAL DEMONSTRATION","NOT CLIENT WORK","Delivery release: HOLD","12-test QA execution record"])if(!report.includes(marker))fail("report missing required marker: "+marker);
const acceptance=json(paths[1],"acceptance receipt"),compat=json(paths[2],"compatibility manifest"),lifecycle=json(paths[3],"lifecycle receipt"),config=json(paths[4],"config");
for(const [label,raw] of [["acceptance receipt",acceptance.raw],["compatibility manifest",compat.raw],["lifecycle receipt",lifecycle.raw],["config",config.raw]])safeText(raw,label);
const a=acceptance.value,c=compat.value,l=lifecycle.value,k=config.value,reportSha=sha(report);
if(a?.schema!=="NEWTON_REDACTED_REPORT_ACCEPTANCE_V1"||a.synthetic!==true||a.result!=="REDACTED_REPORT_ACCEPTED_FOR_PRIVATE_REVIEW"||a.reportSha256!==reportSha||a.customerDelivery!=="HOLD"||a.paymentState!=="NOT_CLEARED"||a.connectionState!=="NEEDS_CONNECTION"||a.live!==false||a.externalAction!==false)fail("acceptance receipt is not checksum-bound offline HOLD evidence");
if(c?.schema!=="NEWTON_FULFILMENT_COMPATIBILITY_MANIFEST_V1"||c.synthetic!==true||c.result!=="READY_FOR_HUMAN_ASSISTED_PRIVATE_DRY_RUN"||c.projectRef!==a.projectRef||c.enquiryId!==l?.enquiryId||c.evidenceDigest!==a.compatibilityEvidenceDigest||c.customerDelivery!=="HOLD"||c.paymentState!=="NOT_CLEARED"||c.connectionState!=="NEEDS_CONNECTION"||c.live!==false||c.externalAction!==false)fail("compatibility manifest does not match the accepted report");
if(l?.schemaVersion!==1||l.component!=="ENQUIRY_LIFECYCLE_REVIEW"||l.state!=="STAGED"||l.testMode!=="OFFLINE_SYNTHETIC_ONLY"||
  l.connectionStatus!=="NEEDS_CONNECTION"||l.live!==false||l.decision!=="RETAIN_UNTIL_POLICY_DATE"||
  l.emailClass!=="SYNTHETIC_EXAMPLE_INVALID_REDACTED"||l.ownerApproval!=="NOT_GRANTED"||l.storageConnected!==false||
  l.deletionExecuted!==false||l.externalContact!==false||!/^[a-f0-9]{64}$/.test(l.inputFingerprintSha256||""))
  fail("lifecycle receipt is not current retention evidence or was promoted beyond HOLD");
const exact=(value,keys)=>value&&typeof value==="object"&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&Object.keys(value).every(key=>keys.includes(key));
const configKeys=["schema","mode","storageAdapter","deliveryRoute","recipientRole","ownerApproval","rollbackApproval","liveEnabled"];
if(!exact(k,configKeys)||k.schema!=="NEWTON_PRIVATE_HANDOVER_CONNECT_LATER_V1"||k.mode!=="OFFLINE_PRIVATE_REVIEW_ONLY"||k.storageAdapter!==""||k.deliveryRoute!==""||k.recipientRole!==""||k.ownerApproval!=="NOT_GRANTED"||k.rollbackApproval!=="NOT_GRANTED"||k.liveEnabled!==false)fail("config must remain blank, disconnected, NOT_GRANTED and non-live");

const files=[
  {role:"synthetic_report",name:basename(reportPath),sha256:reportSha},
  {role:"report_acceptance",name:basename(paths[1]),sha256:sha(acceptance.raw)},
  {role:"cross_pr_compatibility",name:basename(paths[2]),sha256:sha(compat.raw)},
  {role:"privacy_lifecycle",name:basename(paths[3]),sha256:sha(lifecycle.raw)}
];
if(new Set(files.map(file=>file.name)).size!==files.length)fail("handover artefact basenames must be unique");
const evidenceDigest="sha256:"+sha(files.map(file=>`${file.role}:${file.name}:${file.sha256}`).join("\n")+"\n");
const manifest={schema:"NEWTON_PRIVATE_HANDOVER_BUNDLE_V1",synthetic:true,projectRef:a.projectRef,lifecycleEnquiryId:l.enquiryId,lifecycleDecision:l.decision,result:"READY_FOR_OWNER_PRIVATE_HANDOVER_REVIEW",files,evidenceDigest,blockers:["OWNER_APPROVAL_NOT_GRANTED","DELIVERY_ROUTE_NOT_CONNECTED","CLIENT_ACCEPTANCE_NOT_RUN","PAYMENT_NOT_CLEARED","LIVE_BROWSER_NOT_RUN","CLOUDFLARE_PREVIEW_NOT_RUN"],customerDelivery:"HOLD",connectionState:"NEEDS_CONNECTION",paymentState:"NOT_CLEARED",live:false,externalAction:false};
const output=paths[5];
try{const stat=lstatSync(output);if(stat.isSymbolicLink()||!stat.isFile())fail("output path is unsafe")}catch(error){if(error?.code!=="ENOENT")fail("output path is unsafe")}
writeFileSync(output,JSON.stringify(manifest,null,2)+"\n",{mode:0o600});chmodSync(output,0o600);
console.log(JSON.stringify({result:manifest.result,evidenceDigest,files:files.length,outputMode:"0600",customerDelivery:"HOLD",connectionState:"NEEDS_CONNECTION",live:false}));
