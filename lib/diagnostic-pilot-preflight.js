// £195 Enquiry Ownership Diagnostic: approved pilot objective, NOT an external offer.
// Pure, synthetic preflight. Never reads credentials, contacts customers, writes records or accepts money.
const FIELDS=Object.freeze(["version","demoRef","channel","exampleLimit","vatTreatment",
  "supplierIdentityReviewed","tradingAddressApproved","termsAndCancellationReviewed",
  "privateDataRouteApproved","deliveryCapacityConfirmed"]);
const CHANNELS=Object.freeze(["Website","Email","Phone","WhatsApp"]);
const VAT=Object.freeze(["UNKNOWN","VAT_INCLUDED","VAT_EXCLUDED","OUTSIDE_SCOPE"]);
const DEMO=/^DEMO-[A-Z0-9-]{3,30}$/;
function hold(ok,reason){if(!ok)throw Error("DIAGNOSTIC PILOT HOLD: "+reason);}
function inertRecord(value){
  if(!value||typeof value!=="object"||Array.isArray(value))return false;
  const proto=Object.getPrototypeOf(value);
  if(proto!==Object.prototype&&proto!==null)return false;
  const keys=Reflect.ownKeys(value);
  if(keys.length!==FIELDS.length||!keys.every(k=>typeof k==="string"&&FIELDS.includes(k)))return false;
  return keys.every(k=>{
    const d=Object.getOwnPropertyDescriptor(value,k);
    return d&&Object.hasOwn(d,"value")&&d.enumerable===true;
  });
}
export function prepareDiagnosticPilotBrief(input){
  hold(inertRecord(input),"exact inert internal brief fields required");
  hold(input.version===1&&typeof input.demoRef==="string"&&DEMO.test(input.demoRef),
    "fictional DEMO reference required");
  hold(CHANNELS.includes(input.channel),"one approved channel required");
  hold(Number.isInteger(input.exampleLimit)&&input.exampleLimit>=1&&input.exampleLimit<=20,
    "one to twenty fictional or anonymised examples required");
  hold(VAT.includes(input.vatTreatment),"VAT status must be recognised or explicitly UNKNOWN");
  for(const k of ["supplierIdentityReviewed","tradingAddressApproved",
    "termsAndCancellationReviewed","privateDataRouteApproved","deliveryCapacityConfirmed"])
    hold(typeof input[k]==="boolean","boolean review state required for "+k);

  const gates=[];
  if(input.vatTreatment==="UNKNOWN")gates.push("VAT_AND_FINAL_PRICE_UNCONFIRMED");
  if(!input.supplierIdentityReviewed)gates.push("LEGAL_SUPPLIER_NOT_VERIFIED");
  if(!input.tradingAddressApproved)gates.push("TRADING_AND_INVOICE_ADDRESS_NOT_APPROVED");
  if(!input.termsAndCancellationReviewed)gates.push("TERMS_CANCELLATION_REFUNDS_NOT_REVIEWED");
  if(!input.privateDataRouteApproved)gates.push("PRIVATE_DATA_TRANSFER_NOT_APPROVED");
  if(!input.deliveryCapacityConfirmed)gates.push("DELIVERY_CAPACITY_NOT_CONFIRMED");

  const scope=Object.freeze([
    "Human-led review of exactly one enquiry channel: "+input.channel,
    "Up to "+input.exampleLimit+" entirely fictional or appropriately anonymised example hand-offs",
    "Ownership, next-action, due-time and escalation map",
    "Three prioritised, evidence-based process improvements",
    "Example tracker plus optional 15-minute debrief",
  ]);
  const exclusions=Object.freeze([
    "No customer account logins, raw personal data or live integrations",
    "No customer messaging or automated sales promises",
    "No performance, revenue or conversion guarantee",
    "Implementation and maintenance are separate possible projects",
  ]);
  const draft=[
    "NEWTON REVENUE — INTERNAL £195 PILOT SCOPE (NOT FOR SENDING)",
    "Reference: "+input.demoRef,
    "Target: UK business with an enquiry ownership or follow-up problem (no buyer selected).",
    "Proposed price: £195 GBP; final VAT-inclusive/exclusive position and total HOLD until confirmed.",
    ...scope.map(x=>"• "+x),
    "Delivery target: two working days only after written scope agreement, safe inputs and confirmed capacity.",
    "Do not ask for unredacted customer records, passwords or access tokens.",
    "Next: verify the actual buyer's request, legal supplier, tax position, terms, data route and capacity.",
    "Before any quote, outreach, listing, contract, invoice or charge: obtain separate owner approval.",
  ].join("\n");

  return Object.freeze({
    schema:"NEWTON_DIAGNOSTIC_PILOT_BRIEF_V1",
    synthetic:true,
    demoRef:input.demoRef,
    commercialTarget:"GBP_195_DIAGNOSTIC",
    pilotObjectiveApproved:true, // 25 Oct owner selected priority, not external permissions
    scope,exclusions,
    proposedPriceGBP:195,
    vatTreatment:input.vatTreatment,
    externalReadiness:"OWNER_REVIEW_AND_REAL_EVIDENCE_REQUIRED",
    internalPreflight:gates.length?"BLOCKED_ON_DECLARED_GATES":"DECLARED_GATES_PRESENT_UNVERIFIED",
    blockers:Object.freeze(gates),
    quoteOrPaymentReady:false,
    sendOrListPermitted:false,
    buyerContactPermitted:false,
    liveCustomerDataPermitted:false,
    invoicePermitted:false,
    bankOrProcessorCalled:false,
    clearedEvidenceGBP:0,
    networkCalled:false,
    storageWrites:false,
    draft,
  });
}
