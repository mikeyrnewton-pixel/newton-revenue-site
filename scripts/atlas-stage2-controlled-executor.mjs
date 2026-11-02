#!/usr/bin/env node
/**
 * ATLAS Stage 2 / v0: LOCAL OWNER-APPROVED EXECUTION PROOF.
 *
 * This is deliberately NOT an MCP tool, a shell runner, a network service,
 * a Docker controller, or an Activepieces controller. One action only:
 * write a harmless local proof receipt to an owner-private directory.
 *
 * Separate proposal, explicit owner-local approval, and one-shot execution
 * are required. Do not expose approval/execution commands to any remote
 * agent, MCP server or shared user account. Future remote execution needs
 * independently authenticated owner approval and an additional audit.
 */
import {randomBytes, createHash, timingSafeEqual} from "node:crypto";
import * as fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {pathToFileURL} from "node:url";

const {O_RDONLY, O_WRONLY, O_CREAT, O_EXCL, O_NOFOLLOW} = fs.constants;
const SCHEMA = "atlas.stage2.control.v1";
const ACTION = "local_proof_v1";
const CONSENT = "I_APPROVE_STAGE2_LOCAL_PROOF";
const TTL_MS = 30 * 60 * 1000;
const ID_RE = /^[a-f0-9]{24}$/;
const FORBIDDEN_MODE = 0o077;
const fail = code => {throw new Error("STAGE2_HOLD_" + code);};
const exact = (v, fields) => v !== null && typeof v === "object" &&
  !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype &&
  Object.keys(v).length === fields.length &&
  fields.every(k => Object.hasOwn(v, k));
const digest = v => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const hashEqual = (a, b) => typeof a === "string" && typeof b === "string" &&
  /^[a-f0-9]{64}$/.test(a) && /^[a-f0-9]{64}$/.test(b) &&
  timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
const isId = id => typeof id === "string" && ID_RE.test(id);

