import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { buildMockQuote } from "../lib/mock-quote.js";
const fixture = JSON.parse(readFileSync(new URL("../examples/mock-quote.json", import.meta.url), "utf8"));
const output = resolve(process.argv[2] || "generated/mock-quote.md");
const quote = buildMockQuote(fixture);
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, quote, { mode: 0o600 });
console.log("FICTIONAL mock scope built: " + output + " (commercial release HOLD)");
