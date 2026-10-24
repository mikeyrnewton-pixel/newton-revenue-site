# ATLAS Connector Control v0.1 — single-command Mac diagnostic

**State verified 24 October 2026:** Connector Control CLI and remote status service source remain REVIEW-ONLY; **a separate sanitized status snapshot publisher and minute-interval observer LaunchAgent were owner-installed on the Mac on 23 October**. The isolated secure MCP tunnel's *harmless* `atlas_ping` canary was independently invoked from ChatGPT on 24 October and returned `ATLAS_TUNNEL_CANARY_OK_NO_MAC_ACCESS`. This proves canary transport only; **no direct ChatGPT access to Activepieces, Mac files or actual Mac status**, and no production deployment of the observer MCP service.

This tool is meant to eliminate repeated ad hoc iPhone-to-Mac SSH debugging without reinstalling or disturbing the user's existing Mac automation stack.

## What is implemented

- `node scripts/atlas-mac-connector-control.mjs --status`: one **read-only** consolidated status from the **Mac itself**. Checks:
  - Docker daemon and five known container names: Activepieces app, worker, PostgreSQL, Redis, the owner-verified `atlas-tunnel-client-canary`;
  - local-only HTTP status from `http://127.0.0.1:8080/` (returns status class only; no response body logged);
  - watchdog LaunchAgent loaded (not a guarantee it is correctly monitoring everything);
  - timestamp freshness of `~/ATLAS-LOCAL/state/watchdog-latest.json` (without reading its contents);
  - the CLI prints a **static** `Remote ChatGPT tool call: NOT VERIFIED` because a Mac-local diagnostics execution cannot independently prove remote ChatGPT transport; the *separate* `atlas_ping` canary has been verified without Mac-status access.
- `--plan`: safe, zero-network, no-install checklist for Mac secure tunnel + permissions.
- `--check-key-file ABSOLUTE_PATH`: inspect **metadata only** for owner-controlled 0600 regular, nonempty, reasonably bounded secret file. Does not open its contents, verify the key's actual role, or display anything secret.
- `--help`: supported modes.

**Hard limits:** This tool has no `--activate`, `--install`, `--run`, `--outreach`, `--pay` or `--deploy` mode, and will reject unknown commands. It does not read actual Activepieces workflows, perform API model requests, create secrets, install apps, pull Docker images, send sales messages, or connect the tunnel.

## Why these checks are reliable

All subprocesses use fixed absolute executables, fixed arguments, no shell, short timeouts and bounded output. Only allowlisted service names and fixed health labels are printed; Docker process output is not passed through. HTTP is strictly localhost 127.0.0.1:8080. No external API calls. The code never reads a secret value.

Unit tests can inject Mac/Docker simulation, timeout/failure states, stale watchdog heartbeats and forbidden commands. Tests validate the no-connect/no-spend contract and print no private network information.

## Run *after explicit owner approval to stage source on Mac*

The owner currently has iPhone Shortcuts → SSH access, Mac Node v24.14.0 at `~/ATLAS-LOCAL-SETUP/node/bin/node`. **This Connector Control entrypoint has not itself been verified as installed on the Mac.** The separately approved `atlas-observer-publisher.mjs` and `uk.newton.atlas-observer-snapshot` LaunchAgent are installed locally; do not confuse them with the unmerged observer MCP server or this review-only CLI.

1. Review draft PR and CI.
2. Inspect the reviewed file at a pinned commit (not mutable `main`), verify hash in the staging handoff. No `curl|bash`.
3. Stage the script in a separate private folder under `~/ATLAS-CONNECTOR-CONTROL/` without altering installed ATLAS services, Docker, watchdog or Activepieces.
4. From authenticated owner-run Mac SSH, execute:
   ```sh
   "$HOME/ATLAS-LOCAL-SETUP/node/bin/node" "$HOME/ATLAS-CONNECTOR-CONTROL/atlas-mac-connector-control.mjs" --status
   ```
5. Send only the **sanitised status**, never tokens, app configuration, webhook URLs or raw Docker logs.

This is a future owner-controlled adoption procedure, **not an instruction to execute it now**. The chat's GitHub connector cannot modify local Mac files.

## Safe tunnel activation is still separate

OpenAI Support stated tunnel long-poll transport has no *described* separate charge; model/API calls remain billable and ChatGPT plugin access is governed by workspace entitlements. This does not turn a general API key into a free model-credit mechanism. Runtime key must be restricted to **Tunnels Read + Use** only and handled locally. **This historical claim is superseded:** the owner started the isolated Mac canary and official pinned tunnel client on 23 October, and ChatGPT called the fixed-return `atlas_ping` plugin successfully. The only exposed tool still returns the static `ATLAS_TUNNEL_CANARY_OK_NO_MAC_ACCESS` marker. This is **not** Activepieces access, live status or remote command execution.

Before changing the already-verified canary, replacing the tunnel target, or connecting Activepieces to ChatGPT:
- Owner's distinct approval for image download, restricted key and manual start.
- Review Activepieces MCP available tools and *enforce* read-only use; the original Prospect Engine webhook editor showed `Authentication: None`. Never publish/run flows or permit prospect outreach during inspection.
- Use a verified version-pinned official client, `ghcr.io/openai/tunnel-client:<REVIEWED_VERSION>`, not the illustrative docs tag.
- Use `http://host.docker.internal:8080/mcp` **inside Docker** only after local verification; do not bind an additional host port 8080 or expose the Mac publicly.
- Confirm client connected + OpenAI workspace association + tool listing + successful representative **read-only** flow-list call. Only then call the integration **CONNECTED**.
- Do not store the real tunnel ID/key in public GitHub or screenshots.

### Source reference

- [Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)
- [Official tunnel-client Docker deployment](https://github.com/openai/tunnel-client/blob/master/docs/deployment/docker.md)
- [Runtime permissions](https://github.com/openai/tunnel-client/blob/master/docs/permissions.md)
- [OpenAI tunnel-client releases](https://github.com/openai/tunnel-client/releases/latest)

**No cash is generated merely by running ATLAS Connector Control.**


## Mac-local observer uptime evidence — 24 October 2026

**On-device receipts, not 24/7 uptime proof:** owner-supplied 08:42 BST read-only SSH check gave observer `runs = 80`, `last exit code = 0`, snapshot age **3 seconds**, and AC power/battery 100%. At 08:46 BST another check gave `runs = 83`, `last exit code = 0`, snapshot age **59 seconds**. Overnight `pmset -g log` records repeated AC-powered maintenance sleep/DarkWake episodes, including 08:07–08:36 BST, with full Wake near 08:36 after HID user activity. Previously at 19:43 BST on 23 October a reversible 20-minute `caffeinate -s -t 1200` test had produced run count 9 and a 35-second-old snapshot. Thus the observer continues to run **when awake** and did run again after the one-off assertion expired, but this does **not** establish continuous overnight operation. `Maintenance Sleep` messages may be returns to an already-sleeping state: the initial sleep trigger remains **UNVERIFIED**.

**Safety gates:** Do not assert that a broken-screen Mac can run unattended indefinitely. Check physical lid/open state, AC power, thermal ventilation and the original pre-sleep log before considering an owner-approved persistent solution. No `sudo pmset` changes, hibernation/security overrides, permanent caffeinate job, Mac install, Docker/plugin replacement, launch or private snapshot exposure are authorised by this draft documentation. Monitor with read-only status checks only until explicit separate approval. Source: owner's 23–24 Oct SSH screenshots and PR #47 audit.
