#!/usr/bin/env node
/**
 * ATLAS Connector Control v0.1 — read-only Mac diagnostics.
 *
 * No install, Docker changes, remote access, tunnel initiation, API keys, outbound
 * messages or customer data. All diagnostics are bounded and report only fixed,
 * non-secret readiness labels. Must be invoked on the OWNER'S Mac; GitHub CI
 * execution does not test the owner's Mac.
 */
import {spawnSync} from "node:child_process";
import {existsSync, lstatSync} from "node:fs";
import os from "node:os";
import path from "node:path";

const APP="ATLAS_CONNECTOR_CONTROL_V1";
const DOCKER_LOCATIONS=Object.freeze([
  "/Applications/Docker.app/Contents/Resources/bin/docker",
  "/opt/homebrew/bin/docker",
  "/usr/local/bin/docker",
]);
const WATCHDOG_LABEL="uk.newton.atlas-watchdog";
const HEARTBEAT_SUFFIX="ATLAS-LOCAL/state/watchdog-latest.json";
const KNOWN_CONTAINERS=Object.freeze([
  ["activepieces-app-1","activepiecesApp"],
  ["activepieces-worker-1","activepiecesWorker"],
  ["activepieces-postgres-1","postgres"],
  ["activepieces-redis-1","redis"],
  ["atlas-tunnel-client","tunnelClient"],
]);
const safeRun=(bin,args,timeout=3500)=>{
  try {
    const res=spawnSync(bin,args,{encoding:"utf8",timeout,maxBuffer:150000,env:{
      HOME:process.env.HOME||"",
      PATH:"/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:/usr/local/bin",
    }});
    if(res.error||res.signal||res.status!==0)return {ok:false,output:""};
    return {ok:true,output:res.stdout||""};
  } catch {return {ok:false,output:""};}
};
const reportStatic=()=>Object.freeze({
  schema:APP,
  mode:"PLAN_ONLY",
  directChatGPTMacConnection:"NOT_VERIFIED",
  activepiecesCodeRead:"NOT_VERIFIED",
  tunnelRegistered:"OWNER_SCREENSHOT_EVIDENCE_ONLY",
  tunnelClientState:"NOT_VERIFIED",
  productionRelease:"HOLD",
  autoOutreach:false,
  autoPayment:false,
  apiModelCalls:false,
  newSpend:false,
  steps:Object.freeze([
    "OWNER_CONFIRMS_LIMITED_RUNTIME_KEY_READ_USE_ONLY",
    "OWNER_APPROVES_LOCAL_CLIENT_INSTALLATION_SEPARATELY",
    "OWNER_APPROVES_INITIAL_MANUAL_TUNNEL_RUNTIME",
    "AUTHENTICATED_MCP_TOOL_PERMISSIONS_REVIEW_BEFORE_USE",
    "READ_ONLY_LIVE_FLOW_LIST_AND_STRUCTURE_WITH_EVIDENCE",
  ]),
});
export function assessRuntimeSecretFile(file,uid=process.getuid?.()){
  if(typeof file!=="string"||!path.isAbsolute(file))return "INVALID_PATH";
  try {
    const st=lstatSync(file);
    if(st.isSymbolicLink()||!st.isFile())return "NOT_REGULAR_FILE";
    if((st.mode&0o077)!==0)return "PERMISSIONS_TOO_BROAD";
    if(uid!==undefined&&st.uid!==uid)return "NOT_OWNER_CONTROLLED";
    if(st.size===0||st.size>4096)return "INVALID_SIZE";
    return "METADATA_OK_KEY_CONTENT_NOT_READ";
  }catch{return "NOT_FOUND";}
}
export async function readMacStatus({
  platform=process.platform,
  arch=process.arch,
  home=os.homedir(),
  run=safeRun,
  fetcher=fetch,
  stat=lstatSync,
  now=Date.now(),
  uid=process.getuid?.()??null,
}={}){
  const state={
    schema:APP,
    mode:"READ_ONLY_LOCAL_STATUS",
    computer:platform==="darwin"?"MACOS":"NOT_MACOS",
    processor:arch==="arm64"?"ARM64":arch==="x64"?"X64":"OTHER",
    docker:"NOT_VERIFIED",
    containers:{
      activepiecesApp:"NOT_VERIFIED",
      activepiecesWorker:"NOT_VERIFIED",
      postgres:"NOT_VERIFIED",
      redis:"NOT_VERIFIED",
      tunnelClient:"NOT_VERIFIED",
    },
    activepiecesHttp:"NOT_VERIFIED",
    watchdog:"NOT_VERIFIED",
    watchdogHeartbeat:"NOT_VERIFIED",
    secureTunnel:"NOT_CONNECTED_BY_THIS_CHECK",
    customerOutreach:"HOLD",
    clearedCashGBP:0,
    noWritesPerformed:true,
  };
  if(platform!=="darwin")return state;
  const docker=DOCKER_LOCATIONS.find(p=>existsSync(p));
  if(docker){
    const ps=run(docker,["ps","--format","{{.Names}}|{{.Status}}"]);
    if(ps.ok){
      state.docker="RESPONDING";
      const found=new Map(ps.output.split(/\r?\n/).filter(Boolean).map(line=>{
        const [name,status]=line.split("|");
        return [name??"",status??""];
      }));
      for(const [container,key] of KNOWN_CONTAINERS){
        const status=found.get(container);
        state.containers[key]=status===undefined?"NOT_RUNNING":
          /\bhealthy\b/i.test(status)?"RUNNING_HEALTHY":
          /^Up\b/i.test(status)?"RUNNING_NOT_HEALTH_CONFIRMED":"OTHER";
      }
    }else state.docker="CLI_UNAVAILABLE_OR_DAEMON_OFFLINE";
  }else state.docker="CLI_NOT_FOUND";
  try{
    const ctl=new AbortController();
    const timer=setTimeout(()=>ctl.abort(),2500);
    try{
      const response=await fetcher("http://127.0.0.1:8080/",{
        signal:ctl.signal,redirect:"manual",headers:{"accept":"text/html"},
      });
      state.activepiecesHttp=response.status===200?"HTTP_200":
        response.status>=200&&response.status<500?"HTTP_RESPONDED":"HTTP_UNEXPECTED";
      if(response.body?.cancel)await response.body.cancel();
    }finally{clearTimeout(timer);}
  }catch{state.activepiecesHttp="NO_RESPONSE";}
  if(uid!==null){
    const launched=run("/bin/launchctl",["print",`gui/${uid}/${WATCHDOG_LABEL}`]);
    state.watchdog=launched.ok?"LAUNCHAGENT_LOADED":"NOT_LOADED_OR_UNAVAILABLE";
  }
  try{
    const hb=stat(path.join(home,HEARTBEAT_SUFFIX));
    if(!hb.isSymbolicLink()&&hb.isFile()){
      const age=now-hb.mtimeMs;
      state.watchdogHeartbeat=age<0?"CLOCK_SKEW":
        age<=180000?"FRESH_UNDER_3_MINUTES":
        age<=3600000?"STALE_UNDER_1_HOUR":"STALE_OVER_1_HOUR";
    }
  }catch{state.watchdogHeartbeat="NOT_FOUND";}
  return state;
}
export function formatStatus(state){
  const keys=[
    ["Mac",state.computer],
    ["Docker",state.docker],
    ["Activepieces app",state.containers.activepiecesApp],
    ["Activepieces worker",state.containers.activepiecesWorker],
    ["Database",state.containers.postgres],
    ["Redis",state.containers.redis],
    ["Activepieces HTTP",state.activepiecesHttp],
    ["Watchdog",state.watchdog],
    ["Watchdog heartbeat",state.watchdogHeartbeat],
    ["Tunnel container",state.containers.tunnelClient],
  ];
  return ["=== ATLAS CONNECTOR CONTROL (READ ONLY) ===",
    ...keys.map(([k,v])=>`${k}: ${v}`),
    "Remote ChatGPT tool call: NOT VERIFIED",
    "Customer communication: HOLD",
    "Real payments: NOT VERIFIED",
    "System modified: NO",
    "=== COMPLETE ==="].join("\n");
}
export async function main(argv=process.argv.slice(2),deps={}){
  if(argv.length===1&&argv[0]==="--plan")return JSON.stringify(reportStatic(),null,2);
  if(argv.length===1&&argv[0]==="--status")return formatStatus(await readMacStatus(deps));
  if(argv.length===2&&argv[0]==="--check-key-file")
    return "Restricted key file metadata: "+assessRuntimeSecretFile(argv[1])+
      "\nNOTE: No key contents were read. Tunnels Read + Use permissions not remotely verified.";
  if(argv.length===1&&argv[0]==="--help")
    return "ATLAS Connector Control v0.1\n--status : read-only Mac status\n--plan : safe setup checklist\n--check-key-file ABSOLUTE_PATH : inspect file metadata only\nNever installs, starts or configures a tunnel.";
  throw Error("Supported commands: --status | --plan | --check-key-file ABSOLUTE_PATH | --help");
}
if(process.argv[1]&&path.resolve(process.argv[1])===new URL(import.meta.url).pathname){
  main().then(s=>process.stdout.write(s+"\n")).catch(()=>{
    console.error("BLOCKED: invalid command or unavailable diagnostic.");
    process.exitCode=2;
  });
}
