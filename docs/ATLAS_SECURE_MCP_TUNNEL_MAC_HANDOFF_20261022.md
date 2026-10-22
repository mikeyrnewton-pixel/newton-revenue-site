# ATLAS Secure MCP Tunnel — owner-safe Mac handoff (22 October 2026)

**Status: PREPARED, NOT ACTIVATED.** This document is a review-only design. Never treat the registered `tunnel_…` record as a live connection.

## Evidence already verified from owner screenshots

- One existing OpenAI-hosted Secure MCP Tunnel registered in the owner's Platform org and selected ChatGPT workspace. **Tunnel client not installed/started** and custom ChatGPT app/plugin **not installed**.
- Mac reachable from iPhone via authenticated Tailscale SSH, Apple Silicon `arm64`, `sw_vers` reports `27.0.1`.
- Docker Desktop running, CLI at `/Applications/Docker.app/Contents/Resources/bin/docker`; no Homebrew found.
- Activepieces app/worker/Postgres/Redis running; local `http://127.0.0.1:8080/` returned HTTP 200; private MCP URL reportedly `http://Michaels-MacBook-Pro.local:8080/mcp`. The `/mcp` protocol/authentication handshake **has not been tested**.
- Mac watchdog LaunchAgent loaded with fresh heartbeat at 20:28:46 on 22 Oct.
- Activepieces shows original `NEWTON REVENUE - Prospect Engine v1` four-stage flow, no runs displayed, webhook editor showed `Authentication: None`.
- Owner Platform billing screenshot showed free-trial **$0.00 remaining API credits** and Add payment details; owner prohibits new spending, trials, billable API usage or exposing the Mac.

## Explicit HOLD before runtime

1. **Cost gate**: written/current Platform confirmation of whether Secure MCP Tunnel control-plane calls from `tunnel-client` with a restricted API key and ChatGPT plugin tool discovery incur fees; no assumption from generic Responses API model-token pricing. Under the current £0 rule, do **not** add a card, top up, enable auto-recharge, generate/use billable model API requests, or run the client pending resolution.
2. **Tool gate**: inspect/limit Activepieces MCP permissions so that only harmless read/list/inspect actions can be called. Current screenshot of four-stage Prospect Engine includes a webhook `Authentication: None`; no publish/run/flow modification, outbound sends, contact data or payment actions without separately scoped approval.
3. **Security gate**: use an OpenAI restricted *runtime* key with only Tunnels **Read + Use**, not a Platform admin key, and keep it in private file / secret mount, never in this chat, screenshots, shell command arguments, GitHub repository, clipboard-synced shortcut, workflow logs or Docker CLI environment flags.

## Exact supported architecture, once gates are cleared

ChatGPT plugin (Connection: **Tunnel**, select the already registered tunnel ID) → OpenAI hosted tunnel → client container on existing Docker Desktop (outbound HTTPS to `api.openai.com:443`) → `http://host.docker.internal:8080/mcp` (Docker Desktop host alias) → Mac's existing Activepieces.

**Crucial Mac detail:** Docker already publishes Activepieces on Mac host port **8080**. **Do not map the tunnel client's health listener to host 8080**; Docker port collision. Do not modify existing Activepieces containers, LaunchAgents, watchdog, Tailscale, or firewall. First verify `host.docker.internal` reaches the Activepieces MCP endpoint **from inside Docker**, not only Mac host. Reuse existing private network.

Official Docker image is multi-arch `ghcr.io/openai/tunnel-client` (Linux `arm64` supported by Apple Silicon Docker). **Use a specific verified release**, not moving latest and not the illustrative v1.2.3 from official docs. At time of review GitHub `releases/latest` resolved to `v0.0.17`; **version and image must be rechecked immediately before installation**.

The official runtime expects `CONTROL_PLANE_TUNNEL_ID`, `MCP_SERVER_URL` (local MCP target), and restricted `CONTROL_PLANE_API_KEY`. Prefer the documented `--control-plane.api-key=file:/... ` path using a read-only secret mount. Do not persist token in iOS Shortcut action text or generate an unrestricted API key.

## Verification order after explicit approval

- **Read-only local preflight**: existing Docker healthy, port 8080 responsive, correct tunnel ID and org/workspace association; test network/DNS without contacting prospective buyers.
- Start a **manually stopped-by-default** review-only client; no autorestart / launchd integration / Production deployment.
- Check client `/healthz` / `/readyz` from inside private container, validate authentication/permissions, ensure no sensitive logs.
- In ChatGPT web **Plugins → Add custom MCP server → Tunnel**, select existing tunnel; inspect discovered tool list; allow read-only inspection tools only. Confirmation permissions must be reviewed before calls.
- Execute a **safe read-only flow listing**, then read `NEWTON REVENUE - Prospect Engine v1` structure; compare with owner screenshots. Successful read is first proof of live integration; **not** first sale/production deployment.
- Stop and remove review client if auth/permission/cost gate fails; no secret dumps; preserve existing workloads.

## Owner controls

**Owner needs to approve separately:** new runtime key; downloaded Docker image and manual container start; remote AI discovery of Mac automation metadata; each later write capability and any recurring service. No implied authorization from tunnel creation itself.

**Key sources (read from current versions before activation):**
- https://developers.openai.com/api/docs/guides/secure-mcp-tunnels
- https://raw.githubusercontent.com/openai/tunnel-client/master/docs/onboarding.md
- https://raw.githubusercontent.com/openai/tunnel-client/master/docs/permissions.md
- https://raw.githubusercontent.com/openai/tunnel-client/master/docs/deployment/docker.md
- https://docs.docker.com/desktop/features/networking/networking-how-tos/
- https://github.com/openai/tunnel-client/releases/latest

This file contains **no actual tunnel ID or credentials**.
