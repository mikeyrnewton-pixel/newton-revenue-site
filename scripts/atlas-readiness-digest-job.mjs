#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {pathToFileURL} from 'node:url';

const MAX_RECEIPT_BYTES = 2 * 1024 * 1024;
const RECEIPTS = Object.freeze([
  {name:'salesDeskStartup',file:'SALES_DESK_STARTUP.json'},
  {name:'salesDeskReconciliation',file:'SALES_DESK_RECONCILIATION.json'},
  {name:'prospectOutputReview',file:'PROSPECT_OUTPUT_REVIEW.json'}
]);

const parseArgs=(argv)=>{
  const out={};
  for(let i=0;i<argv.length;i++){
    const token=argv[i];
    if(!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const key=token.slice(2);
    if(!['results-dir','output'].includes(key)) throw new Error(`Unknown option: --${key}`);
    const value=argv[++i];
    if(!value||value.startsWith('--')) throw new Error(`Missing value for --${key}`);
    out[key]=value;
  }
  return out;
};
const assertPrivateDirectory=(directory,{create=false}={})=>{
  if(create) fs.mkdirSync(directory,{recursive:true,mode:0o700});
  const stat=fs.lstatSync(directory);
  if(stat.isSymbolicLink()||!stat.isDirectory()) throw new Error('Results directory must be a real directory');
  if((stat.mode&0o077)!==0) throw new Error('Results directory permissions must not allow group or other access');
};
const readPrivateReceipt=(target)=>{
  const stat=fs.lstatSync(target);
  if(stat.isSymbolicLink()||!stat.isFile()) throw new Error(`${path.basename(target)} must be a regular non-symlink file`);
  if((stat.mode&0o077)!==0) throw new Error(`${path.basename(target)} permissions must not allow group or other access`);
  if(stat.size>MAX_RECEIPT_BYTES) throw new Error(`${path.basename(target)} exceeds 2 MiB safety limit`);
  const raw=fs.readFileSync(target,'utf8');
  return {raw,doc:JSON.parse(raw),sha256:crypto.createHash('sha256').update(raw).digest('hex')};
};
const validStartup=(doc)=>Boolean(
  doc?.schemaVersion===1&&['STARTED','ALREADY_RUNNING'].includes(doc.status)&&
  doc.listener?.host==='127.0.0.1'&&doc.listener?.port===3777&&
  doc.listener?.verified===true&&doc.listener?.public===false&&
  doc.controls?.externalNetworkUsed===false&&doc.controls?.manualOwnerInvocation===true
);
const validReconciliation=(doc)=>Boolean(
  doc?.schemaVersion===1&&['RECONCILED_LOCAL_EVIDENCE','NO_LEDGER'].includes(doc.status)&&
  doc.controls?.readOnly===true&&doc.controls?.aggregateOnly===true&&
  doc.controls?.syntheticExcluded===true&&doc.controls?.externalBankVerification===false
);
const validProspectReview=(doc)=>Boolean(
  doc?.schemaVersion===1&&doc.status==='READY_FOR_OWNER_REVIEW_UNSENT'&&
  doc.controls?.externalCommunication===false&&doc.controls?.personalDataCollected===false&&
  doc.controls?.ownerApprovalRequired===true&&doc.controls?.networkAccessUsed===false
);
const validators=Object.freeze({salesDeskStartup:validStartup,salesDeskReconciliation:validReconciliation,prospectOutputReview:validProspectReview});

export const buildDigest=(resultsDir)=>{
  const evidence={};
  for(const item of RECEIPTS){
    const target=path.join(resultsDir,item.file);
    if(!fs.existsSync(target)){
      evidence[item.name]={state:'MISSING',file:item.file,sha256:null,sourceStatus:null};
      continue;
    }
    const receipt=readPrivateReceipt(target);
    evidence[item.name]={
      state:validators[item.name](receipt.doc)?'VALID_LOCAL_EVIDENCE':'INVALID_OR_UNSUPPORTED',
      file:item.file,
      sha256:receipt.sha256,
      sourceStatus:typeof receipt.doc?.status==='string'?receipt.doc.status:'MISSING'
    };
  }
  const complete=Object.values(evidence).every(item=>item.state==='VALID_LOCAL_EVIDENCE');
  return {
    schemaVersion:1,
    job:{id:'TASK-016',kind:'LOCAL_READINESS_DIGEST_V1',consequential:false},
    status:complete?'COMPLETE_LOCAL_EVIDENCE':'BLOCKED_MISSING_OR_INVALID_EVIDENCE',
    evidence,
    controls:{readOnlyInputs:true,aggregateOnly:true,externalNetworkUsed:false,modelOrApiUsed:false,externalCommunication:false},
    assertions:{customerDelivery:false,revenue:false,bankVerification:false,autonomousOperation:false},
    nextRequired:complete
      ? 'Owner may review local evidence; this still does not prove delivery, revenue or autonomous operation.'
      : 'Generate missing valid receipts through their separately authorised local commands, then rerun this job.',
    hold:'LOCAL BUILD EVIDENCE ONLY — never treat this digest as a client result, contact event, payment, bank evidence or live-service proof.'
  };
};
const writePrivate=(destination,payload)=>{
  const directory=path.dirname(destination);
  assertPrivateDirectory(directory,{create:true});
  if(fs.existsSync(destination)){
    const stat=fs.lstatSync(destination);
    if(stat.isSymbolicLink()||!stat.isFile()) throw new Error('Output must be a regular non-symlink file');
  }
  const temporary=path.join(directory,`.${path.basename(destination)}.${process.pid}.tmp`);
  try{
    fs.writeFileSync(temporary,JSON.stringify(payload,null,2)+'\n',{encoding:'utf8',mode:0o600,flag:'wx'});
    fs.renameSync(temporary,destination);
    fs.chmodSync(destination,0o600);
  }finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary)}
};

export function main(argv=process.argv.slice(2)){
  const args=parseArgs(argv);
  const resultsDir=path.resolve(args['results-dir']||path.join(os.homedir(),'ATLAS-BUILD-READY','results'));
  assertPrivateDirectory(resultsDir);
  const output=path.resolve(args.output||path.join(resultsDir,'TASK016_READINESS_DIGEST.json'));
  const digest=buildDigest(resultsDir);
  writePrivate(output,digest);
  process.stdout.write(JSON.stringify({status:digest.status,output,evidence:Object.fromEntries(Object.entries(digest.evidence).map(([key,value])=>[key,value.state]))})+'\n');
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{main()}catch(error){console.error(`BLOCKED: ${error.message}`);process.exitCode=1}
}
