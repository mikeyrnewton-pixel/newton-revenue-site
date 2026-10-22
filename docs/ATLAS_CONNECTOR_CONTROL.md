# ATLAS Connector Control v0.1 — single-command Mac diagnostic

**State:** TESTED SOURCE / DRAFT REVIEW. Not installed on owner's Mac. Not a live ChatGPT ↔ Activepieces connection.

This tool is meant to eliminate repeated ad hoc iPhone-to-Mac SSH debugging without reinstalling or disturbing the user's existing Mac automation stack.

## What is implemented

- `node scripts/atlas-mac-connector-control.mjs --status`: one **read-only** consolidated status from the **Mac itself**. Checks:
  - Docker daemon and five known container names: Activepieces app, worker, PostgreSQL, Redis, optional future `atlas-tunnel-client`;
  - local-only HTTP status from `http://127.0.0.1:8080/` (returns status class only; no response body logged);
  - watchdog LaunchAgent loaded (not a guarantee it is correctly monitoring everything);
  - timestamp freshness of `~/ATLAS-LOCAL/state/watchdog-latest.json` (without reading its contents);
  - explicitly says ChatGPT tool-call connectivity is **NOT VERIFIED**.
- `--plan`: safe, zero-network, no-install checklist for Mac secure tunnel + permissions.
- `--check-key-file ABSOLUTE_PATH`: inspect **metadata only** for owner-controlled 0600 regular, nonempty, reasonably bounded secret file. Does not open its contents, verify the key's actual role, or display anything secret.
- `--help`: supported modes.

**Hard limits:** This tool has no `--activate`, `--install`, `--run`, `--outreach`, `--pay` or `--deploy` mode, and will reject unknown commands. It does not read actual Activepieces workflows, perform API model requests, create secrets, install apps, pull Docker images, send sales messages, or connect the tunnel.

## Why these checks are reliable

All subprocesses use fixed absolute executables, fixed arguments, no shell, short timeouts and bounded output. Only allowlisted service names and fixed health labels are printed; Docker process output is not passed through. HTTP is strictly localhost 127.0.0.1:8080. No external API calls. The code never reads a secret value.

Unit tests can inject Mac/Docker simulation, timeout/failure states, stale watchdog heartbeats and forbidden commands. Tests validate the no-connect/no-spend contract and print no private network information.

## Run *after explicit owner approval to stage source on Mac*

The owner currently has iPhone Shortcuts → SSH access, Mac Node v24.14.0 at `~/ATLAS-LOCAL-SETUP/node/bin/node`. This script currently exists only in GitHub review branch, **not on the Mac**.

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

OpenAI Support stated tunnel long-poll transport has no *described* separate charge; model/API calls remain billable and ChatGPT plugin access is governed by workspace entitlements. This does not turn a general API key into a free model-credit mechanism. Runtime key must be restricted to **Tunnels Read + Use** only and handled locally. Existing tunnel was created in Platform but no client was installed/running on Mac, and no ChatGPT read-only tool call succeeded.

Before installing/running the tunnel client or connecting Activepieces to ChatGPT:
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
