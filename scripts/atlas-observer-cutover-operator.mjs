#!/usr/bin/env node
/**
 * ATLAS Observer Stage 4 — owner-operated, restricted single-client cutover.
 *
 * --preflight: READ-ONLY; does not modify any service or local file.
 * --apply-readonly-observer: explicit owner-Mac invocation, only after a
 * separate factual confirmation that the *mounted runtime key* matches the
 * reviewed Tunnels Read+Use restricted key and the expected ChatGPT workspace.
 * --rollback: stop the observer-targeted candidate before restarting the
 * original unchanged canary-targeted client.
 *
 * Never prints or reads credential bytes, raw Docker configuration,
 * secret mount host paths, tunnel IDs or arbitrary logs. No shell, no
 * network calls from this script, no new tunnel/key/plugin and no financial,
 * customer, AI or trading operations.
 *
 * This is SOURCE ONLY until run on the owner's Mac. Review CI can never prove
 * actual runtime permissions, plugin discovery or remote atlas_status.
 */
import {spawnSync} from 'node:child_process';
import fs, {constants} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {reviewTunnelReplacement} from './atlas-tunnel-cutover-contract-20261026.mjs';

export const CUTOVER_SCHEMA='atlas.observer.reversible.cutover.v1';
export const NAMES=Object.freeze({
  canary:'atlas-mcp-readonly-canary',
  original:'atlas-tunnel-client-canary',
  observer:'atlas-mcp-observer-review',
  candidate:'atlas-tunnel-client-observer-candidate',
});
const CANARY_URL='http://127.0.0.1:18787/mcp';
const OBSERVER_URL='http://127.0.0.1:18788/mcp';
const TUNNEL_IMAGE='ghcr.io/openai/tunnel-client:v0.0.17';
const SECRET_DEST='/run/secrets/runtime-key';
const GUARD_DIR='.atlas-observer-cutover';
const GUARD_FILE='state.json';
const allowedEnv=new Set([
  'PATH','HOME','LANG','LC_ALL','TZ','SSL_CERT_FILE','SSL_CERT_DIR',
  'MCP_SERVER_URL','CONTROL_PLANE_TUNNEL_ID','LOG_LEVEL','LOG_FORMAT',
  'HEALTH_LISTEN_ADDR','HEALTH_URL_FILE','GODEBUG','GOTRACEBACK'
]);
const allowedCmd=new Set(['run','--control-plane.api-key=file:/run/secrets/runtime-key']);
const keyPattern=/^[A-Z][A-Z0-9_]*$/;
const validId=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const hold=(code)=>{throw Error(code)};
const assert=(ok,code)=>{if(!ok)hold(code)};

function envMap(entries){
  assert(Array.isArray(entries)&&entries.length<=30,'ENV_FORMAT_UNSAFE');
  const values=new Map();
  for(const entry of entries){
    assert(typeof entry==='string'&&entry.length<1400,'ENV_FORMAT_UNSAFE');
    const i=entry.indexOf('=');
    const key=entry.slice(0,i);
    assert(i>0&&keyPattern.test(key)&&allowedEnv.has(key)&&
      !values.has(key),'ENV_UNREVIEWED');
    // Proxy/secret-bearing args are never reconstructed from opaque data.
    const val=entry.slice(i+1);
    assert(!/[\u0000-\u001f\u007f]/u.test(val),'ENV_VALUE_UNSAFE');
    values.set(key,val);
  }
  return values;
}
const validExec=x=>typeof x==='string'&&x.length>0&&x.length<180&&
  !/[\u0000-\u001f\u007f]/u.test(x)&&
  !['sh','bash','/bin/sh','/bin/bash'].includes(x);

