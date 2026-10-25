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
const MAX_JSON_NESTING = 32;
const PROTOCOL = "2025-03-26";
const SUPPORTED = new Set(["2024-11-05", PROTOCOL, "2025-06-18"]);
const TOOL_SCHEMA = Object.freeze({
  type: "object",
  properties: Object.freeze({}),
  additionalProperties: false,
});
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
  Object.freeze({name: "atlas_ping", description: "Returns a fixed harmless connectivity token; no Mac access.", inputSchema: TOOL_SCHEMA}),
  Object.freeze({name: "atlas_capabilities", description: "Returns the observer's fixed read-only scope and explicit denied capabilities. No snapshot or Mac access.", inputSchema: TOOL_SCHEMA}),
  Object.freeze({name: "atlas_status", description: "Reads only a pre-generated, freshness-checked, allowlisted Mac health snapshot. No commands, identifiers or customer data.", inputSchema: TOOL_SCHEMA}),
]);
const reply = (id, result) => ({jsonrpc: "2.0", id, result});
const error = (id, code, message) => ({jsonrpc: "2.0", id, error: {code, message}});
const validRecord = value => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};
// The exported handler is also used directly by offline tests and future local
// adapters. Do not execute accessors or accept hidden/symbol properties at that
// trust boundary, even though JSON.parse itself produces inert data properties.
const ownDataKeys = value => {
  if (!validRecord(value)) return null;
  const keys = Reflect.ownKeys(value);
  if (!keys.every(key => typeof key === "string")) return null;
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, "value") ||
        descriptor.enumerable !== true) return null;
  }
  return keys;
};
const inertRecord = value => ownDataKeys(value) !== null;
const exactKeys = (value, allowed) => {
  const keys = ownDataKeys(value);
  return keys !== null && keys.every(key => allowed.includes(key));
};
const emptyParams = value => value === undefined || exactKeys(value, []);
const validInitializeParams = value =>
  exactKeys(value, ["protocolVersion", "capabilities", "clientInfo"]) &&
  typeof value.protocolVersion === "string" &&
  value.protocolVersion.length > 0 && value.protocolVersion.length <= 32 &&
  (!Object.hasOwn(value, "capabilities") || inertRecord(value.capabilities)) &&
  (!Object.hasOwn(value, "clientInfo") || inertRecord(value.clientInfo));

