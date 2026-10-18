#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {pathToFileURL} from 'node:url';

const MAX_BYTES=256*1024;
const SECRET_KEY=/(secret|token|password|api.?key|private.?key|credential.?value)/i;

const parseArgs=(argv)=>{
  const out={};
  for(let i=0;i<argv.length;i++){
    const token=argv[i];
    if(!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const key=token.slice(2);
    if(!['integration','providers','adoption','output'].includes(key)) throw new Error(`Unknown option: --${key}`);
    const value=argv[++i];
    if(!value||value.startsWith('--')) throw new Error(`Missing value for --${key}`);
    out[key]=value;
  }
  for(const key of ['integration','providers','adoption']) if(!out[key]) throw new Error(`--${key} is required`);
  return out;
};

const readPrivateJson=(target,label)=>{
  const file=path.resolve(target);
  const stat=fs.lstatSync(file);
  if(stat.isSymbolicLink()||!stat.isFile()) throw new Error(`${label} must be a regular non-symlink file`);
  if((stat.mode&0o077)!==0) throw new Error(`${label} permissions must not allow group or other access`);
  if(stat.size>MAX_BYTES) throw new Error(`${label} exceeds 256 KiB safety limit`);
  const raw=fs.readFileSync(file,'utf8');
  const value=JSON.parse(raw);
  if(!value||typeof value!=='object'||Array.isArray(value)) throw new Error(`${label} must contain a JSON object`);
  return {raw,value};
};

const rejectSecretFields=(value,trail='input')=>{
  if(!value||typeof value!=='object') return;
  for(const [key,item] of Object.entries(value)){
    if(SECRET_KEY.test(key)) throw new Error(`${trail} contains forbidden secret field ${key}`);
    if(item&&typeof item==='object') rejectSecretFields(item,`${trail}.${key}`);
  }
};

const issue=(code,message)=>({code,message});
export function evaluateLocalRouting({integration,providers,adoption}){
  for(const [name,value] of Object.entries({integration,providers,adoption})){
    if(!value||typeof value!=='object'||Array.isArray(value)) throw new Error(`${name} must be an object`);
    rejectSecretFields(value,name);
  }
  const issues=[];
  if(integration.result!=='LOCAL_INTEGRATION_READ_ONLY_COMPLETE'||integration.authorisation!=='NO_EXTERNAL_NETWORK_NO_PAID_API_NO_CHANGES'){
    issues.push(issue('INTEGRATION_RECEIPT','local integration receipt is missing its read-only/no-change authorisation'));
  }
  if(integration.checkedOnMac!==true) issues.push(issue('MAC_RUNTIME','local integration was not checked on the target Mac'));
  if(providers.result!=='READ_ONLY_INVENTORY_COMPLETE'||providers.authorisation!=='NO_PROVIDER_NETWORK_CALLS_NO_CHARGES'){
    issues.push(issue('PROVIDER_RECEIPT','provider receipt is missing its no-call/no-charge authorisation'));
  }
  if(providers.macRouterDeploymentVerified!==false) issues.push(issue('ROUTER_CLAIM','provider inventory must not claim a verified deployed router'));
  if(adoption.taskId!=='TASK-022'||adoption.status!=='READY_LOCAL_OFFLINE_BUILD_ADOPTED'){
    issues.push(issue('ADOPTION_RECEIPT','TASK-022 Mac adoption receipt is not READY'));
  }
  const safeAssertions=adoption.assertions||{};
  if(safeAssertions.realCustomerDelivery!==false||safeAssertions.botsChanged!==false||safeAssertions.servicesInstalled!==false||safeAssertions.chargesIncurred!==false){
    issues.push(issue('ADOPTION_BOUNDARY','TASK-022 receipt does not preserve all no-delivery/no-change/no-charge assertions'));
  }

  const localOperatorReady=issues.length===0;
  return {
    schemaVersion:1,
    taskId:'TASK-023',
    status:localOperatorReady?'READY_ONE_OFFLINE_LOCAL_OPERATOR_ROUTE_ONLY':'BLOCKED_TARGET_RUNTIME_PROOF',
    issues,
    routes:{
      localOperator:{
        state:localOperatorReady?'VERIFIED_FOR_ONE_OFF_APPROVED_OFFLINE_BUILD':'HOLD',
        permission:'Existing allowlisted synthetic build task only; no daemon or external call.'
      },
      beast:{state:'HOLD_RUNTIME_NOT_EVIDENCED'},
      qwen:{state:providers.localQwen==='LOCAL_PORT_OPEN_INFERENCE_NOT_PROVEN'?'HOLD_PORT_ONLY_INFERENCE_NOT_PROVEN':'HOLD_NOT_REACHABLE_OR_NOT_CHECKED'},
      activepieces:{state:integration.activepiecesHealth==='HEALTH_HTTP_2XX_APP_ID_AND_WORKERS_UNVERIFIED'?'HOLD_HEALTH_ONLY_FLOW_AND_WORKERS_UNVERIFIED':'HOLD_NOT_HEALTHY_OR_NOT_CHECKED'}
    },
    assertions:{
      workerStarted:false,modelCalled:false,providerCalled:false,flowRun:false,serviceChanged:false,
      daemonInstalled:false,externalNetworkUsed:false,customerDelivery:false,revenue:false
    },
    nextRequired:localOperatorReady
      ? 'Run exactly one approved offline synthetic build through the existing Local Operator and persist its separate private artifact receipt; do not start Qwen, BEAST or Activepieces from this preflight.'
      : 'Collect fresh private Mac-generated integration, provider and TASK-022 adoption receipts; do not infer readiness from installed folders or open ports.'
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
  const inputs={};const hashes={};
  for(const key of ['integration','providers','adoption']){
    const read=readPrivateJson(args[key],key);
    inputs[key]=read.value;hashes[key]=crypto.createHash('sha256').update(read.raw).digest('hex');
  }
  const result=evaluateLocalRouting(inputs);result.sourceSha256=hashes;
  const output=path.resolve(args.output||path.join(os.homedir(),'ATLAS-BUILD-READY','results','TASK023_LOCAL_ROUTING_PREFLIGHT.json'));
  writePrivate(output,result);
  process.stdout.write(JSON.stringify({status:result.status,issues:result.issues.length,output,workerStarted:false,modelCalled:false})+'\n');
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{main()}catch(error){console.error(`BLOCKED: ${error.message}`);process.exitCode=1}
}
