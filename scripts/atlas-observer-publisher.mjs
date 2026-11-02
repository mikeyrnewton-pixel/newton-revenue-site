#!/usr/bin/env node
/**
 * ATLAS Observer snapshot publisher — REVIEW BRANCH ONLY.
 *
 * A local, explicit --publish action converts existing read-only Mac diagnostics
 * into a bounded, privacy-filtered snapshot. It does not start/restart services,
 * install a job, call an AI API, publish a network endpoint or change Activepieces.
 * Never schedule or run this on the owner's Mac without separate approval.
 */
import {constants} from "node:fs";
import * as fs from "node:fs/promises";
import {homedir} from "node:os";
import path from "node:path";
import {randomBytes} from "node:crypto";
import {fileURLToPath} from "node:url";
import {captureSnapshot, assessSnapshot, SNAPSHOT_MAX_BYTES} from "./atlas-observer-snapshot.mjs";

export const OBSERVER_DIRNAME = ".atlas-observer";
export const OBSERVER_FILENAME = "status.json";
export const OBSERVER_OWNER_DIR_MODE = 0o700;
export const OBSERVER_FILE_MODE = 0o600;
const isOwned = (stat, uid) => uid === undefined || stat.uid === uid;

function checkDir(stat, uid) {
  if (!stat.isDirectory() || stat.isSymbolicLink() || !isOwned(stat,uid) ||
      (stat.mode & 0o077) !== 0) throw Error("Observer directory is not private and owner-controlled");
}
function checkFile(stat, uid) {
  if (!stat.isFile() || stat.isSymbolicLink() || !isOwned(stat,uid) ||
      stat.nlink !== 1 || (stat.mode & 0o077) !== 0)
    throw Error("Existing observer snapshot is not a private regular owner file");
}
async function checkExistingTarget(dest, uid) {
  try {checkFile(await fs.lstat(dest), uid);}
  catch (e) {if (e?.code !== "ENOENT") throw e;}
}
function fixedDestination(home) {
  if (typeof home !== "string" || !path.isAbsolute(home))
    throw Error("Invalid owner home");
  const dir = path.join(home, OBSERVER_DIRNAME);
  return {dir, dest:path.join(dir,OBSERVER_FILENAME)};
}

/**
 * Refuses an existing symlink, shared directory, unsafe target, or unexpected
 * host identity. Atomic rename means a directory-level read-only Docker bind
 * sees the new inode. A single-file bind would NOT follow atomic replacements.
 * This function is for on-host, approved execution only; never MCP-exposed.
 */
export async function publishSnapshot({
  capture = captureSnapshot,
  home = homedir(),
  uid = process.getuid?.(),
  now = Date.now,
} = {}) {
  const {dir,dest} = fixedDestination(home);
  // Preserve the failure-closed semantics of the source collector. It must
  // produce only known enum words, never raw Docker or watchdog output.
  const candidate = await capture();
  const validation = assessSnapshot(candidate, now());
  if (validation.status !== "FRESH") throw Error("Refusing invalid or stale observer snapshot");
  // Reconstruct from the assessor's strictly allowlisted output. Never write
  // the raw collector payload or arbitrary properties of a supplied capture.
  const output = JSON.stringify({
    schema: validation.schema, capturedAt: validation.capturedAt, state: validation.state,
  }) + "\n";
  const size = Buffer.byteLength(output);
  if (size <= 1 || size > SNAPSHOT_MAX_BYTES)
    throw Error("Snapshot exceeds maximum size");
  try {await fs.mkdir(dir,{mode:OBSERVER_OWNER_DIR_MODE});}
  catch (e) {if (e?.code !== "EEXIST") throw e;}
  checkDir(await fs.lstat(dir),uid);
  await checkExistingTarget(dest,uid);

  const tmp = path.join(dir,`.status-${randomBytes(12).toString("hex")}.tmp`);
  let handle;
  let renamed = false;
  try {
    handle = await fs.open(tmp,constants.O_WRONLY | constants.O_CREAT |
      constants.O_EXCL | (constants.O_NOFOLLOW ?? 0),OBSERVER_FILE_MODE);
    checkFile(await handle.stat(),uid);
    await handle.writeFile(output,{encoding:"utf8"});
    await handle.sync();
    await handle.close(); handle=undefined;
    // Recheck immediately before replacement: never voluntarily follow a
    // symlink or overwrite a permissive/hard-linked target.
    checkDir(await fs.lstat(dir),uid);
    await checkExistingTarget(dest,uid);
    await fs.rename(tmp,dest);
    renamed=true;
  } finally {
    if (handle) await handle.close().catch(()=>{});
    if (!renamed) await fs.unlink(tmp).catch(()=>{});
  }
  const final = await fs.lstat(dest);
  checkFile(final,uid);
  // No host path or JSON diagnostics printed to terminal by this command.
  return Object.freeze({status:"PUBLISHED_PRIVATE_SNAPSHOT",sizeBytes:size});
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  const args=process.argv.slice(2);
  if(args.length === 1 && args[0] === "--publish") {
    publishSnapshot().then(r=>process.stdout.write(r.status+"\n"))
      .catch(()=>{process.stderr.write("HOLD: private snapshot publish failed.\n");process.exitCode=2;});
  } else if (args.length === 1 && args[0] === "--help") {
    process.stdout.write("ATLAS private snapshot publisher (owner-approved local action only): --publish\n");
  } else {
    process.stderr.write("HOLD: explicit --publish required.\n");process.exitCode=2;
  }
}
