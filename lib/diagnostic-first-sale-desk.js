// Combined £195 first-pilot desk: actual integration of the existing review-only
// commercial preflight, universal opportunity intake, CRM preview and buyer research.
// Entire flow remains offline/synthetic. NO real customer/store/network/outreach/payment.
import {prepareDiagnosticPilotBrief} from "./diagnostic-pilot-preflight.js";
import {previewOfflineOpportunityCrmRow} from "./opportunity-crm-preview.js";
import {triageOfflineBuyerResearch} from "./buyer-research-triage.js";

const KEYS=["pilot","publicResearch","asOf"];
function hold(ok,message){if(!ok)throw Error("PILOT DESK HOLD: "+message);}
function exactRecord(o){
  if(!o||typeof o!=="object"||Array.isArray(o))return false;
  const proto=Object.getPrototypeOf(o);
  if(proto!==Object.prototype&&proto!==null)return false;
  const keys=Reflect.ownKeys(o);
  return keys.length===KEYS.length&&keys.every(k=>typeof k==="string"&&KEYS.includes(k))&&
    keys.every(k=>{
      const d=Object.getOwnPropertyDescriptor(o,k);
      return d&&Object.hasOwn(d,"value")&&d.enumerable;
    });
}
function fixedPilotOpportunity(){
  // Deliberately UNVERIFIED even if the owner has ticked every preparatory box.
  // Only authenticated evidence, independent checks and further owner approvals
  // may ever change the future LIVE opportunity state.
  return {
    version:1,
    opportunityId:"OPP-DIAGNOSTIC195",
    description:"Fictional UK human-led £195 Enquiry Ownership Diagnostic for one enquiry channel.",
    category:"SERVICE",buyerType:"BUSINESS",territory:"UK",
    sellerAuthority:"UNKNOWN",pricing:"QUOTE_REQUIRED",fulfilment:"UNKNOWN",
    restrictions:"UNKNOWN",sourceEvidence:"UNVERIFIED",
  };
}

export function buildOfflineDiagnosticFirstSaleDesk(input){
  hold(exactRecord(input),"exact owner-review workspace required");
  const pilot=prepareDiagnosticPilotBrief(input.pilot);
  const buyerResearch=triageOfflineBuyerResearch(input.publicResearch,input.asOf);
  const crmPreview=previewOfflineOpportunityCrmRow(fixedPilotOpportunity());

  const nextActions=Object.freeze([
    ...(pilot.blockers.length?[{
      desk:"CASH",
      state:"BLOCKED_OWNER_COMMERCIAL_EVIDENCE",
      action:"Independently verify VAT, supplier/trading identity, terms, safe input route and capacity",
    }]:[]),
    ...(buyerResearch.publicBriefsForManualValidation?[{
      desk:"ACQUISITION",
      state:"PUBLIC_BUYER_SIGNAL_UNVERIFIED",
      action:"Review public brief scope, fee/budget, geography, account eligibility and current status",
    }]:[{
      desk:"ACQUISITION",
      state:"NO_PILOT_FIT_BUYER_VERIFIED",
      action:"Find date-stamped relevant public buyer briefs; do not invent buyers or send outreach",
    }]),
    {
      desk:"BUILD",
      state:"PRIVATE_CRM_ACCESS_HOLD",
      action:"Prepare reviewed owner authentication, RLS and non-secret evidence handling before live data",
    },
  ].map(x=>Object.freeze(x)));

  return Object.freeze({
    schema:"NEWTON_DIAGNOSTIC_FIRST_SALE_OFFLINE_WORKSPACE_V1",
    goal:"TEST_ONE_REAL_195_GBP_DIAGNOSTIC_ONLY_AFTER_SEPARATE_APPROVALS",
    pilot,
    buyerResearch,
    crmPreview,
    nextActions,
    ownerDecisionRequiredBeforeExternalUse:true,
    buyerQualifiedCount:0,
    realCustomerDataAccess:false,
    customerMessagesSent:0,
    liveQuotesSent:0,
    liveInvoicesIssued:0,
    paymentsCapturedGBP:0,
    clearedCashGBP:0,
    writesPerformed:false,
    release:"INTERNAL_REVIEW_ONLY",
  });
}
