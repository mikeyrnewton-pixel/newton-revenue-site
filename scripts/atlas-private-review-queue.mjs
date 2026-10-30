/**
 * ATLAS internal safety review queue. ONE explicit owner-run private write only.
 *
 * Converts an allowlisted Watchdog review candidate into a durable local
 * pending-review ticket (not a task execution). No remote endpoints, model,
 * customer messages, shell, Docker or trading capability. The existing
 * Watchdog, Observer, launchd, tunnel and Activepieces are never modified.
 */
import {constants,closeSync,existsSync,fstatSync,fsyncSync,lstatSync,
  mkdirSync,openSync,readSync,unlinkSync,writeSync} from 'node:fs';
import {homedir} from 'node:os';
import path from 'node:path';

export const QUEUE_SCHEMA='atlas.local.review.ticket.v1';
export const QUEUE_FOLDER='.atlas-internal-review';
const MAX_TICKET_BYTES=2048;
// Full policy invariants: an untrusted caller may not relabel a harmless
// category into a different security state or disguise a source-integrity HOLD.
const allowedKinds=new Map([
  ['REVIEW_PINNED_SOURCE_INTEGRITY',{lane:'BUILD',risk:'HOLD_SOURCE_INTEGRITY',urgency:'SECURITY_HOLD'}],
  ['REVIEW_SNAPSHOT_FRESHNESS',{lane:'QA',risk:'HOLD_UNTRUSTED_SNAPSHOT',urgency:'REVIEW'}],
  ['REVIEW_DOCKER_STATUS',{lane:'QA',risk:'HOLD_DOCKER',urgency:'REVIEW'}],
  ['REVIEW_CORE_HEALTH',{lane:'QA',risk:'HOLD_CORE_SERVICES',urgency:'REVIEW'}],
  ['REVIEW_PRIVATE_TUNNEL',{lane:'QA',risk:'HOLD_TUNNEL',urgency:'REVIEW'}],
  ['REVIEW_ACTIVEPIECES_HEALTH',{lane:'QA',risk:'HOLD_WORKER',urgency:'REVIEW'}],
  ['REVIEW_WATCHDOG_HEARTBEAT',{lane:'QA',risk:'HOLD_WATCHDOG',urgency:'REVIEW'}],
  ['REVIEW_WATCHDOG_AGENT',{lane:'QA',risk:'HOLD_WATCHDOG',urgency:'REVIEW'}],
  ['REVIEW_UNVERIFIED_HEALTH',{lane:'QA',risk:'HOLD_UNVERIFIED',urgency:'REVIEW'}],
]);
const fixedKeys=[
  'id','kind','lane','risk','observedTimeBucket','urgency',
  'permissions','currentExecution','futureAction','retryPolicy','source',
].sort();
const acceptable=(st,uid,dir)=>Boolean(st)&&st.uid===uid&&(dir||st.nlink===1)&&
  (dir?st.isDirectory():st.isFile())&&
  !st.isSymbolicLink()&&(st.mode&0o777)===(dir?0o700:0o600);
