#!/bin/bash
# ATLAS Observer Stage 2: start ONE isolated, read-only, on-Mac review container.
# Does NOT restart/change the existing canary, tunnel, plugin, Mac power or watchdog.
# Owner-approved Stage 2 ONLY; local testing, no public port or future auto-restart.
set -euo pipefail
umask 077
if [ "$#" -ne 1 ] || [ "$1" != '--start-local-only' ]; then
  echo 'HOLD: exact switch --start-local-only required'; exit 2
fi
if [ "$(uname -s)" != Darwin ] || [ "$(id -u)" = 0 ]; then
  echo 'HOLD: non-root Mac owner required'; exit 2
fi
if ! /usr/bin/pmset -g batt | /usr/bin/grep -q "Now drawing from 'AC Power'"; then
  echo 'HOLD: AC power not confirmed'; exit 2
fi
if ! /usr/sbin/ioreg -r -k AppleClamshellState -d 1 2>/dev/null |
   /usr/bin/grep -q '"AppleClamshellState" = No'; then
  echo 'HOLD: lid sensor not confirmed open'; exit 2
fi

STAGE="$HOME/ATLAS-OBSERVER-MCP-REVIEW-20261024"
SCRIPTS="$STAGE/scripts"
SNAPDIR="$HOME/.atlas-observer"
SNAP="$SNAPDIR/status.json"
CANARY='atlas-mcp-readonly-canary'
TUNNEL='atlas-tunnel-client-canary'
OBSERVER='atlas-mcp-observer-review'
LABEL='com.newton.atlas.observer-review'
CREATED_ID=''
DOCKER=''
for path in /Applications/Docker.app/Contents/Resources/bin/docker \
            /opt/homebrew/bin/docker /usr/local/bin/docker; do
  if [ -x "$path" ]; then DOCKER="$path"; break; fi
done
if [ -z "$DOCKER" ] || ! "$DOCKER" info >/dev/null 2>&1; then
  echo 'HOLD: existing Docker daemon not available'; exit 2
fi

# Never replace any pre-existing container, whether running or stopped.
if "$DOCKER" container inspect "$OBSERVER" >/dev/null 2>&1; then
  echo 'HOLD: Observer review container already exists; no overwrite'; exit 2
fi

# Paths must be unambiguous Docker --mount sources, with exact owner-only modes.
for dir in "$STAGE" "$SCRIPTS" "$SNAPDIR"; do
  case "$dir" in *','*|*$'\n'*|*$'\r'*) echo 'HOLD: unsafe mount path'; exit 2;; esac
  if [ ! -d "$dir" ] || [ -L "$dir" ] ||
     [ "$(stat -f %Lp "$dir" 2>/dev/null)" != 700 ] ||
     [ "$(stat -f %Su "$dir" 2>/dev/null)" != "$(id -un)" ]; then
    echo 'HOLD: nonprivate or missing source directory'; exit 2
  fi
done
for file in "$SCRIPTS/atlas-mcp-observer.mjs" \
            "$SCRIPTS/atlas-observer-snapshot.mjs" "$SNAP"; do
  if [ ! -f "$file" ] || [ -L "$file" ] ||
     [ "$(stat -f %Lp "$file" 2>/dev/null)" != 600 ] ||
     [ "$(stat -f %l "$file" 2>/dev/null)" != 1 ] ||
     [ "$(stat -f %Su "$file" 2>/dev/null)" != "$(id -un)" ]; then
    echo 'HOLD: nonprivate, linked or missing review file'; exit 2
  fi
