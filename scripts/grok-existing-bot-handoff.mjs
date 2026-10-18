#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {pathToFileURL} from 'node:url';

const MAX_BYTES=256*1024;
const QUEUE_URL='https://docs.google.com/spreadsheets/d/1nKgw5sr4OU56kel8GzYIOiuQ14cJcE851u9x4vLei84/edit#gid=1610000002';
const FORBIDDEN=/(api[_ -]?key|access[_ -]?token|password|secret|bearer\s+[a-z0-9._-]+|private[_ -]?key|contact|outreach|publish|marketing|trade|broker|wallet|apply|submit (?:an )?application|application submission|spend|purchase|contract|account change|create (?:a )?(?:new )?bot)/i;

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

const assertPrivateRegularFile=(target,label)=>{
  const stat=fs.lstatSync(target);
  if(stat.isSymbolicLink()||!stat.isFile()) throw new Error(`${label} must be a regular non-symlink file`);
  if((stat.mode&0o077)!==0) throw new Error(`${label} permissions must not allow group or other access`);
  if(stat.size>MAX_BYTES) throw new Error(`${label} exceeds 256 KiB safety limit`);
};

const cleanText=(value,label,{min=1,max=1000}={})=>{
  if(typeof value!=='string') throw new Error(`${label} must be text`);
  const text=value.trim();
  if(text.length<min||text.length>max) throw new Error(`${label} length is invalid`);
  if(/[\u0000-\u001f\u007f]/.test(text)) throw new Error(`${label} contains control characters`);
  if(FORBIDDEN.test(text)) throw new Error(`${label} contains a forbidden action or secret marker`);
  return text;
};

const validateUrl=(value)=>{
  const text=cleanText(value,'existingBot.controlUrl',{min:12,max:500});
  let url;
  try{url=new URL(text)}catch{throw new Error('existingBot.controlUrl must be a valid URL')}
  if(url.protocol!=='https:') throw new Error('existingBot.controlUrl must use https');
  if(url.username||url.password||url.search||url.hash) throw new Error('existingBot.controlUrl must not contain credentials, query data or fragments');
  const host=url.hostname.toLowerCase();
  if(!(host==='grok.com'||host.endsWith('.grok.com')||host==='x.com'||host.endsWith('.x.com'))){
    throw new Error('existingBot.controlUrl must be an official grok.com or x.com URL');
  }
  return url.toString();
};

export function buildExistingBotHandoff(doc){
  if(doc?.schemaVersion!==1) throw new Error('schemaVersion must be 1');
  if(doc?.taskId!=='TASK-021') throw new Error('taskId must be TASK-021');
  if(doc?.existingBot?.provider!=='GROK') throw new Error('existingBot.provider must be GROK');
  if(doc?.existingBot?.authenticatedByOwner!==true) throw new Error('an owner-authenticated existing bot is required');
  const controlUrl=validateUrl(doc.existingBot.controlUrl);
  const botLabel=cleanText(doc.existingBot.label,'existingBot.label',{min:2,max:80});
  const objective=cleanText(doc.objective,'objective',{min:10,max:500});
  const artifactPath=cleanText(doc.artifactPath,'artifactPath',{min:3,max:240});
  if(path.isAbsolute(artifactPath)||artifactPath.split(/[\\/]/).includes('..')) throw new Error('artifactPath must be a repository-relative path without traversal');
  if(!Array.isArray(doc.acceptanceChecks)||doc.acceptanceChecks.length<2||doc.acceptanceChecks.length>12){
    throw new Error('acceptanceChecks must contain 2-12 checks');
  }
  const checks=doc.acceptanceChecks.map((item,index)=>cleanText(item,`acceptanceChecks[${index}]`,{min:3,max:240}));
  const source=JSON.stringify(doc);
  if(FORBIDDEN.test(source)) throw new Error('input contains a forbidden action or secret marker');

  const lines=[
    '# TASK-021 — Existing Grok Bot Handoff',
    '',
    '**Status:** READY FOR OWNER REVIEW — UNSENT',
    '',
    `**Existing bot:** ${botLabel}`,
    `**Owner-opened control page:** ${controlUrl}`,
    `**Canonical queue:** ${QUEUE_URL}`,
    `**Repository artifact:** \`${artifactPath}\``,
    '',
    '## Objective',
    '',
    objective,
    '',
    '## Acceptance gates',
    '',
    ...checks.map((item,index)=>`${index+1}. ${item}`),
    '',
    '## Mandatory boundaries',
    '',
    '- Work only inside the already authenticated, existing Grok bot selected by the owner.',
    '- Read the linked queue and edit only the named existing repository artifact.',
    '- Use fictional or non-personal test data only.',
    '- Do not request, expose or store credentials, keys, tokens, identity documents or personal data.',
    '- Do not create another bot, contact anyone, spend money, publish, market, trade, apply, sign, or change an account.',
    '- Save a private result and report the exact artifact path, tests run, pass/fail result and remaining blocker.',
    '- A generated or pasted brief is not execution proof; READY requires the named tests and owner readback.',
    '',
    '## Owner-only execution step',
    '',
    'After reviewing this brief, the owner may paste it into the named existing bot. No action has been sent or performed by this generator.',
    '',
    '## Required return receipt',
    '',
    '- Existing bot label and control page used (no secrets)',
    '- Exact saved artifact path or link',
    '- Exact test command and result',
    '- Status: READY, BLOCKED or FAILED',
    '- One precise remaining blocker',
    ''
  ];
  return {
    status:'READY_FOR_OWNER_REVIEW_UNSENT',
    taskId:'TASK-021',
    queueUrl:QUEUE_URL,
    controlUrl,
    sourceSha256:crypto.createHash('sha256').update(source).digest('hex'),
    assertions:{botCreated:false,messageSent:false,externalAction:false,secretsIncluded:false,personalDataIncluded:false},
    markdown:lines.join('\n')
  };
}

const writePrivate=(destination,text)=>{
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
    fs.writeFileSync(temp,text,{mode:0o600,flag:'wx'});
    fs.renameSync(temp,destination);fs.chmodSync(destination,0o600);
  }finally{if(fs.existsSync(temp))fs.unlinkSync(temp)}
};

export function main(argv=process.argv.slice(2)){
  const args=parseArgs(argv);
  const input=path.resolve(args.input);
  assertPrivateRegularFile(input,'Input');
  const result=buildExistingBotHandoff(JSON.parse(fs.readFileSync(input,'utf8')));
  const output=path.resolve(args.output||path.join(os.homedir(),'ATLAS-BUILD-READY','handoffs','TASK021_EXISTING_GROK_BOT_HANDOFF.md'));
  writePrivate(output,result.markdown);
  process.stdout.write(JSON.stringify({status:result.status,output,botCreated:false,messageSent:false})+'\n');
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{main()}catch(error){console.error(`BLOCKED: ${error.message}`);process.exitCode=1}
}
