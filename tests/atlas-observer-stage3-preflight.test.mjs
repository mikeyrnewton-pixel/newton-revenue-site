import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
const file=fileURLToPath(new URL("../scripts/atlas-observer-stage3-preflight-20261024.sh",import.meta.url));
const s=readFileSync(file,"utf8");

test("Stage 3 read-only local topology probe parses with Bash",()=>{
  const r=spawnSync("bash",["-n",file],{encoding:"utf8",timeout:4000});
  assert.equal(r.status,0,r.stderr);
});

test("Stage 3 requires exact owner-run flag and produces safe preliminary receipt",()=>{
  const r=spawnSync("bash",[file],{encoding:"utf8",timeout:4000});
  assert.equal(r.status,2);
  assert.match(r.stdout,/ATLAS_STAGE3_PREFLIGHT=STARTED/);
  assert.match(r.stdout,/HOLD_EXACT_SWITCH_REQUIRED/);
});

test("Stage 3 only performs fixed read-only Docker checks",()=>{
  assert.match(s,/ATLAS_STAGE3_PREFLIGHT=LOCAL_TOPOLOGY_VERIFIED/);
  assert.match(s,/CURRENT_TUNNEL_TARGET=ORIGINAL_CANARY_18787/);
  assert.match(s,/CUTOVER=NOT_STARTED/);
  assert.match(s,/PLATFORM_TUNNEL_ROLE=NOT_VERIFIED/);
  assert.match(s,/CHATGPT_PLUGIN_TOOL_DISCOVERY=NOT_REFRESHED/);
  assert.match(s,/FILE_BACKED_KEY_REFERENCE_NOT_VERIFIED/);
  assert.match(s,/READONLY_RUNTIME_KEY_MOUNT_NOT_VERIFIED/);
  assert.match(s,/keyfile_cmd=/);
  assert.match(s,/keyfile_entry=/);
  assert.match(s,/keyfile_args=/);
  assert.match(s,/endpoint_env=/);
  assert.match(s,/MCP_SERVER_URL=http:\/\/127\.0\.0\.1:18787\/mcp/);
  assert.match(s,/--mcp\.server-url=http:\/\/127\.0\.0\.1:18787\/mcp/);
  assert.match(s,/--control-plane\.api-key=file:\/run\/secrets\/openai_runtime_key/);
  assert.match(s,/\.Destination "\/run\/secrets\/openai_runtime_key"/);
  assert.match(s,/\.HostConfig\.NetworkMode/);
  assert.match(s,/\.HostConfig\.ReadonlyRootfs/);
  assert.match(s,/\.HostConfig\.Privileged/);
  assert.match(s,/\.HostConfig\.PortBindings/);
  assert.doesNotMatch(s,/"\$DOCKER"\s+(?:exec|run|start|stop|restart|rm|kill|pull|push|create|cp|update|network|volume|logs)\b/);
  assert.doesNotMatch(s,/"\$DOCKER" inspect -f '\{\{(?:json )?\.(?:Config\.Env|Config\.Cmd|Args|Mounts)\}\}'/);
  assert.doesNotMatch(s,/\b(?:curl|wget|sudo|scp|ssh|eval)\b/);
});

test("Stage 3 matches previously verified configuration, not the unused template paths",()=>{
  assert.match(s,/CANARY_TARGET_NOT_A_NEW_ENDPOINT|EXPECTED_CANARY_ENDPOINT_NOT_VERIFIED/);
  assert.match(s,/RUNTIME_KEY=FILE_REFERENCED_READONLY_VALUE_NOT_READ/);
  assert.doesNotMatch(s,/openai_runtime_key/);
  assert.doesNotMatch(s,/\$DOCKER"\s+(?:run|start|stop|restart|rm|kill|exec|create|cp|logs)\b/);
  assert.doesNotMatch(s,/printf.*(?:\$keyfile|\$mount|\$image|\$endpoint_env)/);
});
