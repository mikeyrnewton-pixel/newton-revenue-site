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


## Actual owner Mac preflight receipt — 24 Oct 2026 11:21 BST

Owner executed the approved **read-only preflight** through iPhone SSH and supplied a screenshot at 11:21 BST. Every prerequisite in the preflight reported ready:

- `AC_POWER=YES`; `LID_SENSOR_OPEN=YES`.
- `SNAPSHOT_OWNER_PERMISSIONS=PRIVATE`; `SNAPSHOT_FRESH=YES`.
- `OBSERVATION_AGENT=REGISTERED`.
- `DOCKER_DAEMON=RESPONDING`.
- `CANARY_CONTAINER=RUNNING`; `TUNNEL_CONTAINER=RUNNING`.
- `CANARY_BASE_IMAGE=CACHED`; `OBSERVER_CONTAINER=ABSENT`.
- `TUNNEL_NAMESPACE=CANARY_SHARED`.
- Final receipt: `PREFLIGHT_COMPLETE=NO_CHANGES`.

**What this confirms:** approved Mac-local snapshot and existing private canary/tunnel prerequisites are ready for an isolated observer *candidate*. **What it does not prove:** Node runtime/UID interoperability of the cached image; the new Observer service actually launching; a successful read-only 0600 snapshot directory bind; local three-tool MCP acceptance; current watchdog heartbeat; uninterrupted sleep-free runtime; or remote ChatGPT `atlas_status` accessibility. Base image availability does not prove its name, digest, architecture or ability to run our reviewed Observer. No changes occurred in this preflight.

**Reviewed pinned service source at PR #47 head `1053f4251c7d092e9f1afbe709b89bcb27dea096`:**
- `scripts/atlas-mcp-observer.mjs` Git blob SHA-1: `56eafea5e1e2a60ec5de0a3eb8051ea6b72349c5`.
- `scripts/atlas-observer-snapshot.mjs` Git blob SHA-1: `7dde06ee91ce6776c6e6217e4dd43c402f678d79`.
- `tests/atlas-mcp-observer.test.mjs` Git blob SHA-1: `0b43927fbe6843d05a6241785b83ed8d55b1b804`.
- Pin the immutable commit and independently check `git hash-object` against these **exact Git blob hashes** before any proposed staging. No mutable branch/main retrieval or unverified dynamic download.

**Next explicit scope for approval, not performed:** stage *only* those source files into a new private, non-overwriting review folder; execute the targeted offline suite; validate known cached Node image identity and snapshot mount permissions. Only with a separate explicit approval and passing local checks, consider starting **one** `atlas-mcp-observer-review` container with no published host ports, only a private read-only directory-level snapshot bind and read-only code bind, no host/Docker socket, dropped capabilities, no writable customer resources, same isolated canary network namespace and port **18788**. Keep existing canary and tunnel processes untouched and still targeting **18787**. Verify local MCP allowlist and stale/safety denials before any additional separate plugin/tunnel cutover approval. `OBSERVATION_AGENT` registration and `SNAPSHOT_FRESH` do not solve the previously observed unattended maintenance sleep.

**Status: MAC_PREFLIGHT_PASS / SOURCE_REVIEWED / OBSERVER_CONTAINER_NOT_DEPLOYED / CHATGPT_MAC_STATUS_NOT_AVAILABLE.** £0 spent; no service, secrets, account, plugin, power, production or customer state changed.


## iPhone download failure recovery — 24 Oct 2026 11:54 BST

The owner tried to download the previous `.sh` staging attachment on iPhone and received the platform's **“The file download failed. Please try again later.”** alert. **No evidence of Mac staging or any failed Mac command.** To avoid relying on platform attachment handling and two iCloud files, the draft-only `scripts/atlas-observer-local-stage-20261024.sh` was replaced with a pinned-source-fetch staging mode. This uses only public GitHub HTTPS GET to fetch three reviewed source/test files from immutable commit `1053f4251c7d092e9f1afbe709b89bcb27dea096`, verifies each against its exact Git blob SHA-1, then runs local Node syntax and offline regression tests. It makes no Docker, tunnel, plugin, power, LaunchAgent or production changes. No `curl|bash` and no credentials.

