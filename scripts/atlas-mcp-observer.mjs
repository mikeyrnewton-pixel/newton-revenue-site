#!/usr/bin/env node
/**
 * ATLAS Observer v0.1 — REVIEW ONLY, not deployed. This service only reads
 * a single fixed read-only-mounted snapshot. It has no shell, Docker socket,
 * Activepieces credentials, outbound network requests or arbitrary file API.
 *
 * Running canary and tunnel client must NOT be replaced without fresh
 * owner approval, QA review, and a separate verified deployment handoff.
 */
import {createServer} from "node:http";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {assessSnapshot, readSnapshotFile} from "./atlas-observer-snapshot.mjs";

export const OBSERVER_HOST = "127.0.0.1";
export const OBSERVER_PORT = 18788; // Different from running atlas_ping canary.
export const PING_REPLY = "ATLAS_TUNNEL_CANARY_OK_NO_MAC_ACCESS";
const MAX_REQUEST_BYTES = 8192;
const PROTOCOL = "2025-03-26";
const SUPPORTED = new Set(["2024-11-05", PROTOCOL, "2025-06-18"]);
const TOOL_SCHEMA = Object.freeze({type: "object", properties: {}, additionalProperties: false});
const CAPABILITIES = Object.freeze({
  schema: "atlas.observer.capabilities.v1",
  mode: "READ_ONLY_SANITIZED_SNAPSHOT",
  tools: Object.freeze(["atlas_ping", "atlas_capabilities", "atlas_status"]),
  snapshotMaxAgeSeconds: 300,
  macShell: false,
  filesystemBrowse: false,
  dockerControl: false,
  activepiecesAccess: false,
  customerDataAccess: false,
  financialAccess: false,
  writeActions: false,
});
const TOOLS = Object.freeze([
  {name: "atlas_ping", description: "Returns a fixed harmless connectivity token; no Mac access.", inputSchema: TOOL_SCHEMA},
  {name: "atlas_capabilities", description: "Returns the observer's fixed read-only scope and explicit denied capabilities. No snapshot or Mac access.", inputSchema: TOOL_SCHEMA},
  {name: "atlas_status", description: "Reads only a pre-generated, freshness-checked, allowlisted Mac health snapshot. No commands, identifiers or customer data.", inputSchema: TOOL_SCHEMA},
]);
const reply = (id, result) => ({jsonrpc: "2.0", id, result});
const error = (id, code, message) => ({jsonrpc: "2.0", id, error: {code, message}});
const validRecord = value => value !== null && typeof value === "object" && !Array.isArray(value);
const exactKeys = (value, allowed) => validRecord(value) &&
  Object.keys(value).every(key => allowed.includes(key)) &&
  allowed.filter(key => Object.hasOwn(value, key)).length === Object.keys(value).length;

