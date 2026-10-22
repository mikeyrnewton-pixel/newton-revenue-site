// Review-only payment evidence connector preparation for the £195 diagnostic.
// Validates non-secret configuration metadata only. It performs no network call,
// reads no environment value, creates no charge and never proves payment.
const ENV_NAME=/^[A-Z][A-Z0-9_]{2,63}$/;
const PROVIDER=/^[A-Z][A-Z0-9_]{1,31}$/;

function hold(ok,message){if(!ok)throw new Error("PAYMENT CONNECTOR HOLD: "+message)}
function exact(value,keys){
  return value&&typeof value==="object"&&!Array.isArray(value)&&
    Object.keys(value).length===keys.length&&Object.keys(value).every(key=>keys.includes(key));
}
function safeEnvName(value){
  return typeof value==="string"&&ENV_NAME.test(value)&&
    !/(SECRET_VALUE|TOKEN_VALUE|PASSWORD_VALUE|PRIVATE_KEY)/.test(value);
}

export function preparePaymentEvidenceConnector(input){
  const keys=["version","provider","credentialEnv","accountRefEnv","currency",
    "priceMinor","readOnly","allowCharges","allowRefunds","allowPayouts"];
  hold(exact(input,keys),"exact non-secret configuration required");
  hold(input.version===1,"configuration version 1 required");
  hold(typeof input.provider==="string"&&PROVIDER.test(input.provider),
    "provider identifier required");
  hold(safeEnvName(input.credentialEnv),"credential environment name required");
  hold(safeEnvName(input.accountRefEnv),"account reference environment name required");
  hold(input.currency==="GBP"&&input.priceMinor===19500,
    "fixed GBP 195.00 evidence target required");
  hold(input.readOnly===true,"read-only access required");
  hold(input.allowCharges===false&&input.allowRefunds===false&&input.allowPayouts===false,
    "all money-moving permissions must remain disabled");
  hold(input.credentialEnv!==input.accountRefEnv,
    "credential and account reference placeholders must differ");

  const blockers=[];
  if(input.provider==="UNSET")blockers.push("PAYMENT_PROVIDER_UNSET");
  return Object.freeze({
    schema:"NEWTON_PAYMENT_CONNECTOR_READINESS_V1",
    state:blockers.length?"NEEDS_CONNECTION":"READY_FOR_OWNER_CONNECTION",
    provider:input.provider,
    credentialEnv:input.credentialEnv,
    accountRefEnv:input.accountRefEnv,
    expectedCurrency:"GBP",
    expectedAmountMinor:19500,
    capability:"READ_PAYMENT_EVIDENCE_ONLY",
    blockers:Object.freeze(blockers),
    networkCalled:false,
    connected:false,
    paymentRecorded:false,
    clearedEvidenceGBP:0,
    canCharge:false,
    canRefund:false,
    canPayout:false,
  });
}

const OBSERVATION_UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const EVIDENCE_DIGEST=/^[0-9a-f]{64}$/;
const PAYMENT_STATUSES=new Set(["PENDING","SETTLED","FAILED","REFUNDED","DISPUTED"]);

function canonicalIso(value){
  if(typeof value!=="string")return false;
  const parsed=new Date(value);
  return !Number.isNaN(parsed.getTime())&&parsed.toISOString()===value;
}