/** A safe local Docker CREATE plan. Does not perform any Docker action. */
export function makeCutoverPlan(containers){
  // Existing, independently reviewed immutable original topology contract.
  const baseline=reviewTunnelReplacement(containers);
  const [canary,tunnel,observer]=containers;
  assert(baseline.stage==='REVIEW_READY_NO_MAC_CHANGES','BASELINE_NOT_REVIEWED');
  assert(tunnel.HostConfig.AutoRemove===false,'ORIGINAL_CONTAINER_MUST_BE_RETAINED');
  assert(tunnel.Config.Image===TUNNEL_IMAGE,'IMAGE_TAG_DRIFT');
  assert(validId(canary.Id)&&validId(tunnel.Id)&&validId(observer.Id),
    'IDENTITY_FORMAT_UNVERIFIED');
  const mounts=tunnel.Mounts;
  assert(mounts.length===1&&mounts[0].Destination===SECRET_DEST&&
    mounts[0].RW===false&&mounts[0].Type==='bind','SECRET_MOUNT_UNSAFE');
  const keySource=mounts[0].Source;
  assert(typeof keySource==='string'&&path.isAbsolute(keySource)&&
    keySource!=='/'&&keySource.length<400&&
    path.normalize(keySource)===keySource&&
    !keySource.endsWith('/')&&!keySource.includes(',')&&
    !/[\u0000-\u001f\u007f]/u.test(keySource),'KEY_PATH_UNSAFE');
  const env=envMap(tunnel.Config.Env);
  assert(env.get('MCP_SERVER_URL')===CANARY_URL,'ORIGINAL_CANARY_TARGET_DRIFT');
  assert(/^tunnel_[A-Za-z0-9_-]{8,150}$/.test(
    env.get('CONTROL_PLANE_TUNNEL_ID')||''),'TUNNEL_ID_INVALID');
  const entrypoint=tunnel.Config.Entrypoint;
  const cmd=tunnel.Config.Cmd;
  assert(Array.isArray(entrypoint)&&entrypoint.length===1&&
    validExec(entrypoint[0]),'ENTRYPOINT_NOT_RECONSTRUCTABLE');
  assert(Array.isArray(cmd)&&cmd.length>=2&&cmd.length<=10&&
    cmd[0]==='run'&&cmd.every(x=>allowedCmd.has(x))&&
    cmd.filter(x=>x==='--control-plane.api-key=file:/run/secrets/runtime-key').length===1,
    'COMMAND_NOT_RECONSTRUCTABLE');
  assert(!tunnel.Config.WorkingDir||tunnel.Config.WorkingDir==='/',
    'WORKDIR_NOT_RECONSTRUCTABLE');
  const user=tunnel.Config.User;
  assert(user===''||(typeof user==='string'&&
    /^[1-9][0-9]*:[1-9][0-9]*$/.test(user)),'TUNNEL_USER_UNREVIEWED');
  const argv=['container','create','--name',NAMES.candidate,
    '--network=container:'+NAMES.canary,'--read-only',
    '--cap-drop=ALL','--security-opt=no-new-privileges:true',
    '--restart=no','--pids-limit=64','--memory=128m',
    '--tmpfs','/tmp:rw,noexec,nosuid,nodev,size=16m',
    '--mount','type=bind,src='+keySource+',dst='+SECRET_DEST+',readonly',
    '--label','com.newton.atlas.observer-cutover=read-only-v1',
    '--entrypoint',entrypoint[0]];
  if(user)argv.push('--user',user);
  for(const [key,value] of env){
    argv.push('--env',key+'='+(key==='MCP_SERVER_URL'?OBSERVER_URL:value));
  }
  argv.push(tunnel.Image,...cmd);
  return Object.freeze({
    schema:CUTOVER_SCHEMA,canaryId:canary.Id,originalId:tunnel.Id,
    observerId:observer.Id,sourceImageId:tunnel.Image,
    keySource,argv:Object.freeze(argv),
    originalUrl:CANARY_URL,desiredUrl:OBSERVER_URL,
  });
}

