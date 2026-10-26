#!/usr/bin/env node
/**
 * Build a private, redacted retention/deletion review receipt.
 * Offline only: this file has no storage, network, deletion or approval capability.
 */
import { readFileSync, writeFileSync, chmodSync, lstatSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

const argv = process.argv.slice(2);
if (argv.includes("--help")) {
  console.log("Usage: node scripts/enquiry-lifecycle-receipt.mjs --record <json> --policy <json> --as-of <ISO> --output <json>");
  console.log("Creates a redacted offline review receipt; never connects to or deletes data.");
  process.exit(0);
}

function fail(message) {
  console.error(message + "; no connection, deletion, approval or live change made.");
  process.exit(2);
}
const allowed = new Set(["--record", "--policy", "--as-of", "--output"]);
const args = new Map();
for (let i = 0; i < argv.length; i += 2) {
  const flag = argv[i], value = argv[i + 1];
  if (!allowed.has(flag) || !value || value.startsWith("--")) fail("Unknown or incomplete argument");
  if (args.has(flag)) fail("Duplicate argument");
  args.set(flag, value);
}
if (args.size !== 4) fail("All four arguments are required");

function loadJson(path, label) {
  try {
    const raw = readFileSync(resolve(path), "utf8");
    if (/(?:api.?key|token|secret|password|credential|cookie)\s*[:=]/i.test(raw)) fail(label + " contains secret-like text");
    return { raw, value: JSON.parse(raw) };
  } catch (error) {
    if (error?.code === "ENOENT") fail(label + " does not exist");
    if (error instanceof SyntaxError) fail(label + " is not valid JSON");
    throw error;
  }
}

const recordFile = loadJson(args.get("--record"), "Record");
const policyFile = loadJson(args.get("--policy"), "Policy");
const record = recordFile.value, policy = policyFile.value;
const asOf = new Date(args.get("--as-of"));
const createdAt = new Date(record.createdAt);
if (!Number.isFinite(asOf.valueOf()) || !Number.isFinite(createdAt.valueOf())) fail("Dates must be valid ISO timestamps");
if (asOf < createdAt) fail("As-of time cannot precede record creation");

if (record.schemaVersion !== 1 || typeof record.enquiryId !== "string" || !/^[a-z0-9-]{8,80}$/i.test(record.enquiryId))
  fail("Record schema or enquiry ID is invalid");
if (typeof record.email !== "string" || !/^[^@\s]+@example\.invalid$/i.test(record.email))
  fail("Only the synthetic example.invalid fixture is permitted");
if (record.syntheticOnly !== true || record.personalData !== false) fail("Record must be explicitly synthetic and non-personal");
if (typeof record.deletionRequested !== "boolean") fail("Deletion request state is required");

if (policy.schemaVersion !== 1 || !Number.isInteger(policy.retentionDays) || policy.retentionDays < 1 || policy.retentionDays > 365)
  fail("Retention policy is invalid");
if (!Number.isInteger(policy.deletionGraceDays) || policy.deletionGraceDays < 0 || policy.deletionGraceDays > 30)
  fail("Deletion grace policy is invalid");
if (policy.ownerApproval !== "NOT_GRANTED" || policy.liveEnabled !== false ||
    policy.storageAdapter !== "" || policy.deletionAdapter !== "" || policy.connectionStatus !== "NEEDS_CONNECTION")
  fail("Policy must remain disconnected, NOT_GRANTED and non-live");

const deleteEligibleAt = new Date(createdAt.valueOf() + policy.retentionDays * 86400000);
let decision = "RETAIN_UNTIL_POLICY_DATE";
if (record.deletionRequested) decision = "HOLD_OWNER_APPROVAL_FOR_DELETION_REVIEW";
else if (asOf >= deleteEligibleAt) decision = "RETENTION_EXPIRED_HOLD_FOR_REVIEW";

const fingerprint = createHash("sha256")
  .update(JSON.stringify({ record, policy, asOf: asOf.toISOString() }))
  .digest("hex");
const receipt = {
  schemaVersion: 1,
  component: "ENQUIRY_LIFECYCLE_REVIEW",
  state: "STAGED",
  testMode: "OFFLINE_SYNTHETIC_ONLY",
  connectionStatus: "NEEDS_CONNECTION",
  live: false,
  decision,
  enquiryId: record.enquiryId,
  emailClass: "SYNTHETIC_EXAMPLE_INVALID_REDACTED",
  createdAt: createdAt.toISOString(),
  asOf: asOf.toISOString(),
  deleteEligibleAt: deleteEligibleAt.toISOString(),
  ownerApproval: "NOT_GRANTED",
  storageConnected: false,
  deletionExecuted: false,
  externalContact: false,
  inputFingerprintSha256: fingerprint
};

const output = resolve(args.get("--output"));
try {
  const existing = lstatSync(output);
  if (existing.isSymbolicLink() || !existing.isFile()) fail("Output path is unsafe");
} catch (error) {
  if (error?.code !== "ENOENT") fail("Output path is unsafe");
}
writeFileSync(output, JSON.stringify(receipt, null, 2) + "\n", { mode: 0o600 });
chmodSync(output, 0o600);
console.log(JSON.stringify({
  result: "PRIVATE_REDACTED_LIFECYCLE_RECEIPT_CREATED",
  decision,
  outputMode: "0600",
  connectionStatus: "NEEDS_CONNECTION",
  live: false,
  deletionExecuted: false
}));
