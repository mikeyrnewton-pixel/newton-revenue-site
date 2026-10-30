import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {proposeWatchdogWork} from '../scripts/atlas-watchdog-work-policy.mjs';
import {storeReviewTicket,QUEUE_FOLDER,QUEUE_SCHEMA}
  from '../scripts/atlas-private-review-queue.mjs';

const NOW=Date.UTC(2026,9,29,9,0);
const uid=process.getuid?.();
const triage=(id='CORE_SERVICE_STOPPED')=>({
  schema:'atlas.observer.triage.v1',state:'NEEDS_REVIEW',
  findings:[{id,priority:1,next:'REVIEW_CORE_SERVICES'}]
});
const audit=()=>({state:'PINNED_SOURCES_VERIFIED',checked:3,expected:3});
const candidate=(id='CORE_SERVICE_STOPPED')=>
  proposeWatchdogWork({triage:triage(id),sourceAudit:audit(),now:NOW}).candidate;

function withHome(fn){
  const home=fs.mkdtempSync(path.join(tmpdir(),'atlas-private-review-fixture-'));
  fs.chmodSync(home,0o700);
  try{return fn(home);}finally{fs.rmSync(home,{recursive:true,force:true})}
}

test('a single accepted Watchdog candidate becomes ONE private pending-review ticket',()=>{
  withHome(home=>{
    const item=candidate();
    const receipt=storeReviewTicket({home,uid,candidate:item});
    assert.equal(receipt.status,'CREATED_PENDING_REVIEW');
    assert.equal(receipt.ticketsCreated,1);
    assert.equal(receipt.ticketsExecuted,0);
    assert.equal(receipt.customerMessagesSent,0);
    assert.equal(receipt.serviceChanges,0);
    assert.equal(receipt.cloudCalls,0);
    const dir=path.join(home,QUEUE_FOLDER);
    const file=path.join(dir,item.id+'.json');
    assert.equal(fs.statSync(dir).mode&0o777,0o700);
    assert.equal(fs.statSync(file).mode&0o777,0o600);
    assert.equal(fs.statSync(file).nlink,1);
    const parsed=JSON.parse(fs.readFileSync(file,'utf8'));
    assert.equal(parsed.schema,QUEUE_SCHEMA);
    assert.equal(parsed.id,item.id);
    assert.equal(parsed.kind,'REVIEW_CORE_HEALTH');
    assert.equal(parsed.lane,'QA');
    assert.equal(parsed.state,'PENDING_OWNER_REVIEW_ONLY');
    assert.equal(parsed.workerExecuted,false);
    assert.equal(parsed.externalCommunication,false);
    assert.equal(parsed.paymentOrTrade,false);
    assert.equal(Object.hasOwn(parsed,'command'),false);
  });
});

test('source integrity HOLD keeps its exact high-priority security label',()=>{
  withHome(home=>{
    const result=proposeWatchdogWork({
      triage:{schema:'atlas.observer.triage.v1',
        state:'NO_REVIEW_SIGNAL',findings:[]},
      sourceAudit:{state:'SOURCE_HASH_MISMATCH',checked:1,expected:3},
      now:NOW
    });
    const ticket=storeReviewTicket({home,uid,candidate:result.candidate});
    assert.equal(ticket.status,'CREATED_PENDING_REVIEW');
    const payload=JSON.parse(fs.readFileSync(path.join(
      home,QUEUE_FOLDER,result.candidate.id+'.json'),'utf8'));
    assert.equal(payload.kind,'REVIEW_PINNED_SOURCE_INTEGRITY');
    assert.equal(payload.lane,'BUILD');
    assert.equal(payload.risk,'HOLD_SOURCE_INTEGRITY');
    assert.equal(payload.urgency,'SECURITY_HOLD');
    assert.equal(payload.workerExecuted,false);
  });
});

test('consecutive duplicate events do not create duplicate tickets',()=>{
  withHome(home=>{
    const item=candidate();
    const first=storeReviewTicket({home,uid,candidate:item});
    const second=storeReviewTicket({home,uid,candidate:item});
    assert.equal(first.status,'CREATED_PENDING_REVIEW');
    assert.equal(second.status,'DUPLICATE_SKIPPED');
    assert.equal(second.ticketsCreated,0);
    const files=fs.readdirSync(path.join(home,QUEUE_FOLDER));
    assert.deepEqual(files,[item.id+'.json']);
  });
});

