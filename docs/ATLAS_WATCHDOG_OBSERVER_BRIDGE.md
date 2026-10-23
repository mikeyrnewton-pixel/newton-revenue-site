# ATLAS Watchdog → Observer snapshot bridge (REVIEW ONLY)

**23 October 2026. Source is on draft PR #47. Nothing in this document has been installed or scheduled on the owner's Mac.** The existing OpenAI secure tunnel remains live, but its single tool `atlas_ping` is a constant response: it does **not** inspect the Mac.

## Why this is the next step

The existing **ATLAS Connector Control** read-only collector already knows how to inspect **fixed** Docker container status, Activepieces loopback HTTP readiness and watchdog LaunchAgent status plus the watchdog heartbeat file's **modification time only**. It does not need or expose watchdog log content. However, ChatGPT cannot currently call this collector. The Observer prototype deliberately has no shell, Docker socket or filesystem browser.

This new `scripts/atlas-observer-publisher.mjs` is the missing **local, private file boundary**:

1. When explicitly invoked on the Mac as `node scripts/atlas-observer-publisher.mjs --publish`, it calls the existing vetted `captureSnapshot`/read-only Mac collector, then independently revalidates and re-filters all data.
2. It creates **only** a private, owner-controlled `$HOME/.atlas-observer/status.json` file containing fixed enums for Docker, Activepieces and watchdog status and its capture timestamp; it never persists raw logs, container names, secrets, customer data or even unknown metadata fields. Directory permissions must be **0700**, file **0600**, and ownership must match the user. An unexpected symlink, hardlink, shared directory or permissive existing file fails closed.
3. Each replacement uses a distinct private temporary file, fsync and atomic rename. **Important:** a future Docker container should mount the **directory**, not the status.json file inode, **read-only** at `/run/atlas-observer`; an individual-file bind might not see the new inode after rename.
4. If separately approved later, `scripts/atlas-mcp-observer.mjs` can read only `/run/atlas-observer/status.json`; no caller-selected path, Mac command, unrestricted Docker/API endpoint or write tool is allowed. The remote `atlas_status` tool returns a `FRESH` label only if snapshot age is no more than **five minutes** (30-second future skew tolerance). Watchdog heartbeat has its **own** freshness label, so `FRESH` snapshot does **not** imply a healthy watchdog.
5. A **separate future owner-approved** local periodic job (e.g. a user LaunchAgent running once per 60 seconds) would be required for automatic refresh. This is **not** integrated into, nor does it alter/restart, the existing ATLAS watchdog.

## Explicit safe boundaries

- The new publisher has **no HTTP listener**, no socket, no external API usage, no tool endpoint, no Activepieces workflow calls, no Mac/Docker changes besides publishing its dedicated private status file when expressly executed, and no modifications to the existing watchdog's LaunchAgent or heartbeat.
- The Observer MCP service and publisher must remain **separate processes/privilege domains**. The MCP service cannot invoke the publisher; it only receives the already sanitized result through a private read-only mount.
- Do not mount `/var/run/docker.sock`, user home, `.atlas-tunnel/runtime-key`, credentials, actual Activepieces volume or customer data into an MCP container. Do not bind public host ports.
- Keep the *currently verified* `atlas-mcp-readonly-canary` and `atlas-tunnel-client-canary` unchanged. No reassignment of tunnel targets or plugin auth/permission changes before scoped owner approval.
- The existing canary's **No authentication** setting was accepted for its one fixed harmless response, **not** permission for wider raw diagnostics, secrets, financial information or any Operator capabilities. Reassess connector workspace access and data security before connecting even this low-sensitivity status output.
- Mac screen and SSH are not required to review/test source; they would be required only for the separately approved on-device installation and verification.

## Testing performed off-Mac

