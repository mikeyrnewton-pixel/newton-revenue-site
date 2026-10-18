#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const MAX_BYTES = 1024 * 1024;
const MAX_RECORDS = 250;
const FORBIDDEN_KEYS = /(^|_)(email|e_mail|phone|mobile|contact|person|first_name|last_name|linkedin|recipient|to|cc|bcc|send|sent|message_id)($|_)/i;
const PERSONAL_HOSTS = /(^|\.)(linkedin\.com|facebook\.com|instagram\.com|tiktok\.com|x\.com|twitter\.com)$/i;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE = /(?:\+\d[\d\s().-]{6,}\d|\b0\d{9,10}\b|\btel:\s*\d)/i;

const parseArgs = (argv) => {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    const option = argv[i];
    const value = argv[i + 1];
    if (!['--input', '--output'].includes(option) || !value || value.startsWith('--')) throw new Error('Usage: prospect-output-accept.mjs --input <json> --output <json>');
    out[option.slice(2)] = value;
  }
  if (!out.input || !out.output) throw new Error('Both --input and --output are required');
  return out;
};

const privateRegularFile = (target, label) => {
  const stat = fs.lstatSync(target);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`${label} must be a regular non-symlink file`);
  if ((stat.mode & 0o077) !== 0) throw new Error(`${label} permissions must not allow group or other access`);
  return stat;
};

const assertNoForbiddenData = (value, trail = 'input') => {
  if (Array.isArray(value)) return value.forEach((item, index) => assertNoForbiddenData(item, `${trail}[${index}]`));
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.test(key)) throw new Error(`Personal/contact or send field is forbidden: ${trail}.${key}`);
      assertNoForbiddenData(child, `${trail}.${key}`);
    }
    return;
  }
  if (typeof value === 'string' && (EMAIL.test(value) || PHONE.test(value))) throw new Error(`Personal contact data is forbidden: ${trail}`);
};

const boundedText = (value, name, max) => {
  if (typeof value !== 'string') throw new Error(`${name} must be text`);
  const clean = value.trim();
  if (!clean || clean.length > max) throw new Error(`${name} must contain 1-${max} characters`);
  return clean;
};

const businessUrl = (value, name) => {
  const raw = boundedText(value, name, 500);
  let url;
  try { url = new URL(raw); } catch { throw new Error(`${name} must be a valid URL`); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash) throw new Error(`${name} must be a clean HTTPS URL without credentials, port, query or fragment`);
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (!host.includes('.') || host === 'localhost' || /^\d+(?:\.\d+){3}$/.test(host) || PERSONAL_HOSTS.test(host)) throw new Error(`${name} must be a public business website, not a personal/social host`);
  url.hostname = host;
  url.pathname = url.pathname.replace(/\/{2,}/g, '/');
  return {url: url.toString(), host};
};

