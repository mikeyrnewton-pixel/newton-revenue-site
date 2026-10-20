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

const OBSERVATION_UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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
  hold(exact(expectedBinding,["sourceRecordId","invoiceEventId","invoicedAt"]),
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
  hold(input.currency==="GBP"&&input.amountMinor===19500,
    "fixed GBP 195.00 observation required");
  hold(canonicalIso(input.observedAt),"canonical UTC observation timestamp required");
  hold(Date.parse(input.observedAt)>=Date.parse(expectedBinding.invoicedAt),
    "payment observation cannot predate invoice event");
  hold(PAYMENT_STATUSES.has(input.status),"recognised payment status required");
  hold(EVIDENCE_DIGEST.test(input.evidenceDigest||""),
    "SHA-256 evidence digest required");

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