- Run `node --test tests/atlas-mcp-observer.test.mjs tests/atlas-observer-publisher.test.mjs`.
- The publisher tests cover private owner permissions, fresh watchdog-label propagation, atomic replacement across inode changes, lossless loading by the Observer's existing allowlist assessor, privacy of malicious extra fields, rejection of symlink directories/files, hardlinked and world-readable target files, owner mismatch, stale/future/invalid snapshots and explicit action gating.
- These tests use synthetic fixtures in the isolated development environment, not real owner Mac data; CI cannot prove launchd currently running or the watchdog heartbeat currently fresh.
- Code under test is review-only; the security QA owner (CAREER PRIME) must review it independently before it is installed.

## Remaining release gates — not waived by passing CI

1. **Security QA** on publisher, collector and Observer; verify absence of arbitrary remote operations and no secret/raw text leakage.
2. **Single specific owner approval** to stage the files on their Mac and run **one local read-only health snapshot** publishing into the private folder. Verify file metadata (not secrets) and that its watchdog timestamp label is truly current.
3. **Separate specific owner approval** before installing/enabling any 60-second LaunchAgent snapshot refresher or starting the isolated Observer MCP container. Verify fixed read-only directory mount and absolutely no host-published port or unrestricted access.
4. **Separate specific owner approval** before changing the secure tunnel's target to the reviewed Observer service or widening the custom plugin from `atlas_ping` to `atlas_status`. Confirm tool list and authentication/workspace access. Run a **genuine remote** `atlas_status` call and compare its freshness with independently verified Mac time and watchdog heartbeat. Only then label **LIVE_VERIFIED_OBSERVER**.
5. Only after the above may other agents rely on Mac status snapshots; scheduled automation tool exposure must be independently checked at each run.

**Current truth:** Connection `LIVE_VERIFIED_CANARY`; watchdog last owner-confirmed loaded and heartbeat fresh at earlier diagnostic, **current heartbeat unknown**; publisher `TESTED_OFFLINE`, **NOT INSTALLED**; periodic refresh **NOT CONFIGURED**; `atlas_status` **NOT YET AVAILABLE** in ChatGPT; no real trading or newly cleared revenue evidenced. Budget £0. No customer communications, charges, live trades, production merges or Mac/service modifications were authorised by creating this review source.

## New 60-second LaunchAgent preview — reviewed source, not installed

**Source:** `scripts/atlas-observer-launchd-plan.mjs`, whose sole executable CLI output is `--emit` (an XML plist **printed to stdout**). This is not an installer. It has no write/install/load/start/enable/restart functionality. A separate owner-approved on-Mac deployment procedure would later need to verify paths and explicitly create/install the plist; this code never performs those actions.

- Fixed **distinct** label: `uk.newton.atlas-observer-snapshot` (the existing watchdog remains `uk.newton.atlas-watchdog`).
- Fixed interval: `StartInterval = 60` seconds, no dynamic interval or arguments; `RunAtLoad = false`, `KeepAlive = false`, `ProcessType = Background`.
- `ProgramArguments` is a **three-element array**, not a shell command: resolved absolute Node binary, resolved adjacent `atlas-observer-publisher.mjs` path, `--publish`. The generator rejects relative paths, unexpected executable/script names and control characters; it escapes XML metacharacters.
- No customer details, passwords, remote URLs, arbitrary environment variables, secrets, Docker socket mounts, stdout logging or network access in the plist. stdout and stderr are redirected to `/dev/null`; observability is through the snapshot status and age, not raw logs.
- launchd's per-user `StartInterval` is **not guaranteed to run while the Mac sleeps**; after sleep, the status may become STALE. That is correct and safer than misreporting an old heartbeat as live.
- Manual verification **before approval**: `node --test tests/atlas-observer-launchd-plan.test.mjs`, plus inspect the generated plist with an XML/plist parser. Mac-local `--emit` must run only after the user approves fetching/staging the reviewed source; neither this document nor GitHub CI authorizes doing so.

**Release gates unchanged:** no new LaunchAgent has been installed or activated; no observer container has been started; no tunnel target or custom plugin permissions changed. Independent security QA is still required, followed by the owner's *specific* on-device approval. The existing `atlas_ping` remains the only proven remote tool. Do not claim the watchdog's current heartbeat is known from this software preview.
