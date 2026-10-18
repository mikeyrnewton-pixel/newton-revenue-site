#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {pathToFileURL} from 'node:url';

const MAX_BYTES=32*1024;
const SUCCESS_BUILDS=new Set([
  'FOUR_OFFLINE_BUILD_TASKS_RUN',
  'FOUR_APPROVED_LOCAL_OFFLINE_BUILD_TASKS_RUN',
  'FOUR_PINNED_PRIVATE_SYNTHETIC_BUILDS_RUN'
]);
const KNOWN_KEYS=new Set([
  'MAC_STAGED','PUBLIC_SITE_TESTS','PRIVATE_BUILDS','AI_PROVIDER_INVENTORY',
  'LOCAL_INTEGRATION_INVENTORY','CREDENTIALS_PRESENT_UNTESTED','OPTIONAL_ROUTES_DISABLED',
  'FULL_CUSTOMER_REHEARSAL','REAL_CUSTOMER_DELIVERY','MAC_RUNNING_BOTS_CHANGED',
  'NEW_SERVICES_INSTALLED','NEW_CHARGES'
]);
const SECRET=/(api[_ -]?key|access[_ -]?token|password|secret|bearer|private[_ -]?key|ghp_|sk-[a-z0-9])/i;

const parseArgs=(argv)=>{
  const out={};
  for(let i=0;i<argv.length;i++){
    const token=argv[i];
    if(!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const key=token.slice(2);
    if(!['input','output'].includes(key)) throw new Error(`Unknown option: --${key}`);
    const value=argv[++i];
    if(!value||value.startsWith('--')) throw new Error(`Missing value for --${key}`);
    out[key]=value;
  }
  if(!out.input) throw new Error('--input is required');
  return out;
};

const assertPrivateFile=(target,label)=>{
  const stat=fs.lstatSync(target);
  if(stat.isSymbolicLink()||!stat.isFile()) throw new Error(`${label} must be a regular non-symlink file`);
  if((stat.mode&0o077)!==0) throw new Error(`${label} permissions must not allow group or other access`);
  if(stat.size>MAX_BYTES) throw new Error(`${label} exceeds 32 KiB safety limit`);
};

const issue=(code,message)=>({code,message});
export function evaluateMacAdoptionStatus(raw){
  if(typeof raw!=='string') throw new Error('status input must be text');
  if(SECRET.test(raw)) throw new Error('status contains a possible secret marker');
  const values=new Map();
  for(const [index,source] of raw.split(/\r?\n/).entries()){
    const line=source.trim();
    if(!line) continue;
    const match=/^([A-Z0-9_]+)=([A-Z0-9_]+)$/.exec(line);
    if(!match) throw new Error(`line ${index+1} is not a safe KEY=VALUE status`);
    const [,key,value]=match;
    if(!KNOWN_KEYS.has(key)) throw new Error(`line ${index+1} uses unknown key ${key}`);
    if(values.has(key)) throw new Error(`duplicate status key ${key}`);
    values.set(key,value);
  }

  const issues=[];
  const expect=(key,value,code)=>{
    if(values.get(key)!==value) issues.push(issue(code,`${key} must equal ${value}`));
  };
  expect('MAC_STAGED','YES','MAC_STAGE');
  expect('PUBLIC_SITE_TESTS','PASS','PUBLIC_TESTS');
  if(!SUCCESS_BUILDS.has(values.get('PRIVATE_BUILDS'))){
    issues.push(issue('PRIVATE_BUILDS','PRIVATE_BUILDS does not prove four approved offline synthetic tasks ran'));
  }
  expect('AI_PROVIDER_INVENTORY','COMPLETE_NO_API_CALLS','PROVIDER_INVENTORY');
  expect('LOCAL_INTEGRATION_INVENTORY','COMPLETE_READ_ONLY_NOT_CONNECTED','LOCAL_INVENTORY');
  expect('REAL_CUSTOMER_DELIVERY','HOLD','DELIVERY_HOLD');
  expect('MAC_RUNNING_BOTS_CHANGED','NO','NO_BOT_CHANGE');
  expect('NEW_SERVICES_INSTALLED','NO','NO_SERVICE_CHANGE');
  expect('NEW_CHARGES','NONE','NO_CHARGES');
  if(!values.has('CREDENTIALS_PRESENT_UNTESTED')) issues.push(issue('CREDENTIAL_COUNT','credential inventory count missing'));
  else if(!/^\d+$/.test(values.get('CREDENTIALS_PRESENT_UNTESTED'))) issues.push(issue('CREDENTIAL_COUNT','credential inventory count must be numeric'));
  if(!values.has('OPTIONAL_ROUTES_DISABLED')) issues.push(issue('ROUTE_COUNT','optional route count missing'));
  else if(!/^\d+$/.test(values.get('OPTIONAL_ROUTES_DISABLED'))) issues.push(issue('ROUTE_COUNT','optional route count must be numeric'));
  const rehearsal=values.get('FULL_CUSTOMER_REHEARSAL');
  if(!['FICTIONAL_REHEARSAL_COMPLETE','NOT_IN_MERGED_MAIN'].includes(rehearsal)){
    issues.push(issue('REHEARSAL','FULL_CUSTOMER_REHEARSAL has an unsupported state'));
  }

  return {
    schemaVersion:1,
    taskId:'TASK-022',
    status:issues.length?'BLOCKED_MAC_ADOPTION':'READY_LOCAL_OFFLINE_BUILD_ADOPTED',
    issues,
    evidence:{
      publicSiteTests:values.get('PUBLIC_SITE_TESTS')||'MISSING',
      privateBuilds:values.get('PRIVATE_BUILDS')||'MISSING',
      providerInventory:values.get('AI_PROVIDER_INVENTORY')||'MISSING',
      localInventory:values.get('LOCAL_INTEGRATION_INVENTORY')||'MISSING',
      fictionalRehearsal:rehearsal||'MISSING'
    },
    assertions:{
      realCustomerDelivery:false,
      botsChanged:false,
      servicesInstalled:false,
      chargesIncurred:false,
      externalContact:false,
      individualBuildArtifactsIndependentlyVerified:false
    },
    hold:'This receipt validates the redacted bootstrap status only. It does not prove individual output contents, live workers, customer delivery or revenue.',
    nextRequired:issues.length
      ? 'Run the approved Mac bootstrap and supply its private ATLAS_BUILD_STATUS.txt without credentials; do not edit a status file to force a pass.'
      : 'Read back the separate private build artifacts before any TASK-009/010/012/013 completion claim.'
  };
}

const writePrivate=(destination,payload)=>{
  const directory=path.dirname(destination);
  fs.mkdirSync(directory,{recursive:true,mode:0o700});
  const dir=fs.lstatSync(directory);
  if(dir.isSymbolicLink()||!dir.isDirectory()||(dir.mode&0o077)!==0) throw new Error('Output directory must be private and non-symlinked');
  if(fs.existsSync(destination)){
    const stat=fs.lstatSync(destination);
    if(stat.isSymbolicLink()||!stat.isFile()) throw new Error('Output must be a regular non-symlink file');
  }
  const temp=path.join(directory,`.${path.basename(destination)}.${process.pid}.tmp`);
  try{
    fs.writeFileSync(temp,JSON.stringify(payload,null,2)+'\n',{mode:0o600,flag:'wx'});
    fs.renameSync(temp,destination);fs.chmodSync(destination,0o600);
  }finally{if(fs.existsSync(temp))fs.unlinkSync(temp)}
};

export function main(argv=process.argv.slice(2)){
  const args=parseArgs(argv);
  const input=path.resolve(args.input);
  assertPrivateFile(input,'Input');
  const raw=fs.readFileSync(input,'utf8');
  const result=evaluateMacAdoptionStatus(raw);
  result.sourceSha256=crypto.createHash('sha256').update(raw).digest('hex');
  const output=path.resolve(args.output||path.join(os.homedir(),'ATLAS-BUILD-READY','results','TASK022_MAC_ADOPTION_RECEIPT.json'));
  writePrivate(output,result);
  process.stdout.write(JSON.stringify({status:result.status,issues:result.issues.length,output,realCustomerDelivery:false})+'\n');
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{main()}catch(error){console.error(`BLOCKED: ${error.message}`);process.exitCode=1}
}
