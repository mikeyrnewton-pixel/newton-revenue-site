#!/usr/bin/env node
/**
 * ATLAS Observer v0.1 — strictly bounded, read-only status snapshot boundary.
 *
 * The Mac-side CLI produces a small JSON report on stdout; it does NOT write
 * any file or open a listening socket. A separately owner-approved local job
 * may later place this output into the fixed, read-only-mounted container file.
 * The tunnel-facing process NEVER runs Mac, Docker or shell commands.
 */
import {openSync, fstatSync, readSync, closeSync, constants} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

export const SNAPSHOT_SCHEMA = "atlas.observer.snapshot.v1";
export const SNAPSHOT_PATH = "/run/atlas-observer/status.json";
export const SNAPSHOT_MAX_BYTES = 4096;
export const SNAPSHOT_MAX_AGE_MS = 5 * 60 * 1000;
export const SNAPSHOT_FUTURE_TOLERANCE_MS = 30 * 1000;

const ALLOWED = Object.freeze({
  docker: Object.freeze(["RESPONDING", "NOT_VERIFIED", "CLI_NOT_FOUND", "CLI_UNAVAILABLE_OR_DAEMON_OFFLINE"]),
  container: Object.freeze(["RUNNING_HEALTHY", "RUNNING_NOT_HEALTH_CONFIRMED", "NOT_RUNNING", "OTHER", "NOT_VERIFIED"]),
  http: Object.freeze(["HTTP_200", "HTTP_RESPONDED", "HTTP_UNEXPECTED", "NO_RESPONSE", "NOT_VERIFIED"]),
  watchdog: Object.freeze(["LAUNCHAGENT_LOADED", "NOT_LOADED_OR_UNAVAILABLE", "NOT_VERIFIED"]),
  heartbeat: Object.freeze(["FRESH_UNDER_3_MINUTES", "STALE_UNDER_1_HOUR", "STALE_OVER_1_HOUR", "CLOCK_SKEW", "NOT_FOUND", "NOT_VERIFIED"]),
});
const CONTAINERS = Object.freeze(["activepiecesApp", "activepiecesWorker", "postgres", "redis", "tunnelClient"]);
const select = (value, allowed) => allowed.includes(value) ? value : "NOT_VERIFIED";
const isRecord = v => v !== null && typeof v === "object" && !Array.isArray(v);
const fail = reason => ({schema: SNAPSHOT_SCHEMA, status: reason});

/** Return only fixed public readiness words, ignoring all untrusted extra fields. */
export function safeMacStatus(raw) {
  if (!isRecord(raw) || raw.schema !== "ATLAS_CONNECTOR_CONTROL_V1" ||
      raw.mode !== "READ_ONLY_LOCAL_STATUS" || raw.computer !== "MACOS" ||
      raw.noWritesPerformed !== true || !isRecord(raw.containers)) return null;
  return {
    computer: "MACOS",
    docker: select(raw.docker, ALLOWED.docker),
    containers: Object.fromEntries(CONTAINERS.map(key => [key, select(raw.containers[key], ALLOWED.container)])),
    activepiecesHttp: select(raw.activepiecesHttp, ALLOWED.http),
    watchdog: select(raw.watchdog, ALLOWED.watchdog),
    watchdogHeartbeat: select(raw.watchdogHeartbeat, ALLOWED.heartbeat),
  };
}

/** Only safeMacStatus fields go into the on-disk report. No raw fields survive. */
export function makeSnapshot(raw, capturedAt = new Date().toISOString()) {
  const state = safeMacStatus(raw);
  if (!state || !Number.isFinite(Date.parse(capturedAt)) ||
      typeof capturedAt !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(capturedAt)) {
    throw Error("Observer snapshot rejected");
  }
  return {schema: SNAPSHOT_SCHEMA, capturedAt, state};
}

/** Refuse stale / future / malformed / foreign snapshots and never echo input. */
export function assessSnapshot(value, now = Date.now()) {
  if (!isRecord(value) || value.schema !== SNAPSHOT_SCHEMA ||
      typeof value.capturedAt !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.capturedAt) ||
      !Number.isFinite(Date.parse(value.capturedAt))) return fail("INVALID");
  const age = now - Date.parse(value.capturedAt);
  if (age < -SNAPSHOT_FUTURE_TOLERANCE_MS) return fail("CLOCK_SKEW");
  if (age > SNAPSHOT_MAX_AGE_MS) return fail("STALE");
  const state = safeMacStatus({
    ...value.state,
    schema: "ATLAS_CONNECTOR_CONTROL_V1",
    mode: "READ_ONLY_LOCAL_STATUS",
    computer: value.state?.computer,
    noWritesPerformed: true,
  });
  if (!state) return fail("INVALID");
  // Observed-at is formatted from the validated instant, not arbitrary data.
  return {schema: SNAPSHOT_SCHEMA, status: "FRESH", capturedAt: new Date(Date.parse(value.capturedAt)).toISOString(), state};
}

/** Read exactly one fixed file. No path argument, symlinks or oversized contents. */
export function readSnapshotFile() {
  let fd;
  try {
    fd = openSync(SNAPSHOT_PATH, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const st = fstatSync(fd);
    if (!st.isFile() || st.size <= 0 || st.size > SNAPSHOT_MAX_BYTES) return null;
    const b = Buffer.alloc(st.size);
    let done = 0;
    while (done < st.size) {
      const n = readSync(fd, b, done, st.size - done, done);
      if (n <= 0) return null;
      done += n;
    }
    return JSON.parse(b.toString("utf8"));
  } catch { return null; }
  finally { if (fd !== undefined) try { closeSync(fd); } catch {} }
}

export async function captureSnapshot({collector, now = Date.now} = {}) {
  const read = collector ?? (await import("./atlas-mac-connector-control.mjs")).readMacStatus;
  const raw = await read();
  const currentTime = now();
  if (!Number.isFinite(currentTime)) throw Error("Invalid capture clock");
  return makeSnapshot(raw, new Date(currentTime).toISOString());
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  if (process.argv.length === 3 && process.argv[2] === "--capture") {
    captureSnapshot().then(value => process.stdout.write(JSON.stringify(value) + "\n"))
      .catch(() => {process.stderr.write("HOLD: snapshot capture unavailable.\n");process.exitCode = 2;});
  } else if (process.argv.length === 3 && process.argv[2] === "--help") {
    process.stdout.write("ATLAS Observer snapshot: --capture prints safe JSON only; no files written.\n");
  } else {
    process.stderr.write("HOLD: supported --capture or --help only.\n");
    process.exitCode = 2;
  }
}
