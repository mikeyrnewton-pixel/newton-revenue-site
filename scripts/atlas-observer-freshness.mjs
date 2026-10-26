// Read-only inspection of ATLAS's private Mac observer snapshot metadata.
// No file contents, shell commands, Docker changes or network operations.
import {lstatSync} from 'node:fs';
import {join} from 'node:path';

export const OBSERVER_FRESHNESS_BUDGET_SECONDS=180;
const receipt=(state,ageSeconds=null)=>Object.freeze({
  state,
  ageSeconds,
  evidence:'FILESYSTEM_MTIME_ONLY_NOT_AUTOMATIC_CADENCE_OR_CONTENT_PROOF',
  privateContentsRead:false,
  automaticRefreshVerified:false,
  writesPerformed:false,
});

export function inspectPrivateObserverSnapshot({
  home,uid,nowMs=Date.now(),lstat=lstatSync,
}={}){
  if(typeof home!=='string'||!home.startsWith('/')||home.includes('\0')||
     !Number.isSafeInteger(uid)||uid<1||
     !Number.isFinite(nowMs)||nowMs<0||
     typeof lstat!=='function')return receipt('NOT_VERIFIED');
  let directory,file;
  try{
    directory=lstat(join(home,'.atlas-observer'));
    file=lstat(join(home,'.atlas-observer','status.json'));
  }catch{return receipt('NOT_VERIFIED')}
  // lstat, not stat: reject symlinks instead of following them.
  const safe=directory?.isDirectory?.()===true&&file?.isFile?.()===true&&
    directory.uid===uid&&file.uid===uid&&
    (directory.mode&0o777)===0o700&&(file.mode&0o777)===0o600&&
    Number.isSafeInteger(file.size)&&file.size>=2&&file.size<=65536;
  if(!safe)return receipt('SECURITY_OR_FILETYPE_HOLD');
  const elapsedMs=nowMs-file.mtimeMs;
  if(!Number.isFinite(elapsedMs)||elapsedMs<0)return receipt('CLOCK_OR_TIMESTAMP_HOLD');
  const ageSeconds=Math.floor(elapsedMs/1000);
  if(!Number.isSafeInteger(ageSeconds))return receipt('CLOCK_OR_TIMESTAMP_HOLD');
  return receipt(ageSeconds<=OBSERVER_FRESHNESS_BUDGET_SECONDS?
    'RECENT_PRIVATE_SNAPSHOT_PRESENT':'STALE_PRIVATE_SNAPSHOT',ageSeconds);
}
