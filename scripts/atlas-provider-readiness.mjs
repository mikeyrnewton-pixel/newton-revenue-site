#!/usr/bin/env node
/**
 * ATLAS: read-only, zero-network, zero-spend local model credential inventory.
 *
 * Reads only exact, anticipated local .env files and this process environment.
 * Never invokes a provider, emits key material, edits files or assumes a
 * configured key is usable/free. Never prints file paths or environment values.
 */
import { readFileSync, lstatSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { connect } from "node:net";

const cli = new Set(process.argv.slice(2));
if (cli.has("--help")) {
  console.log("Usage: node scripts/atlas-provider-readiness.mjs [--json] [--no-local]");
  console.log("Read-only, no external network, no API/AI/model calls, no key disclosure.");
  process.exit(0);
}
for (const arg of cli) {
  if (!["--json", "--no-local"].includes(arg)) {
    console.error("Unknown argument; no network or model calls made.");
    process.exit(2);
  }
}

const examples = [
  { name: "Cerebras", vars: ["CEREBRAS_API_KEY"], route: true },
  { name: "Groq", vars: ["GROQ_API_KEY"], route: true },
  { name: "OpenRouter", vars: ["OPENROUTER_API_KEY"], route: true },
  { name: "Gemini", vars: ["GEMINI_API_KEY"], route: true },
  { name: "Mistral", vars: ["MISTRAL_API_KEY"], route: true },
  { name: "NVIDIA", vars: ["NVIDIA_API_KEY"], route: true },
  { name: "Cloudflare AI", vars: ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"], route: true },
  { name: "DeepSeek", vars: ["DEEPSEEK_API_KEY"], route: false },
  { name: "xAI (Grok API)", vars: ["XAI_API_KEY"], route: false },
  { name: "Perplexity API", vars: ["PERPLEXITY_API_KEY"], route: false },
  { name: "Voyage (retrieval)", vars: ["VOYAGE_API_KEY"], route: false }
];
const wanted = new Set(examples.flatMap(item => item.vars));
const home = homedir();
const files = [
  join(home, "Newton-Empire", ".env"),
  join(home, "newton-empire", ".env"),
  join(home, "ATLAS-LOCAL-SETUP", ".env"),
  join(home, "ATLAS-LOCAL-SETUP", "Newton-Empire", ".env"),
  join(home, "ATLAS-BUILD-READY", "source", "Newton-Empire", ".env"),
  join(home, ".newton-empire", ".env")
];
// An explicit existing config path is optional. It is NEVER printed.
if (process.env.ATLAS_EXISTING_ENV_FILE) {
  files.push(resolve(process.env.ATLAS_EXISTING_ENV_FILE));
}
const seenFiles = new Set(), entries = new Map();

function appearsConfigured(raw) {
  if (typeof raw !== "string") return false;
  let value = raw.trim();
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1).trim();
  return Boolean(value) &&
    !/^(?:none|null|unset|not_set|changeme|your_key|your_api_key|replace_me|example|placeholder|todo|<.+>|\$\{.+\})$/i.test(value) &&
    !/^((?:your|insert|replace|example|test)[-_\s])|(?:[-_\s](?:placeholder|here))$/i.test(value);
}
function readExactEnvFile(path) {
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 512 * 1024) return false;
    if (typeof process.getuid === "function" && stat.uid !== process.getuid()) return false;
    const content = readFileSync(path, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const match = line.match(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);
      if (!match || !wanted.has(match[1])) continue;
      // Quoted values can contain a #; unquoted values strip trailing comments.
      let value = match[2].trim();
      if (!(value.startsWith("'") || value.startsWith('"'))) {
        value = value.split(/\s+#/)[0].trim();
      }
      if (appearsConfigured(value)) entries.set(match[1], true);
    }
    return true;
  } catch { return false; }
}
for (const path of files) {
  if (seenFiles.has(path)) continue;
  seenFiles.add(path);
  if (readExactEnvFile(path)) entries.set("__SOURCE_FOUND", true);
}
for (const key of wanted) {
  if (appearsConfigured(process.env[key])) entries.set(key, true);
}
const providers = examples.map(item => ({
  provider: item.name,
  inExistingRouter: item.route,
  credentialStatus: item.vars.every(key => entries.get(key) === true)
    ? "PRESENT_UNTESTED" : "MISSING_OR_NOT_DISCOVERED"
}));
const routed = providers.filter(x => x.inExistingRouter);
const report = {
  result: "READ_ONLY_INVENTORY_COMPLETE",
  authorisation: "NO_PROVIDER_NETWORK_CALLS_NO_CHARGES",
  configFoundAtKnownLocations: entries.get("__SOURCE_FOUND") === true,
  routedProvidersWithCredentials: routed.filter(x => x.credentialStatus === "PRESENT_UNTESTED").length,
  routedProviderFamilies: routed.length,
  providers,
  localQwen: "NOT_CHECKED",
  privateGitHubAuthentication: "NOT_CHECKED",
  caution: "PRESENT_UNTESTED means a key was detected, NOT that the API works, is free, or is authorised for background jobs. No credentials were printed or changed."
};
async function isLocalPortOpen(port) {
  return await new Promise(resolve => {
    let settled = false;
    const socket = connect({host:"127.0.0.1", port});
    const finish = (value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(850);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}
if (!cli.has("--no-local")) {
  report.localQwen = await isLocalPortOpen(12434)
    ? "LOCAL_PORT_OPEN_INFERENCE_NOT_PROVEN" : "LOCAL_PORT_NOT_REACHABLE";
}
if (cli.has("--json")) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log("ATLAS PROVIDER READINESS — NO API CALLS / £0");
  for (const item of providers) {
    console.log(item.provider + ": " + item.credentialStatus +
      (item.inExistingRouter ? " [EXISTING ROUTE]" : " [NO EXISTING LLM ROUTE]"));
  }
  console.log("Qwen: " + report.localQwen);
  console.log("Routed credentials found: " + report.routedProvidersWithCredentials +
    "/" + report.routedProviderFamilies);
  console.log("Grok Bot, Perplexity Pro and paid/free quotas are NOT verified by API-key presence.");
  console.log("No keys printed. No accounts connected or changed. No paid API calls made.");
}