done
# Both binds expose directories, not individual files: atomic snapshot renames
# require the directory mount to observe the latest status.json inode.
# Fail closed if private folders contain anything outside the exact reviewed
# code files and the sanitized snapshot. A publisher temp file can exist for
# milliseconds during a scheduled refresh; if so, retry later, never broaden.
shopt -s nullglob dotglob
for entry in "$SCRIPTS"/*; do
  case "$entry" in
    "$SCRIPTS/atlas-mcp-observer.mjs"|"$SCRIPTS/atlas-observer-snapshot.mjs") ;;
    *) echo 'HOLD: unexpected item in mounted source directory'; exit 2 ;;
  esac
done
for entry in "$SNAPDIR"/*; do
  if [ "$entry" != "$SNAP" ]; then
    echo 'HOLD: unexpected item in private snapshot mount directory'; exit 2
  fi
done
shopt -u nullglob dotglob
if [ "$(git hash-object "$SCRIPTS/atlas-mcp-observer.mjs")" != \
     '56eafea5e1e2a60ec5de0a3eb8051ea6b72349c5' ] ||
   [ "$(git hash-object "$SCRIPTS/atlas-observer-snapshot.mjs")" != \
     '7dde06ee91ce6776c6e6217e4dd43c402f678d79' ]; then
  echo 'HOLD: staged source integrity changed'; exit 2
fi
age=$(( $(date +%s) - $(stat -f %m "$SNAP") ))
if [ "$age" -lt 0 ] || [ "$age" -gt 300 ]; then
  echo 'HOLD: local observer snapshot stale or clock skewed'; exit 2
fi
echo 'SOURCE_AND_SNAPSHOT=PRIVATE_PINNED_FRESH'

for service in "$CANARY" "$TUNNEL"; do
  if [ "$("$DOCKER" inspect -f '{{.State.Running}}' "$service" 2>/dev/null)" != true ]; then
    echo 'HOLD: existing canary or tunnel not running'; exit 2
  fi
done
CANARY_ID=$("$DOCKER" inspect -f '{{.Id}}' "$CANARY")
TUNNEL_ID=$("$DOCKER" inspect -f '{{.Id}}' "$TUNNEL")
NET=$("$DOCKER" inspect -f '{{.HostConfig.NetworkMode}}' "$TUNNEL")
if [ "$NET" != "container:$CANARY" ] && [ "$NET" != "container:$CANARY_ID" ]; then
  echo 'HOLD: existing tunnel not isolated with canary'; exit 2
fi
# Reuse the immutable image ID of the *running* canary, never a mutable
# local image tag that could now point to different unreviewed bytes.
IMAGE=$("$DOCKER" inspect -f '{{.Image}}' "$CANARY")
if [[ ! "$IMAGE" =~ ^sha256:[0-9a-f]{64}$ ]] ||
   ! "$DOCKER" image inspect "$IMAGE" >/dev/null 2>&1; then
  echo 'HOLD: exact cached running canary image ID unavailable'; exit 2
fi
# A temporary no-network, no-mount container verifies the cached image runs Node.
VERSION=$("$DOCKER" run --rm --pull=never --network none --read-only \
  --cap-drop=ALL --security-opt no-new-privileges:true \
  --pids-limit 32 --memory 128m --user "$(id -u):$(id -g)" \
  --entrypoint node "$IMAGE" --version 2>/dev/null) || {
    echo 'HOLD: cached image cannot run Node as unprivileged user'; exit 2
  }
MAJOR=$(printf '%s' "$VERSION" | /usr/bin/sed -n 's/^v\([0-9][0-9]*\)\..*/\1/p')
if [ -z "$MAJOR" ] || [ "$MAJOR" -lt 22 ]; then
  echo 'HOLD: approved Node 22+ runtime not present'; exit 2
fi
echo 'CACHED_NODE_RUNTIME=VERIFIED'

