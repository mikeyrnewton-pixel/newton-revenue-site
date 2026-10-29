#!/usr/bin/env node
/**
 * ATLAS minute worker v0.2 — owner-local, one-shot health review.
 * --run-once stays strictly READ-ONLY. Explicit --queue-review may create
 * ONE private, idempotent INTERNAL REVIEW TICKET, never perform the task.
 * Neither mode launches shell/tests, models/API calls, contacts customers,
 * changes existing Mac services or creates a scheduler.
 * Owner approval needed before staging/running/scheduling on the Mac.
 */
import {createHash} from "node:crypto";
import {constants,openSync,fstatSync,lstatSync,readSync,closeSync} from "node:fs";
import {homedir} from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {triageOwnerSnapshot} from "./atlas-observer-triage-cli.mjs";
import {proposeWatchdogWork} from "./atlas-watchdog-work-policy.mjs";
import {storeReviewTicket} from "./atlas-private-review-queue.mjs";

export const MINUTE_SCHEMA="atlas.minute.work.v1";
export const STAGE="ATLAS-OBSERVER-MCP-REVIEW-20261024";
export const PINNED=Object.freeze({
  "scripts/atlas-mcp-observer.mjs":"56eafea5e1e2a60ec5de0a3eb8051ea6b72349c5",
  "scripts/atlas-observer-snapshot.mjs":"7dde06ee91ce6776c6e6217e4dd43c402f678d79",
  "tests/atlas-mcp-observer.test.mjs":"0b43927fbe6843d05a6241785b83ed8d55b1b804",
});
const MAX_SOURCE_BYTES=256*1024;
const owned=(st,uid,dir)=>st?.uid===uid &&
  (dir?st.isDirectory():st.isFile()) &&
  !st.isSymbolicLink() &&
  (st.mode & 0o777)===(dir?0o700:0o600) &&
  (dir || st.nlink===1);

function fixedPrivateRead(filename,uid){
  let fd;
  try{
    const before=lstatSync(filename);
    if(!owned(before,uid,false)||before.size<1||before.size>MAX_SOURCE_BYTES)
      return null;
    fd=openSync(filename,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
    const after=fstatSync(fd);
    if(!owned(after,uid,false)||after.size!==before.size||
       after.ino!==before.ino||after.dev!==before.dev)
      return null;
    const buf=Buffer.alloc(after.size);
    let offset=0;
    while(offset<buf.length){
      const bytes=readSync(fd,buf,offset,buf.length-offset,offset);
      if(bytes<=0)return null;
      offset+=bytes;
    }
    return buf;
  }catch{return null;}
  finally{if(fd!==undefined)try{closeSync(fd);}catch{}}
}
function gitBlobHash(buf){
  return createHash("sha1").update("blob "+buf.length+"\0").update(buf).digest("hex");
}
/** Source manifest must be a static allowlist in production. */
export function auditPinnedSources({home=homedir(),uid=process.getuid?.(),manifest=PINNED}={}){
  const outcome=state=>Object.freeze({state,checked:0,expected:Object.keys(PINNED).length});
  if(typeof home!=="string"||!path.isAbsolute(home)||!Number.isSafeInteger(uid))
    return outcome("OWNER_PATH_UNVERIFIED");
  const root=path.join(home,STAGE);
  try{
    if(!owned(lstatSync(root),uid,true))return outcome("PRIVATE_STAGE_UNVERIFIED");
    for(const sub of ["scripts","tests"]){
      if(!owned(lstatSync(path.join(root,sub)),uid,true))
        return outcome("PRIVATE_STAGE_UNVERIFIED");
    }
    if(!manifest||typeof manifest!=="object"||
       Object.keys(manifest).length!==Object.keys(PINNED).length ||
       !Object.keys(PINNED).every(p=>typeof manifest[p]==="string"&&
         /^[0-9a-f]{40}$/.test(manifest[p])))
      return outcome("MANIFEST_UNVERIFIED");
    let checked=0;
    for(const name of Object.keys(PINNED)){
      const bytes=fixedPrivateRead(path.join(root,name),uid);
      if(!bytes)return Object.freeze({state:"SOURCE_UNAVAILABLE",checked,expected:3});
      if(gitBlobHash(bytes)!==manifest[name])
        return Object.freeze({state:"SOURCE_HASH_MISMATCH",checked,expected:3});
      checked++;
    }
    return Object.freeze({state:"PINNED_SOURCES_VERIFIED",checked,expected:3});
  }catch{return outcome("PRIVATE_STAGE_UNVERIFIED");}
}

/** Safe to invoke once per minute; never assumes the host will stay awake. */
export function minuteWork({home=homedir(),uid=process.getuid?.(),now=Date.now(),manifest=PINNED, recentOrderIds=[]}={}){
  const triage=triageOwnerSnapshot({home,uid,now});
  const sources=auditPinnedSources({home,uid,manifest});
  const reviewCandidate=proposeWatchdogWork({triage,sourceAudit:sources,now,recentOrderIds});
  const healthNeedsReview=triage.state!=="NO_REVIEW_SIGNAL";
  const integrityNeedsReview=sources.state!=="PINNED_SOURCES_VERIFIED";
  const next=integrityNeedsReview?"REVIEW_PINNED_SOURCE_INTEGRITY":
    healthNeedsReview?triage.next:"NONE";
  return Object.freeze({
    schema:MINUTE_SCHEMA,
    state:integrityNeedsReview||healthNeedsReview?"REVIEW_REQUIRED":"NO_REVIEW_SIGNAL",
    next,
    triage,
    sourceAudit:sources,
    reviewCandidate,
    proposedReviewWorkItems:reviewCandidate.candidate===null?0:1,
    reviewItemsActuallyEnqueued:0,
    workPerformed:Object.freeze(["PRIVATE_STATUS_TRIAGE","PINNED_SOURCE_INTEGRITY_AUDIT"]),
    scheduling:"EXTERNAL_OWNER_APPROVAL_REQUIRED",
    newBuildsCreated:0,
    changesApplied:false,
    autoRepair:false,
    networkCalls:false,
    moneySpentGBP:0,
  });
}
const invoked=process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
  const mode=process.argv.length===3?process.argv[2]:'';
  if(mode==='--run-once'||mode==='--queue-review'){
    if(process.platform!=='darwin'||!process.getuid||process.getuid()===0){
      process.stderr.write('HOLD: owner Mac required.\n');
      process.exitCode=2;
    } else {
      const report=minuteWork();
      if(mode==='--run-once'){
        process.stdout.write(JSON.stringify(report)+'\n');
      } else if(report.reviewCandidate.candidate){
        const receipt=storeReviewTicket({candidate:report.reviewCandidate.candidate});
        process.stdout.write(JSON.stringify({...report,privateReviewTicket:receipt})+'\n');
        if(receipt.status==='HOLD')process.exitCode=2;
      }else{
        process.stdout.write(JSON.stringify({...report,privateReviewTicket:{
          status:'NO_CANDIDATE_NO_WRITE',ticketsCreated:0,ticketsExecuted:0
        }})+'\n');
      }
    }
  }else if(mode==='--help'){
    process.stdout.write('ATLAS minute worker: --run-once (read-only) | --queue-review (one private pending-review ticket only); no service changes or built-in scheduler.\n');
  }else{
    process.stderr.write('HOLD: --run-once | --queue-review | --help only.\n');
    process.exitCode=2;
  }
}
