#!/usr/bin/env node
/** Accept an existing fictional diagnostic Markdown report for private review. */
import {readFileSync,writeFileSync,chmodSync,lstatSync} from "node:fs";
import {resolve} from "node:path";
import {createHash} from "node:crypto";

const argv=process.argv.slice(2);
if(argv.includes("--help")){
  console.log("Usage: node scripts/enquiry-redacted-report-acceptance.mjs --report <md> --compatibility <json> --config <json> --output <json>");
  console.log("Offline review only; never sends, releases, invoices or marks payment.");
  process.exit(0);
}
function fail(message){console.error("REDACTED REPORT HOLD: "+message+"; no delivery, contact, payment or live change made.");process.exit(2);}
const allowed=new Set(["--report","--compatibility","--config","--output"]),args=new Map();
for(let i=0;i<argv.length;i+=2){const flag=argv[i],value=argv[i+1];if(!allowed.has(flag)||!value||value.startsWith("--"))fail("unknown or incomplete argument");if(args.has(flag))fail("duplicate argument");args.set(flag,value);}
if(args.size!==4)fail("all four arguments are required");
function text(path,label){try{return readFileSync(resolve(path),"utf8")}catch(error){if(error?.code==="ENOENT")fail(label+" does not exist");throw error}}
function json(path,label){try{return JSON.parse(text(path,label))}catch(error){if(error instanceof SyntaxError)fail(label+" is not valid JSON");throw error}}
const reportPath=resolve(args.get("--report"));
const report=text(reportPath,"report"),compat=json(args.get("--compatibility"),"compatibility manifest"),config=json(args.get("--config"),"config");
try{if((lstatSync(reportPath).mode&0o077)!==0)fail("report must be private mode 0600")}catch(error){if(error?.code!=="ENOENT")throw error}
if(report.length<600||report.length>200000)fail("report size is outside the review contract");
if(/\b[A-Z0-9._%+-]+@(?!example\.invalid\b)[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(report))fail("report contains a non-fixture email");
if(/(?:^|[^\d])(?:\+44|0[127])[\d \-()]{8,}\d(?:$|[^\d])/m.test(report))fail("report contains a possible telephone number");
if(/\b(?:sk-proj-|sk-[A-Za-z0-9_-]{16}|BEGIN PRIVATE KEY|Bearer [A-Za-z0-9_-]{16})/i.test(report))fail("report contains credential-like text");
if(/<script|javascript:|https?:\/\//i.test(report))fail("report contains active markup or an external URL");
if(/\b(?:RELEASE APPROVED|CLIENT DELIVERED|CLIENT ACCEPTED|PAYMENT CLEARED|CLEARED REVENUE|LIVE VERIFIED)\b/i.test(report))fail("report contains a forbidden completion claim");
for(const marker of [
  "# Enquiry Ownership Diagnostic — FICTIONAL DEMONSTRATION",
  "NOT CLIENT WORK", "Delivery release: HOLD", "Source reconciliation:",
  "## Fictional evidence tracker", "## Three fictional findings",
  "## Three recommended fixes — illustrative only", "## 12-test QA execution record",
  "This synthetic pack is not the separately approved actual delivery"
])if(!report.includes(marker))fail("report missing required marker: "+marker);
const qaNames=["Scope","Privacy","Completeness","Ownership","Action control","Status integrity","Duplicate control","Reconciliation","Fix quality","Claims","Human review","Client acceptance"];
for(const name of qaNames)if(!new RegExp("\\|\\s*"+name.replace(" ","\\s+")+"\\s*\\|\\s*NOT RUN\\s*\\|").test(report))fail("QA row is not held at NOT RUN: "+name);
if((report.match(/\|\s*F-0[1-3]\s*\|/g)||[]).length!==3)fail("report must contain exactly three fictional findings");
if((report.match(/\|\s*[1-3]\s*\|/g)||[]).length<3)fail("report must contain three prioritised fixes");

const exact=(value,keys)=>value&&typeof value==="object"&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&Object.keys(value).every(key=>keys.includes(key));
if(!exact(config,["schema","mode","reportAdapter","deliveryRoute","recipientRole","ownerApproval","liveEnabled"])||
  config.schema!=="NEWTON_REDACTED_REPORT_CONNECT_LATER_V1"||config.mode!=="OFFLINE_REVIEW_ONLY"||
  config.reportAdapter!==""||config.deliveryRoute!==""||config.recipientRole!==""||config.ownerApproval!=="NOT_GRANTED"||config.liveEnabled!==false)
  fail("config must remain blank, disconnected, NOT_GRANTED and non-live");
const requiredContracts=["PR11_QA","PR29_COMMERCIAL","PR30_ACQUISITION","PR43_LIFECYCLE"];
const requiredCompatibilityBlockers=["HUMAN_REVIEW_NOT_RUN","CLIENT_ACCEPTANCE_NOT_RUN","PAYMENT_NOT_CLEARED","OWNER_CONNECTION_NOT_APPROVED","LIVE_BROWSER_NOT_RUN"];
const exactArray=(value,expected)=>Array.isArray(value)&&value.length===expected.length&&value.every((item,index)=>item===expected[index]);
if(!compat||compat.schema!=="NEWTON_FULFILMENT_COMPATIBILITY_MANIFEST_V1"||compat.synthetic!==true||
  !/^DEMO-[A-Z0-9-]{3,30}$/.test(compat.projectRef||"")||
  !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(compat.enquiryId||"")||
  !exact(compat.commercialBasis,["priceGBP","vatTreatment","supplierAddressApproved","termsApproved"])||
  compat.commercialBasis.priceGBP!==195||!["VAT_INCLUDED","VAT_EXCLUDED","OUTSIDE_SCOPE"].includes(compat.commercialBasis.vatTreatment)||
  compat.commercialBasis.supplierAddressApproved!==true||compat.commercialBasis.termsApproved!==true||
  !/^sha256:[a-f0-9]{64}$/.test(compat.evidenceDigest||"")||
  !exactArray(compat.compatibleContracts,requiredContracts)||!exactArray(compat.blockers,requiredCompatibilityBlockers)||
  compat.result!=="READY_FOR_HUMAN_ASSISTED_PRIVATE_DRY_RUN"||compat.customerDelivery!=="HOLD"||
  compat.paymentState!=="NOT_CLEARED"||compat.connectionState!=="NEEDS_CONNECTION"||compat.live!==false||compat.externalAction!==false)
  fail("compatibility manifest is incomplete or promoted beyond offline HOLD");
if(!report.includes("Project: "+compat.projectRef+" ·"))
  fail("report project does not match compatibility manifest");
const reportSha=createHash("sha256").update(report).digest("hex");
const receipt={
  schema:"NEWTON_REDACTED_REPORT_ACCEPTANCE_V1",synthetic:true,projectRef:compat.projectRef,enquiryId:compat.enquiryId,
  commercialBasis:{...compat.commercialBasis},compatibleContracts:[...compat.compatibleContracts],
  compatibilityBlockers:[...compat.blockers],
  result:"REDACTED_REPORT_ACCEPTED_FOR_PRIVATE_REVIEW",reportSha256:reportSha,
  compatibilityEvidenceDigest:compat.evidenceDigest,qaRowsHeldNotRun:12,
  blockers:["HUMAN_REVIEW_NOT_RUN","CLIENT_ACCEPTANCE_NOT_RUN","DELIVERY_ROUTE_NOT_CONNECTED","PAYMENT_NOT_CLEARED","LIVE_BROWSER_NOT_RUN"],
  customerDelivery:"HOLD",connectionState:"NEEDS_CONNECTION",paymentState:"NOT_CLEARED",live:false,externalAction:false
};
const output=resolve(args.get("--output"));
try{const existing=lstatSync(output);if(existing.isSymbolicLink()||!existing.isFile())fail("output path is unsafe")}catch(error){if(error?.code!=="ENOENT")fail("output path is unsafe")}
writeFileSync(output,JSON.stringify(receipt,null,2)+"\n",{mode:0o600});chmodSync(output,0o600);
console.log(JSON.stringify({result:receipt.result,outputMode:"0600",customerDelivery:"HOLD",connectionState:"NEEDS_CONNECTION",live:false}));
