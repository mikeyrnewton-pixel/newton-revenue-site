#!/usr/bin/env node
/**
 * TASK-024: create a private, fail-closed provider-route request.
 *
 * The generated request is always NOT_GRANTED. This tool has no provider,
 * network, credential, account, route, billing, or approval capability.
 */
import { lstatSync, writeFileSync, chmodSync } from "node:fs";
import { resolve } from "node:path";

const argv = process.argv.slice(2);
if (argv.includes("--help")) {
  console.log("Usage: node scripts/task024-provider-request-builder.mjs --provider <name> --purpose <synthetic-purpose> --output <json>");
  console.log("Creates a private NOT_GRANTED request; no provider or route action.");
  process.exit(0);
}
const allowed = new Set(["--provider", "--purpose", "--output"]);
const args = new Map();
function fail(message) {
  console.error(message + "; no request, provider call, approval, or route change made.");
  process.exit(2);
}
for (let i = 0; i < argv.length; i += 2) {
  const flag = argv[i], value = argv[i + 1];
  if (!allowed.has(flag) || !value || value.startsWith("--")) fail("Unknown or incomplete argument");
  if (args.has(flag)) fail("Duplicate argument");
  args.set(flag, value);
}
if (args.size !== 3) fail("All three arguments are required");

function safeText(value, max) {
  return typeof value === "string" && value.trim() === value && value.length > 0 &&
    value.length <= max && !/[\u0000-\u001f\u007f]/.test(value) &&
    !/(?:api.?key|token|secret|password|credential|cookie)\s*[:=]/i.test(value);
}
const provider = args.get("--provider");
const purpose = args.get("--purpose");
if (!safeText(provider, 80) || !safeText(purpose, 200)) fail("Provider or purpose is unsafe");
if (!/synthetic/i.test(purpose)) fail("Purpose must explicitly state synthetic use");

const output = resolve(args.get("--output"));
try {
  const existing = lstatSync(output);
  if (existing.isSymbolicLink() || !existing.isFile()) fail("Output path is unsafe");
} catch (error) {
  if (error?.code !== "ENOENT") fail("Output path is unsafe");
}

const request = {
  schemaVersion: 1,
  taskId: "TASK-024",
  provider,
  purpose,
  syntheticOnly: true,
  ownerApproval: "NOT_GRANTED",
  maxCalls: 1,
  maxSpendGBP: 0,
  personalData: false,
  externalContact: false,
  publishing: false,
  trading: false,
  accountChange: false
};
writeFileSync(output, JSON.stringify(request, null, 2) + "\n", {mode: 0o600});
chmodSync(output, 0o600);
console.log(JSON.stringify({
  result: "PRIVATE_REQUEST_CREATED_NOT_GRANTED",
  outputMode: "0600",
  provider,
  providerCalled: false,
  routeEnabled: false,
  ownerApproval: "NOT_GRANTED",
  maxSpendGBP: 0
}));

