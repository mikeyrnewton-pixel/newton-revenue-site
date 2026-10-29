import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {
  makeCutoverPlan,sanitizedPlan,preflight,apply,rollback,NAMES,CUTOVER_SCHEMA
} from '../scripts/atlas-observer-cutover-operator.mjs';

const id=n=>n.repeat(64);
const keyFile=root=>path.join(root,'owner-runtime-key');
function fixture(root){
  const hc=()=>({
    NetworkMode:'container:'+NAMES.canary,
    ReadonlyRootfs:true,Privileged:false,RestartPolicy:{Name:'no'},
    PortBindings:null,CapDrop:['ALL'],CapAdd:[],
    SecurityOpt:['no-new-privileges'],AutoRemove:false,
  });
  const base=(name,ident)=>({
    Name:'/'+name,Id:id(ident),State:{Running:true},HostConfig:hc(),
    Config:{Image:'unused',User:'501:20',Entrypoint:[],Cmd:[],Env:[]},
    Mounts:[],Image:'sha256:'+id('d')
  });
  const canary=base(NAMES.canary,'a');
  const original=base(NAMES.original,'b');
  const observer=base(NAMES.observer,'c');
  original.Config={
    Image:'ghcr.io/openai/tunnel-client:v0.0.17',User:'501:20',
    Entrypoint:['/tunnel-client'],
    Cmd:['run','--control-plane.api-key=file:/run/secrets/runtime-key'],
    Env:['PATH=/bin',
      'MCP_SERVER_URL=http://127.0.0.1:18787/mcp',
      'CONTROL_PLANE_TUNNEL_ID=tunnel_0123456789abcdef'],
  };
  original.Mounts=[{
    Destination:'/run/secrets/runtime-key',Type:'bind',
    RW:false,Source:keyFile(root)
  }];
  observer.Mounts=[{
    Destination:'/opt/atlas-observer/scripts',RW:false
  },{Destination:'/run/atlas-observer',RW:false}];
  return [canary,original,observer];
}
function local(fn){
  const home=fs.mkdtempSync(path.join(os.tmpdir(),'atlas-cutover-test-'));
  fs.chmodSync(home,0o700);
  fs.writeFileSync(keyFile(home),'synthetic-not-a-credential-or-real-key',
    {mode:0o600});
  try{return fn(home)}finally{fs.rmSync(home,{recursive:true,force:true})}
}
function dockerMock(home,{failCandidateStart=false}={}){
  const [canary,original,observer]=fixture(home);
  const state={canary,original,observer,candidate:null,transitions:[],violations:0};
  const get=name=>{
    const namesMap={
      [NAMES.canary]:state.canary,
      [NAMES.original]:state.original,
      [NAMES.observer]:state.observer,
      [NAMES.candidate]:state.candidate,
    };
    const item=namesMap[name];
    if(!item)throw Error('FAKE_DOCKER_MISSING');
    return item;
  };
  function run(_,args){
    state.transitions.push(args.slice());
    const [section,verb,...rest]=args;
    if(section==='info')return 'docker-ok';
    if(section==='container'&&verb==='inspect'){
      return JSON.stringify(rest.map(name=>get(name)));
    }
    if(section==='container'&&verb==='create'){
      assert.equal(state.candidate,null);
      assert.equal(args.includes('--read-only'),true);
      assert.equal(args.includes('--cap-drop=ALL'),true);
      assert.equal(args.includes('--network=container:'+NAMES.canary),true);
      assert.equal(args.some(a=>a==='--env'),true);
      assert.equal(args.includes('MCP_SERVER_URL=http://127.0.0.1:18788/mcp'),true);
      assert.equal(args.includes('MCP_SERVER_URL=http://127.0.0.1:18787/mcp'),false);
      const c=structuredClone(state.original);
      c.Name='/'+NAMES.candidate;
      c.Id=id('e');
      c.State.Running=false;
      c.Config.Env=c.Config.Env.map(e=>
        e.startsWith('MCP_SERVER_URL=')?
          'MCP_SERVER_URL=http://127.0.0.1:18788/mcp':e);
      state.candidate=c;
      return c.Id+'\n';
    }
    if(section==='container'&&verb==='stop'){
      const name=rest.at(-1);get(name).State.Running=false;
      return name+'\n';
    }
    if(section==='container'&&verb==='start'){
      const name=rest.at(-1);
      if(name===NAMES.candidate&&failCandidateStart)throw Error('SIMULATED_CANDIDATE_START_FAIL');
      const candidate=state.candidate;
      if(name===NAMES.candidate&&state.original.State.Running)state.violations++;
      if(name===NAMES.original&&candidate?.State.Running)state.violations++;
      get(name).State.Running=true;
      return name+'\n';
    }
    if(section==='container'&&verb==='rm'){
      assert.equal(rest[0],NAMES.candidate);
      assert.equal(state.candidate?.State.Running,false);
      state.candidate=null;
      return NAMES.candidate+'\n';
    }
    throw Error('UNREVIEWED_DOCKER_COMMAND');
  }
  return {state,run};
}

