# ATLAS Observer — Stage 3/4 authenticated cutover gate

## 24 October 2026 — verified progress and corrected authentication diagnosis

**Stage 2 is now MAC-LOCAL VERIFIED**, based on the owner's 17:28 BST SSH receipt: one isolated read-only Observer container running, exactly three accepted MCP tools, sanitized fresh local status, denied write/shell methods, no published ports, original canary/tunnel container identities preserved. This supersedes the earlier stage-2-pending baseline later in this historic document. The real ChatGPT tunnel tool still exposes only `atlas_ping`, so Stage 4 is NOT connected.

At 18:24 BST the owner verified the original MCP target is set by `MCP_SERVER_URL` in Docker's environment, NOT as a command-line argument. At 18:38 and 20:13 BST, checks for an **illustrative but wrong credential destination** and for three specific key-valued environment variables returned no matches. This was not evidence of unauthenticated access. Original installation notes from 23 October identify an owner-controlled file-backed runtime key mounted read-only at `/run/secrets/runtime-key`, referenced by the pinned tunnel client from its launch settings. This is historical installation context, not a fresh inspection. The source-only Stage 3 preflight now checks the correct destination and searches Docker Args/Cmd/Entrypoint with equality-only comparisons. It neither reads key bytes nor prints environment contents, private mounts, IDs or launch arguments. No tunnel or Mac changes were made by correcting the script.

**Version-specific documentation:** openai/tunnel-client `v0.0.17` supports `--control-plane.api-key=file:/path` and `MCP_SERVER_URL` configuration; Docker container environment values are immutable after create. Changing the running client target therefore requires a reviewed replacement/recreation path, not an assumed live endpoint switch. The local verifier's GitHub CI PASS is not proof of the runtime key's permissions. The runtime principal must have **Tunnels Read + Use**, no Manage or admin key; independent Platform role/workspace verification remains an explicit HOLD.

**Existing canary is the rollback baseline.** No cutover before: (1) exact runtime key-file reference and read-only bind verified on the actual Mac; (2) original non-secret launch contract recorded for rollback without exposing key material; (3) Platform role and plugin visibility verified; (4) explicit owner-visible safe transition with means to restore original 18787 target; and (5) a genuine post-cutover remote `atlas_status` plus separately demonstrated rollback. Do not duplicate the existing tunnel identity, hand keys to ChatGPT, disable the canary, merge PR #47, or alter the five hourly commercial automations.

**24 October 2026 · Review documentation ONLY · no Mac runtime or plugin changes.**

## Evidence baseline (must not be confused with target state)
- Mac source Stage 1 owner receipt: **34/34** tests and `ATLAS_OBSERVER_MCP=PINNED_OFFLINE_STAGE_TESTS_PASSED` at 12:10 BST.
- HISTORICAL 12:00–16:44 BST STATE (SUPERSEDED 17:28 BST): Stage 2 installer was under review; actual owner 17:28 BST Mac receipt later verified `ATLAS_OBSERVER_STAGE2=LOCAL_SERVICE_VERIFIED`. See opening addendum.
- ChatGPT plugin `ATLAS — Private Mac Connection` presently exposes only harmless `atlas_ping`; fresh genuine ChatGPT call still returns `ATLAS_TUNNEL_CANARY_OK_NO_MAC_ACCESS`. This proves only canary transport, not Mac health.
- Existing canary + tunnel pair must remain intact. Existing `atlas-tunnel-client-canary` configured to canary-only 127.0.0.1:18787; future Observer is designed for 127.0.0.1:18788 **within the shared namespace**. No host port or public ingress.
- Stage 2 hardening: use exact running canary image ID, deny unknown mounted directory entries, keep non-root/read-only/no-new-privileges/resource limits, verify original canary + tunnel identities. Old installer pin `4760f363...` / `dbe3982...` is **superseded** by `79ac106787ef1669a8d1898436b19e61ccd3ee15` / Git blob `e15fd9eb6678727aa8b93fb4548a295217afc8a9`.
- Historic intermittent macOS maintenance sleep remains **unresolved**. A single fresh snapshot says nothing about indefinite availability or future SLA.

## Non-negotiable preconditions before any Stage 3 change
1. SATISFIED 17:28 BST: Owner Mac independently printed actual Stage 2 success markers and read-only smoke receipt. A popup containing only `0` remains insufficient evidence for any future installs. Never rerun Stage 2 installer blindly.
2. Confirm real local HTTP MCP call to the review container returns only `atlas_ping`, `atlas_capabilities`, `atlas_status` with fresh **allowlisted sanitized status**; deny `run_shell`, command/path/URL parameters, unknown tools, and `resources/list`. Verify JSON output contains no usernames, keys, device identifiers, private customer data or network paths.
3. Verify namespace-sharing boundaries on the Mac. Observer listens only on loopback 18788, existing canary still 18787. Shared container namespace is NOT independent network isolation; any process in the shared namespace could reach both loopback listeners. No shell, Docker socket, Activepieces API or filesystem browsing may be exposed by MCP.
4. Separately inspect the official runtime key's **Tunnels Read + Use** only; exclude Manage/admin permission from the long-running tunnel client. Do not paste, log, print or submit the key into ChatGPT, GitHub, Shortcut command text, screenshots or tests. Inspect the existing tunnel's authorized Platform organization and the intended ChatGPT workspace. Keep existing identity; do NOT create a new tunnel or key by default.
5. Review the ChatGPT plugin's authentication, visibility and workspace permissions independently from the app approval preference. Current app-specific permission inherits **Allow low-risk actions**; this is **not** an MCP server auth control. If security or connector UI cannot enforce the desired bounds, STOP rather than broadening scope or assuming private tunnel means unconditional approval.
6. Review the existing tunnel-client version's **actual** CLI/help and supported configuration; do not infer a switch flag from changing docs. No restart, new client, extra tunnel or plugin scope change before explicit owner-visible rollback design and existing canary baseline capture.