/** Denied methods and unauthorized tools never call readSnapshot. */
export function handleObserverMcp(message, {readSnapshot = readSnapshotFile, now = Date.now} = {}) {
  if (!exactKeys(message, ["jsonrpc", "id", "method", "params"]))
    return error(null, -32600, "Invalid request");
  const hasId = Object.hasOwn(message, "id");
  const id = hasId ? message.id : null;
  const validId = !hasId ||
    (typeof id === "string" && id.length > 0 && id.length <= 128 &&
     !/[\u0000-\u001f\u007f-\u009f]/u.test(id)) ||
    (typeof id === "number" && Number.isSafeInteger(id));
  if (message.jsonrpc !== "2.0" || typeof message.method !== "string" || !validId)
    return error(validId ? id : null, -32600, "Invalid request");
  if (!hasId) return null;
  if (message.method === "initialize") {
    if (!validInitializeParams(message.params))
      return error(id, -32602, "Invalid initialize parameters");
    const offered = message.params.protocolVersion;
    return reply(id, {
      protocolVersion: SUPPORTED.has(offered) ? offered : PROTOCOL,
      capabilities: {tools: {listChanged: false}},
      serverInfo: {name: "atlas-observer-review", version: "0.1.0"},
      instructions: "Read-only snapshot prototype. No remote Mac control or workflow access.",
    });
  }
  if (message.method === "ping")
    return emptyParams(message.params) ? reply(id, {}) : error(id, -32602, "Parameters not allowed");
  if (message.method === "tools/list")
    return emptyParams(message.params) ? reply(id, {tools: TOOLS}) : error(id, -32602, "Parameters not allowed");
  if (message.method !== "tools/call") return error(id, -32601, "Method not available");
  // Accept only the MCP tool name and optional zero-argument object. Ignoring
  // extra command/path/URL/schema fields would create a fail-open boundary if
  // future code ever started consuming them.
  if (!exactKeys(message.params, ["name", "arguments"]) ||
      typeof message.params.name !== "string" ||
      !TOOLS.some(tool => tool.name === message.params.name)) return error(id, -32602, "Tool not allowed");
  const args = message.params.arguments === undefined ? {} : message.params.arguments;
  if (!exactKeys(args, []))
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
function canonicalJsonContentType(value) {
  if (typeof value !== "string") return false;
  const parts = value.split(";").map(part => part.trim());
  if (parts[0]?.toLowerCase() !== "application/json") return false;
  if (parts.length === 1) return true;
  return parts.length === 2 &&
    /^charset\s*=\s*utf-8$/iu.test(parts[1]);
}
function inspectJsonStructure(text) {
  const stack = [];
  for (let index = 0; index < text.length;) {
    const char = text[index];
    if (/\s/u.test(char)) {index += 1;continue;}
    if (char === "{") {
      if (stack.length >= MAX_JSON_NESTING) return "TOO_DEEP";
      stack.push({type: "object", keys: new Set(), expectingKey: true});
      index += 1;
      continue;
    }
    if (char === "[") {
      if (stack.length >= MAX_JSON_NESTING) return "TOO_DEEP";
      stack.push({type: "array"});
      index += 1;
      continue;
    }
    if (char === "}" || char === "]") {
      stack.pop();
      index += 1;
      continue;
    }
    if (char === ",") {
      const current = stack.at(-1);
      if (current?.type === "object") current.expectingKey = true;
      index += 1;
      continue;
    }
    if (char !== "\"") {index += 1;continue;}

    const start = index;
    index += 1;
    let escaped = false;
    while (index < text.length) {
      const next = text[index++];
      if (escaped) {escaped = false;continue;}
      if (next === "\\") {escaped = true;continue;}
      if (next === "\"") break;
    }
    const current = stack.at(-1);
    if (current?.type === "object" && current.expectingKey) {
      let key;
      try {key = JSON.parse(text.slice(start, index));}
      catch {continue;}
      if (current.keys.has(key)) return "DUPLICATE";
      current.keys.add(key);
      current.expectingKey = false;
    }
  }
  return "OK";
}

export function createObserverServer(deps = {}) {
  const server = createServer((req, res) => {
    if (req.method === "GET" && req.url === "/healthz")
      return json(res, 200, {status: "OBSERVER_PROCESS_ALIVE_ONLY"});
    if (req.url !== "/mcp") return json(res, 404, {error: "Not found"});
    if (req.method !== "POST") return json(res, 405, {error: "Method not allowed"});
    // Node deliberately de-duplicates Content-Type in req.headers. Inspect the
    // raw field names as well so duplicated/conflicting declarations cannot be
    // normalized into a single allowlisted value before this trust boundary.
    const contentTypeCount = req.rawHeaders.reduce(
      (count, value, index) => count +
        (index % 2 === 0 && value.toLowerCase() === "content-type" ? 1 : 0),
      0,
    );
    if (contentTypeCount !== 1 ||
        !canonicalJsonContentType(req.headers["content-type"]))
      return json(res, 415, {error: "Canonical UTF-8 JSON required"});
    // The byte cap applies to the body received by this process. Refuse
    // compression so an encoded request cannot expand beyond that reviewed
    // bound or create decoder ambiguity at the Observer trust boundary.
    const contentEncodingCount = req.rawHeaders.reduce(
      (count, value, index) => count +
        (index % 2 === 0 && value.toLowerCase() === "content-encoding" ? 1 : 0),
      0,
    );
    const contentEncoding = req.headers["content-encoding"];
    if (contentEncodingCount > 1 ||
        (contentEncoding !== undefined &&
         (contentEncodingCount !== 1 || typeof contentEncoding !== "string" ||
          contentEncoding.trim().toLowerCase() !== "identity")))
      return json(res, 415, {error: "Content encoding not allowed"});
    const chunks = [];
    let size = 0;
    let oversized = false;
    req.on("data", chunk => {
      if (oversized) return;
      size += chunk.length;
      if (size > MAX_REQUEST_BYTES) {
        oversized = true;
        chunks.length = 0;
        json(res, 413, {error: "Request too large"});
        req.resume();
        return;
      }
      chunks.push(chunk);
    });
    req.on("error", () => {if (!res.writableEnded) empty(res, 400);});
    req.on("end", () => {
      if (res.writableEnded) return;
      if (oversized) return json(res, 413, {error: "Request too large"});
      let message;
      try {
        const body = new TextDecoder("utf-8", {fatal: true}).decode(
          Buffer.concat(chunks),
        );
        const structure = inspectJsonStructure(body);
        if (structure === "DUPLICATE")
          return json(res, 400, error(null, -32600, "Duplicate JSON object keys not allowed"));
        if (structure === "TOO_DEEP")
          return json(res, 400, error(null, -32600, "JSON nesting limit exceeded"));
        message = JSON.parse(body);
      } catch {
        return json(res, 400, error(null, -32700, "Invalid JSON"));
      }
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
