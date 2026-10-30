import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const file=fileURLToPath(new URL("../scripts/atlas-observer-stage2-iphone-bootstrap-20261024.sh",import.meta.url));
const source=readFileSync(file,"utf8");

test("iPhone Stage 2 bootstrap passes native Bash syntax",()=>{
  const result=spawnSync("bash",["-n",file],{encoding:"utf8",timeout:4000});
  assert.equal(result.status,0,result.stderr);
});

test("requires exact one-shot owner switch and fails closed before any remote action",()=>{
  const result=spawnSync("bash",[file],{encoding:"utf8",timeout:4000});
  assert.equal(result.status,2);
  assert.match(result.stdout,/ATLAS_BOOTSTRAP=STARTED/);
  assert.match(result.stdout,/HOLD: explicit --start-local-only required/);
  assert.match(source,/\[ "\$\#" -ne 1 \] \|\| \[ "\$1" != '--start-local-only' \]/);
  assert.match(source,/\[ "\$\(uname -s\)" != Darwin \] \|\| \[ "\$\(id -u\)" = 0 \]/);
});

test("only immutable trusted installer is executed after hash and syntax checks",()=>{
  assert.match(source,/d87e78dcc416d5127d79e0eef43c34afc3bcbe62/);
  assert.match(source,/55b3e5dbdf6e3d010ca35e8f4d00dd7288079566/);
  assert.match(source,/\/usr\/bin\/git hash-object/);
  assert.match(source,/\/bin\/bash -n "\$FILE"/);
  assert.match(source,/\/bin\/bash "\$FILE" --start-local-only 2>&1/);
  assert.match(source,/ATLAS_BOOTSTRAP=INSTALLER_HASH_AND_SYNTAX_VERIFIED/);
  assert.match(source,/ATLAS_BOOTSTRAP_EXIT=%s/);
  assert.match(source,/trap finish EXIT/);
  assert.match(source,/\/usr\/bin\/curl -fsSL --proto '=https' --tlsv1\.2/);
  assert.doesNotMatch(source,/\|\s*(?:bash|sh)\b/);
  assert.doesNotMatch(source,/(?:sudo|docker\.sock|\.env|api.key|--publish|--restart|--privileged)/i);
});
