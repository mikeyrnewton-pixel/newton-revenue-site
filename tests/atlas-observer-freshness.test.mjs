import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectPrivateObserverSnapshot,OBSERVER_FRESHNESS_BUDGET_SECONDS}
  from '../scripts/atlas-observer-freshness.mjs';

const NOW=1_800_000_000_000;
const dir=(mode=0o700,uid=501)=>({uid,mode,isDirectory:()=>true,isFile:()=>false});
const file=(age=20,mode=0o600,uid=501,size=454)=>({
  uid,mode,size,mtimeMs:NOW-age*1000,isFile:()=>true,isDirectory:()=>false,
});
const fixture=({d=dir(),f=file(),home='/Users/fixture',uid=501,nowMs=NOW}={})=>{
  const seen=[];
  const result=inspectPrivateObserverSnapshot({home,uid,nowMs,lstat:path=>{
    seen.push(path);
    if(path==='/Users/fixture/.atlas-observer')return d;
    if(path==='/Users/fixture/.atlas-observer/status.json')return f;
    throw Error('Unexpected probe path');
  }});
  return {result,seen};
};
test('recent private file is timestamp evidence, never automatic cadence proof',()=>{
  const {result,seen}=fixture();
  assert.equal(result.state,'RECENT_PRIVATE_SNAPSHOT_PRESENT');
  assert.equal(result.ageSeconds,20);
  assert.equal(result.automaticRefreshVerified,false);
  assert.equal(result.privateContentsRead,false);
  assert.equal(result.writesPerformed,false);
  assert.equal(seen.length,2);
  assert.ok(Object.isFrozen(result));
  assert.doesNotMatch(JSON.stringify(result),/Users|fixture|status\\.json|token|secret/i);
});
test('stale boundary is explicit and does not claim uptime',()=>{
  assert.equal(OBSERVER_FRESHNESS_BUDGET_SECONDS,180);
  assert.equal(fixture({f:file(180)}).result.state,'RECENT_PRIVATE_SNAPSHOT_PRESENT');
  assert.equal(fixture({f:file(181)}).result.state,'STALE_PRIVATE_SNAPSHOT');
  assert.equal(fixture({f:file(181)}).result.ageSeconds,181);
});
test('absent, unreadable and invalid identities cannot imply freshness',()=>{
  assert.equal(inspectPrivateObserverSnapshot().state,'NOT_VERIFIED');
  assert.equal(fixture({uid:0}).result.state,'NOT_VERIFIED');
  assert.equal(fixture({home:'relative'}).result.state,'NOT_VERIFIED');
  const missing=inspectPrivateObserverSnapshot({home:'/tmp',uid:501,nowMs:NOW,
    lstat:()=>{throw Error('missing')}});
  assert.equal(missing.state,'NOT_VERIFIED');
});
test('symlinks, unsafe permissions, owner mismatch and wrong file type halt',()=>{
  for(const x of [
    {d:dir(0o755)},{f:file(20,0o644)},{d:dir(0o700,502)},
    {f:file(20,0o600,502)},{f:file(20,0o600,501,0)},
    {f:file(20,0o600,501,100000)},
    {f:{...file(),isFile:()=>false}},
    {d:{...dir(),isDirectory:()=>false}},
  ])assert.equal(fixture(x).result.state,'SECURITY_OR_FILETYPE_HOLD');
});
test('future timestamps and invalid mtime halt instead of looking fresh',()=>{
  assert.equal(fixture({f:file(-5)}).result.state,'CLOCK_OR_TIMESTAMP_HOLD');
  assert.equal(fixture({f:{...file(),mtimeMs:NaN}}).result.state,'CLOCK_OR_TIMESTAMP_HOLD');
});
