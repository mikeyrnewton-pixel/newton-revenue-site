// Synthetic-only commercial evidence reconciliation for the £195 diagnostic.
// No invoice, payment link, bank instruction, customer contact or delivery is performed.
const CHANNELS=new Set(["Website","Email","Phone","WhatsApp"]);
const VAT=new Set(["VAT_INCLUDED","VAT_EXCLUDED","OUTSIDE_SCOPE"]);
const ORDER=["QUOTE_READY","WRITTEN_ACCEPTANCE","OWNER_APPROVED","INVOICE_READY","INVOICED","PAYMENT_RECORDED","CLEARED"];
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DIGEST=/^[0-9a-f]{64}$/i;

function hold(ok,message){if(!ok)throw new Error("COMMERCIAL HOLD: "+message)}
function exact(value,keys){
  return value&&typeof value==="object"&&!Array.isArray(value)&&
    Object.keys(value).length===keys.length&&Object.keys(value).every(key=>keys.includes(key));
}
function iso(value){
  if(typeof value!=="string")return false;
  const parsed=new Date(value);
  return !Number.isNaN(parsed.getTime())&&parsed.toISOString()===value;
}

export function reconcileCommercialReadiness(input){
  const inputKeys=["synthetic","projectRef","sourceRecordId","sourceClassification",
    "sourceEvidenceDigest","channel","priceGBP","vatTreatment",
    "supplierAddressApproved","termsApproved","events"];
  hold(exact(input,inputKeys),"exact readiness input required");
  hold(input.synthetic===true,"fictional rehearsal only");
  hold(/^DEMO-[A-Z0-9-]{3,30}$/.test(input.projectRef),"fictional project reference required");
  hold(UUID.test(input.sourceRecordId||""),"valid source record ID required");
  hold(input.sourceClassification==="SYNTHETIC","synthetic source classification required");
  hold(DIGEST.test(input.sourceEvidenceDigest||""),"source SHA-256 evidence digest required");
  hold(CHANNELS.has(input.channel),"exactly one approved enquiry channel required");
  hold(input.priceGBP===195,"fixed £195 diagnostic price required");
  hold(Array.isArray(input.events),"event array required");

  const blockers=[];
  if(!VAT.has(input.vatTreatment))blockers.push("VAT_TREATMENT_UNCONFIRMED");
  if(input.supplierAddressApproved!==true)blockers.push("SUPPLIER_ADDRESS_UNAPPROVED");
  if(input.termsApproved!==true)blockers.push("COMMERCIAL_TERMS_UNAPPROVED");
  hold(blockers.length===0||input.events.length===0,
    "commercial events forbidden while VAT, address or terms blockers remain");
  if(blockers.length){
    return Object.freeze({
      schema:"NEWTON_COMMERCIAL_READINESS_V1",
      synthetic:true,
      projectRef:input.projectRef,
      sourceRecordId:input.sourceRecordId,
      sourceClassification:input.sourceClassification,
      state:"COMMERCIAL_HOLD",
      blockers:Object.freeze(blockers),
      acceptedEventIds:Object.freeze([]),
      recordedPaymentEvidenceGBP:0,
      clearedEvidenceGBP:0,
      commercialTruth:"FICTIONAL_ONLY_NOT_REVENUE",
      customerDelivery:"HOLD",
    });
  }

  const seen=new Map();
  const accepted=[];
  let lastAt=null;
  for(const event of input.events){
    const keys=["version","synthetic","eventId","sourceRecordId","type","occurredAt","evidenceDigest"];
    hold(exact(event,keys),"exact event fields required");
    hold(event.version===1&&event.synthetic===true,"fictional event schema version 1 required");
    hold(UUID.test(event.eventId||""),"valid event ID required");
    hold(event.sourceRecordId===input.sourceRecordId,
      "commercial event source record mismatch");
    hold(ORDER.includes(event.type),"recognised commercial event required");
    hold(iso(event.occurredAt),"canonical UTC event timestamp required");
    hold(DIGEST.test(event.evidenceDigest||""),"SHA-256 evidence digest required");
    const serialized=JSON.stringify(event);
    if(seen.has(event.eventId)){
      hold(seen.get(event.eventId)===serialized,"conflicting replay for one event ID");
      continue;
    }
    hold(event.type===ORDER[accepted.length],"commercial event order skipped or repeated");
    hold(lastAt===null||Date.parse(event.occurredAt)>=Date.parse(lastAt),
      "commercial evidence timeline moved backwards");
    seen.set(event.eventId,serialized);
    accepted.push(event);
    lastAt=event.occurredAt;
  }

  const state=accepted.length?accepted.at(-1).type:"COMMERCIAL_GATE_READY";
  return Object.freeze({
    schema:"NEWTON_COMMERCIAL_READINESS_V1",
    synthetic:true,
    projectRef:input.projectRef,
    sourceRecordId:input.sourceRecordId,
    sourceClassification:input.sourceClassification,
    state,
    blockers:Object.freeze([]),
    acceptedEventIds:Object.freeze(accepted.map(event=>event.eventId)),
    recordedPaymentEvidenceGBP:["PAYMENT_RECORDED","CLEARED"].includes(state)?195:0,
    clearedEvidenceGBP:state==="CLEARED"?195:0,
    commercialTruth:"FICTIONAL_ONLY_NOT_REVENUE",
    customerDelivery:"HOLD",
  });
}