function privateDirectory(dir, {create = true} = {}) {
  if (create) {
    try {fs.mkdirSync(dir, {mode: 0o700});}
    catch (e) {if (e.code !== "EEXIST") fail("PRIVATE_DIRECTORY_CREATE");}
  }
  let st;
  try {st = fs.lstatSync(dir);}
  catch {fail("PRIVATE_DIRECTORY_MISSING");}
  if (!st.isDirectory() || st.isSymbolicLink() ||
      (st.mode & FORBIDDEN_MODE) !== 0 ||
      (typeof process.getuid === "function" && st.uid !== process.getuid()))
    fail("PRIVATE_DIRECTORY_UNSAFE");
}
function privateFile(file) {
  let st;
  try {st = fs.lstatSync(file);}
  catch {fail("FILE_MISSING");}
  if (!st.isFile() || st.isSymbolicLink() || st.nlink !== 1 ||
      st.size < 2 || st.size > 2048 ||
      (st.mode & FORBIDDEN_MODE) !== 0 ||
      (typeof process.getuid === "function" && st.uid !== process.getuid()))
    fail("FILE_UNSAFE");
}
function writeOnlyOnce(file, value) {
  let fd;
  try {
    fd = fs.openSync(file, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW, 0o600);
    const body = JSON.stringify(value) + "\n";
    if (Buffer.byteLength(body) > 2048) fail("RECORD_TOO_LARGE");
    fs.writeFileSync(fd, body, {encoding: "utf8"});
    fs.fsyncSync(fd);
  } catch (e) {
    if (e.code === "EEXIST" || e.code === "ELOOP") fail("REPLAY_OR_SYMLINK");
    throw e;
  } finally {if (fd !== undefined) fs.closeSync(fd);}
}
function readPrivateJson(file) {
  privateFile(file);
  let fd;
  try {
    fd = fs.openSync(file, O_RDONLY | O_NOFOLLOW);
    const data = fs.readFileSync(fd, {encoding: "utf8"});
    return JSON.parse(data);
  } catch {fail("FILE_INVALID");}
  finally {if (fd !== undefined) fs.closeSync(fd);}
}
function verifyRequest(r, id, nowMs) {
  if (!exact(r, ["schema","id","action","createdAt","expiresAt"]) ||
      r.schema !== SCHEMA || r.id !== id || r.action !== ACTION)
    fail("REQUEST_SCHEMA");
  const created = Date.parse(r.createdAt), expires = Date.parse(r.expiresAt);
  if (!Number.isFinite(created) || !Number.isFinite(expires) ||
      expires - created !== TTL_MS || created > nowMs + 30000 ||
      nowMs > expires || nowMs < created - 30000)
    fail("REQUEST_EXPIRED_OR_CLOCK");
}
export function makeController({
  home = os.homedir(), now = () => Date.now(), random = () => randomBytes(12)
} = {}) {
  const root = path.join(home, ".atlas-stage2-control");
  const pdir = path.join(root, "requests");
  const adir = path.join(root, "approvals");
  const ddir = path.join(root, "receipts");
  const ldir = path.join(root, "locks");
  const base = () => {
    privateDirectory(root);
    for (const dir of [pdir, adir, ddir, ldir]) privateDirectory(dir);
  };
  const fileFor = (dir,id) => {
    if (!isId(id)) fail("REQUEST_ID");
    return path.join(dir, id + ".json");
  };
  const request = id => {
    const r = readPrivateJson(fileFor(pdir,id));
    verifyRequest(r,id,now());
    return r;
  };
  return Object.freeze({
    listActions() {
      return [{id: ACTION, description:"Write one owner-private local proof receipt only",
        network:false, shell:false, docker:false, spending:false,
        externalMessages:false, approval:"owner local SSH"}];
    },
    propose(action) {
      if (action !== ACTION) fail("ACTION_NOT_ALLOWLISTED");
      base();
      const id = random().toString("hex");
      if (!isId(id)) fail("RANDOM_ID_INVALID");
      // Use one time sample: separate now() calls can differ by even 1 ms,
      // causing verifyRequest's exact 30-minute TTL invariant to reject a
      // newly-created request before its actual expiration.
      const createdMs = now();
      if (!Number.isSafeInteger(createdMs)) fail("CLOCK_INVALID");
      const createdAt = new Date(createdMs).toISOString();
      const expiresAt = new Date(createdMs + TTL_MS).toISOString();
      const r = {schema:SCHEMA,id,action:ACTION,createdAt,expiresAt};
      writeOnlyOnce(fileFor(pdir,id),r);
      return {status:"PROPOSED_NOT_APPROVED",id,action:ACTION,expiresAt};
    },
    approve(id, explicitConsent) {
      if (explicitConsent !== CONSENT) fail("OWNER_CONSENT_REQUIRED");
      base();
      const r = request(id);
      const record = {schema:SCHEMA,id,action:ACTION,requestSha256:digest(r),
        approvedAt:new Date(now()).toISOString(),ownerChannel:"LOCAL_SSH"};
      writeOnlyOnce(fileFor(adir,id),record);
      return {status:"OWNER_APPROVAL_RECORDED",id};
    },
    execute(id) {
      base();
      const r = request(id);
      const a = readPrivateJson(fileFor(adir,id));
      if (!exact(a, ["schema","id","action","requestSha256","approvedAt","ownerChannel"]) ||
          a.schema !== SCHEMA || a.id !== id || a.action !== ACTION ||
          a.ownerChannel !== "LOCAL_SSH" ||
          !hashEqual(a.requestSha256,digest(r)) ||
          !Number.isFinite(Date.parse(a.approvedAt)) ||
          Date.parse(a.approvedAt) < Date.parse(r.createdAt) ||
          Date.parse(a.approvedAt) > now() + 30000)
        fail("APPROVAL_INVALID");
      // One-way lock survives crashes; no automatic retries, no deletion.
      const lock = path.join(ldir,id);
      try {fs.mkdirSync(lock,{mode:0o700});}
      catch {fail("ACTION_ALREADY_STARTED");}
      privateDirectory(lock,{create:false});
      // Fixed action: write an isolated receipt. Never evaluate a command.
      const record = {schema:SCHEMA,id,action:ACTION,
        executedAt:new Date(now()).toISOString(),result:"LOCAL_PROOF_ONLY",
        externalEffect:false,network:false,noSpend:true};
      writeOnlyOnce(fileFor(ddir,id),record);
      return {status:"LOCAL_PROOF_EXECUTED",id,externalEffect:false,noSpend:true};
    },
    receipt(id) {
      base();
      return readPrivateJson(fileFor(ddir,id));
    }
  });
}
function main(argv) {
  const c = makeController();
  let result;
  if (argv.length === 1 && argv[0] === "list") result = c.listActions();
  else if (argv.length === 2 && argv[0] === "propose") result = c.propose(argv[1]);
  else if (argv.length === 3 && argv[0] === "approve") result = c.approve(argv[1],argv[2]);
  else if (argv.length === 2 && argv[0] === "execute") result = c.execute(argv[1]);
  else if (argv.length === 2 && argv[0] === "receipt") result = c.receipt(argv[1]);
  else fail("COMMAND_NOT_ALLOWLISTED");
  process.stdout.write(JSON.stringify(result) + "\n");
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {main(process.argv.slice(2));}
  catch (e) {
    process.stdout.write((/^STAGE2_HOLD_[A-Z_]+$/.test(e.message) ?
      e.message : "STAGE2_HOLD_INTERNAL_ERROR") + "\n");
    process.exitCode = 2;
  }
}
