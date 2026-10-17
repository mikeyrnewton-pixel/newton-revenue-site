#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const STATUSES = Object.freeze(['NEW','QUALIFIED','SCOPE_APPROVED','BUYER_ACCEPTED','INVOICED','CLEARED','DELIVERED','LOST']);
const APPROVED = new Set(['SCOPE_APPROVED','BUYER_ACCEPTED','INVOICED','CLEARED','DELIVERED']);
const PAID = new Set(['CLEARED','DELIVERED']);
const parseArgs = (argv) => {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) throw new Error(`Unexpected argument: ${argv[i]}`);
    const key = argv[i].slice(2);
    const value = argv[++i];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for --${key}`);
    if (!['data-dir','output'].includes(key)) throw new Error(`Unknown option: --${key}`);
    out[key] = value;
  }
  return out;
};
const refuseSymlink = (target, label) => {
  const stat = fs.lstatSync(target);
  if (stat.isSymbolicLink()) throw new Error(`${label} must not be a symbolic link`);
  return stat;
};
const assertPrivate = (stat, label) => {
  if ((stat.mode & 0o077) !== 0) throw new Error(`${label} permissions must not allow group or other access`);
};
const assertRecord = (record, seen) => {
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error('Invalid record');
  if (typeof record.id !== 'string' || record.id.length < 1 || seen.has(record.id)) throw new Error('Invalid or duplicate record ID');
  if (!STATUSES.includes(record.state) || typeof record.synthetic !== 'boolean' || typeof record.company !== 'string' || !Array.isArray(record.events)) throw new Error('Invalid record schema');
  if (record.synthetic && PAID.has(record.state)) throw new Error('Synthetic record cannot be cleared or delivered');
  if (APPROVED.has(record.state)) {
    if (record.termsApproved !== true || !['NOT_VAT_REGISTERED_CONFIRMED','VAT_AMOUNT_CONFIRMED'].includes(record.vatTreatment) || !Number.isSafeInteger(record.amountPence) || record.amountPence < 1) {
      throw new Error('Approved-stage record lacks amount, terms or VAT evidence');
    }
  }
  seen.add(record.id);
};
const aggregate = (leads) => {
  if (leads.length > 10000) throw new Error('Ledger exceeds 10,000-record safety limit');
  const seen = new Set();
  for (const record of leads) assertRecord(record, seen);
  const genuine = leads.filter((record) => !record.synthetic);
  const states = Object.fromEntries(STATUSES.map((status) => [status, genuine.filter((record) => record.state === status).length]));
  const clearedPence = genuine.filter((record) => PAID.has(record.state)).reduce((sum, record) => sum + record.amountPence, 0);
  const invoicedNotClearedPence = genuine.filter((record) => record.state === 'INVOICED').reduce((sum, record) => sum + record.amountPence, 0);
  if (!Number.isSafeInteger(clearedPence) || !Number.isSafeInteger(invoicedNotClearedPence)) throw new Error('Aggregate amount is outside safe integer range');
  return {genuineRecords:genuine.length,syntheticExcluded:leads.length-genuine.length,states,clearedPence,invoicedNotClearedPence};
};
const writeReceipt = (destination, receipt) => {
  const directory = path.dirname(destination);
  fs.mkdirSync(directory,{recursive:true,mode:0o700});
  refuseSymlink(directory,'Receipt directory');
  assertPrivate(fs.statSync(directory),'Receipt directory');
  if (fs.existsSync(destination)) {
    const existing = refuseSymlink(destination,'Receipt file');
    if (!existing.isFile()) throw new Error('Receipt destination must be a regular file');
  }
  const temporary = path.join(directory,`.${path.basename(destination)}.${process.pid}.tmp`);
  try {
    fs.writeFileSync(temporary,JSON.stringify(receipt,null,2)+'\n',{encoding:'utf8',mode:0o600,flag:'wx'});
    fs.renameSync(temporary,destination);
    fs.chmodSync(destination,0o600);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
};

function main() {
  const options = parseArgs(process.argv.slice(2));
  const dataDir = path.resolve(options['data-dir'] || path.join(os.homedir(),'.atlas-sales-desk'));
  const output = path.resolve(options.output || path.join(os.homedir(),'ATLAS-BUILD-READY','results','SALES_DESK_RECONCILIATION.json'));
  const ledger = path.join(dataDir,'pipeline.json');
  let status = 'NO_LEDGER';
  let sourceSha256 = null;
  let totals = aggregate([]);
  if (fs.existsSync(dataDir)) {
    const directoryStat = refuseSymlink(dataDir,'Data directory');
    if (!directoryStat.isDirectory()) throw new Error('Data path must be a directory');
    assertPrivate(directoryStat,'Data directory');
  }
  if (fs.existsSync(ledger)) {
    const ledgerStat = refuseSymlink(ledger,'Ledger');
    if (!ledgerStat.isFile()) throw new Error('Ledger must be a regular file');
    assertPrivate(ledgerStat,'Ledger');
    if (ledgerStat.size > 5 * 1024 * 1024) throw new Error('Ledger exceeds 5 MiB safety limit');
    const raw = fs.readFileSync(ledger,'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.leads)) throw new Error('Invalid or unsupported ledger');
    totals = aggregate(parsed.leads);
    sourceSha256 = crypto.createHash('sha256').update(raw).digest('hex');
    status = 'RECONCILED_LOCAL_EVIDENCE';
  }
  const receipt = {
    schemaVersion:1,
    generatedAt:new Date().toISOString(),
    status,
    source:{kind:'atlas-sales-desk-local-ledger',sha256:sourceSha256},
    totals,
    controls:{readOnly:true,aggregateOnly:true,externalBankVerification:false,syntheticExcluded:true},
    hold:'LOCAL EVIDENCE ONLY — do not treat as bank verification, client acceptance or live service proof.'
  };
  writeReceipt(output,receipt);
  process.stdout.write(JSON.stringify({status,output,totals})+'\n');
}

try { main(); }
catch (error) { console.error(`BLOCKED: ${error.message}`); process.exitCode = 1; }