// Converts a fictional read-only provider observation into a review candidate.
// It never records payment, clears funds or advances the commercial state machine.
export function assessSyntheticPaymentObservation(input,expectedBinding){
  const keys=["version","synthetic","observationId","sourceRecordId","invoiceEventId",
    "provider","currency","amountMinor","observedAt","status","evidenceDigest"];
  hold(exact(input,keys),"exact synthetic observation required");
  hold(exact(expectedBinding,["sourceRecordId","sourceEvidenceDigest","invoiceEventId",
    "invoiceEvidenceDigest","invoicedAt","provider"]),
    "exact expected commercial binding required");
  hold(input.version===1&&input.synthetic===true,
    "fictional observation schema version 1 required");
  hold(OBSERVATION_UUID.test(input.observationId||""),"valid observation ID required");
  hold(OBSERVATION_UUID.test(input.sourceRecordId||""),
    "valid source record ID required");
  hold(OBSERVATION_UUID.test(input.invoiceEventId||""),
    "valid invoice event ID required");
  hold(input.sourceRecordId===expectedBinding.sourceRecordId,
    "payment observation source record mismatch");
  hold(input.invoiceEventId===expectedBinding.invoiceEventId,
    "payment observation invoice event mismatch");
  hold(canonicalIso(expectedBinding.invoicedAt),
    "canonical UTC invoice timestamp required");
  hold(typeof input.provider==="string"&&PROVIDER.test(input.provider)&&input.provider!=="UNSET",
    "named provider identifier required");
  hold(typeof expectedBinding.provider==="string"&&PROVIDER.test(expectedBinding.provider)&&
    expectedBinding.provider!=="UNSET",
    "named expected provider identifier required");
  hold(input.provider===expectedBinding.provider,
    "payment observation provider mismatch");
  hold(input.currency==="GBP"&&input.amountMinor===19500,
    "fixed GBP 195.00 observation required");
  hold(canonicalIso(input.observedAt),"canonical UTC observation timestamp required");
  hold(Date.parse(input.observedAt)>=Date.parse(expectedBinding.invoicedAt),
    "payment observation cannot predate invoice event");
  hold(PAYMENT_STATUSES.has(input.status),"recognised payment status required");
  hold(EVIDENCE_DIGEST.test(input.evidenceDigest||""),
    "SHA-256 evidence digest required");
  hold(EVIDENCE_DIGEST.test(expectedBinding.sourceEvidenceDigest||"")&&
    EVIDENCE_DIGEST.test(expectedBinding.invoiceEvidenceDigest||""),
    "canonical source and invoice evidence digests required");
  hold(expectedBinding.sourceEvidenceDigest!==expectedBinding.invoiceEvidenceDigest,
    "source and invoice evidence digests must differ");
  hold(input.evidenceDigest!==expectedBinding.sourceEvidenceDigest&&
    input.evidenceDigest!==expectedBinding.invoiceEvidenceDigest,
    "payment evidence digest reused from an earlier commercial stage");

  const exceptions=new Set(["FAILED","REFUNDED","DISPUTED"]);
  const exception=exceptions.has(input.status);
  const candidate=input.status==="PENDING"?"PAYMENT_RECORDED":
    input.status==="SETTLED"?"CLEARED":null;
  const blockers=exception
    ? [`PAYMENT_${input.status}_REQUIRES_RECONCILIATION`]
    : input.status==="PENDING"
      ? ["PROVIDER_SETTLEMENT_NOT_OBSERVED","OWNER_APPROVAL_REQUIRED"]
      : ["OWNER_APPROVAL_REQUIRED"];

  return Object.freeze({
    schema:"NEWTON_SYNTHETIC_PAYMENT_OBSERVATION_V1",
    state:exception?"PAYMENT_EXCEPTION_HOLD":
      input.status==="PENDING"?"PAYMENT_RECORDED_REVIEW":"CLEARED_EVIDENCE_REVIEW",
    observationId:input.observationId,
    sourceRecordId:input.sourceRecordId,
    invoiceEventId:input.invoiceEventId,
    provider:input.provider,
    observedStatus:input.status,
    commercialEventCandidate:candidate,
    blockers:Object.freeze(blockers),
    automaticTransition:false,
    ownerApprovalRequired:true,
    connected:false,
    networkCalled:false,
    paymentRecorded:false,
    recordedPaymentEvidenceGBP:0,
    clearedEvidenceGBP:0,
    commercialTruth:"SYNTHETIC_OBSERVATION_NOT_REVENUE",
    customerDelivery:"HOLD",
  });
}



const PAYMENT_CURSOR_KEYS=["version","synthetic","observationIds","evidenceDigests"];

export function emptySyntheticPaymentEvidenceCursor(){
  return Object.freeze({
    version:1,
    synthetic:true,
    observationIds:Object.freeze([]),
    evidenceDigests:Object.freeze([]),
  });
}

