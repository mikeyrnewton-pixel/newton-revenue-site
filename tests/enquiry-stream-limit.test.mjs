import test from 'node:test';
import assert from 'node:assert/strict';
import {onRequestPost as submit} from '../functions/api/enquiry.js';

const endpoint='https://newton-revenue-site.pages.dev/api/enquiry';
const origin='https://newton-revenue-site.pages.dev';
const sent=({body,headers={}})=>new Request(endpoint,{
  method:'POST',headers:{'Content-Type':'application/json',Origin:origin,...headers},
  body,
  ...(body instanceof ReadableStream?{duplex:'half'}:{})
});
const kv=()=>({
  records:new Map(),
  async get(k,mode){return this.records.has(k)?(mode==='json'?JSON.parse(this.records.get(k)):this.records.get(k)):null;},
  async put(k,v){this.records.set(k,v);}
});
const fixture=()=>({
  name:'FICTIONAL CUSTOMER',company:'FICTIONAL BUSINESS',
  email:'qa@example.invalid',problem:'Synthetic form security and byte-boundary test',
  contactPermission:true,website:''
});
const environment=()=>({LEADS:kv()});

test('streamed multi-chunk UTF-8 valid JSON is accepted with same data and consent',async()=>{
  const payload=JSON.stringify({...fixture(),name:'Fictional Café'});
  const bytes=new TextEncoder().encode(payload);
  let index=0;
  const stream=new ReadableStream({
    pull(controller){
      if(index>=bytes.length){controller.close();return;}
      controller.enqueue(bytes.subarray(index,index+1));
      index++;
    }
  });
  const env=environment();
  const r=await submit({request:sent({body:stream}),env});
  assert.equal(r.status,201);
  assert.equal((await r.json()).received,true);
  const record=JSON.parse([...env.LEADS.records.values()][0]);
  assert.equal(record.name,'Fictional Café');
  assert.equal(record.contactPermission,true);
});

test('oversized streaming request fails before reading the full attacker stream',async()=>{
  let readCount=0,cancelCount=0;
  const body=new ReadableStream({
    pull(controller){readCount++;controller.enqueue(new Uint8Array(2048).fill(0x41));},
    cancel(){cancelCount++;}
  },{highWaterMark:0});
  const env=environment();
  const r=await submit({request:sent({body}),env});
  assert.equal(r.status,413);
  assert.ok(readCount<=6,'must stop at the first chunk above 8192 bytes');
  await Promise.resolve();
  assert.equal(cancelCount,1);
  assert.equal(env.LEADS.records.size,0);
});

test('declared oversized Content-Length short-circuits before getReader is called',async()=>{
  let accessed=false;
  const request={
    url:endpoint,
    headers:new Headers({'Content-Type':'application/json','Content-Length':'9999999',Origin:origin}),
    body:{getReader(){accessed=true;throw Error('should not be read');}}
  };
  const r=await submit({request,env:environment()});
  assert.equal(r.status,413);
  assert.equal(accessed,false);
});

test('raw 8192 bytes is bounded but malformed JSON returns 400; 8193 returns 413',async()=>{
  const env=environment();
  const r1=await submit({request:sent({body:' '.repeat(8192)}),env});
  assert.equal(r1.status,400);
  const r2=await submit({request:sent({body:' '.repeat(8193)}),env});
  assert.equal(r2.status,413);
  assert.equal(env.LEADS.records.size,0);
});

test('invalid UTF-8 and broken input stream fail without retaining any lead',async()=>{
  const env=environment();
  const invalid=new ReadableStream({
    start(controller){controller.enqueue(Uint8Array.from([0xff]));controller.close();}
  });
  const bad=await submit({request:sent({body:invalid}),env});
  assert.equal(bad.status,400);
  const broken=new ReadableStream({
    pull(controller){controller.error(Error('simulated network abort'));}
  });
  const cut=await submit({request:sent({body:broken}),env});
  assert.equal(cut.status,400);
  assert.equal(env.LEADS.records.size,0);
});

test('origin denial and invalid content type never read any stream',async()=>{
  const env=environment();
  const attempted=new ReadableStream({
    pull(){throw Error('should never be read');}
  },{highWaterMark:0});
  const badOrigin=await submit({request:sent({body:attempted,headers:{Origin:'https://evil.example'}}),env});
  assert.equal(badOrigin.status,403);
  const wrongType=await submit({request:sent({body:'{"fake":"yes"}',headers:{'Content-Type':'text/plain'}}),env});
  assert.equal(wrongType.status,415);
  assert.equal(env.LEADS.records.size,0);
});


test('only canonical application/json media declarations may reach the request body',async()=>{
  const invalidTypes=[
    'application/jsonp',
    'text/application/json',
    'application/problem+json',
    'application/json; charset=iso-8859-1',
    'application/json; charset=utf-8; boundary=x',
    'application/json, application/json',
  ];
  for(const contentType of invalidTypes){
    let reads=0;
    const body=new ReadableStream({
      pull(controller){
        reads++;
        controller.enqueue(new TextEncoder().encode(JSON.stringify(fixture())));
        controller.close();
      }
    },{highWaterMark:0});
    const env=environment();
    const response=await submit({
      request:sent({body,headers:{'Content-Type':contentType}}),env,
    });
    assert.equal(response.status,415,contentType);
    assert.equal(reads,0,contentType+' must be rejected before stream access');
    assert.equal(env.LEADS.records.size,0);
  }

  for(const contentType of ['application/json','Application/JSON; Charset="UTF-8"']){
    const env=environment();
    const response=await submit({
      request:sent({
        body:JSON.stringify(fixture()),
        headers:{'Content-Type':contentType},
      }),
      env,
    });
    assert.equal(response.status,201,contentType);
    assert.equal(env.LEADS.records.size,1);
  }
});


test('duplicate JSON object keys are rejected before any KV state is created',async()=>{
  const base=JSON.stringify(fixture());
  const cases=[
    base.replace('"name":"FICTIONAL CUSTOMER"',
      '"name":"FIRST VALUE","name":"LAST VALUE"'),
    base.replace('"name":"FICTIONAL CUSTOMER"',
      '"name":"FIRST VALUE","na\\u006de":"ESCAPED DUPLICATE"'),
    base.replace('"website":""',
      '"website":"bot bait","website":""'),
    base.replace('"contactPermission":true',
      '"contactPermission":false,"contactPermission":true'),
    base.slice(0,-1)+',"metadata":{"source":"first","source":"second"}}',
  ];
  for(const body of cases){
    const env=environment();
    const response=await submit({request:sent({body}),env});
    assert.equal(response.status,400,body);
    assert.equal((await response.json()).error,'Ambiguous submission.');
    assert.equal(env.LEADS.records.size,0,'ambiguous JSON must never reach KV');
  }
});
