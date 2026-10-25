// Privacy-safe, no-write invoice-readiness gate for the £195 diagnostic pilot.
// It evaluates evidence metadata only. It cannot issue an invoice, contact a buyer,
// request payment, connect a processor, write storage or record revenue.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DIGEST=/^[0-9a-f]{64}$/;
const PILOT=/^PILOT-[A-Z0-9-]{3,30}$/;
const VAT=new Set(["VAT_INCLUDED","VAT_EXCLUDED","OUTSIDE_SCOPE"]);
const PROCUREMENT=new Set(["VERIFIED_COMPLETE","VALIDATED_NOT_REQUIRED"]);
const KEYS=[
  "version","pilotRef","sourceRecordId","sourceClassification","quoteDraftId",
  "invoiceDraftId",
  "quoteApprovedAt","quoteDeliveredAt","acceptedAt","quoteValidUntil",
  "invoicePreparedAt","currency","totalMinor","vatTreatment","acceptanceMethod",
  "procurementStatus","sourceEvidenceDigest","quoteEvidenceDigest",
  "quoteBindingEvidenceDigest","quoteDeliveryEvidenceDigest","acceptanceEvidenceDigest",
  "buyerAuthorityEvidenceDigest","acceptedTermsEvidenceDigest",
  "billingEntityEvidenceDigest","billingAddressEvidenceDigest",
  "procurementEvidenceDigest","duplicateCheckEvidenceDigest",
  "invoiceDraftEvidenceDigest",
];

function hold(ok,message){if(!ok)throw Error("INVOICE READINESS HOLD: "+message);}
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

export function assessDiagnosticPilotInvoiceReadiness(input){
  hold(inertExactRecord(input,KEYS),
    "exact privacy-safe evidence metadata required");
  hold(input.version===1,"schema version 1 required");
  hold(typeof input.pilotRef==="string"&&PILOT.test(input.pilotRef),
    "non-customer pilot reference required");
  hold(UUID.test(input.sourceRecordId||"")&&UUID.test(input.quoteDraftId||"")&&
    UUID.test(input.invoiceDraftId||""),
    "canonical source, quote-draft and invoice-draft IDs required");
  hold(new Set([
    input.sourceRecordId,input.quoteDraftId,input.invoiceDraftId,
  ]).size===3,"source, quote and invoice drafts must be distinct records");
  hold(input.sourceClassification==="GENUINE",
    "reviewed genuine inbound enquiry evidence required");
  hold(input.currency==="GBP"&&input.totalMinor===19500,
    "fixed GBP 195.00 pilot total required");
  hold(VAT.has(input.vatTreatment),"resolved VAT treatment required");
  hold(input.acceptanceMethod==="WRITTEN",
    "written acceptance evidence required");
  hold(PROCUREMENT.has(input.procurementStatus),
    "procurement route must be verified complete or not required");

  const timestamps=[
    input.quoteApprovedAt,input.quoteDeliveredAt,input.acceptedAt,
    input.quoteValidUntil,input.invoicePreparedAt,
  ];
  hold(timestamps.every(canonicalIso),"canonical UTC timestamps required");
  const approved=Date.parse(input.quoteApprovedAt);
  const delivered=Date.parse(input.quoteDeliveredAt);
  const accepted=Date.parse(input.acceptedAt);
  const validUntil=Date.parse(input.quoteValidUntil);
  const prepared=Date.parse(input.invoicePreparedAt);
  hold(approved<=delivered&&delivered<=accepted&&accepted<=prepared,
    "approval, delivery, acceptance and preparation chronology required");
  hold(accepted<=validUntil,
    "written acceptance must precede the quote-validity deadline");

  const digests=[
    input.sourceEvidenceDigest,input.quoteEvidenceDigest,
    input.quoteBindingEvidenceDigest,input.quoteDeliveryEvidenceDigest,input.acceptanceEvidenceDigest,
    input.buyerAuthorityEvidenceDigest,input.acceptedTermsEvidenceDigest,
    input.billingEntityEvidenceDigest,input.billingAddressEvidenceDigest,
    input.procurementEvidenceDigest,input.duplicateCheckEvidenceDigest,
    input.invoiceDraftEvidenceDigest,
  ];
  hold(digests.every(value=>DIGEST.test(value||"")),
    "canonical SHA-256 evidence digests required");
  hold(new Set(digests).size===digests.length,
    "source, acceptance, billing, duplicate-check and invoice evidence must differ");

  return Object.freeze({
    schema:"NEWTON_DIAGNOSTIC_PILOT_INVOICE_GATE_V1",
    pilotRef:input.pilotRef,
    sourceRecordId:input.sourceRecordId,
    quoteDraftId:input.quoteDraftId,
    invoiceDraftId:input.invoiceDraftId,
    sourceClassification:input.sourceClassification,
    acceptedAt:input.acceptedAt,
    invoicePreparedAt:input.invoicePreparedAt,
    currency:input.currency,
    totalMinor:input.totalMinor,
    vatTreatment:input.vatTreatment,
    procurementStatus:input.procurementStatus,
    state:"INVOICE_READY_FOR_OWNER_ISSUE_APPROVAL",
    blockers:Object.freeze([
      "OWNER_INVOICE_ISSUE_APPROVAL_REQUIRED",
      "VERIFIED_DESTINATION_AND_CHANNEL_REQUIRED",
      "INDEPENDENT_SETTLEMENT_EVIDENCE_REQUIRED",
      "DELIVERY_RELEASE_REMAINS_HELD",
    ]),
    invoiceReady:true,
    invoiceIssued:false,
    paymentRequested:false,
    paymentRecorded:false,
    clearedEvidenceGBP:0,
    deliveryReady:false,
    buyerContactPermitted:false,
    automaticTransition:false,
    networkCalled:false,
    storageWrites:false,
    customerDelivery:"HOLD",
  });
}
