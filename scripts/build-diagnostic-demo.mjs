// Build a reproducible, fully fictional diagnostic rehearsal; no network or customer data.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { buildDemoPack } from "../lib/diagnostic-pack.js";

const input = new URL("../examples/diagnostic-demo.json", import.meta.url);
const out = resolve(process.argv[2] || "generated/diagnostic-demo.md");
const markdown = buildDemoPack(JSON.parse(readFileSync(input, "utf8")));
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, markdown, { flag: "w", mode: 0o600 });
console.log("FICTIONAL demo generated: " + out + " (delivery release HOLD)");