const hold=(reason)=>Object.freeze({
  schema:'atlas.local.review.queue.receipt.v1',status:'HOLD',
  reason, ticketsCreated:0,ticketsExecuted:0,customerMessagesSent:0,
  cloudCalls:0,serviceChanges:0,
});
function safeCandidate(c) {
  if(!c||typeof c!=='object'||Array.isArray(c)||
     Object.keys(c).sort().join('|')!==fixedKeys.join('|')||
     !/^atlas-work-[a-f0-9]{24}$/.test(c.id)||
     !allowedKinds.has(c.kind)||allowedKinds.get(c.kind).lane!==c.lane||
     allowedKinds.get(c.kind).risk!==c.risk||
     allowedKinds.get(c.kind).urgency!==c.urgency||
     !Number.isSafeInteger(c.observedTimeBucket)||c.observedTimeBucket<0||
     !['SECURITY_HOLD','REVIEW'].includes(c.urgency)||
     c.permissions!=='OWNER_REVIEW_REQUIRED'||
     c.currentExecution!=='NONE'||
     c.futureAction!=='FIXED_KIND_INTERNAL_DIAGNOSTIC_ONLY'||
     c.retryPolicy!=='NO_AUTOMATIC_HOST_REPAIR'||
     c.source!=='SANITIZED_WATCHDOG_EVIDENCE_ONLY'||
     typeof c.risk!=='string'||!/^HOLD_[A-Z_]{3,40}$/.test(c.risk))
    return null;
  return Object.freeze({
    schema:QUEUE_SCHEMA,
    id:c.id,kind:c.kind,lane:c.lane,risk:c.risk,
    observedTimeBucket:c.observedTimeBucket,urgency:c.urgency,
    state:'PENDING_OWNER_REVIEW_ONLY',
    origin:'SANITIZED_WATCHDOG_EVIDENCE_ONLY',
    workerExecuted:false,retryAttempted:false,externalCommunication:false,
    modelCalled:false,servicesChanged:false,customerContacted:false,
    paymentOrTrade:false,
  });
}
function exactRead(file,uid) {
  let fd;
  try{
    const before=lstatSync(file);
    if(!acceptable(before,uid,false)||before.size<1||
       before.size>MAX_TICKET_BYTES)return null;
    fd=openSync(file,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
    const after=fstatSync(fd);
    if(!acceptable(after,uid,false)||after.ino!==before.ino||
       after.dev!==before.dev||after.size!==before.size)return null;
    const buf=Buffer.alloc(after.size);
    let off=0;
    while(off<buf.length){
      const n=readSync(fd,buf,off,buf.length-off,off);
      if(n<=0)return null;
      off+=n;
    }
    return buf.toString('utf8');
  }catch{return null}
  finally{if(fd!==undefined)try{closeSync(fd)}catch{}}
}

/** Explicitly called in opt-in queue mode only; never starts a task. */
export function storeReviewTicket({home=homedir(),uid=process.getuid?.(),
  candidate=null}={}){
  const ticket=safeCandidate(candidate);
  if(!ticket)return hold('CANDIDATE_INVALID_OR_UNAPPROVED');
  if(typeof home!=='string'||!path.isAbsolute(home)||
     !Number.isSafeInteger(uid)||uid===0)return hold('OWNER_PATH_UNVERIFIED');
  try{
    const owner=lstatSync(home);
    if(!owner.isDirectory()||owner.isSymbolicLink()||owner.uid!==uid)
      return hold('OWNER_PATH_UNVERIFIED');
    const dir=path.join(home,QUEUE_FOLDER);
    if(!existsSync(dir)) {
      try{mkdirSync(dir,{mode:0o700})}
      catch(e){if(e?.code!=='EEXIST')throw e}
    }
    if(!acceptable(lstatSync(dir),uid,true))
      return hold('PRIVATE_QUEUE_UNVERIFIED');
    const file=path.join(dir,ticket.id+'.json');
    const raw=JSON.stringify(ticket)+'\n';
    const bytes=Buffer.from(raw,'utf8');
    if(bytes.length>MAX_TICKET_BYTES)return hold('TICKET_SIZE_UNSAFE');

    let fd;
    try{
      fd=openSync(file,constants.O_WRONLY|constants.O_CREAT|
        constants.O_EXCL|(constants.O_NOFOLLOW??0),0o600);
    }catch(e){
      if(e?.code!=='EEXIST')return hold('PRIVATE_WRITE_REJECTED');
      const observed=exactRead(file,uid);
      if(observed!==raw)return hold('EXISTING_TICKET_MISMATCH');
      return Object.freeze({
        schema:'atlas.local.review.queue.receipt.v1',
        status:'DUPLICATE_SKIPPED',kind:ticket.kind,
        ticketId:ticket.id,ticketsCreated:0,ticketsExecuted:0,
        customerMessagesSent:0,cloudCalls:0,serviceChanges:0,
      });
    }
    try{
      let written=0;
      while(written<bytes.length){
        const n=writeSync(fd,bytes,written,bytes.length-written,written);
        if(n<=0)throw Error('WRITE_INTERRUPTED');
        written+=n;
      }
      fsyncSync(fd);
    }catch{
      try{closeSync(fd)}catch{}
      try{unlinkSync(file)}catch{}
      return hold('PRIVATE_WRITE_INCOMPLETE');
    }
    closeSync(fd);
    return Object.freeze({
      schema:'atlas.local.review.queue.receipt.v1',
      status:'CREATED_PENDING_REVIEW',kind:ticket.kind,
      ticketId:ticket.id,ticketsCreated:1,ticketsExecuted:0,
      customerMessagesSent:0,cloudCalls:0,serviceChanges:0,
    });
  }catch{return hold('OWNER_LOCAL_QUEUE_UNAVAILABLE')}
}
