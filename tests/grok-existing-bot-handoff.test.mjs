import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {buildExistingBotHandoff} from '../scripts/grok-existing-bot-handoff.mjs';

const script=path.resolve(import.meta.dirname,'..','scripts','grok-existing-bot-handoff.mjs');
const fixture=()=>({
  schemaVersion:1,
  taskId:'TASK-021',
  existingBot:{provider:'GROK',label:'Existing owner bot',controlUrl:'https://grok.com/c/example-existing-bot',authenticatedByOwner:true},
  objective:'Update the named existing repository artifact using only the canonical queue requirements.',
  artifactPath:'docs/task-021-result.md',
  acceptanceChecks:['Run the existing focused test suite and record the result','Save one changed artifact and name one remaining blocker']
});
const setup=()=>fs.mkdtempSync(path.join(os.tmpdir(),'grok-handoff-'));

test('builds an unsent handoff for an owner-authenticated existing bot',()=>{
  const result=buildExistingBotHandoff(fixture());
  assert.equal(result.status,'READY_FOR_OWNER_REVIEW_UNSENT');
  assert.equal(result.assertions.botCreated,false);
  assert.equal(result.assertions.messageSent,false);
  assert.match(result.markdown,/Existing Grok Bot Handoff/);
  assert.match(result.markdown,/No action has been sent or performed/);
});

test('blocks when an authenticated existing bot or control URL is missing',()=>{
  const unauthenticated=fixture();unauthenticated.existingBot.authenticatedByOwner=false;
  assert.throws(()=>buildExistingBotHandoff(unauthenticated),/owner-authenticated existing bot/);
  const missing=fixture();delete missing.existingBot.controlUrl;
  assert.throws(()=>buildExistingBotHandoff(missing),/controlUrl/);
});

test('rejects credentials, query secrets and non-official control hosts',()=>{
  for(const url of ['https://user:pass@grok.com/c/example','https://grok.com/c/example?token=abc','https://example.com/grok']){
    const doc=fixture();doc.existingBot.controlUrl=url;
    assert.throws(()=>buildExistingBotHandoff(doc));
  }
  const doc=fixture();doc.objective='Use API key abc123 to update the artifact';
  assert.throws(()=>buildExistingBotHandoff(doc),/forbidden/);
});

test('rejects consequential or externally directed actions',()=>{
  for(const objective of ['Publish the result publicly','Contact a prospect','Create a new bot','Submit an application','Spend money on credits']){
    const doc=fixture();doc.objective=objective;
    assert.throws(()=>buildExistingBotHandoff(doc),/forbidden/);
  }
});

test('CLI writes a private markdown brief and refuses loose or symlinked input',()=>{
  const root=setup();
  try{
    const input=path.join(root,'input.json');
    const output=path.join(root,'private','handoff.md');
    fs.writeFileSync(input,JSON.stringify(fixture()),{mode:0o600});
    let run=spawnSync(process.execPath,[script,'--input',input,'--output',output],{encoding:'utf8'});
    assert.equal(run.status,0,run.stderr);
    assert.equal(fs.statSync(output).mode&0o777,0o600);
    assert.match(fs.readFileSync(output,'utf8'),/READY FOR OWNER REVIEW — UNSENT/);
    fs.chmodSync(input,0o644);
    run=spawnSync(process.execPath,[script,'--input',input,'--output',output],{encoding:'utf8'});
    assert.notEqual(run.status,0);assert.match(run.stderr,/permissions/);
    fs.chmodSync(input,0o600);const actual=path.join(root,'actual.json');fs.renameSync(input,actual);fs.symlinkSync(actual,input);
    run=spawnSync(process.execPath,[script,'--input',input,'--output',output],{encoding:'utf8'});
    assert.notEqual(run.status,0);assert.match(run.stderr,/non-symlink/);
  }finally{fs.rmSync(root,{recursive:true,force:true})}
});

test('unknown options cannot create or contact a bot',()=>{
  const root=setup();
  try{
    const input=path.join(root,'input.json');fs.writeFileSync(input,JSON.stringify(fixture()),{mode:0o600});
    for(const flag of ['--create-bot','--send-message']){
      const run=spawnSync(process.execPath,[script,'--input',input,flag,'yes'],{encoding:'utf8'});
      assert.notEqual(run.status,0);assert.match(run.stderr,/Unknown option/);
    }
  }finally{fs.rmSync(root,{recursive:true,force:true})}
});
