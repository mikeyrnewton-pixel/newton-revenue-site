#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {pathToFileURL} from 'node:url';

const MAX_BYTES=2*1024*1024;
const SHA=/^[a-f0-9]{64}$/;

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

const assertPrivateFile=(target)=>{
  const stat=fs.lstatSync(target);
  if(stat.isSymbolicLink()||!stat.isFile()) throw new Error('Input must be a regular non-symlink file');
  if((stat.mode&0o077)!==0) throw new Error('Input permissions must not allow group or other access');
  if(stat.size>MAX_BYTES) throw new Error('Input exceeds 2 MiB safety limit');
};

const issue=(code,message)=>({code,message});
export const evaluatePaperSpec=(doc)=>{
  const issues=[];
  if(doc?.schemaVersion!==1) issues.push(issue('SCHEMA','schemaVersion must be 1'));
  if(doc?.mode!=='VIRTUAL_PAPER_ONLY') issues.push(issue('MODE','mode must be VIRTUAL_PAPER_ONLY'));
  if(doc?.capitalGBP!==50) issues.push(issue('CAPITAL','capitalGBP must equal the canonical virtual £50'));

  const execution=doc?.execution||{};
  if(execution.realMoney!==false||execution.brokerConnected!==false||execution.walletConnected!==false||execution.ordersSubmitted!==0||execution.externalNetworkUsed!==false){
    issues.push(issue('NO_REAL_EXECUTION','real money, connections, submitted orders and network use must all be absent'));
  }

  const strategy=doc?.strategy||{};
  if(typeof strategy.ruleId!=='string'||strategy.ruleId.length<3) issues.push(issue('RULE_ID','a stable ruleId is required'));
  if(strategy.signalInput!=='COMPLETED_BARS_ONLY') issues.push(issue('COMPLETED_BARS','signals must use completed bars only'));
  if(strategy.fillModel!=='NEXT_BAR_OPEN') issues.push(issue('FILL_MODEL','fills must use the next bar open'));
  if(strategy.parametersFrozenBeforeHoldout!==true) issues.push(issue('FROZEN_PARAMETERS','parameters must be frozen before holdout'));
  if(strategy.holdoutImmutable!==true) issues.push(issue('IMMUTABLE_HOLDOUT','holdout must be immutable'));

  const costs=doc?.costs||{};
  if(!(Number.isFinite(costs.feeRateEachSide)&&costs.feeRateEachSide>=0.006)) issues.push(issue('FEE','fee must be at least 0.6% each side'));
  if(!(Number.isFinite(costs.slippageRateEachSide)&&costs.slippageRateEachSide>=0.002)) issues.push(issue('SLIPPAGE','slippage must be at least 0.2% each side'));
  if(costs.appliedToHoldout!==true) issues.push(issue('COST_APPLICATION','costs must be applied to holdout'));

  const sizing=doc?.sizing||{};
  if(!(Number.isFinite(sizing.maxPositionFraction)&&sizing.maxPositionFraction>0&&sizing.maxPositionFraction<=0.10)) issues.push(issue('MAX_POSITION','max position must be at most 10%'));
  if(sizing.minOrderGBP!==5) issues.push(issue('MIN_ORDER','minimum virtual order must remain £5'));
  const allocations=Array.isArray(sizing.allocations)?sizing.allocations:[];
  if(!allocations.length||allocations.some(x=>!x||!['BTC','ETH'].includes(x.asset)||!Number.isFinite(x.virtualGBP)||x.virtualGBP<=0)||Math.abs(allocations.reduce((n,x)=>n+x.virtualGBP,0)-50)>1e-9){
    issues.push(issue('ALLOCATION','BTC/ETH virtual allocations must be positive and sum exactly to £50'));
  }
  for(const allocation of allocations){
    const proposed=allocation.virtualGBP*(Number.isFinite(sizing.maxPositionFraction)?sizing.maxPositionFraction:0);
    if(proposed<5) issues.push(issue('UNTRADEABLE_SIZING',`${allocation.asset} proposed size £${proposed.toFixed(2)} is below the £5 minimum`));
  }

  const windows=doc?.windows||{};
  const dates=['trainingEnd','holdoutStart','holdoutEnd','forwardStart'].map(key=>Date.parse(windows[key]));
  if(dates.some(Number.isNaN)||!(dates[0]<dates[1]&&dates[1]<=dates[2]&&dates[2]<dates[3])){
    issues.push(issue('WINDOW_ORDER','training, holdout and forward windows must be ordered and non-overlapping'));
  }

  const provenance=doc?.dataProvenance||{};
  if(typeof provenance.provider!=='string'||provenance.provider.length<2||provenance.interval!=='1d'||provenance.timezone!=='UTC'||!SHA.test(provenance.rawSha256||'')){
    issues.push(issue('PROVENANCE','provider, daily interval, UTC and raw 64-char SHA-256 are required'));
  }
  const retrieved=Date.parse(provenance.retrievedAt);
  const completed=Date.parse(provenance.completedThrough);
  const forward=Date.parse(windows.forwardStart);
  if([retrieved,completed,forward].some(Number.isNaN)||completed>=forward||retrieved<completed){
    issues.push(issue('TIMESTAMP','completedThrough must precede forwardStart and retrieval cannot precede completed data'));
  }

  const holdout=doc?.holdout||{};
  if(!Number.isInteger(holdout.closedTrades)||holdout.closedTrades<30) issues.push(issue('HOLDOUT_TRADES','at least 30 closed holdout trades are required'));
  if(holdout.costsIncluded!==true||holdout.dataLeakageChecksPassed!==true) issues.push(issue('HOLDOUT_CONTROLS','holdout costs and leakage checks must pass'));
  if(!(Number.isFinite(holdout.maxDrawdownFraction)&&holdout.maxDrawdownFraction>=0&&holdout.maxDrawdownFraction<=0.20)) issues.push(issue('DRAWDOWN','maximum holdout drawdown must be no more than 20%'));

  return {
    schemaVersion:1,
    taskId:'TASK-018',
    status:issues.length?'BLOCKED_QUALITY_GATE':'QUALIFIED_FOR_FORWARD_PAPER_LEDGER',
    issues,
    controls:{paperOnly:true,realMoney:false,brokerConnected:false,walletConnected:false,ordersSubmitted:0,externalNetworkUsed:false},
    assertions:{profitableStrategy:false,forwardOrderExecuted:false,realTrade:false,revenue:false},
    nextRequired:issues.length
      ? 'Correct the rule specification or provide a genuinely independent qualifying holdout; do not alter the holdout to chase a pass.'
      : 'Human may separately approve a future virtual-ledger decision after fresh completed-bar provenance; this gate does not execute it.',
    hold:'QUALITY GATE ONLY — qualification is not profit evidence and never authorises a broker, wallet or real-money order.'
  };
};

const writePrivate=(destination,payload)=>{
  const directory=path.dirname(destination);
  fs.mkdirSync(directory,{recursive:true,mode:0o700});
  const dirStat=fs.lstatSync(directory);
  if(dirStat.isSymbolicLink()||!dirStat.isDirectory()||(dirStat.mode&0o077)!==0) throw new Error('Output directory must be private and non-symlinked');
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
  assertPrivateFile(input);
  const raw=fs.readFileSync(input,'utf8');
  const result=evaluatePaperSpec(JSON.parse(raw));
  result.sourceSha256=crypto.createHash('sha256').update(raw).digest('hex');
  const output=path.resolve(args.output||path.join(os.homedir(),'ATLAS-BUILD-READY','results','TASK018_PAPER_QUALITY_GATE.json'));
  writePrivate(output,result);
  process.stdout.write(JSON.stringify({status:result.status,issues:result.issues.length,output,ordersSubmitted:0})+'\n');
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{main()}catch(error){console.error(`BLOCKED: ${error.message}`);process.exitCode=1}
}
