import test from "node:test";
import assert from "node:assert/strict";
import {once} from "node:events";
import {request} from "node:http";
import {
  CANARY_REPLY,CANARY_TOOL,DEFAULT_HOST,DEFAULT_PORT,
  handleMcp,createCanaryServer,startCanary,
} from "../scripts/atlas-mcp-tunnel-canary.mjs";

function call(method,params={},id=1){
  return handleMcp({jsonrpc:"2.0",id,method,params});
}
async function withServer(fn){
  const server=createCanaryServer();
  server.listen(0,"127.0.0.1");
  await once(server,"listening");
  try{
    const port=server.address().port;
    await fn(port);
  }finally{
    await new Promise((res,rej)=>
      server.close(err=>err?rej(err):res()));
  }
}
async function http(port,{method="POST",url="/mcp",headers={},body=null}={}){
  return await new Promise((resolve,reject)=>{
    const req=request({
      hostname:"127.0.0.1",port,path:url,method,
      headers:{...(body===null?{}:{"content-type":"application/json"}),...headers},
    },res=>{
      const chunks=[];
      res.on("data",b=>chunks.push(b));
      res.on("end",()=>{
        const raw=Buffer.concat(chunks).toString();
        let data=null;
        if(raw){try{data=JSON.parse(raw)}catch{}}
        resolve({status:res.statusCode,headers:res.headers,raw,data});
      });
    });
    req.on("error",reject);
    if(body!==null)req.write(typeof body==="string"?body:JSON.stringify(body));
    req.end();
  });
}
test("MCP initialize negotiates stateless tool-only capabilities",()=>{
  const result=call("initialize",{
    protocolVersion:"2025-03-26",
    clientInfo:{name:"test",version:"1"},
    capabilities:{},
  });
  assert.equal(result.result.protocolVersion,"2025-03-26");
  assert.equal(result.result.serverInfo.name,"atlas-tunnel-canary");
  assert.deepEqual(result.result.capabilities,{tools:{listChanged:false}});
  assert.equal(JSON.stringify(result).includes("sk-"),false);
  assert.equal(call("initialize",{protocolVersion:"unsupported"}).result.protocolVersion,"2025-03-26");
  assert.equal(call("initialize",{protocolVersion:"2025-06-18"}).result.protocolVersion,"2025-06-18");
});
test("single allowlisted MCP tool has fixed response and no parameters",()=>{
  const listed=call("tools/list");
  assert.deepEqual(listed.result.tools.map(t=>t.name),[CANARY_TOOL]);
  assert.equal(listed.result.tools[0].inputSchema.additionalProperties,false);
  const ok=call("tools/call",{name:CANARY_TOOL,arguments:{}});
  assert.equal(ok.result.content[0].text,CANARY_REPLY);
  assert.equal(ok.result.isError,false);
  assert.equal(ok.jsonrpc,"2.0");
  assert.equal(call("tools/call",{name:"ap_publish_flow"}).error.code,-32602);
  assert.equal(call("tools/call",{name:"run_shell"}).error.code,-32602);
  assert.equal(call("tools/call",{name:CANARY_TOOL,arguments:{command:"id"}}).error.code,-32602);
  assert.equal(call("tools/call",{name:CANARY_TOOL,arguments:[]}).error.code,-32602);
  assert.equal(call("tools/call",{name:CANARY_TOOL,arguments:null}).result.content[0].text,CANARY_REPLY);
  assert.equal(call("resources/list").error.code,-32601);
  assert.equal(call("prompts/list").error.code,-32601);
  assert.equal(call("tools/uninstall").error.code,-32601);
  assert.equal(call("ping").result.constructor,Object);
});
test("no-id notifications never generate a JSON-RPC response",()=>{
  assert.equal(handleMcp({jsonrpc:"2.0",method:"notifications/initialized"}),null);
  assert.equal(handleMcp({jsonrpc:"2.0",method:"tools/call",params:{name:CANARY_TOOL}}),null);
});
test("invalid messages fail with no effect",()=>{
  for(const v of [null,3,"hello",[],{},{
    jsonrpc:"2.0",method:"tools/call",id:{danger:true},
  }])assert.ok(handleMcp(v).error);
  assert.equal(call("unknown").error.code,-32601);
});
test("readiness route is constant and the only GET route",async()=>{
  await withServer(async port=>{
    const ok=await http(port,{method:"GET",url:"/healthz"});
    assert.equal(ok.status,200);
    assert.deepEqual(ok.data,{status:"READY_FOR_LOCAL_TEST_ONLY"});
    assert.equal(ok.headers["cache-control"],"no-store");
    assert.equal((await http(port,{method:"GET",url:"/mcp"})).status,405);
    assert.equal((await http(port,{method:"GET",url:"/secrets"})).status,404);
    assert.equal((await http(port,{method:"GET",url:"/workflows"})).status,404);
  });
});
test("MCP HTTP response supports initialize, tools/list, call with no remote side effects",async()=>{
  await withServer(async port=>{
    const init=await http(port,{body:{
      jsonrpc:"2.0",id:1,method:"initialize",params:{
        protocolVersion:"2025-03-26",capabilities:{},clientInfo:{name:"test",version:"1"},
      },
    }});
    assert.equal(init.status,200);
    assert.equal(init.data.result.serverInfo.name,"atlas-tunnel-canary");
    const list=await http(port,{body:{jsonrpc:"2.0",id:2,method:"tools/list",params:{}}});
    assert.deepEqual(list.data.result.tools.map(v=>v.name),["atlas_ping"]);
    const result=await http(port,{body:{
      jsonrpc:"2.0",id:3,method:"tools/call",
      params:{name:"atlas_ping",arguments:{}},
    }});
    assert.equal(result.data.result.content[0].text,CANARY_REPLY);
    assert.ok(!result.raw.includes(process.env.HOME??"NO_HOME_SET"));
    const notification=await http(port,{body:{
      jsonrpc:"2.0",method:"notifications/initialized",
    }});
    assert.equal(notification.status,202);
    assert.equal(notification.raw,"");
  });
});
test("HTTP requests are bounded; unknown tools and methods explicitly blocked",async()=>{
  await withServer(async port=>{
    assert.equal((await http(port,{body:"{"})).status,400);
    assert.equal((await http(port,{body:"[]"})).status,400);
    assert.equal((await http(port,{body:" ".repeat(8193)})).status,413);
    assert.equal((await http(port,{
      body:"arbitrary",
      headers:{"content-type":"text/plain"},
    })).status,415);
    const denied=await http(port,{body:{
      jsonrpc:"2.0",id:2,method:"tools/call",
      params:{name:"ap_delete_flow",arguments:{}},
    }});
    assert.equal(denied.data.error.code,-32602);
    assert.ok(denied.raw.includes("Tool not allowed"));
  });
});
test("defaults prohibit public network exposure by default",()=>{
  assert.equal(DEFAULT_HOST,"127.0.0.1");
  assert.equal(DEFAULT_PORT,18787);
  assert.throws(()=>startCanary({host:"0.0.0.0"}),/Unapproved bind address/);
  assert.throws(()=>startCanary({host:"::"}),/Unapproved bind address/);
  assert.throws(()=>startCanary({host:"192.168.1.1"}),/Unapproved bind address/);
  assert.throws(()=>startCanary({port:80}),/Unsafe port/);
  assert.throws(()=>startCanary({port:65536}),/Unsafe port/);
});
