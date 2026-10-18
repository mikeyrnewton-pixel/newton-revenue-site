#!/usr/bin/env node
/**
 * TASK-024: fail-closed provider-route authorisation gate.
 *
 * Consumes the read-only AI_PROVIDER_READINESS inventory and an explicit route
 * request. Produces a private decision receipt only. It has no networking,
 * provider SDK, route enablement, credential reading, or billing capability.
 */
import { lstatSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { resolve } from "node:path";

const argv = process.argv.slice(2);
if (argv.includes("--help")) {
  console.log("Usage: node scripts/task024-provider-route-gate.mjs --inventory <json> --request <json> --output <json>");
  console.log("Decision only: no provider call, route enablement, credential access, or spend.");
  process.exit(0);
}
const allowed = new Set(["--inventory", "--request", "--output"]);
const args = new Map();
for (let i = 0; i < argv.length; i += 2) {
  const flag = argv[i], value = argv[i + 1];
  if (!allowed.has(flag) || !value || value.startsWith("--")) fail("Unknown or incomplete argument");
  if (args.has(flag)) fail("Duplicate argument");
  args.set(flag, value);
}
if (args.size !== 3) fail("All three file arguments are required");

function fail(message) {
  console.error(message + "; no provider call or route change made.");
  process.exit(2);
}
function readPrivateJson(label, rawPath) {
  const path = resolve(rawPath);
  let stat;
  try { stat = lstatSync(path); } catch { fail(label + " is not readable"); }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 512 * 1024) fail(label + " is unsafe");
  if (typeof process.getuid === "function" && stat.uid !== process.getuid()) fail(label + " owner is unsafe");
  if ((stat.mode & 0o077) !== 0) fail(label + " permissions must be 0600");
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch { fail(label + " is not valid JSON"); }
}
function safeString(value, max = 200) {
  return typeof value === "string" && value.length > 0 && value.length <= max &&
    !/[\u0000-\u001f\u007f]/.test(value);
}
function containsSecretField(value) {
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, child]) =>
    /(?:api.?key|token|secret|password|credential|authorization|cookie)/i.test(key) || containsSecretField(child));
}

const inventory = readPrivateJson("Inventory", args.get("--inventory"));
const request = readPrivateJson("Request", args.get("--request"));
if (containsSecretField(request)) fail("Request contains a forbidden secret-like field");
if (inventory?.result !== "READ_ONLY_INVENTORY_COMPLETE" ||
    inventory?.authorisation !== "NO_PROVIDER_NETWORK_CALLS_NO_CHARGES" ||
    !Array.isArray(inventory?.providers)) fail("Inventory provenance is invalid");

const expectedKeys = ["schemaVersion", "taskId", "provider", "purpose", "syntheticOnly",
  "ownerApproval", "maxCalls", "maxSpendGBP", "personalData", "externalContact",
  "publishing", "trading", "accountChange"];
if (!request || typeof request !== "object" || Array.isArray(request) ||
    Object.keys(request).some(key => !expectedKeys.includes(key)) ||
    expectedKeys.some(key => !(key in request))) fail("Request schema is invalid");
if (request.schemaVersion !== 1 || request.taskId !== "TASK-024" ||
    !safeString(request.provider, 80) || !safeString(request.purpose) ||
    request.syntheticOnly !== true || request.maxCalls !== 1 || request.maxSpendGBP !== 0 ||
    [request.personalData, request.externalContact, request.publishing, request.trading,
      request.accountChange].some(value => value !== false) ||
    !["NOT_GRANTED", "GRANTED_FOR_ONE_ZERO_COST_TEST"].includes(request.ownerApproval)) {
  fail("Request exceeds the zero-cost synthetic boundary");
}

const route = inventory.providers.find(item => item?.provider === request.provider);
let status = "HOLD_PROVIDER_NOT_IN_INVENTORY";
let reason = "The requested provider is absent from the bounded inventory.";
if (route?.routeType === "OPTIONAL_DISABLED_IN_SOURCE") {
  status = "HOLD_OPTIONAL_ROUTE_DISABLED";
  reason = "Optional direct routes remain disabled and require separate implementation and billing authority.";
} else if (route?.routeType !== "CORE_IN_SOURCE" || route?.inExistingRouter !== true) {
  status = "HOLD_NO_EXISTING_CORE_ROUTE";
  reason = "Only an already-existing core route can pass this gate.";
} else if (route?.credentialStatus !== "PRESENT_UNTESTED") {
  status = "HOLD_CREDENTIAL_NOT_DISCOVERED";
  reason = "No credential was discovered; the gate never reads or requests credential material.";
} else if (request.ownerApproval !== "GRANTED_FOR_ONE_ZERO_COST_TEST") {
  status = "HOLD_OWNER_APPROVAL";
  reason = "Fresh human approval for one zero-cost synthetic test is absent.";
} else {
  status = "READY_FOR_SEPARATE_ONE_CALL_TEST_UNCALLED";
  reason = "Preconditions passed, but a separate executor and fresh confirmation are still required.";
}

const receipt = {
  schemaVersion: 1,
  taskId: "TASK-024",
  result: status,
  provider: request.provider,
  routeType: route?.routeType ?? "UNKNOWN",
  credentialStatus: route?.credentialStatus ?? "UNKNOWN",
  syntheticOnly: true,
  maxCalls: 1,
  maxSpendGBP: 0,
  reason,
  assertions: {
    providerCalled: false,
    modelResponseReceived: false,
    routeEnabled: false,
    credentialsReadOrPrinted: false,
    chargesIncurred: false,
    externalMessageSent: false
  }
};
const output = resolve(args.get("--output"));
try {
  const existing = lstatSync(output);
  if (existing.isSymbolicLink() || !existing.isFile()) fail("Output path is unsafe");
} catch (error) {
  if (error?.code !== "ENOENT") fail("Output path is unsafe");
}
writeFileSync(output, JSON.stringify(receipt, null, 2) + "\n", {mode: 0o600});
chmodSync(output, 0o600);
console.log(JSON.stringify(receipt));

