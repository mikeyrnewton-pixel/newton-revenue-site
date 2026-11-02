# ATLAS Observer v0.1 — read-only MCP preview (NOT INSTALLED)

**23 October 2026. Cloud MCP service remains REVIEW_BRANCH / TESTED_OFFLINE only.** The Mac-side sanitized snapshot publisher and dedicated 60-second LaunchAgent were separately installed by the owner and have verified multiple local runs **while Mac stayed awake**. Keep the proven secure tunnel and existing `atlas_ping` canary **unchanged**. Neither the PR nor the Mac-local snapshot proves that ChatGPT can inspect the Mac.

## Baseline

On 23 Oct the owner manually started the isolated `atlas-mcp-readonly-canary` and official `ghcr.io/openai/tunnel-client:v0.0.17` client, then the ChatGPT personal plugin `ATLAS — Private Mac Connection` genuinely invoked `atlas_ping` and got `ATLAS_TUNNEL_CANARY_OK_NO_MAC_ACCESS`. Proof: [PR #47 audit](https://github.com/mikeyrnewton-pixel/newton-revenue-site/pull/47#issuecomment-6362633796). No Mac status or system command is exposed by that tool.

## Least-privilege design

Three separate trust boundaries, none automatically connected by GitHub source updates:

1. **Local Mac snapshot producer** — `scripts/atlas-observer-snapshot.mjs --capture` calls the **already existing, reviewed** `readMacStatus` diagnostic and writes a filtered JSON object to **stdout only**. It does not create files, schedule jobs, start containers, read secrets, expose raw names or write to Activepieces. The old diagnostic uses fixed allowlisted `docker ps`, `launchctl print`, loopback-only Activepieces HTTP response status, and heartbeat file metadata. No free-form shell execution or arbitrary user input.
2. **Owner-managed snapshot file** — on 23 Oct the owner verified the pinned publisher and 18 offline tests on the Mac, then published a filtered local `~/.atlas-observer/status.json` with owner-only folder/file modes 0700/0600. The owner separately approved/installed fixed-label `uk.newton.atlas-observer-snapshot` (StartInterval=60s, no KeepAlive): first run passed; later while an explicitly time-bounded 20-minute AC-only `caffeinate -s -t 1200` assertion was active, run count rose to **9**, exit code **0**, and snapshot age was **35s** at 19:43 BST. This is **local evidence only**. macOS sleep events made the snapshot stale (>300s) without the assertion. No permanent Mac uptime remedy has been approved. The **read-only Docker mount** at `/run/atlas-observer/status.json` is **not installed** and must remain a separate review/approval gate. No credential file, Docker socket, host root or Activepieces data directory may be mounted.
3. **Isolated MCP observer service** — `scripts/atlas-mcp-observer.mjs --serve` is an *alternative service*, **not a patch to the running verified canary**. It is designed to listen only on `127.0.0.1:18788` inside an independently isolated Docker namespace and exposes **exactly** `atlas_ping`, `atlas_capabilities` and `atlas_status`. The former returns a constant. The latter has **zero parameters** and reads only the fixed snapshot path. It launches no shell/Docker/HTTP/Mac commands and returns only fixed enum labels, no input text or raw diagnostic output. Bind to the private loopback and expose **no published host ports**. The tunnel's current target is still `127.0.0.1:18787/mcp`; rerouting it to port 18788 requires separate owner consent after QA.

### Allowed output

`atlas_status` reports `FRESH` plus a captured-at timestamp and these strictly filtered fields: `computer`, `docker`, five **known** container categories (Activepieces app/worker, Postgres, Redis, tunnel), `activepiecesHttp`, `watchdog`, and `watchdogHeartbeat`. Values are from explicit short enums. No hostnames, device IDs, usernames, secrets, customer names, bank accounts, network addresses, file paths or unrecognised containers are returned. Malformed or unrecognised status values map to `NOT_VERIFIED`; an invalid file maps to `INVALID`; missing/unreadable file to `INVALID` or `UNAVAILABLE`; age >5 minutes to `STALE`; future skew >30 seconds to `CLOCK_SKEW`. Stale data is **not displayed as current health**. HTTP `/healthz` verifies only observer process life, not actual Mac state.

### Explicitly prohibited

No `run_shell`, arbitrary Docker/API access, HTTP client, filesystem browse, install/restart/publish, Activepieces flows, CRM/customer records, trading, payment, changing secrets, wider tool catalogue, or read/write business data. No runtime key in GitHub. Existing test-only **No authentication** selection must **not** be presumed sufficient for future sensitive data. First review the tunnel/plugin's workspace association, auth, visibility, consent and ability to access health metadata; keep output innocuous. Any future operator actions require a *separate* design and owner approval.

## Review and test gates

- Tests: `node --test tests/atlas-mcp-observer.test.mjs` using local fixtures. They cover legitimate and denied MCP calls, input/schema constraints, invalid and stale snapshots, future clock skew, fake secrets/customer data, untrusted status strings, no remote read on denied operations, bounded HTTP requests, localhost-only bind, forbidden CLI commands and no effects from the preview.
- CAREER PRIME independent security review before staging or attaching plugin. GitHub CI is **not** a Mac runtime test.
- BUILD must independently verify Docker networking: if a later owner-approved observer container shares the canary network namespace to contact the tunnel client, **port 18788 must be reachable only inside that namespace**, and no existing process or client may be restarted without consent.
- Snapshot producer must be reviewed against updated tunnel container naming: existing Connector Control v0.1 originally monitored `atlas-tunnel-client`, while owner actually started `atlas-tunnel-client-canary`. Correct any status mismatch **before reporting client-state evidence**; do not mistake a stale tool name for a stopped client.
- Before any real status tool is shown to ChatGPT: inspect *exact* tool list, enforce auth/workspace scopes, verify denied methods, confirm no customer/secret leakage, and execute first real `atlas_status` call showing `FRESH` from the owner's Mac. Only then state **FULL_OBSERVER_VERIFIED**.

## Release state

- OpenAI private MCP transport / `atlas_ping`: **LIVE_VERIFIED_CANARY**.
- Observer source + synthetic tests: **TESTED_OFFLINE** once GitHub CI confirms.
- Mac-local sanitized publisher / 60-second snapshot LaunchAgent: **OWNER-INSTALLED, REPEATED LOCAL REFRESH VERIFIED WHILE AWAKE** (sleep interruption unresolved).
- Observer MCP runtime, Docker read-only mount, private tunnel reconfiguration and new plugin scope: **NOT DEPLOYED**.
- ChatGPT remote `atlas_status`: **NOT VERIFIED**.
- Real cash, real trades, Activepieces remote tool access: **NOT VERIFIED**.

Budget £0. No approvals for spend, customer contact, real trades, Mac runtime changes, plugin permission changes, PR merge or production deployment.
