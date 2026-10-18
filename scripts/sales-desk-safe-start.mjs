#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';

export const EXPECTED = Object.freeze({
  marker:'atlas-sales-desk-v1.2\n',
  files:Object.freeze({
    'cli.mjs':'0378b72568daffa966b704d7bcf258153d5bdebcd1f6173a6d645781be21ed7f',
    'model.mjs':'f54b50b8b01579acf52062379df2f85016e0dce6e9c06bcb6e4d4bf23479cb71',
    'store.mjs':'1f1454608d6ae3d4b3eb8c4e6b072514ae0f67055ac6de4263536b9b24c173b9',
    'package.json':'9be5f336eed6c70a3ad102c60d5bc500ea87eed9659d3a65d22ba681ff626300'
  })
});

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const regularNoLink = (target,label) => {
  const stat=fs.lstatSync(target);
  if(stat.isSymbolicLink()||!stat.isFile()) throw new Error(`${label} must be a regular non-symlink file`);
  return stat;
};
export function verifyStage(stageDir,expected=EXPECTED){
  const root=path.resolve(stageDir);
  const rootStat=fs.lstatSync(root);
  if(rootStat.isSymbolicLink()||!rootStat.isDirectory()) throw new Error('Stage must be a real directory, not a symlink');
  const marker=path.join(root,'.atlas-sales-desk-managed');
  regularNoLink(marker,'Managed marker');
  if(fs.readFileSync(marker,'utf8')!==expected.marker) throw new Error('Managed marker mismatch');
  for(const [name,digest] of Object.entries(expected.files)){
    const target=path.join(root,name); regularNoLink(target,name);
    if(sha256(fs.readFileSync(target))!==digest) throw new Error(`${name} fingerprint mismatch`);
  }
  const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
  if(pkg.name!=='atlas-sales-desk'||pkg.version!=='1.2.0'||pkg.scripts?.start!=='node cli.mjs serve') throw new Error('Package identity mismatch');
  return {stageDir:root,fingerprints:{...expected.files}};
}

export function probeDashboard({port=3777,timeoutMs=1200}={}){
  return new Promise((resolve)=>{
    let settled=false;
    const finish=(value)=>{if(!settled){settled=true;resolve(value)}};
    const request=http.request({host:'127.0.0.1',port,path:'/',method:'GET',headers:{Host:`127.0.0.1:${port}`},timeout:timeoutMs},response=>{
      let body='';
      response.setEncoding('utf8');
      response.on('data',chunk=>{body+=chunk.slice(0,131072-body.length);if(body.length>=131072)response.destroy()});
      response.on('end',()=>finish(response.statusCode===200&&body.includes('<title>ATLAS Sales Desk</title>')&&body.includes('Local-only, read-only cockpit')?'VERIFIED_SALES_DESK':'FOREIGN_OR_UNVERIFIED_LISTENER'));
    });
    request.on('timeout',()=>request.destroy(new Error('timeout')));
    request.on('error',error=>finish(['ECONNREFUSED','EHOSTUNREACH'].includes(error.code)?'PORT_CLOSED':'PROBE_ERROR'));
    request.end();
  });
}