test('a changed or corrupt existing ticket fails closed instead of being overwritten',()=>{
  withHome(home=>{
    const item=candidate();
    storeReviewTicket({home,uid,candidate:item});
    const file=path.join(home,QUEUE_FOLDER,item.id+'.json');
    fs.writeFileSync(file,'{"unsafe":true}\n',{mode:0o600});
    const before=fs.readFileSync(file);
    const receipt=storeReviewTicket({home,uid,candidate:item});
    assert.equal(receipt.status,'HOLD');
    assert.equal(receipt.reason,'EXISTING_TICKET_MISMATCH');
    assert.deepEqual(fs.readFileSync(file),before);
  });
});

test('symlinked existing ticket is rejected without reading target',()=>{
  withHome(home=>{
    const item=candidate();
    const dir=path.join(home,QUEUE_FOLDER);
    fs.mkdirSync(dir,{mode:0o700});
    const target=path.join(home,'unrelated-private-file');
    fs.writeFileSync(target,'SHOULD_NOT_READ',{mode:0o600});
    fs.symlinkSync(target,path.join(dir,item.id+'.json'));
    const receipt=storeReviewTicket({home,uid,candidate:item});
    assert.equal(receipt.status,'HOLD');
    assert.equal(receipt.reason,'EXISTING_TICKET_MISMATCH');
    assert.equal(fs.readFileSync(target,'utf8'),'SHOULD_NOT_READ');
  });
});

test('symlink or group-accessible directory never receives review ticket',()=>{
  withHome(home=>{
    const item=candidate();
    const dir=path.join(home,QUEUE_FOLDER);
    const external=path.join(home,'external');
    fs.mkdirSync(external,{mode:0o700});
    fs.symlinkSync(external,dir);
    let receipt=storeReviewTicket({home,uid,candidate:item});
    assert.equal(receipt.status,'HOLD');
    assert.equal(receipt.reason,'PRIVATE_QUEUE_UNVERIFIED');
    fs.unlinkSync(dir);
    fs.mkdirSync(dir,{mode:0o770});
    receipt=storeReviewTicket({home,uid,candidate:item});
    assert.equal(receipt.status,'HOLD');
    assert.equal(receipt.reason,'PRIVATE_QUEUE_UNVERIFIED');
    assert.deepEqual(fs.readdirSync(external),[]);
    assert.deepEqual(fs.readdirSync(dir),[]);
  });
});

test('unapproved kinds, extra fields or unsupported code instructions never enter queue',()=>{
  withHome(home=>{
    const item=candidate();
    for(const altered of [
      {...item,kind:'RUN_SHELL'},
      {...item,lane:'SALES'},
      {...item,source:'chat instructions'},
      {...item,command:'email customer'},
      {...item,id:'../../secrets'},
      {...item,permissions:'AUTO_RUN'},
      {...item,retryPolicy:'DOCKER_AUTO_RESTART'},
      {...item,risk:'HOLD_UNRELATED'},
      {...item,urgency:'SECURITY_HOLD'},
      {...item,observedTimeBucket:NaN},
    ]){
      const r=storeReviewTicket({home,uid,candidate:altered});
      assert.equal(r.status,'HOLD');
      assert.equal(r.ticketsCreated,0);
    }
    assert.equal(fs.existsSync(path.join(home,QUEUE_FOLDER)),false);
  });
});

test('explicit non-Mac queue CLI cannot install, contact or write',()=>{
  const script=fileURLToPath(new URL('../scripts/atlas-minute-work.mjs',import.meta.url));
  // GH Actions Linux always blocks the host CLI; running on owner Mac is
  // a separately approved step and NOT covered by this synthetic test.
  if(process.platform!=='darwin'){
    const res=spawnSync(process.execPath,[script,'--queue-review'],{
      encoding:'utf8',timeout:4000
    });
    assert.equal(res.status,2);
    assert.match(res.stderr,/owner Mac required/);
    assert.equal(res.stdout,'');
  }
  const source=fs.readFileSync(
    fileURLToPath(new URL('../scripts/atlas-private-review-queue.mjs',import.meta.url)),
    'utf8'
  );
  for(const forbidden of [
    /\bspawn(?:Sync)?\s*\(/,/\bexec(?:Sync|File)?\s*\(/,
    /\bfetch\s*\(/,/\bcreateServer\s*\(/,
    /\bsubmitOrder\s*\(/,/\btrade\s*\(/,
  ])assert.doesNotMatch(source,forbidden);
});

test('healthy minute means nothing is stored by policy',()=>{
  withHome(home=>{
    const noEvent=proposeWatchdogWork({
      triage:{schema:'atlas.observer.triage.v1',state:'NO_REVIEW_SIGNAL',findings:[]},
      sourceAudit:audit(),now:NOW
    });
    assert.equal(noEvent.candidate,null);
    // The runner checks the null candidate before attempting any write.
    assert.equal(fs.existsSync(path.join(home,QUEUE_FOLDER)),false);
  });
});
