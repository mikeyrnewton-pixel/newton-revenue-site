# ATLAS Observer — one-shot owner preflight and explicit deployment gates
**24 October 2026 — PENDING OWNER MAC PREFLIGHT. REVIEW ONLY.**

## Verified starting point
- A dedicated private Mac-local `~/.atlas-observer/status.json` is already refreshed by owner-installed `uk.newton.atlas-observer-snapshot` LaunchAgent; don't reinstall it. Owner screenshots at 08:42 and 08:46 BST showed runs 80 → 83, exit code 0 and fresh snapshot; earlier logs show unattended AC-powered maintenance sleep.
- Existing isolated `atlas-mcp-readonly-canary` + `atlas-tunnel-client-canary` returned `ATLAS_TUNNEL_CANARY_OK_NO_MAC_ACCESS` to a **real ChatGPT tool call** on 24 October. Do NOT change either service under this preflight.
- Current review branch 349013f96a149a5359f8d2a2dcdbf2d65386b577, `atlas-mcp-observer.mjs` service is not installed or connected to ChatGPT; `atlas_status` remote receipt does NOT exist.
- Safe output: only fixed readiness labels, **no Docker listing**, usernames, tokens, tunnel IDs, IPs, contents of the status file, logs or credential paths.
- This is a **read-only, local prerequisite check**. Running this command does not authorise container creation, downloads, mount setup, power modifications or plugin/tunnel switch.

## Owner's existing iPhone Run Script Over SSH — READ ONLY
```sh
echo "=== ATLAS OBSERVER PREFLIGHT V1 ==="
if pmset -g batt 2>/dev/null | grep -q "Now drawing from 'AC Power'"; then
  echo "AC_POWER=YES"
else
  echo "AC_POWER=NO_HOLD"
fi
if /usr/sbin/ioreg -r -k AppleClamshellState -d 1 2>/dev/null |
  grep -q '"AppleClamshellState" = No'; then
  echo "LID_SENSOR_OPEN=YES"
else
  echo "LID_SENSOR_OPEN=UNKNOWN_HOLD"
fi
DIR="$HOME/.atlas-observer"
SNAP="$DIR/status.json"
if [ -d "$DIR" ] && [ ! -L "$DIR" ] &&
   [ -f "$SNAP" ] && [ ! -L "$SNAP" ] &&
   [ "$(stat -f %Lp "$DIR" 2>/dev/null)" = "700" ] &&
   [ "$(stat -f %Lp "$SNAP" 2>/dev/null)" = "600" ] &&
   [ "$(stat -f %l "$SNAP" 2>/dev/null)" = "1" ] &&
   [ "$(stat -f %Su "$DIR" 2>/dev/null)" = "$(id -un)" ] &&
   [ "$(stat -f %Su "$SNAP" 2>/dev/null)" = "$(id -un)" ]; then
  echo "SNAPSHOT_OWNER_PERMISSIONS=PRIVATE"
  AGE=$(( $(date +%s) - $(stat -f %m "$SNAP") ))
  if [ "$AGE" -ge 0 ] && [ "$AGE" -le 300 ]; then
    echo "SNAPSHOT_FRESH=YES"
  else
    echo "SNAPSHOT_FRESH=NO"
  fi
else
  echo "SNAPSHOT_OWNER_PERMISSIONS=REVIEW_HOLD"
fi
if launchctl print "gui/$(id -u)/uk.newton.atlas-observer-snapshot" >/dev/null 2>&1; then
  echo "OBSERVATION_AGENT=REGISTERED"
else
  echo "OBSERVATION_AGENT=NOT_VERIFIED"
fi
DOCKER=""
for PATH_ENTRY in /Applications/Docker.app/Contents/Resources/bin/docker     /opt/homebrew/bin/docker /usr/local/bin/docker; do
  if [ -x "$PATH_ENTRY" ]; then DOCKER="$PATH_ENTRY"; break; fi
done
if [ -z "$DOCKER" ]; then
  echo "DOCKER_CLI=NOT_FOUND"
elif ! "$DOCKER" info >/dev/null 2>&1; then
  echo "DOCKER_DAEMON=NOT_RESPONDING"
else
  echo "DOCKER_DAEMON=RESPONDING"
  for NAME in atlas-mcp-readonly-canary atlas-tunnel-client-canary; do
    RUNNING=$("$DOCKER" container inspect -f '{{.State.Running}}' "$NAME" 2>/dev/null)
    if [ "$RUNNING" = "true" ]; then
      case "$NAME" in
        atlas-mcp-readonly-canary) echo "CANARY_CONTAINER=RUNNING" ;;
        atlas-tunnel-client-canary) echo "TUNNEL_CONTAINER=RUNNING" ;;
      esac
    else
      case "$NAME" in
        atlas-mcp-readonly-canary) echo "CANARY_CONTAINER=HOLD" ;;
        atlas-tunnel-client-canary) echo "TUNNEL_CONTAINER=HOLD" ;;
      esac
    fi
  done
  BASE_IMAGE=$("$DOCKER" container inspect -f '{{.Config.Image}}' atlas-mcp-readonly-canary 2>/dev/null)
  if [ -n "$BASE_IMAGE" ] && "$DOCKER" image inspect "$BASE_IMAGE" >/dev/null 2>&1; then
    echo "CANARY_BASE_IMAGE=CACHED"
  else
    echo "CANARY_BASE_IMAGE=REVIEW_HOLD"
  fi
  if "$DOCKER" container inspect atlas-mcp-observer-review >/dev/null 2>&1; then
    echo "OBSERVER_CONTAINER=ALREADY_EXISTS_REVIEW"
  else
    echo "OBSERVER_CONTAINER=ABSENT"
  fi
  CANARY_ID=$("$DOCKER" container inspect -f '{{.Id}}' atlas-mcp-readonly-canary 2>/dev/null)
  NET=$("$DOCKER" container inspect -f '{{.HostConfig.NetworkMode}}' atlas-tunnel-client-canary 2>/dev/null)
  if [ "$NET" = "container:atlas-mcp-readonly-canary" ] ||
     { [ -n "$CANARY_ID" ] && [ "$NET" = "container:$CANARY_ID" ]; }; then
    echo "TUNNEL_NAMESPACE=CANARY_SHARED"
  else
    echo "TUNNEL_NAMESPACE=REVIEW_REQUIRED"
  fi
fi
echo "PREFLIGHT_COMPLETE=NO_CHANGES"
```