const waitForDashboard=async(port,attempts=12)=>{
  for(let i=0;i<attempts;i++){
    const state=await probeDashboard({port,timeoutMs:500});
    if(state!=='PORT_CLOSED') return state;
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  return 'PORT_CLOSED';
};
const privateDirectory=(directory)=>{
  fs.mkdirSync(directory,{recursive:true,mode:0o700});
  const stat=fs.lstatSync(directory);
  if(stat.isSymbolicLink()||!stat.isDirectory()||(stat.mode&0o077)!==0) throw new Error('Output directory must be private, mode 0700, and not a symlink');
};
export function writeReceipt(destination,receipt){
  const output=path.resolve(destination),directory=path.dirname(output);
  privateDirectory(directory);
  if(fs.existsSync(output)) regularNoLink(output,'Receipt');
  const temp=path.join(directory,`.${path.basename(output)}.${process.pid}.tmp`);
  try{
    fs.writeFileSync(temp,JSON.stringify(receipt,null,2)+'\n',{mode:0o600,flag:'wx'});
    fs.renameSync(temp,output);fs.chmodSync(output,0o600);
  }finally{if(fs.existsSync(temp))fs.unlinkSync(temp)}
  return output;
}

export async function startVerifiedStage({stageDir,outputDir,port=3777,nodePath=process.execPath,expected=EXPECTED,environment=process.env}={}){
  const verified=verifyStage(stageDir,expected);
  privateDirectory(outputDir);
  const before=await probeDashboard({port});
  if(before==='VERIFIED_SALES_DESK') return {status:'ALREADY_RUNNING',pid:null,port,verified};
  if(before!=='PORT_CLOSED') throw new Error(`Port ${port} is occupied but is not a verified ATLAS Sales Desk (${before})`);
  const logPath=path.join(outputDir,'SALES_DESK_LOCAL.log');
  if(fs.existsSync(logPath)) regularNoLink(logPath,'Sales Desk log');
  const logFd=fs.openSync(logPath,fs.constants.O_WRONLY|fs.constants.O_APPEND|fs.constants.O_CREAT|fs.constants.O_NOFOLLOW,0o600);
  fs.fchmodSync(logFd,0o600);
  let child;
  try{
    child=spawn(nodePath,[path.join(verified.stageDir,'cli.mjs'),'serve'],{
      cwd:verified.stageDir,detached:true,stdio:['ignore',logFd,logFd],
      env:{...environment,ATLAS_DATA_DIR:path.join(os.homedir(),'.atlas-sales-desk')}
    });
    child.unref();
  }finally{fs.closeSync(logFd)}
  const after=await waitForDashboard(port);
  if(after!=='VERIFIED_SALES_DESK'){
    try{process.kill(child.pid,'SIGTERM')}catch{}
    throw new Error(`Sales Desk did not become a verified localhost listener (${after})`);
  }
  return {status:'STARTED',pid:child.pid,port,verified};
}

const parseArgs=(argv)=>{
  const out={};
  for(let i=0;i<argv.length;i++){
    const token=argv[i];if(!token.startsWith('--'))throw new Error(`Unexpected argument: ${token}`);
    const key=token.slice(2);if(!['stage-dir','output'].includes(key))throw new Error(`Unknown option: --${key}`);
    const value=argv[++i];if(!value||value.startsWith('--'))throw new Error(`Missing value for --${key}`);out[key]=value;
  }
  return out;
};
export async function main(){
  if(process.platform!=='darwin') throw new Error('This command is Mac-only; no service was started');
  const args=parseArgs(process.argv.slice(2));
  const stageDir=path.resolve(args['stage-dir']||path.join(os.homedir(),'ATLAS-SALES-DESK-v1.2'));
  const receiptPath=path.resolve(args.output||path.join(os.homedir(),'ATLAS-BUILD-READY','results','SALES_DESK_STARTUP.json'));
  const outputDir=path.dirname(receiptPath);
  const result=await startVerifiedStage({stageDir,outputDir});
  const receipt={schemaVersion:1,generatedAt:new Date().toISOString(),status:result.status,pid:result.pid,listener:{host:'127.0.0.1',port:result.port,verified:true,public:false},stage:{version:'1.2.0',fingerprints:result.verified.fingerprints},controls:{manualOwnerInvocation:true,launchdInstalled:false,dockerChanged:false,externalNetworkUsed:false},hold:'Local listener proof only; not client delivery, customer contact, bank verification or revenue.'};
  writeReceipt(receiptPath,receipt);
  process.stdout.write(JSON.stringify({status:receipt.status,receipt:receiptPath,listener:receipt.listener})+'\n');
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  main().catch(error=>{console.error(`BLOCKED: ${error.message}`);process.exitCode=1});
}
