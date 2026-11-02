import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {handleObserverMcp, createObserverServer} from "../scripts/atlas-mcp-observer-meta-hotfix-20261102.mjs";

const path=fileURLToPath(new URL("../scripts/atlas-mcp-observer-meta-hotfix-20261102.mjs",import.meta.url));
const source=readFileSync(path,"utf8");
const call=(name, paramsExtra={}, args={})=>handleObserverMcp({
 jsonrpc:"2.0",id:1,method:"tools/call",params:{name,arguments:args,...paramsExtra}
},{readSnapshot:()=>null});

test("backport retains fixed three-tool read-only allowlist and no execution access",()=>{
 const tools=handleObserverMcp({jsonrpc:"2.0",id:2,method:"tools/list",params:{}}).result.tools;
 assert.deepEqual(tools.map(t=>t.name),["atlas_ping","atlas_capabilities","atlas_status"]);
 assert.match(source,/mode: "READ_ONLY_SANITIZED_SNAPSHOT"/);
 assert.equal(source.includes("execFileSync("),false);
 assert.equal(source.includes("child_process"),false);
 assert.equal(source.includes("docker.sock"),false);
});
test("normal requests and MCP _meta accepted without exposing metadata",()=>{
 const meta={"progressToken":"abc123", "io.modelcontextprotocol/protocolVersion":"2025-06-18", extra:{nested:"secret-fixture"}};
 for(const tool of ["atlas_ping","atlas_capabilities","atlas_status"]){
   for(const p of [{},{_meta:meta}]){
     const r=call(tool,p);
     assert.equal(r.error,undefined,tool+JSON.stringify(p));
     assert.equal(r.result.content[0].type,"text");
     assert.equal(JSON.stringify(r).includes("secret-fixture"),false);
   }
 }
 assert.equal(call("atlas_status",{_meta:meta}).result.content.length,1);
});
test("unrecognized names, unknown params, nonempty tool arguments remain denied",()=>{
 const meta={"progressToken":"abc123"};
 for(const p of [
  {name:"run_shell",arguments:{},_meta:meta},
  {name:"atlas_status",arguments:{cmd:"id"},_meta:meta},
  {name:"atlas_status",arguments:{},_meta:meta,arbitrary:true},
  {name:"atlas_status",arguments:{},_meta:null},
  {name:"atlas_status",arguments:{},_meta:[]},
 ]) {
  const r=handleObserverMcp({jsonrpc:"2.0",id:3,method:"tools/call",params:p},{readSnapshot:()=>{throw Error("not permitted")}});
  assert.equal(r.error?.code,-32602);
 }
});
test("Observer factory remains available but requires no live network in this test",()=>{
 assert.equal(typeof createObserverServer,"function");
});
