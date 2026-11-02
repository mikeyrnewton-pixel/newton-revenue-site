#!/usr/bin/env node
// ATLAS Observer Stage 4 candidate: inspect-only tunnel replacement/rollback guard.
// Never reads key bytes or prints environment, tunnel identity, mounts or secrets.
// No Docker writes, no tool discovery, and no live tunnel cutover.
import {spawnSync} from 'node:child_process';
import {accessSync,constants,realpathSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const names=['atlas-mcp-readonly-canary','atlas-tunnel-client-canary','atlas-mcp-observer-review'];
const expected='http://127.0.0.1:18787/mcp';
const allowed=new Set(['PATH','HOME','LANG','LC_ALL','TZ','SSL_CERT_FILE','SSL_CERT_DIR',
  'MCP_SERVER_URL','CONTROL_PLANE_TUNNEL_ID','LOG_LEVEL','LOG_FORMAT',
  'HEALTH_LISTEN_ADDR','HEALTH_URL_FILE','HTTP_PROXY','HTTPS_PROXY',
  'NO_PROXY','ALL_PROXY','GODEBUG','GOTRACEBACK']);
const insist=(ok,msg)=>{if(!ok)throw Error(msg)};
const list=x=>Array.isArray(x)?x:[];
const portsOk=x=>x==null||(typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===0);
const confined=x=>x?.State?.Running===true&&x?.HostConfig?.ReadonlyRootfs===true&&
  x?.HostConfig?.Privileged===false&&x?.HostConfig?.RestartPolicy?.Name==='no'&&
  portsOk(x?.HostConfig?.PortBindings)&&list(x?.HostConfig?.CapDrop).includes('ALL')&&
  list(x?.HostConfig?.CapAdd).length===0&&
  list(x?.HostConfig?.SecurityOpt).some(y=>y==='no-new-privileges'||y==='no-new-privileges:true');

export function reviewTunnelReplacement(containers){
  insist(Array.isArray(containers)&&containers.length===3,'REQUIRE_THREE_CONTAINERS');
  const [canary,tunnel,observer]=containers;
  insist(containers.every((x,i)=>x?.Name==='/'+names[i]&&x.State?.Running===true),
    'CONTAINER_IDENTITY_OR_RUNNING_DRIFT');
  const share=x=>x?.HostConfig?.NetworkMode==='container:'+names[0]||
    x?.HostConfig?.NetworkMode==='container:'+canary.Id;
  insist(share(tunnel)&&share(observer),'PRIVATE_NETWORK_DRIFT');
  insist(confined(tunnel)&&confined(observer),'CONFINEMENT_DRIFT');
  insist(/^[1-9][0-9]*:[1-9][0-9]*$/.test(observer.Config?.User||''),
    'OBSERVER_USER_NOT_NONROOT');
  const obsMounts=list(observer.Mounts);
  insist(obsMounts.length===2&&['/opt/atlas-observer/scripts','/run/atlas-observer']
    .every(dest=>obsMounts.some(x=>x.Destination===dest&&x.RW===false)),
    'OBSERVER_MOUNT_DRIFT');
  insist(tunnel.Config?.Image==='ghcr.io/openai/tunnel-client:v0.0.17'&&
    /^sha256:[a-f0-9]{64}$/.test(tunnel.Image||''),'IMAGE_PIN_DRIFT');
  const m=list(tunnel.Mounts);
  insist(m.length===1&&m[0].Destination==='/run/secrets/runtime-key'&&
    m[0].Type==='bind'&&m[0].RW===false&&typeof m[0].Source==='string'&&
    m[0].Source.startsWith('/')&&!/[\r\n,\0]/.test(m[0].Source),
    'RUNTIME_KEY_MOUNT_DRIFT');
  insist(Array.isArray(tunnel.Config.Env),'ENV_FORMAT_DRIFT');
  const entries=new Map();
  for(const x of tunnel.Config.Env){
    insist(typeof x==='string'&&x.includes('='),'ENV_ENTRY_INVALID');
    const i=x.indexOf('='),k=x.slice(0,i);
    insist(allowed.has(k)&&!entries.has(k),'UNREVIEWED_ENV_OR_DUPLICATE');
    entries.set(k,x.slice(i+1));
  }
  insist(entries.get('MCP_SERVER_URL')===expected,'CANARY_ENV_TARGET_UNVERIFIED');
  insist(/^tunnel_[A-Za-z0-9_-]{8,150}$/.test(
    entries.get('CONTROL_PLANE_TUNNEL_ID')||''),'TUNNEL_ID_REFERENCE_UNVERIFIED');
  const args=[...list(tunnel.Config.Entrypoint),...list(tunnel.Config.Cmd)];
  insist(args.every(x=>typeof x==='string'&&x.length<512&&!/[\r\n\0]/.test(x)),
    'LAUNCH_ARG_INVALID');
  insist(args.includes('--control-plane.api-key=file:/run/secrets/runtime-key'),
    'RUNTIME_KEY_FILE_FLAG_MISSING');
  insist(!args.some(x=>x.startsWith('--mcp.server-url')||
    x.includes('CONTROL_PLANE_API_KEY=')||x.includes('OPENAI_ADMIN_KEY=')),
    'COMMAND_OVERRIDES_TARGET_OR_EMBEDS_KEY');
  // An owner Mac can legitimately run the tunnel with AutoRemove=false (the
  // normal Docker default). This *retains* the original stopped container,
  // including its name: any separately authorised replacement must preserve
  // that original through a name-aware rollback, not assume it disappears.
  // Keep unknown/non-boolean values on HOLD; never infer a cutover is safe.
  const autoRemove=tunnel.HostConfig.AutoRemove;
  insist(autoRemove===true||autoRemove===false,'STOP_REMOVAL_CONTRACT_UNKNOWN');
  return Object.freeze({
    stage:'REVIEW_READY_NO_MAC_CHANGES',
    current:'CANARY_18787',
    desired:'OBSERVER_18788',
    rollback:autoRemove===true
      ? 'STOP_AUTO_REMOVES_OLD_CONTAINER_RECREATE_REQUIRED'
      : 'STOP_RETAINS_ORIGINAL_CONTAINER_NAME_COLLISION_REVIEW_REQUIRED',
    key:'READONLY_FILE_REFERENCE_ONLY',
    environment:'EXACT_RECONSTRUCTION_ALLOWLIST',
    dockerWrites:0,
    remoteAtlasStatus:'NOT_VERIFIED',
  });
}

function callDocker(argv) {
  const r=spawnSync(argv[0],argv.slice(1),{
    encoding:'utf8',timeout:6000,maxBuffer:1500000,stdio:['ignore','pipe','pipe'],
  });
  insist(!r.error&&r.status===0,'DOCKER_READ_ONLY_INSPECT_FAILED');
  // Never expose raw Docker inspect or stderr.
  return r.stdout;
}
const invoked=process.argv[1]&&realpathSync(resolve(process.argv[1]))===
  realpathSync(fileURLToPath(import.meta.url));
// macOS /tmp normally resolves to /private/tmp. Comparing textual paths
// silently skipped the CLI when iPhone SSH staged a verified script in /tmp.
if(invoked){
  try {
    insist(process.argv.length===3&&process.argv[2]==='--inspect-only',
      'INSPECT_ONLY_SWITCH_REQUIRED');
    insist(process.platform==='darwin'&&process.getuid?.()!==0,
      'MAC_OWNER_REQUIRED');
    const candidates=['/Applications/Docker.app/Contents/Resources/bin/docker',
      '/opt/homebrew/bin/docker','/usr/local/bin/docker'];
    const docker=candidates.find(x=>{try{accessSync(x,constants.X_OK);return true}catch{return false}});
    insist(Boolean(docker),'DOCKER_MISSING');
    callDocker([docker,'info']);
    const receipt=reviewTunnelReplacement(JSON.parse(
      callDocker([docker,'container','inspect',...names])));
    for(const [k,v] of Object.entries(receipt)){
      process.stdout.write('ATLAS_CUTOVER_'+k.toUpperCase()+'='+String(v)+'\n');
    }
    process.stdout.write('ATLAS_CUTOVER_CONTRACT=REVIEW_READY_NO_CHANGES\n');
  } catch(e) {
    const code=/^[A-Z0-9_]+$/.test(e.message)?e.message:'INSPECTION_INVALID';
    process.stdout.write('ATLAS_CUTOVER_CONTRACT=HOLD_'+code+'\n');
    process.exitCode=2;
  }
}