### Do not do during preflight
No `docker run`, `docker pull`, `docker stop`, `docker exec`, `launchctl load`, `pmset -a`, `caffeinate`, `curl|sh`, key inspection, reading file content or public port binding.

## Conditional next gate AFTER output is reviewed
1. **QA**: require a pin and exact test result for `scripts/atlas-mcp-observer.mjs`, `scripts/atlas-observer-snapshot.mjs`, and supporting source. Confirm container base image is cached, compatibility, privs, and exact fixed contents. Verify Mac physical ventilation and stable AC supply; do not claim 24/7 service.
2. **Separate scoped owner approval to STAGE/START** one new isolated `atlas-mcp-observer-review` container alongside existing canary (NO RESTART of canary or tunnel, NO PUBLISHED PORTS, readonly filesystem, dropped capabilities, no privileges, limited CPU/RAM, readonly bind of the single private *snapshot directory* not file, only approved reviewed observer source, `127.0.0.1:18788` within the *same isolated network namespace*). Must verify provenance (pinned SHA) and the ability of container to read a `0600` file safely. No secret/Docker socket/whole-home mounts. Fail closed if any prerequisite is different. Use a different name than any existing component.
3. **Local-only acceptance**: observer returns exactly `atlas_ping`, `atlas_capabilities`, `atlas_status`, and `atlas_status` says FRESH only with valid snapshot age ≤300 sec. Negative calls (`run_shell`, `tools/write`, arbitrary path, URL and arguments) fail closed. Existing tunnel still routes to original port 18787 at this stage.
4. **Separate scoped owner approval for CONNECTOR CUTOVER**: only after security/auth/workspace review. Preserve verified canary rollback route; never expose broad Activepieces tools. Change the tunnel target/plugin separately, then run a *real* ChatGPT `atlas_status` call and compare it to an independent Mac-local timestamp. No FULL_OBSERVER_VERIFIED until this succeeds.
5. **Uptime follow-up**: address recurring maintenance sleep using original sleep history and proper thermal safeguards; do not make permanent `pmset` changes as part of Observer deployment.

Release states: **MAC_SNAPSHOT_OWNER_INSTALLED / LIVE_VERIFIED_CANARY / OBSERVER_MCP_TESTED_OFFLINE / OBSERVER_REMOTE_NOT_AVAILABLE**. £0 expenditure. No contracts, genuine customer data, payments, trading or production site changes.
