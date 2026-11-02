/**
 * ATLAS Stage 2B — OFFLINE, NON-NETWORKED SIGNED INTENT PROTOTYPE.
 *
 * NO MCP server, HTTP listener, Mac shell, Docker control, external side
 * effects, or private signing keys. Keep Stage 1 Observer unchanged.
 * The sole permitted action is the same harmless local_proof_v1 receipt.
 *
 * A separate owner device / principal must hold the Ed25519 private key.
 * Never install that key on an agent-accessible Mac account. The public key
 * alone is passed to this verifier. No signer is supplied in production.
 *
 * Fail-closed replay locking is durable: if a process dies after acquiring a
 * lock, never auto-retry; require manual reconciliation. An action not proved
 * as completed remains uncertain, not "failed so retry".
 */
import * as fs from "node:fs";
import path from "node:path";
import {randomBytes, createHash, createPublicKey, verify as verifySignature} from "node:crypto";

const INTENT_SCHEMA = "atlas.stage2b.intent.v1";
const APPROVAL_SCHEMA = "atlas.stage2b.approval.v1";
const ACTION = "local_proof_v1";
const PURPOSE = "ATLAS_STAGE2B_LOCAL_PROOF_ONLY";
const INTENT_VALID_MS = 24 * 60 * 60 * 1000; // Owner may approve later.
const APPROVAL_VALID_MS = 10 * 60 * 1000; // Short after signed approval only.
const CLOCK_SKEW_MS = 30 * 1000;
const ID_RE = /^[a-f0-9]{32}$/;
const SIG_RE = /^[A-Za-z0-9_-]{86}$/; // 64 Ed25519 bytes, unpadded b64url.
const DIGEST_RE = /^[0-9a-f]{64}$/;
const restricted = 0o077;

const hold = code => {throw new Error("ATLAS_STAGE2B_HOLD_" + code);};
const exact = (x, keys) =>
  x!==null && typeof x==="object" && !Array.isArray(x) &&
  Object.getPrototypeOf(x)===Object.prototype &&
  Object.keys(x).length===keys.length && keys.every(k=>Object.hasOwn(x,k));
