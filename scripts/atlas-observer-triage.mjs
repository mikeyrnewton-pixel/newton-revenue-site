/**
 * ATLAS Observer — deterministic minute-ready health triage.
 * REVIEW ONLY. Pure function, no CLI, timers, network, files, shell or repairs.
 * A future separately approved local 60-second job can evaluate it; this
 * source file does not schedule anything on the owner's Mac.
 */
import {assessSnapshot} from "./atlas-observer-snapshot.mjs";
export const TRIAGE_SCHEMA = "atlas.observer.triage.v1";
const RULES = Object.freeze([
  {id:"DOCKER_NOT_RESPONDING",priority:1,next:"REVIEW_DOCKER",match:s=>s.docker!=="RESPONDING"},
  {id:"CORE_SERVICE_STOPPED",priority:1,next:"REVIEW_CORE_SERVICES",match:s=>["activepiecesApp","activepiecesWorker","postgres","redis"].some(k=>s.containers[k]==="NOT_RUNNING")},
  {id:"TUNNEL_REPORTED_STOPPED",priority:1,next:"REVIEW_TUNNEL",match:s=>s.containers.tunnelClient==="NOT_RUNNING"},
  {id:"ACTIVEPIECES_HTTP_UNHEALTHY",priority:2,next:"REVIEW_ACTIVEPIECES_HTTP",match:s=>["HTTP_UNEXPECTED","NO_RESPONSE"].includes(s.activepiecesHttp)},
  {id:"WATCHDOG_HEARTBEAT_UNHEALTHY",priority:2,next:"REVIEW_WATCHDOG_HEARTBEAT",match:s=>["STALE_UNDER_1_HOUR","STALE_OVER_1_HOUR","CLOCK_SKEW","NOT_FOUND"].includes(s.watchdogHeartbeat)},
  {id:"WATCHDOG_AGENT_UNAVAILABLE",priority:2,next:"REVIEW_WATCHDOG_AGENT",match:s=>s.watchdog==="NOT_LOADED_OR_UNAVAILABLE"},
  {id:"UNCERTAIN_HEALTH",priority:3,next:"REVIEW_UNVERIFIED_STATE",match:s=>s.docker==="NOT_VERIFIED"||Object.values(s.containers).includes("NOT_VERIFIED")||s.activepiecesHttp==="NOT_VERIFIED"||s.watchdog==="NOT_VERIFIED"||s.watchdogHeartbeat==="NOT_VERIFIED"},
]);
const outcome=(state,findings)=>Object.freeze({
  schema:TRIAGE_SCHEMA,
  state,
  priority:findings[0]?.priority??null,
  next:findings[0]?.next??"NONE",
  findings:Object.freeze(findings.map(r=>Object.freeze({id:r.id,priority:r.priority,next:r.next}))),
  action:"REVIEW_ONLY",
  autoRepair:false,
  commandsExecuted:false,
  externalRequests:false,
});
/** Input must be the locally generated, strictly assessed snapshot JSON. */
export function triageSnapshot(value, now=Date.now()){
  const assessed=assessSnapshot(value,now);
  if(assessed.status!=="FRESH"){
    return outcome("BLOCKED_UNVERIFIED_SNAPSHOT",[
      {id:"SNAPSHOT_NOT_FRESH",priority:1,next:"REVIEW_SNAPSHOT_FRESHNESS"}
    ]);
  }
  const findings=RULES.filter(r=>r.match(assessed.state))
    .sort((a,b)=>a.priority-b.priority||a.id.localeCompare(b.id));
  return outcome(findings.length?"NEEDS_REVIEW":"NO_REVIEW_SIGNAL",findings);
}