test('preflight reconstructs a separate pinned candidate without writes or secrets',()=>{
  local(home=>{
    const inspect=fixture(home);
    const plan=makeCutoverPlan(inspect);
    assert.equal(plan.schema,CUTOVER_SCHEMA);
    assert.equal(plan.originalId,id('b'));
    assert.equal(plan.argv.slice(0,4).join(' '),
      'container create --name '+NAMES.candidate);
    assert.equal(plan.argv.includes('--read-only'),true);
    assert.equal(plan.argv.includes('--restart=no'),true);
    assert.equal(plan.argv.includes('--mount'),true);
    assert.equal(plan.argv.includes('--entrypoint'),true);
    assert.equal(plan.argv.includes('MCP_SERVER_URL=http://127.0.0.1:18788/mcp'),true);
    assert.equal(plan.argv.includes('MCP_SERVER_URL=http://127.0.0.1:18787/mcp'),false);
    const sanitized=JSON.stringify(sanitizedPlan(plan));
    assert.doesNotMatch(sanitized,/tunnel_012345|owner-runtime-key|sha256:/);
    assert.equal(sanitizedPlan(plan).originalRetained,true);
    const mock=dockerMock(home);
    const receipt=preflight('docker-mock',{run:mock.run,uid:process.getuid()});
    assert.equal(receipt.status,'REVIEWED_RECONSTRUCTION_NO_WRITES');
    assert.equal(mock.state.transitions.some(x=>x.includes('create')),false);
    assert.equal(mock.state.transitions.some(x=>x.includes('stop')),false);
  });
});

test('wrong key file permissions block before any Docker changes',()=>{
  local(home=>{
    const mock=dockerMock(home);
    fs.chmodSync(keyFile(home),0o644);
    assert.throws(()=>preflight('fake',{run:mock.run,uid:process.getuid()}),
      /KEY_FILE_SECURITY_NOT_VERIFIED/);
    assert.equal(mock.state.transitions.some(x=>x.includes('create')),false);
    assert.equal(mock.state.original.State.Running,true);
  });
});

test('unsupported settings never reconstruct arbitrary tunnel commands',()=>{
  local(home=>{
    const fail=(change)=>{
      const x=fixture(home);change(x);
      assert.throws(()=>makeCutoverPlan(x));
    };
    fail(x=>x[1].HostConfig.AutoRemove=true);
    fail(x=>x[1].Config.Entrypoint=['/bin/sh']);
    fail(x=>x[1].Config.Cmd.push('--mcp.command=unsafe'));
    fail(x=>x[1].Config.Env.push('OPENAI_ADMIN_KEY=secret'));
    fail(x=>x[1].Config.Env.push('HTTP_PROXY=http://proxy.example'));
    fail(x=>x[1].Config.WorkingDir='/tmp');
    fail(x=>x[1].Config.User='0:0');
    fail(x=>x[1].Mounts[0].Source='/tmp/a,readonly,bind');
    fail(x=>x[1].HostConfig.NetworkMode='host');
    fail(x=>x[1].Image='sha256:untrusted');
  });
});

test('only actual owner-matched key + workspace attestation permits apply',()=>{
  local(home=>{
    const mock=dockerMock(home);
    assert.throws(()=>apply('fake',{home,uid:process.getuid(),run:mock.run,
      roleVerified:false,workspaceVerified:true}),
      /ROLE_AND_WORKSPACE_IDENTITY_CONFIRMATION_REQUIRED/);
    assert.equal(mock.state.transitions.length,0);
    assert.equal(mock.state.original.State.Running,true);
  });
});

