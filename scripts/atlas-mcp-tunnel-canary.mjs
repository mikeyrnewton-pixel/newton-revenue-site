#!/usr/bin/env node
/**
 * ATLAS Tunnel Canary — deliberately useless, read-only MCP server.
 *
 * Gives the owner a safe first "ChatGPT -> tunnel -> Mac" proof WITHOUT
 * exposing Activepieces, Mac commands, credentials, filesystem, or leads.
 *
 * No external dependencies, no outbound network requests, and one allowlisted
 * constant-response tool. Defaults to localhost only. Start only with the
 * owner's separate approval; source/CI alone proves no live connection.
 */
import {createServer} from "node:http";
import {fileURLToPath} from "node:url";
import path from "node:path";

export const CANARY_REPLY="ATLAS_TUNNEL_CANARY_OK_NO_MAC_ACCESS";
export const CANARY_TOOL="atlas_ping";
export const DEFAULT_HOST="127.0.0.1";
export const DEFAULT_PORT=18787;
const MAX_BYTES=8192;
const SUPPORTED_PROTOCOLS=new Set([
  "2024-11-05",
  "2025-03-26",
  "2025-06-18",
]);
const PROTOCOL_DEFAULT="2025-03-26";
const jsonResponse=(id,result)=>({jsonrpc:"2.0",id,result});
const jsonError=(id,code,message)=>({jsonrpc:"2.0",id,error:{code,message}});
const canaryTool=Object.freeze({
  name:CANARY_TOOL,
  description:"Returns a fixed harmless status token. No Mac, credentials, Docker, Activepieces, network or filesystem access.",
  inputSchema:{type:"object",properties:{},additionalProperties:false},
});
const json=(res,status,body)=>{
  const payload=JSON.stringify(body);
  res.writeHead(status,{
    "content-type":"application/json; charset=utf-8",
    "cache-control":"no-store",
    "x-content-type-options":"nosniff",
    "content-length":Buffer.byteLength(payload),
  });
  res.end(payload);
};
const empty=(res,status)=>{
  res.writeHead(status,{"cache-control":"no-store","content-length":0});
  res.end();
};
export function handleMcp(message){
  if(!message||typeof message!=="object"||Array.isArray(message))
    return jsonError(null,-32600,"Invalid JSON-RPC request");
  const hasId=Object.prototype.hasOwnProperty.call(message,"id");
  const id=hasId?message.id:null;
  if(message.jsonrpc!=="2.0"||typeof message.method!=="string"||
     (hasId&&!["string","number"].includes(typeof id)))
    return jsonError(id,-32600,"Invalid JSON-RPC request");
  // Notifications never elicit a response.
  if(!hasId)return null;
  if(message.method==="initialize"){
    const offered=message.params?.protocolVersion;
    const protocol=SUPPORTED_PROTOCOLS.has(offered)?offered:PROTOCOL_DEFAULT;
    return jsonResponse(id,{
      protocolVersion:protocol,
      capabilities:{tools:{listChanged:false}},
      serverInfo:{name:"atlas-tunnel-canary",version:"0.1.0"},
      instructions:"Test only. This connector cannot access Activepieces or the Mac.",
    });
  }
  if(message.method==="ping")return jsonResponse(id,{});
  if(message.method==="tools/list")return jsonResponse(id,{tools:[canaryTool]});
  if(message.method==="tools/call"){
    if(message.params?.name!==CANARY_TOOL)
      return jsonError(id,-32602,"Tool not allowed");
    const args=message.params?.arguments??{};
    if(!args||typeof args!=="object"||Array.isArray(args)||
       Object.keys(args).length!==0)
      return jsonError(id,-32602,"Arguments not allowed");
    return jsonResponse(id,{
      content:[{type:"text",text:CANARY_REPLY}],
      isError:false,
    });
  }
  return jsonError(id,-32601,"Method not available");
}
export function createCanaryServer(){
  return createServer((req,res)=>{
    // Even a health check is fixed text and never reads local state.
    if(req.method==="GET"&&req.url==="/healthz")
      return json(res,200,{status:"READY_FOR_LOCAL_TEST_ONLY"});
    if(req.url!=="/mcp")return json(res,404,{error:"Not found"});
    if(req.method!=="POST"){
      res.setHeader("allow","POST");
      return json(res,405,{error:"Method not allowed"});
    }
    const ctype=(req.headers["content-type"]??"").toLowerCase();
    if(!ctype.startsWith("application/json"))
      return json(res,415,{error:"JSON required"});
    const chunks=[];
    let length=0;
    let tooLarge=false;
    req.on("data",chunk=>{
      length+=chunk.length;
      if(length>MAX_BYTES){tooLarge=true;return;}
      chunks.push(chunk);
    });
    req.on("error",()=>{if(!res.writableEnded)empty(res,400);});
    req.on("end",()=>{
      if(res.writableEnded)return;
      if(tooLarge)return json(res,413,{error:"Request too large"});
      let body;
      try{body=JSON.parse(Buffer.concat(chunks).toString("utf8"));}
      catch{return json(res,400,jsonError(null,-32700,"Malformed JSON"));}
      if(Array.isArray(body))
        return json(res,400,jsonError(null,-32600,"Batch requests disabled"));
      const answer=handleMcp(body);
      if(answer===null)return empty(res,202);
      return json(res,200,answer);
    });
  });
}
export function startCanary({host=DEFAULT_HOST,port=DEFAULT_PORT}={}){
  if(!Number.isInteger(port)||port<1024||port>65535)
    throw Error("Unsafe port");
  // Never widen the host process to all interfaces. Container reachability
  // requires a separately reviewed private bridge or an in-container canary.
  if(host!==DEFAULT_HOST)
    throw Error("Unapproved bind address");
  const server=createCanaryServer();
  server.listen(port,host,()=>{
    process.stdout.write("ATLAS_CANARY_LISTENING_LOCAL_ONLY_OR_OWNER_ISOLATED\n");
  });
  return server;
}
const invoked=process.argv[1]&&
  path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
  const argv=process.argv.slice(2);
  if(argv.length===1&&argv[0]==="--help")
    process.stdout.write("ATLAS Tunnel Canary v0.1 (read-only). --serve to start local-only test; no other actions.\n");
  else if(argv.length===1&&argv[0]==="--serve")
    startCanary();
  else{
    process.stderr.write("HOLD: explicit --serve required.\n");
    process.exitCode=2;
  }
}