/** Denied methods and unauthorized tools never call readSnapshot. */
export function handleObserverMcp(message, {readSnapshot = readSnapshotFile, now = Date.now} = {}) {
  if (!validRecord(message) ||
      !Object.keys(message).every(key => ["jsonrpc", "id", "method", "params"].includes(key)))
    return error(null, -32600, "Invalid request");
  const hasId = Object.hasOwn(message, "id");
  const id = hasId ? message.id : null;
  const validId = !hasId || typeof id === "string" ||
    (typeof id === "number" && Number.isFinite(id));
  if (message.jsonrpc !== "2.0" || typeof message.method !== "string" || !validId)
    return error(validId ? id : null, -32600, "Invalid request");
  if (!hasId) return null;
  if (message.method === "initialize") {
    const offered = message.params?.protocolVersion;
    return reply(id, {
      protocolVersion: SUPPORTED.has(offered) ? offered : PROTOCOL,
      capabilities: {tools: {listChanged: false}},
      serverInfo: {name: "atlas-observer-review", version: "0.1.0"},
      instructions: "Read-only snapshot prototype. No remote Mac control or workflow access.",
    });
  }
  if (message.method === "ping") return reply(id, {});
  if (message.method === "tools/list") return reply(id, {tools: TOOLS});
  if (message.method !== "tools/call") return error(id, -32601, "Method not available");
  // Accept only the MCP tool name and optional zero-argument object. Ignoring
  // extra command/path/URL/schema fields would create a fail-open boundary if
  // future code ever started consuming them.
  if (!exactKeys(message.params, ["name", "arguments"]) ||
      typeof message.params.name !== "string" ||
      !TOOLS.some(tool => tool.name === message.params.name)) return error(id, -32602, "Tool not allowed");
  const args = message.params.arguments === undefined ? {} : message.params.arguments;
  if (!validRecord(args) || Object.keys(args).length !== 0)
    return error(id, -32602, "Arguments not allowed");
  if (message.params.name === "atlas_ping") return reply(id, {content: [{type: "text", text: PING_REPLY}], isError: false});
  if (message.params.name === "atlas_capabilities")
    return reply(id, {content: [{type: "text", text: JSON.stringify(CAPABILITIES)}], isError: false});
  let result;
  try { result = assessSnapshot(readSnapshot(), now()); }
  catch { result = {schema: "atlas.observer.snapshot.v1", status: "UNAVAILABLE"}; }
  return reply(id, {content: [{type: "text", text: JSON.stringify(result)}], isError: false});
}

function json(res, status, value) {
  const payload = JSON.stringify(value);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}
function empty(res, status) {
  res.writeHead(status, {"cache-control": "no-store", "content-length": 0});
  res.end();
}
export function createObserverServer(deps = {}) {
  const server = createServer((req, res) => {
    if (req.method === "GET" && req.url === "/healthz")
      return json(res, 200, {status: "OBSERVER_PROCESS_ALIVE_ONLY"});
    if (req.url !== "/mcp") return json(res, 404, {error: "Not found"});
    if (req.method !== "POST") return json(res, 405, {error: "Method not allowed"});
    if ((req.headers["content-type"] ?? "").split(";", 1)[0].trim().toLowerCase() !== "application/json")
      return json(res, 415, {error: "JSON required"});
    const chunks = [];
    let size = 0;
    let oversized = false;
    req.on("data", chunk => {
      size += chunk.length;
      if (size > MAX_REQUEST_BYTES) {oversized = true;return;}
      chunks.push(chunk);
    });
    req.on("error", () => {if (!res.writableEnded) empty(res, 400);});
    req.on("end", () => {
      if (res.writableEnded) return;
      if (oversized) return json(res, 413, {error: "Request too large"});
      let message;
      try { message = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
      catch { return json(res, 400, error(null, -32700, "Invalid JSON")); }
      if (Array.isArray(message)) return json(res, 400, error(null, -32600, "Batch requests disabled"));
      const result = handleObserverMcp(message, deps);
      if (result === null) return empty(res, 202);
      return json(res, 200, result);
    });
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  server.keepAliveTimeout = 1000;
  server.maxRequestsPerSocket = 20;
  server.maxHeadersCount = 32;
  return server;
}
export function startObserver({host = OBSERVER_HOST, port = OBSERVER_PORT} = {}) {
  if (host !== OBSERVER_HOST) throw Error("Unapproved observer bind address");
  if (port !== OBSERVER_PORT) throw Error("Unapproved observer port");
  const server = createObserverServer();
  server.listen(port, host, () => process.stdout.write("ATLAS_OBSERVER_LOCAL_REVIEW_ONLY\n"));
  return server;
}
const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  if (process.argv.length === 3 && process.argv[2] === "--serve") startObserver();
  else if (process.argv.length === 3 && process.argv[2] === "--help")
    process.stdout.write("ATLAS Observer (review only): --serve binds localhost. Owner approval required before Mac use.\n");
  else {process.stderr.write("HOLD: explicit --serve required.\n");process.exitCode = 2;}
}
