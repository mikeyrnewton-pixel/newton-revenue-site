import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const file=fileURLToPath(new URL("../scripts/atlas-observer-stage2-receipt-20261024.sh",import.meta.url));
const source=readFileSync(file,"utf8");

test("Stage 2 receipt probe passes native Bash syntax",()=>{
  const result=spawnSync("bash",["-n",file],{encoding:"utf8",timeout:4000});
  assert.equal(result.status,0,result.stderr);
});

test("receipt differentiates no install from running fresh local MCP",()=>{
  for(const token of [
    "ATLAS_STAGE2_RECEIPT=STARTED",
    "ATLAS_STAGE2_RECEIPT=NOT_INSTALLED",
    "ATLAS_STAGE2_RECEIPT=LOCAL_SERVICE_VERIFIED",
    "CHATGPT_ATLAS_STATUS=NOT_YET_VERIFIED",
    "LOCAL_ATLAS_STATUS=FAILED_OR_STALE",
    "LOCAL_ATLAS_STATUS=",
    "ATLAS_STAGE2_RECEIPT=HOLD_",
  ]) assert.ok(source.includes(token),token);
  assert.match(source,/assert\.deepEqual\(list\.result\.tools\.map\(t=>t\.name\),\["atlas_ping","atlas_capabilities","atlas_status"\]\)/);
  assert.match(source,/assert\.equal\(denied\.error\.code,-32602\)/);
  assert.match(source,/assert\.equal\(state\.status,"FRESH"\)/);
});

test("receipt cannot change containers, credentials, network or publish status",()=>{
  assert.match(source,/--input-type=module/);
  assert.match(source,/127\.0\.0\.1:18788\/mcp/);
  assert.match(source,/\.HostConfig\.ReadonlyRootfs/);
  assert.match(source,/\.HostConfig\.NetworkMode/);
  assert.match(source,/\.HostConfig\.PortBindings/);
  assert.match(source,/\.HostConfig\.RestartPolicy\.Name/);
  assert.match(source,/\.Destination}}\|{{\.RW/);
  assert.doesNotMatch(source,/\$DOCKER"\s+(?:run|create|start|stop|restart|rm|kill|pull|push|build|cp|commit|update|network create|volume create)\b/);
  assert.doesNotMatch(source,/\b(?:curl|wget|sudo|scp|ssh|eval)\b/);
  assert.doesNotMatch(source,/(?:docker\.sock|Activepieces.*key|\-\-publish\b|\-\-privileged\b)/);
});
