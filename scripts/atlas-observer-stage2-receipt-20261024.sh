#!/bin/bash
# ATLAS Observer: read-only evidence probe for an *existing* Stage 2 review container.
# Does NOT install, create, start, stop, remove, publish, restart or reconfigure.
set -euo pipefail
umask 077
printf 'ATLAS_STAGE2_RECEIPT=STARTED\n'
hold() { printf 'ATLAS_STAGE2_RECEIPT=HOLD_%s\n' "$1"; exit 2; }
[ "$(uname -s)" = Darwin ] || hold NOT_MAC
[ "$(id -u)" -ne 0 ] || hold ROOT_NOT_ALLOWED
CANARY=atlas-mcp-readonly-canary
TUNNEL=atlas-tunnel-client-canary
OBSERVER=atlas-mcp-observer-review
DOCKER=''
for path in /Applications/Docker.app/Contents/Resources/bin/docker /opt/homebrew/bin/docker /usr/local/bin/docker; do
  if [ -x "$path" ]; then DOCKER="$path"; break; fi
done
[ -n "$DOCKER" ] || hold DOCKER_CLI_NOT_FOUND
"$DOCKER" info >/dev/null 2>&1 || hold DOCKER_NOT_RESPONDING
for name in "$CANARY" "$TUNNEL"; do
  running=$("$DOCKER" inspect -f '{{.State.Running}}' "$name" 2>/dev/null) || hold BASELINE_MISSING
  [ "$running" = true ] || hold BASELINE_NOT_RUNNING
done
printf 'BASELINE_CANARY_AND_TUNNEL=RUNNING\n'
if ! "$DOCKER" container inspect "$OBSERVER" >/dev/null 2>&1; then
  printf 'ATLAS_STAGE2_RECEIPT=NOT_INSTALLED\n'
  exit 0
fi
# Inspect only fixed Docker metadata fields: never dump environment, mounts'
# source host paths, container logs, tokens, status.json or customer data.
label=$("$DOCKER" inspect -f '{{index .Config.Labels "com.newton.atlas.observer-review"}}' "$OBSERVER" 2>/dev/null) || hold OBSERVER_INSPECT
[ "$label" = v1 ] || hold OBSERVER_NOT_OURS
running=$("$DOCKER" inspect -f '{{.State.Running}}' "$OBSERVER") || hold OBSERVER_INSPECT
[ "$running" = true ] || hold OBSERVER_NOT_RUNNING
ro=$("$DOCKER" inspect -f '{{.HostConfig.ReadonlyRootfs}}' "$OBSERVER") || hold OBSERVER_INSPECT
priv=$("$DOCKER" inspect -f '{{.HostConfig.Privileged}}' "$OBSERVER") || hold OBSERVER_INSPECT
net=$("$DOCKER" inspect -f '{{.HostConfig.NetworkMode}}' "$OBSERVER") || hold OBSERVER_INSPECT
restart=$("$DOCKER" inspect -f '{{.HostConfig.RestartPolicy.Name}}' "$OBSERVER") || hold OBSERVER_INSPECT
ports=$("$DOCKER" inspect -f '{{json .HostConfig.PortBindings}}' "$OBSERVER") || hold OBSERVER_INSPECT
canary_id=$("$DOCKER" inspect -f '{{.Id}}' "$CANARY") || hold CANARY_INSPECT
image=$("$DOCKER" inspect -f '{{.Image}}' "$OBSERVER") || hold OBSERVER_INSPECT
canary_image=$("$DOCKER" inspect -f '{{.Image}}' "$CANARY") || hold CANARY_INSPECT
[ "$ro" = true ] && [ "$priv" = false ] && [ "$restart" = no ] || hold CONFINEMENT_MISMATCH
[ "$net" = "container:$CANARY" ] || [ "$net" = "container:$canary_id" ] || hold NETWORK_MISMATCH
[ "$ports" = null ] || [ "$ports" = '{}' ] || hold PORTS_PUBLISHED
[ "$image" = "$canary_image" ] || hold IMAGE_MISMATCH
mounts=$("$DOCKER" inspect -f '{{range .Mounts}}{{.Destination}}|{{.RW}};{{end}}' "$OBSERVER") || hold MOUNTS_INSPECT
# Accept either mount listing order, but no additional bind, volume or writable mount.
forward='/opt/atlas-observer/scripts|false;/run/atlas-observer|false;'
reverse='/run/atlas-observer|false;/opt/atlas-observer/scripts|false;'
[ "$mounts" = "$forward" ] || [ "$mounts" = "$reverse" ] || hold MOUNTS_MISMATCH
printf 'OBSERVER_CONTAINER=RUNNING_GUARDED\n'
# Fixed local loopback only, within the review container. Does not call tunnel.
if ! "$DOCKER" exec -i "$OBSERVER" node --input-type=module - <<'LOCAL_ONLY'
import assert from "node:assert/strict";
const request=async(method,params,id=1)=>{
 const res=await fetch("http://127.0.0.1:18788/mcp",{
  method:"POST",headers:{"content-type":"application/json"},
  body:JSON.stringify({jsonrpc:"2.0",id,method,params}),
  signal:AbortSignal.timeout(4000)
 });
 assert.equal(res.status,200);
 return res.json();
};
try {
 const list=await request("tools/list",{});
 assert.deepEqual(list.result.tools.map(t=>t.name),["atlas_ping","atlas_capabilities","atlas_status"]);
 const denied=await request("tools/call",{name:"run_shell",arguments:{}});
 assert.equal(denied.error.code,-32602);
 const status=await request("tools/call",{name:"atlas_status",arguments:{}});
 const state=JSON.parse(status.result.content[0].text);
 assert.equal(state.schema,"atlas.observer.snapshot.v1");
 console.log("LOCAL_ATLAS_STATUS="+state.status);
 assert.equal(state.status,"FRESH");
 assert.equal(state.state.computer,"MACOS");
 assert.equal(state.state.docker,"RESPONDING");
} catch {
 console.log("LOCAL_ATLAS_STATUS=FAILED_OR_STALE");
 process.exitCode=3;
}
LOCAL_ONLY
then
  hold LOCAL_MCP_VALIDATION
fi
for name in "$CANARY" "$TUNNEL"; do
  running=$("$DOCKER" inspect -f '{{.State.Running}}' "$name" 2>/dev/null) || hold BASELINE_AFTER_TEST
  [ "$running" = true ] || hold BASELINE_AFTER_TEST
done
printf 'ATLAS_STAGE2_RECEIPT=LOCAL_SERVICE_VERIFIED\n'
printf 'CHATGPT_ATLAS_STATUS=NOT_YET_VERIFIED\n'
