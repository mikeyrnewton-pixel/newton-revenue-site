#!/usr/bin/env node
/**
 * ATLAS minute-cadence evidence audit. Read-only, fixed commands, sanitized output.
 * A configured StartInterval and nonzero launchctl run count do NOT prove that
 * every 60-second tick happened, that build tasks ran, or that Mac stayed awake.
 */
import {spawnSync} from 'node:child_process';
import {existsSync,realpathSync} from 'node:fs';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {inspectPrivateObserverSnapshot} from './atlas-observer-freshness.mjs';

export const AUDITED_JOBS=Object.freeze([
  Object.freeze({label:'uk.newton.atlas-continuation',expectedSeconds:60}),
  Object.freeze({label:'uk.newton.atlas-observer-snapshot',expectedSeconds:60}),
  Object.freeze({label:'uk.newton.atlas-watchdog',expectedSeconds:60}),
  Object.freeze({label:'uk.newton.atlas-local-operator',expectedSeconds:3600}),
]);
const DOCKER='/Applications/Docker.app/Contents/Resources/bin/docker';
const safeRun=(bin,args)=>{
  try{
    const r=spawnSync(bin,args,{
      encoding:'utf8',timeout:5000,maxBuffer:200000,
      stdio:['ignore','pipe','pipe'],
      env:{HOME:process.env.HOME||'',PATH:'/usr/bin:/bin:/usr/sbin:/sbin'},
    });
    return r.status===0&&!r.error&&!r.signal
      ? {ok:true,output:r.stdout||''}:{ok:false,output:''};
  }catch{return {ok:false,output:''}}
};
const numberOrNull=(value,pattern,max=100000000)=>{
  const text=typeof value==='string'?value:'';
  const match=text.match(pattern);
  if(!match)return null;
  const n=Number(match[1]);
  return Number.isSafeInteger(n)&&n>=0&&n<=max?n:null;
};

export function classifyMinuteEvidence(job,{seconds=null,loaded=false,runs=null,lastExit=null}={}){
  const config=seconds===job.expectedSeconds?'EXPECTED':
    seconds===null?'UNKNOWN':'MISMATCH';
  return Object.freeze({
    label:job.label,
    expectedSeconds:job.expectedSeconds,
    configuredSeconds:seconds,
    schedule:config,
    launchService:loaded?'RESPONDING':'NOT_VERIFIED',
    runCount:runs,
    lastExitCode:lastExit,
    executionEvidence:runs!==null&&runs>0
      ? 'HISTORICAL_RUNS_NOT_CADENCE_PROOF':'NOT_PROVEN',
  });
}

export function assessWorkerRestartHistory({count=null,health=null}={}){
  return Object.freeze({
    restartCount:count,
    currentHealth:health==='healthy'?'HEALTHY':
      health==='unhealthy'?'UNHEALTHY':'NOT_VERIFIED',
    history:count===null?'NOT_VERIFIED':
      count>=20?'ELEVATED_HISTORICAL_RESTARTS_REVIEW':'NO_ELEVATED_HISTORY_OBSERVED',
    // Docker restart count is cumulative; it does not show when restarts happened.
    currentlyCrashLooping:'NOT_VERIFIED',
  });
}

export function auditMinuteController({
  platform=process.platform,home=homedir(),uid=process.getuid?.()??null,
  exists=existsSync,run=safeRun,nowMs=Date.now(),observerLstat=undefined,
}={}){
  const result={
    schema:'ATLAS_MINUTE_EVIDENCE_AUDIT_V1',
    localMac:platform==='darwin'?'YES':'NO',
    jobs:[],worker:assessWorkerRestartHistory(),
    observerSnapshot:Object.freeze({state:'NOT_VERIFIED',ageSeconds:null,
      evidence:'FILESYSTEM_MTIME_ONLY_NOT_AUTOMATIC_CADENCE_OR_CONTENT_PROOF',
      privateContentsRead:false,automaticRefreshVerified:false,writesPerformed:false}),
    scheduleVerdict:'NOT_VERIFIED',
    verifiedEveryMinuteExecution:false,
    verifiedAutomaticCodeBuilding:false,
    directChatGPTMacControl:false,
    noWritesPerformed:true,
  };
  if(platform!=='darwin'||uid===null)return result;
  result.observerSnapshot=inspectPrivateObserverSnapshot({home,uid,nowMs,
    ...(observerLstat ? {lstat:observerLstat} : {}),
  });
  for(const job of AUDITED_JOBS){
    const filename=join(home,'Library','LaunchAgents',job.label+'.plist');
    let seconds=null;
    if(exists(filename)){
      const p=run('/usr/bin/plutil',['-extract','StartInterval','raw','-o','-',filename]);
      if(p.ok)seconds=numberOrNull(p.output,/^\s*(\d+)\s*$/);
    }
    const live=run('/bin/launchctl',['print','gui/'+uid+'/'+job.label]);
    const runs=live.ok?numberOrNull(live.output,/\bruns\s*=\s*(\d+)\b/i):null;
    const lastExit=live.ok?numberOrNull(live.output,/\blast exit code\s*=\s*(\d+)\b/i,255):null;
    result.jobs.push(classifyMinuteEvidence(job,{
      seconds,loaded:live.ok,runs,lastExit,
    }));
  }
  if(exists(DOCKER)){
    const restarts=run(DOCKER,['inspect','--format','{{.RestartCount}}','activepieces-worker-1']);
    const health=run(DOCKER,['inspect','--format',
      '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}',
      'activepieces-worker-1']);
    result.worker=assessWorkerRestartHistory({
      count:restarts.ok?numberOrNull(restarts.output,/^\s*(\d+)\s*$/):null,
      health:health.ok?health.output.trim():null,
    });
  }
  result.scheduleVerdict=result.jobs.every(x=>x.schedule==='EXPECTED')
    ? 'EXPECTED_INTERVALS_CONFIGURED_EXECUTION_UNPROVEN'
    : 'CONFIGURATION_REQUIRES_REVIEW';
  return result;
}

const direct=(()=>{
  try{return Boolean(process.argv[1])&&
    realpathSync(resolve(process.argv[1]))===realpathSync(fileURLToPath(import.meta.url))}
  catch{return false}
})();
if(direct){
  if(process.argv.length!==3||process.argv[2]!=='--audit'){
    process.stdout.write('ATLAS_MINUTE_AUDIT=HOLD_AUDIT_SWITCH_REQUIRED\n');
    process.exitCode=2;
  }else{
    const receipt=auditMinuteController();
    // Only fixed labels and bounded integers; no raw command output, paths,
    // credentials, container environment, or arbitrary LaunchAgent text.
    process.stdout.write(JSON.stringify(receipt,null,2)+'\n');
    if(receipt.localMac!=='YES')process.exitCode=2;
  }
}
