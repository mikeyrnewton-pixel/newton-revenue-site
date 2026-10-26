import test from 'node:test';
import assert from 'node:assert/strict';
import {onRequestGet as getLeads} from '../functions/api/leads.js';

const TOKEN='synthetic-private-token-at-least-32-characters';
const BASE='https://newton-revenue-site.pages.dev/api/leads';
const ID_A='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const ID_B='11111111-2222-4333-8444-555555555555';
const ID_C='66666666-7777-4888-8999-aaaaaaaaaaaa';
const when='2026-10-26T09:00:00.000Z';
const record=(id,createdAt=when)=>({
  id,createdAt,name:'FICTIONAL PRIVATE OWNER TEST',company:'EXAMPLE INVALID',
  email:'fictional@example.invalid',problem:'Synthetic test only',
  notification:{version:1,status:'pending'}
});
function fixture(values,opts={}) {
  const map=new Map(Object.entries(values));
  const keys=opts.keys||[...map.keys()].filter(k=>k.startsWith('lead:'));
  let reads=[],listed=0;
  const env={
    ADMIN_TOKEN:TOKEN,
    LEADS:{
      async list(arg){
        listed++;
        assert.equal(arg.prefix,'lead:');
        assert.equal(arg.limit,100);
        return opts.page||{keys:keys.map(name=>({name})),list_complete:true,cursor:''};
      },
      async get(key,format){
        reads.push(key);
        assert.equal(format,'json');
        if(opts.throwFor?.includes(key))throw Error('Synthetic read failure');
        return map.has(key)?map.get(key):null;
      }
    }
  };
  const request=(token=TOKEN)=>new Request(BASE,{
    headers:{Authorization:'Bearer '+token}
  });
  return {env,request,reads,listed:()=>listed};
}
test('Malformed stored entries never take down valid customer records or get deleted',async()=>{
  const a=record(ID_A);
  const wrong=record(ID_B);wrong.id=ID_A;
  const f=fixture({
    ['lead:'+ID_A]:a,
    ['lead:'+ID_B]:wrong,
    ['lead:'+ID_C]:{id:ID_C,createdAt:null},
  });
  const res=await getLeads({request:f.request(),env:f.env});
  assert.equal(res.status,200);
  const body=await res.json();
  assert.deepEqual(body.records,[a]);
  assert.equal(body.skippedInvalidRecords,2);
  assert.equal(body.dataIntegrityWarning,true);
  assert.equal(body.hasMore,false);
  assert.equal(f.listed(),1);
  assert.ok(!body.records.some(x=>x.id===ID_B||x.id===ID_C));
});
test('Invalid individual JSON and temporarily absent keys show warning not a false empty inbox',async()=>{
  const f=fixture({['lead:'+ID_A]:record(ID_A)}, {
    keys:['lead:'+ID_A,'lead:'+ID_B,'lead:'+ID_C],
    throwFor:['lead:'+ID_B],
  });
  const res=await getLeads({request:f.request(),env:f.env});
  const body=await res.json();
  assert.equal(res.status,200);
  assert.equal(body.records.length,1);
  assert.equal(body.skippedInvalidRecords,1);
  assert.equal(body.unavailableKeyCount,1);
  assert.equal(body.dataIntegrityWarning,true);
});
test('A private page with untrustworthy key labels is never queried by name',async()=>{
  const f=fixture({['lead:'+ID_A]:record(ID_A)},{
    keys:['lead:'+ID_A,'lead:../private-token','notice:'+ID_B,'lead:arbitrary'],
  });
  const res=await getLeads({request:f.request(),env:f.env});
  const b=await res.json();
  assert.equal(b.records.length,1);
  assert.equal(b.skippedInvalidRecords,3);
  assert.deepEqual(f.reads,['lead:'+ID_A,'notice:'+ID_A]);
});
test('Unverifiable notice state cannot claim that owner delivery succeeded',async()=>{
  const f=fixture({
    ['lead:'+ID_A]:record(ID_A),
    ['notice:'+ID_A]:{version:1,status:'everything-is-fine'}
  });
  const a=await getLeads({request:f.request(),env:f.env});
  const b=await a.json();
  assert.equal(b.records[0].notification.status,'pending');
  assert.equal(b.unverifiedNoticeCount,1);
  assert.equal(b.dataIntegrityWarning,true);
  const f2=fixture({['lead:'+ID_A]:record(ID_A)},{throwFor:['notice:'+ID_A]});
  const c=await getLeads({request:f2.request(),env:f2.env});
  const d=await c.json();
  assert.equal(d.records[0].notification.status,'pending');
  assert.equal(d.unverifiedNoticeCount,1);
});
test('Valid two-lead private page sorts newest first and returns no integrity warning',async()=>{
  const a=record(ID_A,'2026-10-25T09:00:00.000Z');
  const b=record(ID_B,'2026-10-26T09:00:00.000Z');
  const f=fixture({['lead:'+ID_A]:a,['lead:'+ID_B]:b});
  const r=await getLeads({request:f.request(),env:f.env});
  const body=await r.json();
  assert.equal(r.status,200);
  assert.deepEqual(body.records.map(x=>x.id),[ID_B,ID_A]);
  assert.equal(body.dataIntegrityWarning,false);
  assert.equal(body.skippedInvalidRecords,0);
  assert.equal(body.unavailableKeyCount,0);
});
test('Owner authentication is checked before any storage reads or pagination calls',async()=>{
  const f=fixture({['lead:'+ID_A]:record(ID_A)});
  const res=await getLeads({request:f.request('wrong'),env:f.env});
  assert.equal(res.status,401);
  assert.equal(f.listed(),0);
  assert.equal(f.reads.length,0);
});
test('Invalid page structure fails closed rather than pretending complete',async()=>{
  const f=fixture({},{page:{keys:'malformed',list_complete:true,cursor:''}});
  const r=await getLeads({request:f.request(),env:f.env});
  assert.equal(r.status,503);
  assert.match((await r.json()).error,/Invalid private storage page/);
});
