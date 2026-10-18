import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {evaluateLocalRouting} from '../scripts/task023-local-routing-preflight.mjs';

const script=path.resolve(import.meta.dirname,'..','scripts','task023-local-routing-preflight.mjs');
const fixtures=()=>({
  integration:{result:'LOCAL_INTEGRATION_READ_ONLY_COMPLETE',authorisation:'NO_EXTERNAL_NETWORK_NO_PAID_API_NO_CHANGES',checkedOnMac:true,activepiecesHealth:'HEALTH_HTTP_2XX_APP_ID_AND_WORKERS_UNVERIFIED'},
  providers:{result:'READ_ONLY_INVENTORY_COMPLETE',authorisation:'NO_PROVIDER_NETWORK_CALLS_NO_CHARGES',macRouterDeploymentVerified:false,localQwen:'LOCAL_PORT_OPEN_INFERENCE_NOT_PROVEN'},
  adoption:{taskId:'TASK-022',status:'READY_LOCAL_OFFLINE_BUILD_ADOPTED',assertions:{realCustomerDelivery:false,botsChanged:false,servicesInstalled:false,chargesIncurred:false}}
});
const setup=()=>fs.mkdtempSync(path.join(os.tmpdir(),'task023-routing-'));

test('allows only one existing offline Local Operator route',()=>{
  const result=evaluateLocalRouting(fixtures());
  assert.equal(result.status,'READY_ONE_OFFLINE_LOCAL_OPERATOR_ROUTE_ONLY');
  assert.equal(result.routes.localOperator.state,'VERIFIED_FOR_ONE_OFF_APPROVED_OFFLINE_BUILD');
  assert.match(result.routes.qwen.state,/HOLD/);
  assert.match(result.routes.activepieces.state,/HOLD/);
  assert.match(result.routes.beast.state,/HOLD/);
  assert.equal(result.assertions.workerStarted,false);
});

test('blocks non-Mac or missing adoption proof',()=>{
  const nonMac=fixtures();nonMac.integration.checkedOnMac=false;
  assert.equal(evaluateLocalRouting(nonMac).status,'BLOCKED_TARGET_RUNTIME_PROOF');
  const blocked=fixtures();blocked.adoption.status='BLOCKED_MAC_ADOPTION';
  assert.ok(evaluateLocalRouting(blocked).issues.some(x=>x.code==='ADOPTION_RECEIPT'));
});

test('an open Qwen port or healthy Activepieces endpoint never authorises execution',()=>{
  const result=evaluateLocalRouting(fixtures());
  assert.equal(result.routes.qwen.state,'HOLD_PORT_ONLY_INFERENCE_NOT_PROVEN');
  assert.equal(result.routes.activepieces.state,'HOLD_HEALTH_ONLY_FLOW_AND_WORKERS_UNVERIFIED');
  assert.equal(result.assertions.modelCalled,false);
  assert.equal(result.assertions.flowRun,false);
});

test('rejects secret-bearing fields and unsafe adoption assertions',()=>{
  const secret=fixtures();secret.providers.apiKey='not-a-real-key';
  assert.throws(()=>evaluateLocalRouting(secret),/forbidden secret field/);
  const unsafe=fixtures();unsafe.adoption.assertions.botsChanged=true;
  assert.ok(evaluateLocalRouting(unsafe).issues.some(x=>x.code==='ADOPTION_BOUNDARY'));
});

test('CLI writes a private preflight and refuses loose or symlinked input',()=>{
  const root=setup();
  try{
    const data=fixtures();const paths={};
    for(const key of ['integration','providers','adoption']){
      paths[key]=path.join(root,`${key}.json`);fs.writeFileSync(paths[key],JSON.stringify(data[key]),{mode:0o600});
    }
    const output=path.join(root,'private','preflight.json');
    let run=spawnSync(process.execPath,[script,'--integration',paths.integration,'--providers',paths.providers,'--adoption',paths.adoption,'--output',output],{encoding:'utf8'});
    assert.equal(run.status,0,run.stderr);
    assert.equal(JSON.parse(fs.readFileSync(output,'utf8')).status,'READY_ONE_OFFLINE_LOCAL_OPERATOR_ROUTE_ONLY');
    assert.equal(fs.statSync(output).mode&0o777,0o600);
    fs.chmodSync(paths.providers,0o644);
    run=spawnSync(process.execPath,[script,'--integration',paths.integration,'--providers',paths.providers,'--adoption',paths.adoption,'--output',output],{encoding:'utf8'});
    assert.notEqual(run.status,0);assert.match(run.stderr,/permissions/);
    fs.chmodSync(paths.providers,0o600);const actual=path.join(root,'provider-actual.json');fs.renameSync(paths.providers,actual);fs.symlinkSync(actual,paths.providers);
    run=spawnSync(process.execPath,[script,'--integration',paths.integration,'--providers',paths.providers,'--adoption',paths.adoption,'--output',output],{encoding:'utf8'});
    assert.notEqual(run.status,0);assert.match(run.stderr,/non-symlink/);
  }finally{fs.rmSync(root,{recursive:true,force:true})}
});

test('unknown options cannot start models, flows or workers',()=>{
  const root=setup();
  try{
    const data=fixtures();const paths={};
    for(const key of ['integration','providers','adoption']){paths[key]=path.join(root,`${key}.json`);fs.writeFileSync(paths[key],JSON.stringify(data[key]),{mode:0o600})}
    for(const flag of ['--start-qwen','--run-flow','--start-worker']){
      const run=spawnSync(process.execPath,[script,'--integration',paths.integration,'--providers',paths.providers,'--adoption',paths.adoption,flag,'yes'],{encoding:'utf8'});
      assert.notEqual(run.status,0);assert.match(run.stderr,/Unknown option/);
    }
  }finally{fs.rmSync(root,{recursive:true,force:true})}
});