const digest = s => createHash("sha256").update(s).digest("hex");
const canonicalIntent = r => JSON.stringify({
  schema:r.schema,id:r.id,action:r.action,args:{},
  requestedAt:r.requestedAt,validUntil:r.validUntil
});
const canonicalApproval = a => JSON.stringify({
  schema:a.schema,id:a.id,intentDigest:a.intentDigest,
  purpose:a.purpose,approvedAt:a.approvedAt,validUntil:a.validUntil
});
function isoTime(t) {
  if (typeof t!=="string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(t)) return NaN;
  const n=Date.parse(t);
  return Number.isSafeInteger(n) && new Date(n).toISOString()===t ? n : NaN;
}
function checkIntent(r, ms) {
  if (!exact(r,["schema","id","action","args","requestedAt","validUntil"]) ||
      r.schema!==INTENT_SCHEMA || !ID_RE.test(r.id) ||
      r.action!==ACTION || !exact(r.args,[]))
    hold("INTENT_NOT_ALLOWLISTED");
  const start=isoTime(r.requestedAt), end=isoTime(r.validUntil);
  if (!Number.isFinite(start) || !Number.isFinite(end) ||
      end-start!==INTENT_VALID_MS || ms<start-CLOCK_SKEW_MS ||
      ms>end || start>ms+CLOCK_SKEW_MS)
    hold("INTENT_EXPIRED_OR_CLOCK");
}
function checkApproval(a, r, ms) {
  if (!exact(a,["schema","id","intentDigest","purpose","approvedAt","validUntil"]) ||
      a.schema!==APPROVAL_SCHEMA || a.id!==r.id ||
      !DIGEST_RE.test(a.intentDigest) ||
      a.intentDigest!==digest(canonicalIntent(r)) ||
      a.purpose!==PURPOSE)
    hold("APPROVAL_INVALID");
  const start=isoTime(a.approvedAt),end=isoTime(a.validUntil);
  const requested=isoTime(r.requestedAt);
  if(!Number.isFinite(start)||!Number.isFinite(end)||
     end-start!==APPROVAL_VALID_MS ||
     start<requested-CLOCK_SKEW_MS ||
     start>ms+CLOCK_SKEW_MS || ms<start-CLOCK_SKEW_MS ||
     ms>end) hold("APPROVAL_EXPIRED_OR_CLOCK");
}
function privateDirectory(dir) {
  try {fs.mkdirSync(dir,{mode:0o700});}
  catch(e) {if(e.code!=="EEXIST") hold("DIRECTORY_CREATE_FAILED");}
  const st=fs.lstatSync(dir);
  if(!st.isDirectory()||st.isSymbolicLink()||
     (st.mode&restricted)!==0 ||
     (typeof process.getuid==="function"&&st.uid!==process.getuid()))
     hold("DIRECTORY_UNSAFE");
}
function exclusiveWrite(file,value) {
  let fd;
  try {
    fd=fs.openSync(file,fs.constants.O_CREAT|fs.constants.O_EXCL|
      fs.constants.O_WRONLY|fs.constants.O_NOFOLLOW,0o600);
    fs.writeFileSync(fd,JSON.stringify(value)+"\n","utf8");
    fs.fsyncSync(fd);
  }catch(e){
    if(e.code==="EEXIST"||e.code==="ELOOP")hold("ACTION_ALREADY_RESERVED");
    throw e;
  }finally{if(fd!==undefined)fs.closeSync(fd);}
}
function publicVerifier(publicKeyPem) {
  if(typeof publicKeyPem!=="string" || publicKeyPem.length>512 ||
     !publicKeyPem.includes("BEGIN PUBLIC KEY"))hold("OWNER_PUBLIC_KEY_INVALID");
  let key;
  try{key=createPublicKey(publicKeyPem);}
  catch{hold("OWNER_PUBLIC_KEY_INVALID");}
  if(key.type!=="public"||key.asymmetricKeyType!=="ed25519")
    hold("OWNER_PUBLIC_KEY_INVALID");
  return key;
}
function signatureBytes(s) {
  if(typeof s!=="string"||!SIG_RE.test(s))hold("SIGNATURE_INVALID");
  const buf=Buffer.from(s,"base64url");
  if(buf.length!==64 || buf.toString("base64url")!==s)
    hold("SIGNATURE_INVALID");
  return buf;
}
export function makeStage2BGate({ownerPublicKeyPem, stateRoot, now=()=>Date.now(), random=()=>randomBytes(16)}) {
  const key=publicVerifier(ownerPublicKeyPem);
  if(typeof stateRoot!=="string" || !path.isAbsolute(stateRoot) ||
     stateRoot.trim()!==stateRoot)hold("STATE_ROOT_INVALID");
  // The caller must supply an owner-specific existing private parent. This
  // prototype makes no assumptions about live Mac users/permission model.
  const journal=path.join(stateRoot,"receipts");
  function ensurePrivate() {
    privateDirectory(stateRoot);
    privateDirectory(journal);
  }
  return Object.freeze({
    listActions() {
      return [{action:ACTION, description:"Write one private harmless proof record only",
        shell:false,network:false,spending:false,trading:false,
        outreach:false,customerAccess:false,requiresSignedOwnerApproval:true}];
    },
    propose() {
      const ms=now();
      if(!Number.isSafeInteger(ms))hold("CLOCK_INVALID");
      const id=random().toString("hex");
      if(!ID_RE.test(id))hold("RANDOM_INVALID");
      const r={schema:INTENT_SCHEMA,id,action:ACTION,args:{},
        requestedAt:new Date(ms).toISOString(),
        validUntil:new Date(ms+INTENT_VALID_MS).toISOString()};
      return {status:"INTENT_ONLY_NOT_APPROVED",intent:r,
        intentDigest:digest(canonicalIntent(r))};
    },
    // Detached approval must be generated and signed on the independent
    // owner device; the production gate never creates a signature.
    verifyOwnerApproval(intent, approval, signature) {
      const ms=now();
      if(!Number.isSafeInteger(ms))hold("CLOCK_INVALID");
      checkIntent(intent,ms);
      checkApproval(approval,intent,ms);
      const bytes=signatureBytes(signature);
      let ok=false;
      try{ok=verifySignature(null,Buffer.from(canonicalApproval(approval)),key,bytes);}
      catch{hold("SIGNATURE_INVALID");}
      if(!ok)hold("SIGNATURE_INVALID");
      return {status:"SIGNED_APPROVAL_VERIFIED",id:intent.id,action:ACTION};
    },
    executeLocalProof(intent, approval, signature) {
      this.verifyOwnerApproval(intent,approval,signature);
      ensurePrivate();
      // O_EXCL receipt pre-reserves the request ID; any retry fails closed.
      // This operation has no separate external effects.
      const receipt={schema:"atlas.stage2b.receipt.v1",id:intent.id,
        action:ACTION,completedAt:new Date(now()).toISOString(),
        result:"LOCAL_PROOF_ONLY",externalEffect:false,noSpend:true};
      exclusiveWrite(path.join(journal,intent.id+".json"),receipt);
      return {status:"LOCAL_PROOF_EXECUTED",id:intent.id,
        receipt:receipt.result,externalEffect:false,noSpend:true};
    }
  });
}
export const STAGE2B_SIGNING_CONTRACT=Object.freeze({
  intent:INTENT_SCHEMA,approval:APPROVAL_SCHEMA,action:ACTION,purpose:PURPOSE,
  intentValidMs:INTENT_VALID_MS,approvalValidMs:APPROVAL_VALID_MS
});