**Owner SSH recovery bootstrap:** fetch the staging script itself from pinned commit `c5376b1a5cc3e9ef63422f15279c6c1fd8486664`, expected Git blob `5bec6ba702cb03532246b930cb470808577c866e`, verify before invoking `/bin/bash <local_temp_file> --stage-offline-only`. Guarded Mac-only, on AC, private new stage directory without overwriting old files. This requires Mac outbound HTTPS **only to public raw.githubusercontent.com** for immutable code retrieval; it does not send business data, tokens or secrets. The test suite then runs locally using Node with ephemeral loopback fixtures. Release gate unchanged: observer container must not be started and the canary/tunnel/plugin must not be touched without a separate explicit scope approval. Run the owner snippet supplied in chat; do not use the obsolete iCloud ZIP/script-file directions.


## Owner-approved Stage 1 PASS — 24 Oct 2026 12:10 BST

Owner authorised **offline Stage 1 only** by replying `Stage`. Initial iOS file-attachment download failed; the reviewed, immutable-source HTTPS staging recovery was prepared in PR #47 and executed via owner's existing iPhone SSH Shortcut. Owner screenshot at 12:10 BST confirms all three pinned Git source hashes passed integrity checks:

- `SOURCE_VERIFIED=scripts/atlas-mcp-observer.mjs`;
- `SOURCE_VERIFIED=scripts/atlas-observer-snapshot.mjs`;
- `SOURCE_VERIFIED=tests/atlas-mcp-observer.test.mjs`.

Actual owner Mac Node test receipt: **tests 34; pass 34; fail 0; cancelled 0; skipped 0; todo 0**; duration ~304 ms. Final marker: `ATLAS_OBSERVER_MCP=PINNED_OFFLINE_STAGE_TESTS_PASSED`.

Explicit unchanged-state receipts: `OBSERVER_CONTAINER=NOT_STARTED`, `EXISTING_CANARY_AND_TUNNEL=UNCHANGED`, `CHATGPT_PLUGIN=UNCHANGED`, `SPEND_GBP=0`.

**Truth boundary:** Mac-local source has passed offline tests and is staged in a new private review folder; *no new Observer service is running*, no container image/UID mapping or host mount has been verified, no private health snapshot has been read through MCP, no cutover to `atlas_status` occurred. This does **not** settle unattended Mac sleep, plugin auth scope, host-data exposure, Docker Desktop bind mount ownership, or 24/7 uptime. Before next owner authorisation: independently review the exact container image, verify Mac Docker Desktop can safely bind the **private snapshot directory** read-only without widening 0700/0600 permissions, require a frozen resource-limited container with no host-published ports and no socket/secret mounts, and preserve canary/tunnel. **Next milestone (separate approval): isolated Observer container start + local-only acceptance, NOT tunnel/plugin cutover.**


## Stage 2 local-only Docker review plan — 24 October 2026

Owner expressed explicit approval to pursue the remaining Observer stages on 24 Oct and requested execution. Stage 1 was already completed on owner Mac (34/34 local tests, pinned source). We prepared a **separate Stage 2 guarded script**, `scripts/atlas-observer-local-container-20261024.sh`, requiring exact flag `--start-local-only`. It is **not yet executed on Mac** as of this review note.

- Pin **immutable reviewed script commit** `4760f363c3955459dc32d4e6fce013e75edac14d`; Git blob SHA-1 `dbe39828403e8317b8d5f3db770f4c47654e94aa`. Obtain via HTTPS-only GET; independently `git hash-object` verify before executing. No `curl|sh`.
- Stage2 re-verifies AC, macOS lid sensor, private owner-only local source and status file (0700/0600, no symlinks/hardlinks), pinned source Git blob integrity, status ≤300 sec, Docker daemon, existing canary/tunnel running and namespace relationship. Refuses preexisting Observer container.
- Uses the **immutable image ID of the already-running canary**, not its mutable local tag, with `--pull=never`, first in temporary **--network none** unprivileged containers to verify Node ≥22 and read-only access to exactly the source and snapshot directory. Zero new image pulls, no model calls or spend.
- If prerequisites pass, starts **one distinct** `atlas-mcp-observer-review` container: shares the existing canary network namespace (`--network container:atlas-mcp-readonly-canary`), not an independently isolated network namespace; server binds solely to 127.0.0.1:18788 **inside that namespace**, while existing tunnel continues to port 18787. No host-published ports, no network host, no Docker socket, no secrets, no Activepieces mount, no whole-home mount, no automatic restart; container uses numeric non-root UID/GID, read-only rootfs, drop all Linux capabilities, no-new-privileges, 128MB/0.5 CPU/64 PIDs, two read-only directory mounts only. If it exits, `--rm` cleans up.
- Automatic on-Mac local MCP smoke uses `docker exec` **only in the new review container** and requires exact tools `atlas_ping`, `atlas_capabilities`, `atlas_status`, sanitized FRESH Mac/Docker snapshot, fixed canary token and denied `run_shell`, malformed arguments and resources. On abnormal exit, the script attempts to delete only its self-created, ownership-labelled container ID; NEVER targets the original canary/tunnel. Existing canary/tunnel baseline is reverified after local smoke.
- Stage2 script shell syntax, read-only mount count, owner-only execution flags, forbidden privilege/public port pattern and no-restart/no-provider guards are under `tests/atlas-observer-local-container.test.mjs`. Exact review-head CI was green before this documentation change. This is static/offline CI **not** proof of Docker mounting or remote ChatGPT status on Mac.