/** Safe public part of the plan. No paths, tunnel IDs or raw env. */
export function sanitizedPlan(plan){
  assert(plan?.schema===CUTOVER_SCHEMA,'PLAN_INVALID');
  return Object.freeze({
    schema:CUTOVER_SCHEMA,status:'REVIEWED_RECONSTRUCTION_NO_WRITES',
    old:'CANARY_18787',replacement:'OBSERVER_18788',
    originalRetained:true,originalNameUnchanged:true,
    candidateName:NAMES.candidate,
    candidateStartsOnlyAfterOriginalStops:true,
    rollback:'STOP_CANDIDATE_THEN_RESTART_UNMODIFIED_ORIGINAL',
    credentials:'EXISTING_READONLY_FILE_MOUNT_NO_KEY_BYTES_READ',
    runtimeKeyRole:'REQUIRES_OWNER_IDENTITY_MATCH',
    chatgptPluginDiscovery:'NOT_YET_VERIFIED',
    commandsExecuted:0,macServicesModified:false,
  });
}

function dockerBin(){
  const candidates=[
    '/Applications/Docker.app/Contents/Resources/bin/docker',
    '/opt/homebrew/bin/docker','/usr/local/bin/docker'
  ];
  const found=candidates.find(f=>{try{fs.accessSync(f,constants.X_OK);return true}catch{return false}});
  assert(Boolean(found),'DOCKER_CLI_MISSING');
  return found;
}
function invokeDocker(bin,args){
  const result=spawnSync(bin,args,{
    encoding:'utf8',timeout:15000,maxBuffer:1500000,
    stdio:['ignore','pipe','pipe']
  });
  // Never surface stderr/stdout from Docker in failure output.
  assert(!result.error&&result.status===0,'DOCKER_OPERATION_FAILED');
  return result.stdout||'';
}
const names=[NAMES.canary,NAMES.original,NAMES.observer];
const inspectThree=(docker)=>JSON.parse(invokeDocker(docker,
  ['container','inspect',...names]));
const inspectOne=(docker,name)=>JSON.parse(invokeDocker(docker,
  ['container','inspect',name]))[0];
function confirmOwnerMac(){
  assert(process.platform==='darwin'&&typeof process.getuid==='function'&&
    process.getuid()!==0,'MAC_OWNER_REQUIRED');
}
function checkLocalKeyFile(plan,uid){
  const st=fs.lstatSync(plan.keySource);
  assert(st.isFile()&&!st.isSymbolicLink()&&st.nlink===1&&
    st.uid===uid&&(st.mode&0o077)===0&&
    st.size>=16&&st.size<=8192,'KEY_FILE_SECURITY_NOT_VERIFIED');
}
function guardDir(home,uid){
  const stat=fs.lstatSync(home);
  assert(stat.isDirectory()&&!stat.isSymbolicLink()&&stat.uid===uid,
    'OWNER_HOME_UNVERIFIED');
  const dir=path.join(home,GUARD_DIR);
  if(!fs.existsSync(dir))fs.mkdirSync(dir,{mode:0o700});
  const st=fs.lstatSync(dir);
  assert(st.isDirectory()&&!st.isSymbolicLink()&&st.uid===uid&&
    (st.mode&0o777)===0o700,'GUARD_DIR_UNSAFE');
  return dir;
}
function writeGuard(file,state){
  const content=JSON.stringify(state)+'\n';
  assert(Buffer.byteLength(content)<2048,'GUARD_TOO_LARGE');
  fs.writeFileSync(file,content,{mode:0o600,flag:'wx'});
}
function readGuard(file,uid){
  const st=fs.lstatSync(file);
  assert(st.isFile()&&!st.isSymbolicLink()&&st.nlink===1&&
    st.uid===uid&&(st.mode&0o777)===0o600&&
    st.size>10&&st.size<2048,'GUARD_FILE_UNSAFE');
  const item=JSON.parse(fs.readFileSync(file,'utf8'));
  assert(item?.schema===CUTOVER_SCHEMA&&validId(item.originalId)&&
    validId(item.candidateId)&&validId(item.canaryId)&&
    item.original===NAMES.original&&item.candidate===NAMES.candidate&&
    item.phase==='CANDIDATE_CREATED','GUARD_CONTENT_INVALID');
  return item;
}
function matchesId(c,id,name){
  return c&&c.Name==='/'+name&&c.Id===id;
}
function safeRollback(docker,guard){
  const old=inspectOne(docker,NAMES.original);
  const candidate=inspectOne(docker,NAMES.candidate);
  const canary=inspectOne(docker,NAMES.canary);
  assert(matchesId(old,guard.originalId,NAMES.original)&&
    matchesId(candidate,guard.candidateId,NAMES.candidate)&&
    matchesId(canary,guard.canaryId,NAMES.canary)&&
    canary.State.Running===true,'ROLLBACK_IDENTITY_DRIFT');
  if(candidate.State.Running===true)
    invokeDocker(docker,['container','stop','--time','10',NAMES.candidate]);
  if(inspectOne(docker,NAMES.original).State.Running!==true)
    invokeDocker(docker,['container','start',NAMES.original]);
  assert(inspectOne(docker,NAMES.original).State.Running===true,
    'ROLLBACK_ORIGINAL_NOT_RUNNING');
  assert(inspectOne(docker,NAMES.candidate).State.Running!==true,
    'ROLLBACK_CANDIDATE_STILL_RUNNING');
  return true;
}
function runPreflight(docker){
  invokeDocker(docker,['info']);
  const inspected=inspectThree(docker);
  const plan=makeCutoverPlan(inspected);
  checkLocalKeyFile(plan,process.getuid());
  return plan;
}
function preflight(docker){
  const plan=runPreflight(docker);
  return sanitizedPlan(plan);
}

