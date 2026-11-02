/**
 * ATLAS Watchdog -> existing BUILD/QA review lane: safe, bounded work candidate.
 *
 * Pure, deterministic, review-only decision. Called by existing minuteWork.
 * No new scheduler, filesystem/network IO, subprocess, Docker control or API.
 * Nothing is enqueued or performed here; a later independently authorised
 * dispatcher may consume the fixed-kind candidate after enforcing permissions.
 */
import {createHash} from 'node:crypto';

export const WORK_POLICY_SCHEMA='atlas.watchdog.work.policy.v1';
export const DEDUP_SECONDS=300;
const MAX_PRIOR_IDS=64;
const allowedSources=new Set([
  'PINNED_SOURCES_VERIFIED','OWNER_PATH_UNVERIFIED','PRIVATE_STAGE_UNVERIFIED',
  'MANIFEST_UNVERIFIED','SOURCE_UNAVAILABLE','SOURCE_HASH_MISMATCH',
]);
const allowedTriage=new Set([
  'NO_REVIEW_SIGNAL','NEEDS_REVIEW','BLOCKED_UNVERIFIED_SNAPSHOT',
]);
const permitted=new Map([
  ['SNAPSHOT_NOT_FRESH',{kind:'REVIEW_SNAPSHOT_FRESHNESS',lane:'QA',risk:'HOLD_UNTRUSTED_SNAPSHOT'}],
  ['DOCKER_NOT_RESPONDING',{kind:'REVIEW_DOCKER_STATUS',lane:'QA',risk:'HOLD_DOCKER'}],
  ['CORE_SERVICE_STOPPED',{kind:'REVIEW_CORE_HEALTH',lane:'QA',risk:'HOLD_CORE_SERVICES'}],
  ['TUNNEL_REPORTED_STOPPED',{kind:'REVIEW_PRIVATE_TUNNEL',lane:'QA',risk:'HOLD_TUNNEL'}],
  ['ACTIVEPIECES_HTTP_UNHEALTHY',{kind:'REVIEW_ACTIVEPIECES_HEALTH',lane:'QA',risk:'HOLD_WORKER'}],
  ['WATCHDOG_HEARTBEAT_UNHEALTHY',{kind:'REVIEW_WATCHDOG_HEARTBEAT',lane:'QA',risk:'HOLD_WATCHDOG'}],
  ['WATCHDOG_AGENT_UNAVAILABLE',{kind:'REVIEW_WATCHDOG_AGENT',lane:'QA',risk:'HOLD_WATCHDOG'}],
  ['UNCERTAIN_HEALTH',{kind:'REVIEW_UNVERIFIED_HEALTH',lane:'QA',risk:'HOLD_UNVERIFIED'}],
]);
const sourceCase={kind:'REVIEW_PINNED_SOURCE_INTEGRITY',lane:'BUILD',risk:'HOLD_SOURCE_INTEGRITY'};
const outcome=(status,candidate=null,reason='NONE')=>Object.freeze({
  schema:WORK_POLICY_SCHEMA,
  status,
  reason,
  candidate,
  dispatchExecuted:false,
  businessActionsExecuted:false,
  modelsCalled:0,
  outboundMessages:0,
  tradesPlaced:0,
  autoRepair:false,
  requiresIndependentOwnerApproval:true,
});
const validNow=now=>Number.isSafeInteger(now)&&now>=0;
const validRecent=ids=>Array.isArray(ids)&&ids.length<=MAX_PRIOR_IDS&&
  ids.every(x=>typeof x==='string'&&/^atlas-work-[0-9a-f]{24}$/.test(x));
const validFindings=triage=>Array.isArray(triage.findings)&&
  triage.findings.length<=8&&triage.findings.every(x=>
    x!==null&&typeof x==='object'&&permitted.has(x.id)&&
    Number.isSafeInteger(x.priority)&&x.priority>=1&&x.priority<=3);
const workId=(kind,bucket)=>'atlas-work-'+createHash('sha256')
  .update(WORK_POLICY_SCHEMA+'|'+kind+'|'+bucket)
  .digest('hex').slice(0,24);

/** Create ONE bounded internal review candidate, never a run receipt. */
export function proposeWatchdogWork({triage,sourceAudit,now=Date.now(),
  recentOrderIds=[]}={}){
  if(!validNow(now)||!validRecent(recentOrderIds)||
      !triage||triage.schema!=='atlas.observer.triage.v1'||
      !allowedTriage.has(triage.state)||
      !sourceAudit||!allowedSources.has(sourceAudit.state)||
      !Number.isSafeInteger(sourceAudit.expected)||
      sourceAudit.expected!==3||
      !Number.isSafeInteger(sourceAudit.checked)||
      sourceAudit.checked<0||sourceAudit.checked>3||
      !validFindings(triage))
    return outcome('HOLD_INVALID_EVIDENCE',null,'TRIAGE_OR_SOURCE_NOT_TRUSTED');

  // Invalid source blocks all downstream execution, regardless of any
  // apparent healthy snapshot or model permission.
  let alert=null;
  if(sourceAudit.state!=='PINNED_SOURCES_VERIFIED' ||
      sourceAudit.checked!==sourceAudit.expected){
    alert=sourceCase;
  }else if(triage.state==='BLOCKED_UNVERIFIED_SNAPSHOT'){
    alert=permitted.get('SNAPSHOT_NOT_FRESH');
  }else if(triage.state==='NEEDS_REVIEW'){
    const ordered=[...triage.findings].sort((a,b)=>a.priority-b.priority||
      a.id.localeCompare(b.id));
    alert=ordered[0]&&permitted.get(ordered[0].id);
    if(!alert) return outcome('HOLD_INVALID_EVIDENCE',null,'MISSING_REVIEW_FINDING');
  }else if(triage.findings.length!==0){
    return outcome('HOLD_INVALID_EVIDENCE',null,'CONTRADICTORY_HEALTH_FINDINGS');
  }
  if(!alert)return outcome('NO_WORK_REQUIRED');

  // Fixed five-minute buckets plus explicit replay inputs. A scheduled
  // consumer MUST additionally persist/reconcile last consumed IDs before
  // acting; this pure function does not claim durable deduplication.
  const bucket=Math.floor(now/(1000*DEDUP_SECONDS));
  const id=workId(alert.kind,bucket);
  if(recentOrderIds.includes(id))
    return outcome('DUPLICATE_SUPPRESSED',null,'SAME_REVIEW_BUCKET_ALREADY_SEEN');

  const candidate=Object.freeze({
    id,
    kind:alert.kind,
    lane:alert.lane,
    risk:alert.risk,
    observedTimeBucket:bucket,
    urgency:sourceAudit.state!=='PINNED_SOURCES_VERIFIED'?'SECURITY_HOLD':'REVIEW',
    permissions:'OWNER_REVIEW_REQUIRED',
    currentExecution:'NONE',
    futureAction:'FIXED_KIND_INTERNAL_DIAGNOSTIC_ONLY',
    retryPolicy:'NO_AUTOMATIC_HOST_REPAIR',
    source:'SANITIZED_WATCHDOG_EVIDENCE_ONLY',
  });
  return outcome('REVIEW_CANDIDATE_NOT_ENQUEUED',candidate,'ACTION_REQUIRES_AUTHORISED_DISPATCHER');
}