## Staged release procedure (future owner gated; NOT executed)
- Freeze factual pre-change evidence: canary ping result, exact canary/tunnel container IDs, tunnel target, version, sanitized readiness, and Mac snapshot timestamp/freshness, without revealing identifiers or key material in public logs. Never change existing Activepieces Docker/CRM/website settings.
- Prepare one narrowly scoped transition for the *existing* permitted plugin/tunnel to the review-only Observer endpoint. Prefer in-place reversible configuration preserving the original 18787 target as the fallback, after confirming documented compatibility with the pinned tunnel version. Never run a simultaneous second tunnel client against the same identity merely to guess whether it works.
- After transition, inspect plugin-discovered **exact three** tool names and input schemas; use only the harmless `atlas_ping` test first and compare with the original token. Then call **real** `atlas_capabilities` and **real** `atlas_status` from ChatGPT, inspect output against allowlist, verify `FRESH`, `MACOS`, `RESPONDING`, and source timestamp within 5 minutes, and independently compare the Mac-local snapshot timestamp/state. `/healthz` or an HTTP 200 alone does not count.
- Negative tests after cutover: attempt to enumerate `resources/list` and disallowed shell/path parameters. Ensure denial; never submit real secret/customer text as adversarial payloads. If anything outside allowlist is present or changes are write-capable, STOP and revert.
- On any failure or unintended scope, **restore the original canary-only tunnel target and app tool scope** using the verified pre-change configuration, and independently make a fresh ChatGPT `atlas_ping` call. Do not delete/recreate tunnel identities or restart Activepieces. Do not consider a written rollback plan equivalent to **demonstrated** actual rollback.
- Only after cutover and rollback have both been independently verified, separately assess removal of the review-only Observer container; never remove the original canary or tunnel merely to tidy up.

## Release receipts required
`STAGE2_MAC_LOCAL_SERVICE_VERIFIED`: observer container exists and local-only MCP/FRESH tests pass on Mac, no remote claims.

`STAGE3_REMOTE_READONLY_SCOPE_VERIFIED`: tunnel/plugin scope, auth, tool schemas and negative-denial tests explicitly checked; no write tools or private records.

`STAGE4_CHATGPT_ATLAS_STATUS_VERIFIED`: genuine ChatGPT `atlas_status` tool invocation, sanitized FRESH result, matched Mac-local timestamp, and proven return to original `atlas_ping` after intentional rollback drill.

`UNATTENDED_MAC_RELIABILITY`: **NOT VERIFIED** until separate longitudinal awake/asleep behavior assessment with owner's physical safety/ventilation decision.

## Safety/cost boundaries
No money, paid API models, Work/Codex credits, production PR merges, customer outreach, transactions, orders, trades, job applications, persistent power changes, broad MCP/Activepieces access or customer/financial data moves without distinct scoped owner authorization.

## Primary public references (current at review)
- https://developers.openai.com/api/docs/guides/secure-mcp-tunnels
- https://github.com/openai/tunnel-client/blob/master/docs/permissions.md
- https://github.com/openai/tunnel-client/blob/master/docs/deployment/docker.md

**Historical review status superseded for Stage 2. Current as of 24 October evening: MAC_STAGE2_LOCAL_VERIFIED / STAGE3_AUTH_AND_CUTOVER_NOT_VERIFIED / REMOTE_ATLAS_STATUS_UNAVAILABLE / CURRENT_CANARY_VERIFIED.**

## 24 October 2026 — executable Stage 3 fixture acceptance

BUILD added `tests/atlas-observer-stage3-runtime-mocks.test.mjs` to the **existing** draft PR #47. Unlike the earlier static source-pattern tests, this suite extracts and executes the actual Stage 3 read-only Docker comparison logic against a fake local Docker CLI. Positive fixtures cover (a) the owner-observed `MCP_SERVER_URL` environment endpoint with a file-backed key reference supplied in Docker Cmd, plus an RO key bind, and (b) the original canary endpoint in Args with a key reference there. Negative fixtures require HOLD for missing endpoint, missing file-backed reference, and missing or writable expected key mount. It also checks that the test output doesn't print raw credential or tunnel-identity material.

The Website quality workflow completed successfully for this code. **No Mac Stage 3 re-execution has occurred:** CI confirms the checked script's decision logic under synthetic Docker outputs, **not** the actual owner's secret bind, permissions, current client health or runtime key role. ChatGPT can still call the original `atlas_ping` canary; remote `atlas_status` is still unavailable.

**Cutover remains a hard hold** pending an independently verified read-only Mac topology receipt and Platform principal/workspace `Read + Use` permission audit. No work requires the owner to regenerate keys, download a new runtime image, or change tunnel settings. The five enabled hourly engines remain unchanged. No customer data, API model credits or payment actions involved.
