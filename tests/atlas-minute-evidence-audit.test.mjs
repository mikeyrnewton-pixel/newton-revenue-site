import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {
  AUDITED_JOBS,auditMinuteController,assessWorkerRestartHistory,classifyMinuteEvidence,
} from '../scripts/atlas-minute-evidence-audit.mjs';

function fixture({intervalOverride={},runsOverride={},launchOffline=[],workerRestarts='212\n',
  workerHealth='healthy\n',dockerPresent=true}={}){
  const executed=[];
  const home='/Users/fixture';
  const out=auditMinuteController({
    platform:'darwin',home,uid:501,
    exists:p=>dockerPresent||!p.includes('Docker.app'),
    run:(bin,args)=>{
      executed.push([bin,...args]);
      if(bin==='/usr/bin/plutil'){
        const label=args.at(-1).split('/').at(-1).replace('.plist','');
        const sec=intervalOverride[label]??(label.endsWith('local-operator')?3600:60);
        return {ok:true,output:String(sec)+'\n'};
      }
      if(bin==='/bin/launchctl'){
        const label=args.at(-1).split('/').at(-1);
        if(launchOffline.includes(label))return {ok:false,output:''};
        const runs=runsOverride[label]??12;
        return {ok:true,output:'private_token=should-not-appear\nruns = '+runs+
          '\nlast exit code = 0\n'};
      }
      if(bin.includes('/docker')){
        return {ok:true,output:args[2]==='{{.RestartCount}}'
          ?workerRestarts:workerHealth};
      }
      throw Error('unexpected call');
    },
  });
  return {out,executed};
}
test('Mac screenshot cadence is assessed without claiming minute execution',()=>{
  const {out,executed}=fixture();
  assert.equal(out.localMac,'YES');
  assert.equal(out.jobs.length,4);
  assert.deepEqual(out.jobs.map(j=>j.configuredSeconds),[60,60,60,3600]);
  assert.equal(out.scheduleVerdict,'EXPECTED_INTERVALS_CONFIGURED_EXECUTION_UNPROVEN');
  assert.ok(out.jobs.every(j=>j.executionEvidence==='HISTORICAL_RUNS_NOT_CADENCE_PROOF'));
  assert.equal(out.worker.restartCount,212);
  assert.equal(out.worker.currentHealth,'HEALTHY');
  assert.equal(out.worker.history,'ELEVATED_HISTORICAL_RESTARTS_REVIEW');
  assert.equal(out.worker.currentlyCrashLooping,'NOT_VERIFIED');
  assert.equal(out.verifiedEveryMinuteExecution,false);
  assert.equal(out.verifiedAutomaticCodeBuilding,false);
  assert.equal(out.directChatGPTMacControl,false);
  assert.equal(out.noWritesPerformed,true);
  assert.ok(executed.every(([bin])=>['/usr/bin/plutil','/bin/launchctl',
    '/Applications/Docker.app/Contents/Resources/bin/docker'].includes(bin)));
  assert.equal(JSON.stringify(out).includes('private_token'),false);
});
test('minute audit incorporates recent private snapshot metadata without opening it',()=>{
  const nowMs=1_800_000_000_000;
  let probes=0;
  const out=auditMinuteController({
    platform:'darwin',home:'/Users/fixture',uid:501,nowMs,
    exists:()=>false,run:()=>({ok:false,output:''}),
    observerLstat:path=>{
      probes++;
      if(path==='/Users/fixture/.atlas-observer')
        return {uid:501,mode:0o700,isDirectory:()=>true};
      if(path==='/Users/fixture/.atlas-observer/status.json')
        return {uid:501,mode:0o600,size:454,mtimeMs:nowMs-40_000,isFile:()=>true};
      throw Error('Unexpected path');
    },
  });
  assert.equal(probes,2);
  assert.equal(out.observerSnapshot.state,'RECENT_PRIVATE_SNAPSHOT_PRESENT');
  assert.equal(out.observerSnapshot.ageSeconds,40);
  assert.equal(out.observerSnapshot.privateContentsRead,false);
  assert.equal(out.observerSnapshot.automaticRefreshVerified,false);
  assert.equal(out.verifiedEveryMinuteExecution,false);
  assert.equal(out.verifiedAutomaticCodeBuilding,false);
  assert.equal(out.directChatGPTMacControl,false);
  assert.equal(out.noWritesPerformed,true);
  assert.equal(out.scheduleVerdict,'CONFIGURATION_REQUIRES_REVIEW');
  assert.doesNotMatch(JSON.stringify(out),/Users|fixture|secret|token/i);
});
test('config drift cannot be masked by a successful launchctl exit',()=>{
  const label=AUDITED_JOBS[0].label;
  const {out}=fixture({intervalOverride:{[label]:300}});
  assert.equal(out.scheduleVerdict,'CONFIGURATION_REQUIRES_REVIEW');
  assert.equal(out.jobs[0].schedule,'MISMATCH');
  assert.equal(out.jobs[0].launchService,'RESPONDING');
});
test('unavailable launchctl never proves runs or successful ticks',()=>{
  const label=AUDITED_JOBS[2].label;
  const {out}=fixture({launchOffline:[label]});
  assert.equal(out.jobs[2].launchService,'NOT_VERIFIED');
  assert.equal(out.jobs[2].runCount,null);
  assert.equal(out.jobs[2].executionEvidence,'NOT_PROVEN');
});
test('malformed and unbounded values become unknown, never trusted',()=>{
  const label=AUDITED_JOBS[0].label;
  const {out}=fixture({intervalOverride:{[label]:'60\nTOKEN=SECRET'},
    workerRestarts:'212\nPASSWORD=test'});
  assert.equal(out.jobs[0].schedule,'UNKNOWN');
  assert.equal(out.worker.restartCount,null);
  assert.equal(JSON.stringify(out).includes('PASSWORD'),false);
});
test('no Docker does not pretend worker restart history is known',()=>{
  const {out,executed}=fixture({dockerPresent:false});
  assert.equal(out.worker.history,'NOT_VERIFIED');
  assert.ok(executed.every(([bin])=>!bin.includes('/docker')));
});
test('restart count is historical; health alone does not establish stability',()=>{
  assert.equal(assessWorkerRestartHistory({count:0,health:'healthy'}).currentlyCrashLooping,'NOT_VERIFIED');
  assert.equal(assessWorkerRestartHistory({count:22,health:'healthy'}).history,
    'ELEVATED_HISTORICAL_RESTARTS_REVIEW');
  assert.equal(assessWorkerRestartHistory({count:1,health:'unhealthy'}).currentHealth,'UNHEALTHY');
  assert.equal(classifyMinuteEvidence(AUDITED_JOBS[0],{
    seconds:60,loaded:true,runs:1,lastExit:0,
  }).executionEvidence,'HISTORICAL_RUNS_NOT_CADENCE_PROOF');
});
test('Linux CLI is explicit, read-only and cannot be abused to mutate',()=>{
  const file=fileURLToPath(new URL('../scripts/atlas-minute-evidence-audit.mjs',import.meta.url));
  const src=readFileSync(file,'utf8');
  assert.doesNotMatch(src,/shell:\s*true|child_process\.exec|eval\s*\(/);
  assert.doesNotMatch(src,/\['(?:start|stop|restart|run|exec|rm|create|pull)'[,]/);
  const bad=spawnSync(process.execPath,[file,'--install'],{encoding:'utf8'});
  assert.equal(bad.status,2);
  assert.match(bad.stdout,/HOLD_AUDIT_SWITCH_REQUIRED/);
  const run=spawnSync(process.execPath,[file,'--audit'],{encoding:'utf8'});
  if(process.platform!=='darwin')assert.equal(run.status,2);
  const result=JSON.parse(run.stdout);
  if(process.platform!=='darwin'){
    assert.equal(result.localMac,'NO');
    assert.equal(result.jobs.length,0);
  }
  assert.equal(result.directChatGPTMacControl,false);
});
