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
