import test from "node:test";
import assert from "node:assert/strict";
import {onRequestPost as submit} from "../functions/api/enquiry.js";

const ORIGIN="https://newton-revenue.pages.dev";
const SUBMISSION="44444444-5555-4666-8777-888888888888";

class MemoryKV {
  constructor(){this.values=new Map();this.puts=[];}
  async get(key,format){
    const value=this.values.get(key);
    if(value==null)return null;
    return format==="json"?JSON.parse(value):value;
  }
  async put(key,value,options){
    assert.ok(options?.expirationTtl);
    this.puts.push(key);
    this.values.set(key,value);
  }
}

const request=()=>new Request(ORIGIN+"/api/enquiry",{
  method:"POST",
  headers:{"Content-Type":"application/json",Origin:ORIGIN},
  body:JSON.stringify({
    submissionId:SUBMISSION,
    name:"FICTIONAL PERSON",
    company:"EXAMPLE INVALID",
    email:"integration@example.invalid",
    problem:"Synthetic PR30 and PR43 compatibility fixture",
    contactPermission:true,
    source:"enquiry-check",
    channel:"direct",
  }),
});

test("PR30 intake preserves PR43 lawful-erasure retry hold",async()=>{
  const kv=new MemoryKV();
  kv.values.set("erased-submission:"+SUBMISSION,JSON.stringify({
    version:1,erased:true,erasedAt:"2026-10-26T10:00:00.000Z",
  }));

  const response=await submit({
    request:request(),
    env:{LEADS:kv},
    waitUntil(){},
  });

  assert.equal(response.status,410);
  assert.deepEqual(await response.json(),{
    error:"This enquiry was erased. Refresh before submitting a new enquiry.",
  });
  assert.deepEqual(kv.puts,[]);
  assert.equal([...kv.values.keys()].some(key=>key.startsWith("lead:")),false);
});

test("PR30 CRM fields remain present when no erasure hold exists",async()=>{
  const kv=new MemoryKV();
  const response=await submit({
    request:request(),
    env:{LEADS:kv},
    waitUntil(){},
  });

  assert.equal(response.status,201);
  const body=await response.json();
  const stored=await kv.get("lead:"+body.reference,"json");
  assert.equal(stored.submissionId,SUBMISSION);
  assert.equal(stored.contactPermission,true);
  assert.equal(stored.contactPermissionCapturedAt,stored.createdAt);
  assert.equal(stored.marketingConsent,false);
  assert.equal(stored.source,"enquiry-check");
  assert.equal(stored.channel,"direct");
  assert.equal(kv.puts.filter(key=>key.startsWith("lead:")).length,1);
});