# No networking and only the two reviewed private read-only directory binds.
if ! "$DOCKER" run --rm --pull=never --network none --read-only \
  --cap-drop=ALL --security-opt no-new-privileges:true \
  --pids-limit 32 --memory 128m --user "$(id -u):$(id -g)" \
  --mount "type=bind,src=$SCRIPTS,dst=/opt/atlas-observer/scripts,readonly" \
  --mount "type=bind,src=$SNAPDIR,dst=/run/atlas-observer,readonly" \
  --entrypoint node "$IMAGE" -e '
    const fs=require("node:fs");
    try{
      for(const f of ["/opt/atlas-observer/scripts/atlas-mcp-observer.mjs",
                      "/opt/atlas-observer/scripts/atlas-observer-snapshot.mjs"]){
        fs.accessSync(f,fs.constants.R_OK)
      }
      const file="/run/atlas-observer/status.json";
      const st=fs.statSync(file);
      if(!st.isFile()||st.size<1||st.size>4096) process.exit(3);
      const data=JSON.parse(fs.readFileSync(file,"utf8"));
      if(data.schema!=="atlas.observer.snapshot.v1"||
         typeof data.capturedAt!=="string") process.exit(3);
      console.log("MOUNTS=PRIVATE_READ_ONLY_ACCESS_OK")
    }catch{process.exit(3)}
  ' 2>/dev/null; then
  echo 'HOLD: non-root container cannot safely read pinned source and snapshot'; exit 2
fi

cleanup_on_error() {
  status=$?
  trap - EXIT
  if [ "$status" -ne 0 ] && [ -n "$CREATED_ID" ]; then
    # Only remove the single container ID created by this invocation, and
    # only if ownership label still matches our exact staging identity.
    owned=$("$DOCKER" inspect -f '{{index .Config.Labels "com.newton.atlas.observer-review"}}' "$CREATED_ID" 2>/dev/null || true)
    if [ "$owned" = v1 ]; then
      "$DOCKER" rm -f "$CREATED_ID" >/dev/null 2>&1 || true
    fi
    echo 'STAGE2=HOLD_CLEANUP_ATTEMPTED'
  fi
}
trap cleanup_on_error EXIT

# The canary continues to own port 18787. This new review service binds only
# 127.0.0.1:18788 INSIDE its existing isolated container network namespace.
CREATED_ID=$("$DOCKER" run -d --rm --pull=never \
  --name "$OBSERVER" --label "$LABEL=v1" \
  --network "container:$CANARY" \
  --read-only --cap-drop=ALL --security-opt no-new-privileges:true \
  --pids-limit 64 --memory 128m --cpus 0.5 --user "$(id -u):$(id -g)" \
  --mount "type=bind,src=$SCRIPTS,dst=/opt/atlas-observer/scripts,readonly" \
  --mount "type=bind,src=$SNAPDIR,dst=/run/atlas-observer,readonly" \
  --entrypoint node "$IMAGE" --max-old-space-size=64 \
  /opt/atlas-observer/scripts/atlas-mcp-observer.mjs --serve 2>/dev/null) || {
    echo 'HOLD: guarded Observer container did not start'; exit 2
  }

if [ "$("$DOCKER" inspect -f '{{.State.Running}}' "$CREATED_ID" 2>/dev/null)" != true ] ||
   [ "$("$DOCKER" inspect -f '{{.HostConfig.ReadonlyRootfs}}' "$CREATED_ID" 2>/dev/null)" != true ] ||
   [ "$("$DOCKER" inspect -f '{{.HostConfig.Privileged}}' "$CREATED_ID" 2>/dev/null)" != false ] ||
   [ "$("$DOCKER" inspect -f '{{.HostConfig.NetworkMode}}' "$CREATED_ID" 2>/dev/null)" != "container:$CANARY" ]; then
  echo 'HOLD: observer isolation cannot be verified'; exit 2
fi

