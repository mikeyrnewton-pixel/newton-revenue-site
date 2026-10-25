// Privacy-safe, no-write quote-draft gate for the £195 diagnostic pilot.
// It accepts evidence metadata only and never sends a quote, creates an invoice,
// contacts a buyer, connects a processor or records revenue.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DIGEST=/^[0-9a-f]{64}$/;
const PILOT=/^PILOT-[A-Z0-9-]{3,30}$/;
const VAT=new Set(["VAT_INCLUDED","VAT_EXCLUDED","OUTSIDE_SCOPE"]);
const KEYS=[
  "version","pilotRef","sourceRecordId","quoteDraftId","sourceClassification",
  "sourceEvidenceDigest","verifiedAt","currency","priceMinor","vatTreatment",
  "supplierIdentityEvidenceDigest","tradingAddressEvidenceDigest",
  "termsEvidenceDigest","privacyEvidenceDigest","capacityEvidenceDigest",
];

function hold(ok,message){if(!ok)throw Error("QUOTE DRAFT HOLD: "+message);}
function inertExactRecord(value,keys){
  if(!value||typeof value!=="object"||Array.isArray(value))return false;
  const prototype=Object.getPrototypeOf(value);
  if(prototype!==Object.prototype&&prototype!==null)return false;
  const ownKeys=Reflect.ownKeys(value);
  if(ownKeys.length!==keys.length||
    !ownKeys.every(key=>typeof key==="string"&&keys.includes(key)))return false;
  return ownKeys.every(key=>{
    const descriptor=Object.getOwnPropertyDescriptor(value,key);
    return descriptor&&descriptor.enumerable===true&&
      Object.hasOwn(descriptor,"value");
  });
}
function canonicalIso(value){
  if(typeof value!=="string")return false;
  const parsed=new Date(value);
  return !Number.isNaN(parsed.getTime())&&parsed.toISOString()===value;
}

export function assessDiagnosticPilotQuoteDraft(input){
  hold(inertExactRecord(input,KEYS),"exact privacy-safe evidence metadata required");
  hold(input.version===1,"schema version 1 required");
  hold(typeof input.pilotRef==="string"&&PILOT.test(input.pilotRef),
    "non-customer pilot reference required");
  hold(UUID.test(input.sourceRecordId||"")&&UUID.test(input.quoteDraftId||""),
    "canonical source and quote-draft IDs required");
  hold(input.sourceRecordId!==input.quoteDraftId,
    "source and quote-draft IDs must identify distinct records");
  hold(input.sourceClassification==="GENUINE",
    "reviewed genuine inbound enquiry evidence required");
  hold(canonicalIso(input.verifiedAt),"canonical UTC verification time required");
  hold(input.currency==="GBP"&&input.priceMinor===19500,
    "fixed GBP 195.00 pilot price required");
  hold(VAT.has(input.vatTreatment),"resolved VAT treatment required");

  const digests=[
    input.sourceEvidenceDigest,
    input.supplierIdentityEvidenceDigest,
    input.tradingAddressEvidenceDigest,
    input.termsEvidenceDigest,
    input.privacyEvidenceDigest,
    input.capacityEvidenceDigest,
  ];
  hold(digests.every(value=>DIGEST.test(value||"")),
    "canonical SHA-256 evidence digests required");
  hold(new Set(digests).size===digests.length,
    "each commercial gate requires distinct evidence");

  return Object.freeze({
    schema:"NEWTON_DIAGNOSTIC_PILOT_QUOTE_GATE_V1",
    pilotRef:input.pilotRef,
    sourceRecordId:input.sourceRecordId,
    quoteDraftId:input.quoteDraftId,
    sourceClassification:input.sourceClassification,
    verifiedAt:input.verifiedAt,
    currency:input.currency,
    priceMinor:input.priceMinor,
    vatTreatment:input.vatTreatment,
    state:"QUOTE_DRAFT_READY_FOR_OWNER_REVIEW",
    blockers:Object.freeze([
      "BUYER_SPECIFIC_SCOPE_AND_IDENTITY_REVIEW_REQUIRED",
      "OWNER_QUOTE_SEND_APPROVAL_REQUIRED",
      "WRITTEN_ACCEPTANCE_REQUIRED_BEFORE_INVOICE",
      "OWNER_INVOICE_APPROVAL_REQUIRED",
      "INDEPENDENT_SETTLEMENT_EVIDENCE_REQUIRED",
    ]),
    quoteDraftReady:true,
    quoteSent:false,
    invoiceReady:false,
    invoiceIssued:false,
    paymentRequested:false,
    paymentRecorded:false,
    clearedEvidenceGBP:0,
    buyerContactPermitted:false,
    automaticTransition:false,
    networkCalled:false,
    storageWrites:false,
    customerDelivery:"HOLD",
  });
}
