import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {verifyStage,probeDashboard,writeReceipt,startVerifiedStage} from '../scripts/sales-desk-safe-start.mjs';

const setup=()=>fs.mkdtempSync(path.join(os.tmpdir(),'atlas-safe-start-test-'));
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
function fixture(root,cliContent="console.log('fixture')\n"){
  const stage=path.join(root,'stage');fs.mkdirSync(stage,{mode:0o700});
  const values={
    'cli.mjs':cliContent,
    'model.mjs':"export const fixture=true\n",
    'store.mjs':"export const fixture=true\n",
    'package.json':JSON.stringify({name:'atlas-sales-desk',version:'1.2.0',scripts:{start:'node cli.mjs serve'}})+'\n'
  };
  fs.writeFileSync(path.join(stage,'.atlas-sales-desk-managed'),'fixture-marker\n',{mode:0o600});
  for(const [name,value] of Object.entries(values))fs.writeFileSync(path.join(stage,name),value,{mode:0o600});
  return {stage,expected:{marker:'fixture-marker\n',files:Object.fromEntries(Object.entries(values).map(([name,value])=>[name,hash(value)]))}};
}
const listen=handler=>new Promise(resolve=>{const server=http.createServer(handler);server.listen(0,'127.0.0.1',()=>resolve(server))});

test('accepts only the complete fingerprint-pinned stage',()=>{
  const root=setup();try{
    const {stage,expected}=fixture(root);
    const result=verifyStage(stage,expected);assert.equal(result.stageDir,stage);
    fs.appendFileSync(path.join(stage,'cli.mjs'),'tampered\n');
    assert.throws(()=>verifyStage(stage,expected),/fingerprint mismatch/);
  }finally{fs.rmSync(root,{recursive:true,force:true})}
});

test('refuses a symlinked stage before reading package files',()=>{
  const root=setup();try{
    const {stage,expected}=fixture(root),link=path.join(root,'stage-link');fs.symlinkSync(stage,link,'dir');
    assert.throws(()=>verifyStage(link,expected),/not a symlink/);
  }finally{fs.rmSync(root,{recursive:true,force:true})}
});

test('health probe distinguishes Sales Desk from a foreign local listener',async()=>{
  const good=await listen((request,response)=>{response.writeHead(200,{'content-type':'text/html'});response.end('<title>ATLAS Sales Desk</title><p>Local-only, read-only cockpit</p>')});
  const bad=await listen((request,response)=>{response.writeHead(200);response.end('different app')});
  try{
    assert.equal(await probeDashboard({port:good.address().port}),'VERIFIED_SALES_DESK');
    assert.equal(await probeDashboard({port:bad.address().port}),'FOREIGN_OR_UNVERIFIED_LISTENER');
  }finally{await Promise.all([new Promise(r=>good.close(r)),new Promise(r=>bad.close(r))])}
});

test('writes a private atomic startup receipt without changing a service',()=>{
  const root=setup();try{
    const output=path.join(root,'private','receipt.json');writeReceipt(output,{status:'FIXTURE'});
    assert.equal(JSON.parse(fs.readFileSync(output,'utf8')).status,'FIXTURE');
    assert.equal(fs.statSync(path.dirname(output)).mode&0o777,0o700);
    assert.equal(fs.statSync(output).mode&0o777,0o600);
  }finally{fs.rmSync(root,{recursive:true,force:true})}
});

test('starts a verified fixture only after a closed-port check and proves the listener',async()=>{
  const root=setup();let pid;
  try{
    const reservation=await listen((request,response)=>response.end());
    const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
    const cli=`import http from 'node:http';\nhttp.createServer((request,response)=>{response.writeHead(200,{'content-type':'text/html'});response.end('<title>ATLAS Sales Desk</title><p>Local-only, read-only cockpit</p>')}).listen(Number(process.env.ATLAS_TEST_PORT),'127.0.0.1');\n`;
    const {stage,expected}=fixture(root,cli),outputDir=path.join(root,'output');
    const result=await startVerifiedStage({stageDir:stage,outputDir,port,expected,environment:{...process.env,ATLAS_TEST_PORT:String(port)}});
    pid=result.pid;assert.equal(result.status,'STARTED');assert.equal(await probeDashboard({port}),'VERIFIED_SALES_DESK');
    assert.equal(fs.statSync(path.join(outputDir,'SALES_DESK_LOCAL.log')).mode&0o777,0o600);
  }finally{
    if(pid)try{process.kill(pid,'SIGTERM')}catch{}
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('CLI fails closed on non-Mac hosts before creating output',()=>{
  if(process.platform==='darwin')return;
  const root=setup();try{
    const script=path.resolve(import.meta.dirname,'..','scripts','sales-desk-safe-start.mjs');
    const output=path.join(root,'out','receipt.json');
    const result=spawnSync(process.execPath,[script,'--stage-dir',path.join(root,'missing'),'--output',output],{encoding:'utf8'});
    assert.notEqual(result.status,0);assert.match(result.stderr,/Mac-only/);assert.equal(fs.existsSync(output),false);
  }finally{fs.rmSync(root,{recursive:true,force:true})}
});