# Test from INSIDE the new Observer container; never use a host-published port
# and never call the active tunnel. Every test speaks to 127.0.0.1:18788.
if ! "$DOCKER" exec -i "$CREATED_ID" node --input-type=module - <<'LOCAL_MCP_TEST'
import assert from "node:assert/strict";
const url="http://127.0.0.1:18788/mcp";
const request=async(method,params,id=1)=>{
  const response=await fetch(url,{method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({jsonrpc:"2.0",id,method,params}),
    signal:AbortSignal.timeout(4000)});
  assert.equal(response.status,200);
  return response.json();
};
try {
  const list=await request("tools/list",{});
  assert.deepEqual(list.result.tools.map(t=>t.name),[
    "atlas_ping","atlas_capabilities","atlas_status"]);
  const ping=await request("tools/call",{name:"atlas_ping",arguments:{}});
  assert.equal(ping.result.content[0].text,"ATLAS_TUNNEL_CANARY_OK_NO_MAC_ACCESS");
  const cap=await request("tools/call",{name:"atlas_capabilities",arguments:{}});
  const capabilities=JSON.parse(cap.result.content[0].text);
  assert.equal(capabilities.writeActions,false);
  assert.equal(capabilities.activepiecesAccess,false);
  assert.equal(capabilities.macShell,false);
  const result=await request("tools/call",{name:"atlas_status",arguments:{}});
  const snapshot=JSON.parse(result.result.content[0].text);
  assert.equal(snapshot.status,"FRESH");
  assert.equal(snapshot.schema,"atlas.observer.snapshot.v1");
  assert.equal(snapshot.state.computer,"MACOS");
  assert.equal(snapshot.state.docker,"RESPONDING");
  const denied=await request("tools/call",{name:"run_shell",arguments:{}});
  assert.equal(denied.error.code,-32602);
  const deniedArgs=await request("tools/call",
    {name:"atlas_status",arguments:{command:"whoami"}});
  assert.equal(deniedArgs.error.code,-32602);
  const forbidden=await request("resources/list",{});
  assert.equal(forbidden.error.code,-32601);
  console.log("MCP_TOOLS=EXACTLY_THREE_READ_ONLY");
  console.log("ATLAS_STATUS=FRESH_PRIVATE_SNAPSHOT");
  console.log("UNAUTHORIZED_METHODS=DENIED");
} catch {
  console.log("HOLD: local MCP acceptance failed");
  process.exitCode=3;
}
LOCAL_MCP_TEST
then
  echo 'HOLD: local MCP acceptance failed'; exit 2
fi

# Final verification: no published ports, no auto-restart, and old canary/tunnel
# still running and sharing their original namespace.
PUBLISHED=$("$DOCKER" inspect -f '{{json .HostConfig.PortBindings}}' "$CREATED_ID")
RESTART=$("$DOCKER" inspect -f '{{.HostConfig.RestartPolicy.Name}}' "$CREATED_ID")
if [ "$PUBLISHED" != null ] && [ "$PUBLISHED" != '{}' ]; then
  echo 'HOLD: unintended host port binding'; exit 2
fi
if [ "$RESTART" != no ]; then
  echo 'HOLD: unintended restart policy'; exit 2
fi
for service in "$CANARY" "$TUNNEL"; do
  if [ "$("$DOCKER" inspect -f '{{.State.Running}}' "$service" 2>/dev/null)" != true ]; then
    echo 'HOLD: baseline service not running'; exit 2
  fi
done
# Require the same original running container IDs, rather than just checking
# that containers with the same names happen to be running after setup.
if [ "$("$DOCKER" inspect -f '{{.Id}}' "$CANARY")" != "$CANARY_ID" ] ||
   [ "$("$DOCKER" inspect -f '{{.Id}}' "$TUNNEL")" != "$TUNNEL_ID" ] ||
   [ "$("$DOCKER" inspect -f '{{.HostConfig.NetworkMode}}' "$TUNNEL")" != "$NET" ]; then
  echo 'HOLD: baseline container identity or tunnel network changed'; exit 2
fi

trap - EXIT
echo 'ATLAS_OBSERVER_STAGE2=LOCAL_SERVICE_VERIFIED'
echo 'OBSERVER_CONTAINER=RUNNING_REVIEW_ONLY_NO_RESTART'
echo 'EXISTING_CANARY_AND_TUNNEL=RUNNING_ORIGINAL_IDS'
echo 'CHATGPT_ATLAS_STATUS=NOT_CONNECTED'
echo 'HOST_PORTS=NONE'
echo 'SPEND_GBP=0'
