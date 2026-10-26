import test from 'node:test';
import assert from 'node:assert/strict';
import {onRequestGet as leads} from '../functions/api/leads.js';

// Private owner pagination must never assert completion without evidence.
// Fake Cloudflare KV only: no personal/customer data, credentials or writes.
const token='synthetic-owner-token-longer-than-24-characters';
const base='https://newton-revenue-site.pages.dev/api/leads';
function setup(page,after=''){
  let listed=0,read=0;
  const LEADS={
    async list(opts){
      listed++;
      assert.equal(opts.prefix,'lead:');
      assert.equal(opts.limit,100);
      if(after)assert.equal(opts.cursor,after);
      else assert.equal(opts.cursor,undefined);
      return page;
    },
    async get(){read++;return null;},
  };
  const request=new Request(base+(after?'?cursor='+encodeURIComponent(after):''),{
    headers:{Authorization:'Bearer '+token},
  });
  return {LEADS,request,listed:()=>listed,read:()=>read};
}
const invoke=async(page,cursor='')=>{
  const s=setup(page,cursor);
  const r=await leads({request:s.request,env:{ADMIN_TOKEN:token,LEADS:s.LEADS}});
  assert.equal(s.listed(),1);
  return {status:r.status,body:await r.json(),getCalls:s.read()};
};

test('owner gets bounded valid continuation cursor and truthful incomplete state',async()=>{
  const x=await invoke({keys:[],list_complete:false,cursor:'page_02-OK=/+'});
  assert.equal(x.status,200);
  assert.equal(x.body.hasMore,true);
  assert.equal(x.body.nextCursor,'page_02-OK=/+');
  assert.deepEqual(x.body.records,[]);
});

test('terminal page never leaks a stale or misleading continuation cursor',async()=>{
  const x=await invoke({keys:[],list_complete:true,cursor:'stale_cursor'});
  assert.equal(x.status,200);
  assert.equal(x.body.hasMore,false);
  assert.equal(x.body.nextCursor,null);
});

test('KV repeating incoming cursor cannot trap private owner in endless pagination',async()=>{
  const x=await invoke({keys:[],list_complete:false,cursor:'repeat-123'},'repeat-123');
  assert.equal(x.status,503);
  assert.match(x.body.error,/Invalid private storage page/);
  assert.equal(x.getCalls,0);
});

test('malformed and missing incomplete-page cursors fail without returning records',async()=>{
  for(const cursor of ['',null,123,'bad?cursor','A'.repeat(1025)]){
    const x=await invoke({keys:[],list_complete:false,cursor});
    assert.equal(x.status,503,'unsafe cursor: '+String(cursor).slice(0,12));
    assert.equal(x.getCalls,0);
    assert.ok(!Object.hasOwn(x.body,'records'));
  }
});

test('missing complete marker is not accepted as a zero-leads response',async()=>{
  for(const page of [{keys:[],cursor:'next'},null,{}, {keys:'not-an-array',list_complete:true}]){
    const x=await invoke(page);
    assert.equal(x.status,503);
    assert.equal(x.getCalls,0);
  }
});

test('invalid owner-supplied cursor and missing token are rejected before KV access',async()=>{
  let count=0;
  const LEADS={list:async()=>{count++;throw Error('must not be reached')},
    get:async()=>null};
  const env={LEADS,ADMIN_TOKEN:token};
  const invalid=new Request(base+'?cursor=%3Cscript%3E',{headers:{Authorization:'Bearer '+token}});
  const unauthenticated=new Request(base+'?cursor=normal');
  assert.equal((await leads({request:invalid,env})).status,400);
  assert.equal((await leads({request:unauthenticated,env})).status,401);
  assert.equal(count,0);
});
