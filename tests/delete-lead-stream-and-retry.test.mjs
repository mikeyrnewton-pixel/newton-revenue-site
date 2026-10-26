import test from 'node:test';
import assert from 'node:assert/strict';
import {onRequestPost as erase} from '../functions/api/delete-lead.js';

const BASE='https://newton-revenue-site.pages.dev/api/delete-lead';
const ADMIN='synthetic-private-owner-token-32-characters';
const LEAD='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const OLD='2026-10-25T10:00:00.000Z';
const env=(map=new Map())=>({ADMIN_TOKEN:ADMIN,LEADS:{
  async get(k,format){const raw=map.get(k);return !raw?null:format==='json'?JSON.parse(raw):raw;},
  async put(k,v){map.set(k,v);},
  async delete(k){map.delete(k);},
}});
const request=(body,headers={})=>new Request(BASE,{
  method:'POST',headers:{'Authorization':'Bearer '+ADMIN,'Content-Type':'application/json',...headers},
  body, ...(body instanceof ReadableStream?{duplex:'half'}:{})
});
const valid=()=>JSON.stringify({leadId:LEAD});
const erased=()=>JSON.stringify({version:1,erased:true,erasedAt:OLD});

test('Lost owner erasure success reply is safely acknowledged from a verified tombstone',async()=>{
  const map=new Map([
    ['erased:'+LEAD,erased()],
  ]);
  const res=await erase({request:request(valid()),env:env(map)});
  assert.equal(res.status,200);
  assert.deepEqual(await res.json(),{ok:true,deleted:true,reference:LEAD,alreadyDeleted:true});
  assert.equal(map.size,1,'repeat must never restore a lead, notice or receipt');
});

test('An absent lead without a valid existing tombstone is not falsely reported deleted',async()=>{
  for(const value of [null,'{}',JSON.stringify({version:99,erased:true,erasedAt:OLD}),
    JSON.stringify({version:1,erased:false,erasedAt:OLD}),
    JSON.stringify({version:1,erased:true,erasedAt:'not-time'})]){
    const map=new Map(value?[['erased:'+LEAD,value]]:[]);
    const r=await erase({request:request(valid()),env:env(map)});
    assert.equal(r.status,404,String(value));
    assert.equal((await r.json()).error,'Lead not found.');
  }
});

test('Authenticated streaming erasure rejects oversized upload before consuming unlimited bytes',async()=>{
  let pulls=0,cancels=0;
  const stream=new ReadableStream({
    pull(c){pulls++;c.enqueue(new Uint8Array(256).fill(0x41));},
    cancel(){cancels++;}
  },{highWaterMark:0});
  const map=new Map();
  const r=await erase({request:request(stream),env:env(map)});
  assert.equal(r.status,413);
  await Promise.resolve();
  assert.ok(pulls<=6,'erasure reader must stop at 1025th byte');
  assert.equal(cancels,1);
  assert.equal(map.size,0);
});

test('Oversized declared length blocks before touching the upload body',async()=>{
  let read=false;
  const q={
    headers:new Headers({'Authorization':'Bearer '+ADMIN,'Content-Type':'application/json','Content-Length':'9999'}),
    body:{getReader(){read=true;throw Error('should not access');}},
  };
  const r=await erase({request:q,env:env()});
  assert.equal(r.status,413);
  assert.equal(read,false);
});

test('A split valid JSON upload works and still requires an existing lead or tombstone',async()=>{
  const data=new TextEncoder().encode(valid());
  let i=0;
  const stream=new ReadableStream({
    pull(c){
      if(i>=data.length){c.close();return;}
      c.enqueue(data.subarray(i,i+1));
      i++;
    }
  });
  const map=new Map([['erased:'+LEAD,erased()]]);
  const r=await erase({request:request(stream,{'Content-Type':'application/json; charset=UTF-8'}),env:env(map)});
  assert.equal(r.status,200);
  assert.equal((await r.json()).alreadyDeleted,true);
});

test('Erasure rejects deceptive content types, malformed JSON and non-UTF8',async()=>{
  const invalidType=await erase({request:request(valid(),{'Content-Type':'text/plain; note=application/json'}),env:env()});
  assert.equal(invalidType.status,415);
  const badJson=await erase({request:request('{'),env:env()});
  assert.equal(badJson.status,400);
  const invalidUtf8=new ReadableStream({start(c){c.enqueue(Uint8Array.from([0xff]));c.close();}});
  const badEncoding=await erase({request:request(invalidUtf8),env:env()});
  assert.equal(badEncoding.status,400);
  const broken=new ReadableStream({pull(c){c.error(Error('synthetic upload abort'));}});
  const aborted=await erase({request:request(broken),env:env()});
  assert.equal(aborted.status,400);
});

test('Unauthorised requests never touch the erasure stream or lead store',async()=>{
  let touched=false;
  const req={
    headers:new Headers({'Content-Type':'application/json','Authorization':'Bearer WRONG'}),
    body:{getReader(){touched=true;throw Error('read forbidden');}}
  };
  const r=await erase({request:req,env:env()});
  assert.equal(r.status,401);
  assert.equal(touched,false);
});