test('complete offline-mocked candidate handoff preserves original and never overlaps clients',()=>{
  local(home=>{
    const mock=dockerMock(home);
    const opts={home,uid:process.getuid(),run:mock.run,
      roleVerified:true,workspaceVerified:true};
    const receipt=apply('fake',opts);
    assert.equal(receipt.status,'LOCAL_CUTOVER_STARTED_REMOTE_STATUS_NOT_VERIFIED');
    assert.equal(receipt.originalStoppedAndPreserved,true);
    assert.equal(receipt.remoteAtlasStatus,'NOT_VERIFIED');
    assert.equal(mock.state.original.State.Running,false);
    assert.equal(mock.state.candidate.State.Running,true);
    assert.equal(mock.state.violations,0);
    assert.equal(mock.state.canary.State.Running,true);
    assert.equal(mock.state.observer.State.Running,true);
    const guard=path.join(home,'.atlas-observer-cutover','state.json');
    assert.equal(fs.statSync(guard).mode&0o777,0o600);
    assert.equal(fs.statSync(path.dirname(guard)).mode&0o777,0o700);
    const data=fs.readFileSync(guard,'utf8');
    assert.doesNotMatch(data,/owner-runtime-key|tunnel_012345|sk-/);
    assert.equal(JSON.parse(data).candidateId,id('e'));

    const rollbackReceipt=rollback('fake',{home,uid:process.getuid(),run:mock.run});
    assert.equal(rollbackReceipt.status,'LOCAL_ROLLBACK_ORIGINAL_CANARY_RUNNING');
    assert.equal(mock.state.original.State.Running,true);
    assert.equal(mock.state.candidate,null);
    assert.equal(mock.state.violations,0);
    assert.equal(fs.existsSync(guard),false);
    assert.equal(mock.state.canary.State.Running,true);
  });
});

test('failure to start replacement restores original and cleans staged candidate',()=>{
  local(home=>{
    const mock=dockerMock(home,{failCandidateStart:true});
    const opts={home,uid:process.getuid(),run:mock.run,
      roleVerified:true,workspaceVerified:true};
    assert.throws(()=>apply('fake',opts),
      /CUTOVER_FAILED_OR_BLOCKED_NO_SUCCESS_CLAIM/);
    assert.equal(mock.state.original.State.Running,true);
    assert.equal(mock.state.candidate,null);
    assert.equal(mock.state.violations,0);
    assert.equal(fs.existsSync(path.join(home,'.atlas-observer-cutover','state.json')),
      false);
  });
});

test('an existing candidate name blocks rather than overwriting any container',()=>{
  local(home=>{
    const mock=dockerMock(home);
    mock.state.candidate={
      ...structuredClone(mock.state.original),
      Name:'/'+NAMES.candidate,Id:id('f'),
      State:{Running:false}
    };
    assert.throws(()=>apply('fake',{home,uid:process.getuid(),run:mock.run,
      roleVerified:true,workspaceVerified:true}),/CANDIDATE_NAME_ALREADY_EXISTS/);
    assert.equal(mock.state.original.State.Running,true);
    assert.equal(mock.state.candidate.Id,id('f'));
    assert.equal(mock.state.violations,0);
  });
});

test('wrong guard identities deny rollback without stopping unrelated containers',()=>{
  local(home=>{
    const mock=dockerMock(home);
    apply('fake',{home,uid:process.getuid(),run:mock.run,
      roleVerified:true,workspaceVerified:true});
    const guard=path.join(home,'.atlas-observer-cutover','state.json');
    const item=JSON.parse(fs.readFileSync(guard,'utf8'));
    item.candidateId=id('f');
    fs.writeFileSync(guard,JSON.stringify(item)+'\n',{mode:0o600});
    const last=mock.state.transitions.length;
    assert.throws(()=>rollback('fake',{home,uid:process.getuid(),run:mock.run}),
      /ROLLBACK_IDENTITY_DRIFT/);
    assert.equal(mock.state.transitions.slice(last).some(x=>x.includes('stop')),false);
  });
});

test('Mac-only operator CLI refuses every cutover switch off owner Mac',()=>{
  if(process.platform==='darwin')return;
  const file=fileURLToPath(new URL('../scripts/atlas-observer-cutover-operator.mjs',import.meta.url));
  for(const arg of ['--preflight','--apply-readonly-observer','--rollback','--unknown']){
    const res=spawnSync(process.execPath,[file,arg],{
      encoding:'utf8',timeout:5000
    });
    assert.equal(res.status,2);
    const output=JSON.parse(res.stdout);
    assert.match(output.status,/^HOLD_/);
    assert.equal(output.cutoverVerified,false);
    assert.doesNotMatch(res.stdout,/owner-runtime-key|tunnel_012345|sk-/);
  }
});

test('source has no arbitrary shell, API or listener startup',()=>{
  const file=fileURLToPath(new URL('../scripts/atlas-observer-cutover-operator.mjs',import.meta.url));
  const src=fs.readFileSync(file,'utf8');
  for(const pattern of [
    /execSync\s*\(/,/shell:\s*true/,/\bfetch\s*\(/,
    /\bcreateServer\s*\(/,/https?\.request\s*\(/,
    /submitOrder\s*\(/,/spawnSync\s*\(\s*['"]sh['"]/,
  ])assert.doesNotMatch(src,pattern);
});