function apply(docker){
  // Explicit owner attestation; authorization to cut over is NOT proof that
  // the UI's reviewed key matches the actual mounted runtime key.
  assert(process.env.ATLAS_REVIEWED_KEY_MATCH==='YES'&&
    process.env.ATLAS_WORKSPACE_MATCH==='YES',
    'ROLE_AND_WORKSPACE_IDENTITY_CONFIRMATION_REQUIRED');
  const plan=runPreflight(docker);
  const uid=process.getuid();
  const dir=guardDir(os.homedir(),uid);
  const guardFile=path.join(dir,GUARD_FILE);
  assert(!fs.existsSync(guardFile),'PRIOR_CUTOVER_GUARD_EXISTS');
  // A candidate with the same name might be someone else's container.
  let oldCandidate=null;
  try{oldCandidate=inspectOne(docker,NAMES.candidate)}catch{}
  assert(!oldCandidate,'CANDIDATE_NAME_ALREADY_EXISTS');

  let created=false,guardWritten=false,stopped=false;
  let state;
  try{
    invokeDocker(docker,plan.argv);
    created=true;
    const c=inspectOne(docker,NAMES.candidate);
    assert(validId(c.Id)&&c.State.Running===false&&
      c.Name==='/'+NAMES.candidate&&
      c.Image===plan.sourceImageId&&
      c.HostConfig.NetworkMode==='container:'+NAMES.canary&&
      c.HostConfig.ReadonlyRootfs===true&&
      c.HostConfig.Privileged===false&&
      c.HostConfig.RestartPolicy.Name==='no'&&
      Array.isArray(c.HostConfig.CapDrop)&&c.HostConfig.CapDrop.includes('ALL')&&
      Array.isArray(c.Mounts)&&c.Mounts.length===1&&
      c.Mounts[0].Destination===SECRET_DEST&&c.Mounts[0].RW===false&&
      c.Config.Env.includes('MCP_SERVER_URL='+OBSERVER_URL),
      'CANDIDATE_RECONSTRUCTION_DRIFT');
    // Confirm original identities immediately before any disruptive action.
    const before=inspectThree(docker);
    assert(before[0].Id===plan.canaryId&&before[0].State.Running===true&&
      before[1].Id===plan.originalId&&before[1].State.Running===true&&
      before[2].Id===plan.observerId&&before[2].State.Running===true,
      'ORIGINAL_IDENTITY_CHANGED');
    state={schema:CUTOVER_SCHEMA,phase:'CANDIDATE_CREATED',
      original:NAMES.original,candidate:NAMES.candidate,
      originalId:plan.originalId,candidateId:c.Id,canaryId:plan.canaryId};
    writeGuard(guardFile,state);
    guardWritten=true;
    // Single runtime client per tunnel ID. The candidate is only *created*
    // above; it has not run or polled while the original is live.
    invokeDocker(docker,['container','stop','--time','10',NAMES.original]);
    stopped=true;
    assert(inspectOne(docker,NAMES.original).State.Running===false,
      'ORIGINAL_DID_NOT_STOP');
    invokeDocker(docker,['container','start',NAMES.candidate]);
    const running=inspectOne(docker,NAMES.candidate);
    assert(matchesId(running,c.Id,NAMES.candidate)&&running.State.Running===true,
      'CANDIDATE_DID_NOT_START');
    assert(inspectOne(docker,NAMES.original).State.Running===false,
      'ORIGINAL_UNEXPECTEDLY_RUNNING');
    return Object.freeze({
      status:'LOCAL_CUTOVER_STARTED_REMOTE_STATUS_NOT_VERIFIED',
      originalStoppedAndPreserved:true,
      candidateRunning:true,
      rollbackCommand:'--rollback',
      credentialsRead:false,customerActions:0,remoteAtlasStatus:'NOT_VERIFIED',
    });
  }catch(e){
    // Best effort restore by exact Docker identities; do NOT remove old
    // container. If an interrupt occurs, the guard remains for --rollback.
    if(guardWritten){
      try{safeRollback(docker,state);fs.unlinkSync(guardFile)}
      catch{hold('CUTOVER_FAILED_ROLLBACK_REQUIRES_OWNER')}
    }else if(stopped){
      try{invokeDocker(docker,['container','start',NAMES.original])}
      catch{hold('CUTOVER_FAILED_MANUAL_ROLLBACK_REQUIRED')}
    }
    if(created){
      try{
        if(inspectOne(docker,NAMES.candidate).State.Running===false)
          invokeDocker(docker,['container','rm',NAMES.candidate]);
      }catch{}
    }
    hold('CUTOVER_FAILED_OR_BLOCKED_NO_SUCCESS_CLAIM');
  }
}
function rollback(docker){
  invokeDocker(docker,['info']);
  const uid=process.getuid();
  const dir=path.join(os.homedir(),GUARD_DIR);
  const state=readGuard(path.join(dir,GUARD_FILE),uid);
  safeRollback(docker,state);
  // Candidate remains preserved stopped; clean it only after original
  // is independently verified running and exact candidate identity matched.
  const c=inspectOne(docker,NAMES.candidate);
  assert(matchesId(c,state.candidateId,NAMES.candidate)&&
    c.State.Running===false,'CANDIDATE_NOT_SAFE_TO_REMOVE');
  invokeDocker(docker,['container','rm',NAMES.candidate]);
  fs.unlinkSync(path.join(dir,GUARD_FILE));
  return Object.freeze({
    status:'LOCAL_ROLLBACK_ORIGINAL_CANARY_RUNNING',
    originalRunning:true,candidateRunning:false,
    remoteAtlasPing:'MUST_BE_INDEPENDENTLY_RETESTED',
    credentialsRead:false,serviceRestartsOtherThanTunnel:0,
  });
}
const invoked=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
  try{
    assert(process.argv.length===3&&[
      '--preflight','--apply-readonly-observer','--rollback'
    ].includes(process.argv[2]),'SWITCH_NOT_ALLOWLISTED');
    confirmOwnerMac();
    const docker=dockerBin();
    const result=process.argv[2]==='--preflight'?preflight(docker):
      process.argv[2]==='--rollback'?rollback(docker):apply(docker);
    process.stdout.write(JSON.stringify(result)+'\n');
  }catch(error){
    const code=/^[A-Z0-9_]+$/.test(error?.message||'')?
      error.message:'UNEXPECTED_LOCAL_HOLD';
    process.stdout.write(JSON.stringify({
      schema:CUTOVER_SCHEMA,status:'HOLD_'+code,
      cutoverVerified:false,remoteAtlasStatus:'NOT_VERIFIED',
      credentialsPrinted:false
    })+'\n');
    process.exitCode=2;
  }
}