function paymentEvidenceCursor(value){
  hold(exact(value,PAYMENT_CURSOR_KEYS),
    "exact prior payment evidence cursor required");
  hold(value.version===1&&value.synthetic===true,
    "fictional payment evidence cursor version 1 required");
  hold(Array.isArray(value.observationIds)&&Array.isArray(value.evidenceDigests)&&
    value.observationIds.length<=1000&&value.evidenceDigests.length<=1000,
    "bounded prior payment evidence cursor required");
  const checks=[
    [value.observationIds,OBSERVATION_UUID,"prior observation IDs"],
    [value.evidenceDigests,EVIDENCE_DIGEST,"prior evidence digests"],
  ];
  for(const [items,pattern,label] of checks){
    hold(items.every(item=>typeof item==="string"&&pattern.test(item)),
      `canonical ${label} required`);
    hold(items.every((item,index)=>index===0||items[index-1]<item),
      `sorted unique ${label} required`);
  }
  return {
    observationIds:new Set(value.observationIds),
    evidenceDigests:new Set(value.evidenceDigests),
  };
}

// Reconciles a bounded fictional batch so one provider transaction cannot be
// presented as multiple payment observations. Digests are non-secret evidence
// identifiers only; this performs no lookup, payment mutation or network call.
export function assessSyntheticPaymentObservationBatch(items,priorCursor){
  hold(Array.isArray(items)&&items.length>0&&items.length<=100,
    "one to 100 synthetic payment observations required");
  const prior=paymentEvidenceCursor(priorCursor);
  const observationIds=new Set(prior.observationIds);
  const evidenceDigests=new Set(prior.evidenceDigests);
  const providerTransactions=new Set();
  const invoiceEventIds=new Set();
  const sourceRecordIds=new Set();
  const candidates=[];
  for(const item of items){
    hold(exact(item,["providerTransactionDigest","observation","expectedBinding"]),
      "exact batch item required");
    hold(EVIDENCE_DIGEST.test(item.providerTransactionDigest||""),
      "canonical provider transaction digest required");
    hold(!observationIds.has(item.observation?.observationId),
      "payment observation ID already reconciled");
    hold(!evidenceDigests.has(item.observation?.evidenceDigest),
      "payment evidence digest already reconciled");
    hold(!providerTransactions.has(item.providerTransactionDigest),
      "provider transaction reused across payment observations");
    hold(!invoiceEventIds.has(item.observation?.invoiceEventId),
      "invoice event reused across payment observations");
    hold(!sourceRecordIds.has(item.observation?.sourceRecordId),
      "source record reused across payment observations");
    hold(item.providerTransactionDigest!==item.observation?.evidenceDigest&&
      item.providerTransactionDigest!==item.expectedBinding?.sourceEvidenceDigest&&
      item.providerTransactionDigest!==item.expectedBinding?.invoiceEvidenceDigest,
      "provider transaction digest must identify a distinct evidence boundary");
    const candidate=assessSyntheticPaymentObservation(
      item.observation,item.expectedBinding,
    );
    observationIds.add(item.observation.observationId);
    evidenceDigests.add(item.observation.evidenceDigest);
    providerTransactions.add(item.providerTransactionDigest);
    invoiceEventIds.add(item.observation.invoiceEventId);
    sourceRecordIds.add(item.observation.sourceRecordId);
    candidates.push(candidate);
  }
  return Object.freeze({
    schema:"NEWTON_SYNTHETIC_PAYMENT_OBSERVATION_BATCH_V1",
    state:"PAYMENT_BATCH_REVIEW",
    observationCount:candidates.length,
    candidates:Object.freeze(candidates),
    reconciliationCursor:Object.freeze({
      version:1,
      synthetic:true,
      observationIds:Object.freeze([...observationIds].sort()),
      evidenceDigests:Object.freeze([...evidenceDigests].sort()),
    }),
    automaticTransition:false,
    connected:false,
    networkCalled:false,
    paymentRecorded:false,
    clearedEvidenceGBP:0,
    commercialTruth:"SYNTHETIC_BATCH_NOT_REVENUE",
    customerDelivery:"HOLD",
  });
}
