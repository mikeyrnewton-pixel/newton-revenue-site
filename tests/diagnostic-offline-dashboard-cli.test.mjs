import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,readFileSync,statSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {buildSyntheticOwnerSnapshot} from "../tools/build-diagnostic-pilot-snapshot.mjs";
const entry=fileURLToPath(new URL("../tools/build-diagnostic-pilot-snapshot.mjs",import.meta.url));

test("working CLI generates the same audited HTML as canonical pipeline and refuses overwrite",()=>{
  const dir=mkdtempSync(join(tmpdir(),"atlas-synthetic-review-"));
  try{
    const file=join(dir,"pilot-review.html");
    const result=execFileSync(process.execPath,[entry,file],{encoding:"utf8"});
    assert.match(result,/synthetic offline review snapshot \(NOT LIVE\)/);
    const html=readFileSync(file,"utf8");
    const canonical=buildSyntheticOwnerSnapshot();
    assert.equal(html,canonical.html);
    assert.match(html,/£195 Diagnostic Pilot/);
    assert.match(html,/INTERNAL ONLY · NOT RELEASED/);
    assert.doesNotMatch(html,/<script|<form|https?:\/\//i);
    if(process.platform!=="win32")assert.equal(statSync(file).mode&0o777,0o600);
    assert.throws(()=>execFileSync(process.execPath,[entry,file],{stdio:"pipe"}),
      /EEXIST|Command failed/);
    assert.equal(readFileSync(file,"utf8"),html,"failure must not mutate existing file");
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test("missing target and non-HTML target fail closed without creating any files",()=>{
  assert.throws(()=>execFileSync(process.execPath,[entry],{stdio:"pipe"}),/Command failed/);
  const dir=mkdtempSync(join(tmpdir(),"atlas-invalid-cli-"));
  try{
    assert.throws(()=>execFileSync(process.execPath,[entry,join(dir,"pilot.json")],
      {stdio:"pipe"}),/Command failed/);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
