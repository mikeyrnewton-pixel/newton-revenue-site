#!/usr/bin/env node
/**
 * ATLAS review-only owner-Mac diagnostic: single fixed private status file.
 * No scheduling, repair, network, shell, Docker, raw content or secret output.
 * SOURCE REVIEW ONLY. Never installed by GitHub/ChatGPT on the owner's Mac.
 */
import {lstatSync, openSync, fstatSync, readSync, closeSync, constants} from "node:fs";
import {homedir} from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {SNAPSHOT_MAX_BYTES} from "./atlas-observer-snapshot.mjs";
import {triageSnapshot} from "./atlas-observer-triage.mjs";

const SAFE_DIR=".atlas-observer";
const SAFE_FILE="status.json";
function ownerPrivate(st, uid, kind){
  return st && (kind==="dir"?st.isDirectory():st.isFile()) &&
    !st.isSymbolicLink() && st.uid===uid &&
    (st.mode & 0o777)===(kind==="dir"?0o700:0o600) &&
    (kind==="dir" || (st.nlink===1 && st.size>0 && st.size<=SNAPSHOT_MAX_BYTES));
}

/** Tests may inject a disposable directory; the CLI never accepts a path. */
export function triageOwnerSnapshot({
  home=homedir(),
  uid=process.getuid?.(),
  now=Date.now(),
}={}){
  if(typeof home!=="string" || !path.isAbsolute(home) ||
     !Number.isSafeInteger(uid) || !Number.isFinite(now)){
    return triageSnapshot(null,Date.now());
  }
  const dir=path.join(home,SAFE_DIR);
  const dest=path.join(dir,SAFE_FILE);
  let fd;
  try {
    const ds=lstatSync(dir);
    if(!ownerPrivate(ds,uid,"dir")) return triageSnapshot(null,now);
    const ls=lstatSync(dest);
    if(!ownerPrivate(ls,uid,"file")) return triageSnapshot(null,now);
    fd=openSync(dest,constants.O_RDONLY | (constants.O_NOFOLLOW??0));
    const fs=fstatSync(fd);
    if(!ownerPrivate(fs,uid,"file") ||
       fs.dev!==ls.dev || fs.ino!==ls.ino) return triageSnapshot(null,now);
    const b=Buffer.alloc(fs.size);
    let offset=0;
    while(offset<b.length){
      const n=readSync(fd,b,offset,b.length-offset,offset);
      if(n<=0) return triageSnapshot(null,now);
      offset+=n;
    }
    return triageSnapshot(JSON.parse(b.toString("utf8")),now);
  } catch {
    return triageSnapshot(null,now);
  } finally {
    if(fd!==undefined) try{closeSync(fd);}catch{}
  }
}

const invoked=process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
  if(process.argv.length===3 && process.argv[2]==="--triage-once"){
    const result=triageOwnerSnapshot();
    process.stdout.write(JSON.stringify(result)+"\n");
  } else if(process.argv.length===3 && process.argv[2]==="--help"){
    process.stdout.write("ATLAS local triage (read-only): --triage-once; no scheduling, repairs or path arguments.\n");
  } else {
    process.stderr.write("HOLD: exact --triage-once or --help required.\n");
    process.exitCode=2;
  }
}
