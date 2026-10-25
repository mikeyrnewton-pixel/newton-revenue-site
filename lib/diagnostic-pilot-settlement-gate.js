// Privacy-safe, no-write settlement-evidence gate for the £195 diagnostic pilot.
// It reviews opaque evidence metadata only. It cannot authenticate a provider,
// issue an invoice, record cash, contact a buyer, write storage or release delivery.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DIGEST=/^[0-9a-f]{64}$/;
const PILOT=/^PILOT-[A-Z0-9-]{3,30}$/;
const PROVIDER=/^[A-Z][A-Z0-9_]{1,31}$/;
const SOURCES=new Set(["OWNER_DECLARATION","PROVIDER_READONLY_RECEIPT"]);
const STATUSES=new Set(["PENDING","SETTLED","FAILED","REFUNDED","DISPUTED"]);
const KEYS=[
  "version","pilotRef","sourceRecordId","quoteDraftId","invoiceDraftId",
  "settlementObservationId","evidenceSource","receiptAuthenticated","provider",
  "readOnly","currency","amountMinor","invoiceIssuedAt","paymentObservedAt",
  "verifiedAt","providerStatus","invoiceIssuedEvidenceDigest",
  "providerReceiptDigest","providerTransactionDigest","accountBindingDigest",
  "payerBindingDigest",
];

function hold(ok,message){
  if(!ok)throw Error("SETTLEMENT EVIDENCE HOLD: "+message);
}

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

export function assessDiagnosticPilotSettlementEvidence(input){
  hold(inertExactRecord(input,KEYS),
    "exact privacy-safe settlement metadata required");
  hold(input.version===1,"schema version 1 required");
  hold(typeof input.pilotRef==="string"&&PILOT.test(input.pilotRef),
    "non-customer pilot reference required");
  const ids=[
    input.sourceRecordId,input.quoteDraftId,input.invoiceDraftId,
    input.settlementObservationId,
  ];
  hold(ids.every(value=>UUID.test(value||"")),
    "canonical source, quote, invoice and observation IDs required");
  hold(new Set(ids).size===ids.length,
    "source, quote, invoice and observation IDs must be distinct");
  hold(SOURCES.has(input.evidenceSource),"recognised evidence source required");
  hold(typeof input.receiptAuthenticated==="boolean",
    "receipt authentication boolean required");
  hold(typeof input.provider==="string"&&PROVIDER.test(input.provider)&&
    input.provider!=="UNSET","named provider required");
  hold(input.readOnly===true,"read-only evidence review required");
  hold(input.currency==="GBP"&&input.amountMinor===19500,
    "fixed GBP 195.00 settlement target required");
  hold(STATUSES.has(input.providerStatus),"recognised provider status required");

  const times=[input.invoiceIssuedAt,input.paymentObservedAt,input.verifiedAt];
  hold(times.every(canonicalIso),"canonical UTC timestamps required");
  const issued=Date.parse(input.invoiceIssuedAt);
  const observed=Date.parse(input.paymentObservedAt);
  const verified=Date.parse(input.verifiedAt);
  hold(issued<=observed&&observed<=verified,
    "invoice, observation and verification chronology required");
  hold(verified-observed<=15*60*1000,
    "settlement observation is stale at verification");

  const digests=[
    input.invoiceIssuedEvidenceDigest,input.providerReceiptDigest,
    input.providerTransactionDigest,input.accountBindingDigest,
    input.payerBindingDigest,
  ];
  hold(digests.every(value=>DIGEST.test(value||"")),
    "canonical SHA-256 evidence digests required");
  hold(new Set(digests).size===digests.length,
    "invoice, receipt, transaction, account and payer evidence must differ");

  const independent=input.evidenceSource==="PROVIDER_READONLY_RECEIPT"&&
    input.receiptAuthenticated===true;
  hold(input.evidenceSource!=="OWNER_DECLARATION"||
    input.receiptAuthenticated===false,
    "owner declaration cannot claim an authenticated provider receipt");

  const settled=independent&&input.providerStatus==="SETTLED";
  const pending=independent&&input.providerStatus==="PENDING";
  const exception=independent&&
    new Set(["FAILED","REFUNDED","DISPUTED"]).has(input.providerStatus);
  const state=settled?"SETTLEMENT_EVIDENCE_READY_FOR_OWNER_REVIEW":
    pending?"SETTLEMENT_PENDING_HOLD":
      exception?"SETTLEMENT_EXCEPTION_HOLD":"SETTLEMENT_EVIDENCE_HOLD";
  const blockers=!independent
    ? ["INDEPENDENT_PROVIDER_RECEIPT_REQUIRED","OWNER_REVIEW_REQUIRED"]
    : settled
      ? ["OWNER_CASH_RECOGNITION_APPROVAL_REQUIRED",
        "CANONICAL_LEDGER_WRITE_SEPARATELY_APPROVED"]
      : ["PROVIDER_"+input.providerStatus+"_NOT_CLEARED",
        "OWNER_RECONCILIATION_REQUIRED"];

  return Object.freeze({
    schema:"NEWTON_DIAGNOSTIC_PILOT_SETTLEMENT_EVIDENCE_V1",
    pilotRef:input.pilotRef,
    sourceRecordId:input.sourceRecordId,
    quoteDraftId:input.quoteDraftId,
    invoiceDraftId:input.invoiceDraftId,
    settlementObservationId:input.settlementObservationId,
    evidenceSource:input.evidenceSource,
    provider:input.provider,
    providerStatus:input.providerStatus,
    independentReceiptMetadataPresent:independent,
    state,
    blockers:Object.freeze(blockers),
    settlementEvidenceReadyForOwnerReview:settled,
    invoiceIssuedByThisGate:false,
    paymentRecorded:false,
    cashRecognised:false,
    clearedEvidenceGBP:0,
    ledgerWriteAllowed:false,
    buyerContactPermitted:false,
    deliveryReady:false,
    automaticTransition:false,
    networkCalled:false,
    storageWrites:false,
    customerDelivery:"HOLD",
  });
}
