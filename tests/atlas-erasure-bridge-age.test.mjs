import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost as erase } from '../functions/api/delete-lead.js';

// Integration regression: the combined branch must preserve PR43's
// lost-response erasure freshness guard without loosening PR45's strict
// media-type/bounded-request checks. All records here are fictional.
const id = 'eeeeeeee-bbbb-4ccc-8ddd-aaaaaaaaaaaa';
const token = 'FICTIONAL-OWNER-SECRET-NEVER-REAL-987654321';
const uri = 'https://newton-revenue-site.pages.dev/api/delete-lead';
const call = marker => {
  const read = [], writes = [];
  const kv = {
    async get(key) {
      read.push(key);
      return key === 'lead:' + id ? null
        : key === 'erased:' + id ? marker : null;
    },
    async put() { writes.push('put'); },
    async delete() { writes.push('delete'); },
  };
  return {
    kv, read, writes,
    request: new Request(uri, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({leadId: id}),
    }),
  };
};
async function status(marker) {
  const f = call(marker);
  const reply = await erase({request:f.request,env:{LEADS:f.kv,ADMIN_TOKEN:token}});
  assert.deepEqual(f.read,['lead:' + id, 'erased:' + id]);
  assert.deepEqual(f.writes, [],'a missing lead must never cause mutation');
  return { status:reply.status, body:await reply.json() };
}
const valid = date => ({
  version:1, erased:true, erasedAt:date.toISOString(),
});

test('genuine recent erasure marker acknowledges a lost owner HTTP response',async()=>{
  const r=await status(valid(new Date(Date.now()-30000)));
  assert.equal(r.status,200);
  assert.deepEqual(r.body,{
    ok:true,deleted:true,reference:id,alreadyDeleted:true,
  });
});

test('freshness guard refuses absence, malformed and extra marker properties',async()=>{
  for(const x of [
    null, '', [], 42, 'true', {},
    {version:1, erased:true},
    {version:2, erased:true,erasedAt:new Date().toISOString()},
    {version:1, erased:false,erasedAt:new Date().toISOString()},
    {...valid(new Date()),debug:'leak'},
    {...valid(new Date()),reference:id},
    {...valid(new Date()),erasedAt:'yesterday'},
  ]){
    const r=await status(x);
    assert.equal(r.status,404,JSON.stringify(x));
  }
});

test('expired tombstones do not silently claim a completed erasure',async()=>{
  const old=await status(valid(new Date(Date.now() - 31*24*60*60*1000)));
  assert.equal(old.status,404);
});

test('future marker beyond five-minute clock tolerance fails closed',async()=>{
  const future=await status(valid(new Date(Date.now() + 6*60*1000)));
  assert.equal(future.status,404);
});

test('non-canonical timestamp representations cannot forge server tombstone',async()=>{
  const canonical=new Date(Date.now()-60000).toISOString();
  for(const other of [
    canonical.replace('.000Z','Z'),
    canonical.replace('Z','+00:00'),
    canonical.replace('T',' '),
    'not-a-time',
  ]) {
    if(other===canonical) continue;
    const r=await status({version:1,erased:true,erasedAt:other});
    assert.equal(r.status,404);
  }
});

test('erasure replay still rejects non-JSON content-type before reading KV',async()=>{
  let calls=0;
  const env={
    ADMIN_TOKEN:token,
    LEADS: {get:async()=>{calls++;throw Error('should not read');},
      put:async()=>{},delete:async()=>{}},
  };
  const req = new Request(uri,{
    method:'POST',
    headers: {Authorization:'Bearer '+token,'Content-Type':'application/json-patch+json'},
    body:JSON.stringify({leadId:id}),
  });
  const response=await erase({request:req,env});
  assert.equal(response.status,415);
  assert.equal(calls,0);
});