const validateInput = (doc) => {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw new Error('Input must be a JSON object');
  assertNoForbiddenData(doc);
  if (doc.schemaVersion !== 1) throw new Error('schemaVersion must be 1');
  const runId = boundedText(doc.runId, 'runId', 100);
  if (!/^[A-Za-z0-9._-]+$/.test(runId)) throw new Error('runId contains unsupported characters');
  if (doc.deliveryMode !== 'UNSENT_OWNER_REVIEW') throw new Error('deliveryMode must be UNSENT_OWNER_REVIEW');
  if (doc.controls?.externalCommunication !== false || doc.controls?.personalDataCollected !== false || doc.controls?.ownerApprovalRequired !== true) {
    throw new Error('Controls must prohibit external communication and personal data, and require owner approval');
  }
  if (doc.source?.system !== 'NEWTON REVENUE — Prospect Engine v1' || doc.source?.permissionBasis !== 'PUBLIC_BUSINESS_WEBSITE') {
    throw new Error('Source system and permission basis are not approved');
  }
  const capturedAt = boundedText(doc.source.capturedAt, 'source.capturedAt', 40);
  if (!Number.isFinite(Date.parse(capturedAt))) throw new Error('source.capturedAt must be an ISO timestamp');
  if (!Array.isArray(doc.records) || doc.records.length < 1 || doc.records.length > MAX_RECORDS) throw new Error(`records must contain 1-${MAX_RECORDS} items`);

  const byHost = new Map();
  let duplicatesRemoved = 0;
  for (const [index, record] of doc.records.entries()) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error(`records[${index}] must be an object`);
    if (record.state !== 'UNSENT') throw new Error(`records[${index}].state must be UNSENT`);
    const businessName = boundedText(record.businessName, `records[${index}].businessName`, 160);
    const website = businessUrl(record.website, `records[${index}].website`);
    if (!Array.isArray(record.sourceUrls) || record.sourceUrls.length < 1 || record.sourceUrls.length > 10) throw new Error(`records[${index}].sourceUrls must contain 1-10 URLs`);
    const sourceUrls = [...new Set(record.sourceUrls.map((url, sourceIndex) => businessUrl(url, `records[${index}].sourceUrls[${sourceIndex}]`)))];
    if (sourceUrls.some((source) => source.host !== website.host)) throw new Error(`records[${index}] evidence must come from its business website`);
    const accepted = {
      businessName,
      website: website.url,
      sourceUrls: [...new Set(sourceUrls.map((source) => source.url))].sort(),
      researchSummary: boundedText(record.researchSummary, `records[${index}].researchSummary`, 1200),
      fitReason: boundedText(record.fitReason, `records[${index}].fitReason`, 600),
      draft: {
        subject: boundedText(record.draft?.subject, `records[${index}].draft.subject`, 160),
        body: boundedText(record.draft?.body, `records[${index}].draft.body`, 2000)
      },
      state: 'UNSENT'
    };
    const existing = byHost.get(website.host);
    if (existing) {
      if (existing.businessName.toLowerCase() !== businessName.toLowerCase()) throw new Error(`Conflicting business names share host ${website.host}`);
      duplicatesRemoved += 1;
      continue;
    }
    byHost.set(website.host, accepted);
  }
  return {runId, capturedAt, records:[...byHost.values()].sort((a, b) => a.businessName.localeCompare(b.businessName)), duplicatesRemoved};
};

const writePrivate = (destination, payload) => {
  const directory = path.dirname(destination);
  fs.mkdirSync(directory, {recursive:true, mode:0o700});
  const directoryStat = fs.lstatSync(directory);
  if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory() || (directoryStat.mode & 0o077) !== 0) throw new Error('Output directory must be a private real directory');
  if (fs.existsSync(destination)) privateRegularFile(destination, 'Output file');
  const temporary = path.join(directory, `.${path.basename(destination)}.${process.pid}.tmp`);
  try {
    fs.writeFileSync(temporary, JSON.stringify(payload, null, 2) + '\n', {encoding:'utf8', mode:0o600, flag:'wx'});
    fs.renameSync(temporary, destination);
    fs.chmodSync(destination, 0o600);
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
};

export const acceptProspectOutput = (raw) => {
  const doc = JSON.parse(raw);
  const accepted = validateInput(doc);
  return {
    schemaVersion:1,
    status:'READY_FOR_OWNER_REVIEW_UNSENT',
    runId:accepted.runId,
    capturedAt:accepted.capturedAt,
    sourceSha256:crypto.createHash('sha256').update(raw).digest('hex'),
    counts:{input:doc.records.length,accepted:accepted.records.length,duplicatesRemoved:accepted.duplicatesRemoved},
    controls:{externalCommunication:false,personalDataCollected:false,ownerApprovalRequired:true,networkAccessUsed:false},
    records:accepted.records,
    hold:'UNSENT OWNER-REVIEW OUTPUT ONLY — not permission to contact, submit, buy data or claim a qualified opportunity.'
  };
};

function main() {
  const options = parseArgs(process.argv.slice(2));
  const input = path.resolve(options.input);
  const output = path.resolve(options.output);
  const stat = privateRegularFile(input, 'Input file');
  if (stat.size > MAX_BYTES) throw new Error('Input exceeds 1 MiB safety limit');
  const raw = fs.readFileSync(input, 'utf8');
  const result = acceptProspectOutput(raw);
  writePrivate(output, result);
  process.stdout.write(JSON.stringify({status:result.status, output, counts:result.counts}) + '\n');
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try { main(); } catch (error) { console.error(`BLOCKED: ${error.message}`); process.exitCode = 1; }
}
