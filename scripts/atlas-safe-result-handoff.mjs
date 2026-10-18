#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {pathToFileURL} from 'node:url';

const MAX_BYTES=2*1024*1024;
const INPUT_FILE='TASK016_READINESS_DIGEST.json';
const OUTPUT_FILE='TASK017_SAFE_RESULT_HANDOFF.json';
const allowedEvidenceStates=new Set(['VALID_LOCAL_EVIDENCE','MISSING','INVALID_OR_UNSUPPORTED']);

const parseArgs=(argv)=>{
  const out={};
  for(let i=0;i<argv.length;i++){
    const token=argv[i];
    if(!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const key=token.slice(2);
    if(!['results-dir','input','output'].includes(key)) throw new Error(`Unknown option: --${key}`);
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

const readPrivateJson=(target)=>{
  const stat=fs.lstatSync(target);
  if(stat.isSymbolicLink()||!stat.isFile()) throw new Error('Input must be a regular non-symlink file');
  if((stat.mode&0o077)!==0) throw new Error('Input permissions must not allow group or other access');
  if(stat.size>MAX_BYTES) throw new Error('Input exceeds 2 MiB safety limit');
  const raw=fs.readFileSync(target,'utf8');
  return {doc:JSON.parse(raw),sha256:crypto.createHash('sha256').update(raw).digest('hex')};
};

const assertSafeDigest=(doc)=>{
  if(doc?.schemaVersion!==1||doc?.job?.id!=='TASK-016'||doc?.job?.kind!=='LOCAL_READINESS_DIGEST_V1'||doc?.job?.consequential!==false) throw new Error('Unsupported TASK-016 digest identity');
  if(!['COMPLETE_LOCAL_EVIDENCE','BLOCKED_MISSING_OR_INVALID_EVIDENCE'].includes(doc.status)) throw new Error('Unsupported TASK-016 digest status');
  const controls=doc.controls||{};
  if(controls.readOnlyInputs!==true||controls.aggregateOnly!==true||controls.externalNetworkUsed!==false||controls.modelOrApiUsed!==false||controls.externalCommunication!==false) throw new Error('Unsafe or incomplete TASK-016 controls');
  const assertions=doc.assertions||{};
  if(assertions.customerDelivery!==false||assertions.revenue!==false||assertions.bankVerification!==false||assertions.autonomousOperation!==false) throw new Error('Unsupported consequential claim');
  const evidence=doc.evidence;
  if(!evidence||typeof evidence!=='object'||Array.isArray(evidence)) throw new Error('Missing aggregate evidence map');
  const names=Object.keys(evidence).sort();
  if(names.join(',')!=='prospectOutputReview,salesDeskReconciliation,salesDeskStartup') throw new Error('Unexpected evidence set');
  for(const item of Object.values(evidence)){
    if(!item||!allowedEvidenceStates.has(item.state)||typeof item.file!=='string'||!Object.hasOwn(item,'sha256')||!Object.hasOwn(item,'sourceStatus')) throw new Error('Malformed evidence item');
  }
  const complete=Object.values(evidence).every(item=>item.state==='VALID_LOCAL_EVIDENCE');
  if((doc.status==='COMPLETE_LOCAL_EVIDENCE')!==complete) throw new Error('Digest status contradicts evidence');
  return complete;
};

export const buildHandoff=(doc,sourceSha256)=>{
  const complete=assertSafeDigest(doc);
  const handoffState=complete?'READY_FOR_ENGINE_IMPORT':'BLOCKED_LOCAL_EVIDENCE';
  return {
    schemaVersion:1,
    result:{id:`TASK-017-${sourceSha256.slice(0,16)}`,taskId:'TASK-017',kind:'ATLAS_SAFE_RESULT_HANDOFF_V1',state:handoffState},
    source:{taskId:'TASK-016',kind:'LOCAL_READINESS_DIGEST_V1',sha256:sourceSha256,status:doc.status},
    queuePatch:{
      taskId:'TASK-017',
      proposedState:handoffState,
      done:false,
      evidence:`Private TASK-016 digest ${sourceSha256.slice(0,16)} validated offline; Apps Script import/readback not executed.`,
      blocker:complete?'Existing authorised ATLAS ENGINE must import this receipt and read back the queue row before DONE.':'TASK-016 local evidence is missing or invalid; do not import as DONE.',
      next:complete?'Import through the existing authorised engine path, preserve active triggers, and verify saved result plus queue readback.':'Generate the missing valid local receipts, rebuild TASK-016 digest, then rerun this handoff.'
    },
    controls:{localOnly:true,externalNetworkUsed:false,modelOrApiUsed:false,externalCommunication:false,changesTriggers:false,changesAccounts:false,requiresHumanOrExistingEngineImport:true},
    assertions:{engineExecuted:false,queueUpdated:false,done:false,customerDelivery:false,revenue:false,autonomousOperation:false},
    hold:'OFFLINE HANDOFF ONLY — this receipt cannot prove an Apps Script run, a queue update, DONE, delivery, revenue or autonomous operation.'
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
  const input=path.resolve(args.input||path.join(resultsDir,INPUT_FILE));
  const output=path.resolve(args.output||path.join(resultsDir,OUTPUT_FILE));
  const {doc,sha256}=readPrivateJson(input);
  const handoff=buildHandoff(doc,sha256);
  writePrivate(output,handoff);
  process.stdout.write(JSON.stringify({state:handoff.result.state,output,resultId:handoff.result.id,done:false})+'\n');
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{main()}catch(error){console.error(`BLOCKED: ${error.message}`);process.exitCode=1}
}
