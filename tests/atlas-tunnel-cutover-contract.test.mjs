import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync,mkdtempSync,symlinkSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {reviewTunnelReplacement} from '../scripts/atlas-tunnel-cutover-contract-20261026.mjs';

const names=['atlas-mcp-readonly-canary','atlas-tunnel-client-canary','atlas-mcp-observer-review'];
const hc=()=>({NetworkMode:'container:atlas-mcp-readonly-canary',ReadonlyRootfs:true,
  Privileged:false,RestartPolicy:{Name:'no'},PortBindings:null,
  CapDrop:['ALL'],CapAdd:[],SecurityOpt:['no-new-privileges'],AutoRemove:true});
const make=(n)=>({Name:'/'+n,Id:'b'.repeat(64),State:{Running:true},
  HostConfig:hc(),Config:{Image:'unused',User:'501:20',Entrypoint:[],Cmd:[],Env:[]},Mounts:[]});
function fixture(){
  const x=names.map(make);
  x[1].Config.Image='ghcr.io/openai/tunnel-client:v0.0.17';
  x[1].Image='sha256:'+'a'.repeat(64);
  x[1].Config.Env=[
    'PATH=/bin','MCP_SERVER_URL=http://127.0.0.1:18787/mcp',
    'CONTROL_PLANE_TUNNEL_ID=tunnel_0123456789abcdef',
  ];
  x[1].Config.Cmd=['run','--control-plane.api-key=file:/run/secrets/runtime-key'];
  x[1].Config.Entrypoint=['/tunnel-client'];
  x[1].Mounts=[{Destination:'/run/secrets/runtime-key',
    Type:'bind',RW:false,Source:'/private/runtime-key'}];
  x[2].Mounts=[
    {Destination:'/opt/atlas-observer/scripts',RW:false},
    {Destination:'/run/atlas-observer',RW:false},
  ];
  return x;
}
function denied(change,code){
  const x=fixture();change(x);
  assert.throws(()=>reviewTunnelReplacement(x),new RegExp(code));
}
test('existing tunnel is only a no-change cutover candidate',()=>{
  const r=reviewTunnelReplacement(fixture());
  assert.equal(r.stage,'REVIEW_READY_NO_MAC_CHANGES');
  assert.equal(r.current,'CANARY_18787');
  assert.equal(r.desired,'OBSERVER_18788');
  assert.equal(r.dockerWrites,0);
  assert.equal(r.remoteAtlasStatus,'NOT_VERIFIED');
  assert.match(r.rollback,/RECREATE_REQUIRED/);
  assert.ok(Object.isFrozen(r));
  assert.doesNotMatch(JSON.stringify(r),/tunnel_[a-z0-9]+|\/private\/|sk-/);
});
test('target, tunnel reference and identity cannot drift',()=>{
  denied(x=>x[1].Config.Env[1]='MCP_SERVER_URL=http://127.0.0.1:18788/mcp',
    'CANARY_ENV_TARGET_UNVERIFIED');
  denied(x=>x[1].Config.Env.pop(),'TUNNEL_ID_REFERENCE_UNVERIFIED');
  denied(x=>x[1].Config.Env.push('MCP_SERVER_URL=http://127.0.0.1:18787/mcp'),
    'UNREVIEWED_ENV_OR_DUPLICATE');
  denied(x=>x[1].Config.Env.push('CONTROL_PLANE_API_KEY=secret'),
    'UNREVIEWED_ENV_OR_DUPLICATE');
  denied(x=>x[1].Config.Env.push('UNEXPECTED=value'),'UNREVIEWED_ENV_OR_DUPLICATE');
  denied(x=>x[1].Name='/unexpected-tunnel','CONTAINER_IDENTITY_OR_RUNNING_DRIFT');
  denied(x=>x[1].HostConfig.NetworkMode='host','PRIVATE_NETWORK_DRIFT');
  denied(x=>x[2].HostConfig.NetworkMode='bridge','PRIVATE_NETWORK_DRIFT');
});
test('all added mounts or privilege regressions halt',()=>{
  denied(x=>x[1].Mounts[0].RW=true,'RUNTIME_KEY_MOUNT_DRIFT');
  denied(x=>x[1].Mounts.push({Destination:'/var/run/docker.sock',RW:false}),
    'RUNTIME_KEY_MOUNT_DRIFT');
  denied(x=>x[2].Mounts.push({Destination:'/home',RW:false}),
    'OBSERVER_MOUNT_DRIFT');
  denied(x=>x[1].HostConfig.Privileged=true,'CONFINEMENT_DRIFT');
  denied(x=>x[1].HostConfig.CapAdd=['NET_ADMIN'],'CONFINEMENT_DRIFT');
  denied(x=>x[1].HostConfig.SecurityOpt=[],'CONFINEMENT_DRIFT');
  denied(x=>x[1].HostConfig.AutoRemove=false,'STOP_REMOVAL_CONTRACT_UNKNOWN');
  denied(x=>x[2].Config.User='0:0','OBSERVER_USER_NOT_NONROOT');
});
test('file-based key and non-overridden endpoint are required',()=>{
  denied(x=>x[1].Config.Cmd=['run'],'RUNTIME_KEY_FILE_FLAG_MISSING');
  denied(x=>x[1].Config.Cmd.push('--mcp.server-url=http://127.0.0.1:18787/mcp'),
    'COMMAND_OVERRIDES_TARGET_OR_EMBEDS_KEY');
  denied(x=>x[1].Config.Cmd.push('OPENAI_ADMIN_KEY=secret'),
    'COMMAND_OVERRIDES_TARGET_OR_EMBEDS_KEY');
  denied(x=>x[1].Config.Cmd.push('bad\narg'),'LAUNCH_ARG_INVALID');
});
test('CLI has no switch for Docker mutations, and refuses non-Mac invocation',()=>{
  const file=fileURLToPath(new URL('../scripts/atlas-tunnel-cutover-contract-20261026.mjs',import.meta.url));
  const src=readFileSync(file,'utf8');
  assert.doesNotMatch(src,/'(?:run|stop|rm|restart|start|create|exec|pull)'[,]/);
  assert.doesNotMatch(src,/child_process\.exec|eval\s*\(|shell:\s*true/);
  for(const args of [[],['--cutover'],['--rollback'],['--inspect-only']]){
    const r=spawnSync(process.execPath,[file,...args],{encoding:'utf8',timeout:4000});
    if(process.platform!=='darwin'||args[0]!=='--inspect-only'){
      assert.equal(r.status,2,r.stderr+r.stdout);
      assert.match(r.stdout,/ATLAS_CUTOVER_CONTRACT=HOLD_/);
      assert.doesNotMatch(r.stdout,/\/Users\/|tunnel_[a-z0-9]+|sk-/);
    }
  }
});

test('symlinked CLI entrypoint must emit a real hold receipt, never silently skip',()=>{
  if(process.platform==='darwin')return; // no Docker introspection from test machines
  const file=fileURLToPath(new URL('../scripts/atlas-tunnel-cutover-contract-20261026.mjs',import.meta.url));
  const dir=mkdtempSync(join(tmpdir(),'atlas-stage4-link-'));
  const alias=join(dir,'alias.mjs');
  try{
    symlinkSync(file,alias);
    const r=spawnSync(process.execPath,[alias,'--inspect-only'],{
      encoding:'utf8',timeout:4000,
    });
    assert.equal(r.status,2,r.stderr+r.stdout);
    assert.match(r.stdout,/ATLAS_CUTOVER_CONTRACT=HOLD_MAC_OWNER_REQUIRED/);
    assert.doesNotMatch(r.stdout,/\/Users\/|tunnel_[a-z0-9]+|sk-/);
  }finally{rmSync(dir,{force:true,recursive:true})}
});