**Still blocked beyond Stage 2:** actual isolated runtime must first return the local `ATLAS_OBSERVER_STAGE2=LOCAL_SERVICE_VERIFIED` marker. Only then separately review plugin/tunnel connection change. Current verified plugin has only `atlas_ping` and no ChatGPT `atlas_status`. Avoid reporting `FULL_OBSERVER_VERIFIED` before first remote call. The 24 Oct sleep root cause remains unresolved, so Stage2 process health doesn't prove unattended uptime.

**24 October 2026 security hardening:** Draft Stage 2 installer uses the running canary's immutable Docker image ID `{{.Image}}` rather than a mutable `{{.Config.Image}}` tag. Stage 2 remains local-only and unexecuted; CI tests validate source properties but cannot prove on-Mac Docker mount access. The deliberate shared canary network namespace means the new loopback port can be accessed by the existing canary/tunnel namespace, though the tunnel's configured destination remains unchanged at 18787. This is not independent network isolation or authenticated remote `atlas_status` access. Only sanitized allowlisted snapshot fields may be mounted. No existing services or plugins are reconfigured by this source change.

## 24 October 2026 — iPhone Shortcut output ambiguity and read-only receipt recovery

Owner's Shortcut screenshot at 13:39 BST showed a Quick Look popup displaying only `0`; the subsequent editor screenshot showed a red warning on **Run Script over SSH** and an `Input: Ask for Input` field. There was **no** `ATLAS_OBSERVER_STAGE2=LOCAL_SERVICE_VERIFIED` Mac receipt and no captured stdout from the installer. A `0` popup is not independent evidence of execution or success. Do **not** rerun Stage 2 blindly or claim the container exists. The existing `atlas_ping` canary was independently called from ChatGPT after the incident and still returned its fixed constant.

BUILD added `scripts/atlas-observer-stage2-receipt-20261024.sh` and `tests/atlas-observer-stage2-receipt.test.mjs` on the existing draft branch. This script is **inspection-only** and never starts, stops, deletes, reconfigures or publishes any service. It prints `ATLAS_STAGE2_RECEIPT=STARTED` immediately, then distinguishes `NOT_INSTALLED`, explicit `HOLD_...` preflight failures, or `LOCAL_SERVICE_VERIFIED`. Its positive receipt requires running canary+tunnel, exact owner-labelled Observer, the inherited canary image ID, read-only root, non-privileged container, no published host ports, no automatic restart, exactly two read-only reviewed mounts, local tools allowlist, denial of unauthorized `run_shell`, and fresh filtered local `atlas_status`. It never calls the remote tunnel or reads secret/counterparty records. GitHub checks are **offline/static only** until an owner Mac result is provided.

**Lowest-friction iPhone SSH display check (no Docker and no Mac modifications):**

```sh
printf 'ATLAS_SSH_STDOUT_OK\n'
```

Only if Quick Look returns the exact text `ATLAS_SSH_STDOUT_OK` is the SSH stdout display channel confirmed. Otherwise inspect Shortcut `Run Script over SSH` action (including unexpected `Input: Ask for Input` prompt and its `Shell Script Result` handoff to `Show`) rather than rerunning an installer. This is the single next owner-only troubleshooting step if needed. Do not ask for SSH passwords or keys.

Once the Shortcut output channel is confirmed, use an independently Git-hash-verified fetch of the review-only receipt script from an immutable commit. Run `bash -n` before execution; never pipe remote download directly into a shell. All Stage 2, plugin/tunnel, and Mac uptime status claims remain gated by observed Mac results. Keep all five hourly automations and commercial draft PRs intact. No new spend.
