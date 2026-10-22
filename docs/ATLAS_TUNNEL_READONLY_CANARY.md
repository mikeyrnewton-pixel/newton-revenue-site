# ATLAS Tunnel Canary — overnight safe-build checkpoint

**Status 22 October 2026:** GitHub TESTED_OFFLINE only. The owner's Mac, Docker and Activepieces were verified working, but ChatGPT-to-Mac is NOT connected; official tunnel image was downloaded, not started.

## Why this exists

Do NOT test the first tunnel connection against the full Activepieces MCP catalogue. Prospect Engine v1 webhook editor previously showed Authentication: None; permissions on the broad Activepieces tool catalogue have not been audited. Plugin descriptions and chat instructions alone do not enforce tool security.

The new scripts/atlas-mcp-tunnel-canary.mjs exposes one MCP tool, atlas_ping, responding only ATLAS_TUNNEL_CANARY_OK_NO_MAC_ACCESS.

- Uses Node's local HTTP server; no subprocess/Docker/Activepieces commands or external network calls. The filesystem import is used solely to detect direct script invocation, never to read or write files.
- Only JSON-RPC 2.0 initialize, tools/list, tools/call, ping methods, plus notifications. Rejects all other tool names and requests with arguments.
- GET /healthz returns a fixed synthetic readiness response. POST /mcp handles bounded JSON. Rejects batch requests, non-JSON, extra paths and requests over 8192 bytes.
- Defaults to local-only 127.0.0.1:18787. Nothing is installed as a service, started or exposed by placing code in GitHub.
- Reviewed tests cover allowed and denied calls, syntax and protocol errors, fixed output, byte limits, route restrictions and non-public network defaults.

## Safe future connection gates

1. OWNER approves staging canary code on Mac and manual local process start, then separately approves official tunnel runtime and ChatGPT plugin attach. All existing live services stay unchanged.
2. Stage reviewed source from a PINNED commit, verify integrity, no curl-to-shell. Do not transfer the key or tunnel credentials via chat, GitHub, or persistent Shortcut script text.
3. Manually run the canary local-only, verify harmless health output on Mac, then verify the Docker tunnel client can privately reach the canary by host.docker.internal. Do not broaden network bind or open firewall merely to make it work; use an owner-reviewed isolated Docker network alternative if localhost cannot be reached from container.
4. Use existing official ghcr.io/openai/tunnel-client:v0.0.17 image, no auto-restart. Mount the existing restricted key file READ-ONLY and use the officially documented control-plane.api-key=file: flag. No secrets in command arguments/environment, logs or screenshots; do not bind port 8080 because Activepieces already uses it.
5. Attach EXISTING OpenAI tunnel in ChatGPT custom MCP plugin only after confirming it lists EXACTLY atlas_ping. Any other tools, especially write-capable actions, means STOP. First successful real ChatGPT tool call returning the fixed canary token and corroborated connection logs is first proof of LIVE_VERIFIED_CANARY.
6. Separate future owner approval is required to expose any real Activepieces workflows, only after audit and enforcement of read-only MCP tools/authentication/consent. Canary is NOT Mac or business-workflow control.

## Cost, privacy and truthful status

OpenAI support (provided by owner) stated no separate described tunnel/polling charge, ChatGPT plugin within plan allowances; model API calls through Responses API are separately billable and forbidden at Platform $0 credit. No purchases, paid model calls, outgoing customer messages, real data movements, public deployment, live trades, contracts or secret changes.

Do not mistake Docker pull, key-file metadata, source tests or local HTTP health for a completed authenticated remote connection.

Official docs:
- https://developers.openai.com/api/docs/guides/secure-mcp-tunnels
- https://github.com/openai/tunnel-client/blob/master/docs/deployment/docker.md
- https://github.com/openai/tunnel-client/blob/master/docs/permissions.md

Draft review only. Keep PR unmerged until the owner approves a safe release.
