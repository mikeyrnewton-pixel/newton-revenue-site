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

## 25 October late: Stage 3 source-only preflight strengthened (not run on Mac)

- Enhanced scripts/atlas-observer-stage3-preflight-20261024.sh to inspect existing Stage 2 Observer container's immutable safety contract BEFORE any tunnel cutover. No Docker writes or disclosure of keys, Config.Env, mount sources or host file paths. It requires non-root numeric UID:GID, readonly rootfs, unprivileged mode, no restart, no published host ports, cap drop ALL and read-only script/snapshot mount targets. Retains current exact canary/tunnel identity and original 18787 target, and does NOT connect to observer 18788.
- New tests/atlas-observer-stage3-confinement-mocks.test.mjs exercise exact contracts and adversarial root/0:0 user, unprotected caps, bad writable mounts, published ports, privileged drift. Verified source commit 1c9217b55441b898d67e4eb03aafb9f3eae403a9: 276/276 GitHub Node tests passed; PR47 is DRAFT/UNMERGED. No Mac shell, container, key or tunnel actually changed by this source-only patch.
- Still blocked on actual Mac owner-run read-only Stage3 inspection plus platform runtime key role approval and real ChatGPT atlas_status, then independent rollback evidence. Local test pass is NOT Mac runtime evidence.


## 26 October 2026 — extra mount and privilege safety (source review only)

Strengthened the existing read-only Stage 3 Mac topology inspector without accessing or changing the actual Mac or any tunnel. It now rejects an existing Observer container if Docker inspection finds **any host mount beyond the two expected read-only destinations**, any added Linux capability despite CapDrop=ALL, or missing `no-new-privileges`. This closes a gap where a valid expected mount could conceal an *additional* Docker socket/host mount. It inspects only boolean/equality evidence; does not print secret values, mount paths, environment or container identities. Commits `cf7ea28645024cd851151e7842ba3903eb47f5e6` and `a62cc61abfd6cc0497be5e0603037a6cc482903e`; **278/278** Node tests passed on GitHub Actions run `40316322183`. Owner Mac Stage 2 was previously locally verified; Stage 3 was not run on the actual Mac during this update. Exact safe `atlas_ping` canary and Tailscale/SSH existing connection are not equivalent to authorised ChatGPT `atlas_status`. Stage 3 local inspection, Platform role verification, reversible tunnel cutover, fresh remote status and rollback remain HOLD until separately approved and independently executed.


## 26 October 2026 — final tunnel confinement regression gate, current source

The latest review-only Stage 3 inspector requires the **existing tunnel** to have **exactly one** mount: the reviewed, read-only file-backed runtime key at the fixed container destination. The tunnel must retain `CapDrop=ALL`, no extra capabilities and `no-new-privileges`; the review Observer must have **exactly two** previously reviewed read-only mounts. Any mismatch fails closed before connection changes. It does not read or print key material, source paths, credentials or Docker configuration, and never changes running services. This supplements—not replaces—the separate Platform permission and workspace-auth checks.

- Source guard commit: `afe46316663565f246cc4b02ab6a6ae7ee6aff2a`.
- Regression coverage: `tests/atlas-observer-stage3-confinement-mocks.test.mjs` and new `tests/atlas-observer-stage3-tunnel-confinement.test.mjs`.
- Reviewed head `6d5e0ba1a38aea73454c64d10fa64dcb484e360a`: **302 of 302** GitHub Node tests passed, workflow ID `40408349099`.
- Pinned Stage3 shell file Git blob: `3d06691eaf200e5be3669d8e35da0394c15fb628`. Only owner-run *read-only* preflight has been prepared; it has **not** been run against the actual Mac for this latest revision.

**Releases still on HOLD:** owner-Mac Stage3 read-only evidence; verified Platform runtime role **Tunnels Read + Use** (not Manage); exact nonsecret original-tunnel rollback inventory; separately authorised existing-tunnel replacement targeting the local Observer; genuine ChatGPT `atlas_capabilities` / `atlas_status`; independently demonstrated fallback to original canary. Do not imply the source gate or the fixed `atlas_ping` token proves Mac connectivity. No production merge, outreach, payments, spending, active Mac changes or plugin changes occurred in this update.

## 26 October 2026, 22:06 GMT — OWNER MAC STAGE 3 VERIFIED (new decisive evidence)

Michael executed the **immutable pinned Stage 3 read-only preflight** from an iPhone SSH Shortcut on the actual Mac and supplied the resulting screenshot directly in conversation. The pinned code was from commit `6d5e0ba1a38aea73454c64d10fa64dcb484e360a`, with matching pinned Git blob `3d06691eaf200e5be3669d8e35da0394c15fb628` (the preceding owner command checked the blob before running). The exact visible stdout markers were:

- `ATLAS_STAGE3_PREFLIGHT=STARTED`
- `LOCAL_CONTAINERS=ALL_RUNNING_SHARED_PRIVATE_NAMESPACE`
- `TUNNEL_IMAGE_AND_RUNTIME_CONFINEMENT=VERIFIED`
- `OBSERVER_EXISTING_READONLY_CONFINEMENT=VERIFIED`
- `CURRENT_TUNNEL_TARGET=ORIGINAL_CANARY_18787`
- `RUNTIME_KEY=FILE_REFERENCED_READONLY_VALUE_NOT_READ`
- `OBSERVER_LOCAL_ENDPOINT=SEPARATE_REVIEW_18788`
- `PLATFORM_TUNNEL_ROLE=NOT_VERIFIED`
- `CHATGPT_PLUGIN_TOOL_DISCOVERY=NOT_REFRESHED`
- `CUTOVER=NOT_STARTED`
- `ATLAS_STAGE3_PREFLIGHT=LOCAL_TOPOLOGY_VERIFIED`

**Interpretation:** The **actual current Mac** passed the exact Stage 3 Docker topology/security inspection: all three local containers present/running, expected shared private namespace, sealed tunnel and review-only observer confinement, original target still on 18787, alternate observer target 18788, read-only file-reference key mount. No credential content was accessed. The receipt independently confirms **no live tunnel cutover**. This upgrades `STAGE3_LOCAL_TOPOLOGY` from *source/test only* to **MAC_LOCAL_VERIFIED**, superseding prior outstanding Stage 3 local inspection references above. The separate Platform principal runtime key RBAC **Tunnels Read + Use (not Manage)** and ChatGPT workspace association, connector tool discovery, an owner-authorized reversible target switch, fresh remote `atlas_status` and demonstrated fallback are STILL UNVERIFIED/BLOCKED. Do not upgrade Stage4 or unattended Mac uptime solely from this receipt.

**Next minimum user-only step:** Check the *existing* runtime key's effective permissions/role and intended tunnel/ChatGPT workspace association in Platform UI **without opening, copying, rotating or showing any key values**. The official permissions documentation distinguishes `Read`, `Use` and `Manage`. The assistant has no connected Platform permission-inspection authority. A redacted permissions screenshot or a simple user answer about the role is sufficient to plan the separate, reversible Stage4 cutover. No Mac runtime or GitHub production release changes are authorized by this read-only verification.

Official sources checked 26 October 2026:
- https://developers.openai.com/api/docs/guides/secure-mcp-tunnels
- https://github.com/openai/tunnel-client/blob/master/docs/permissions.md

**Current execution state: STAGE3_MAC_LOCAL_VERIFIED / STAGE4_REMOTE_HOLD / ORIGINAL_CANARY_RUNNING / ZERO_SPEND / ZERO_EXTERNAL_CONTACTS.**

### 26 October 2026 — connector app permissions checked, not confused with tunnel RBAC

A live ChatGPT settings lookup for the exact installed app **ATLAS — Private Mac Connection** returned `App-specific: Use my default`, global default `Allow low-risk actions`. This is an app invocation consent posture; it does **not** prove the Platform tunnel runtime API key's effective permissions, whether the key is restricted to `Tunnels Read + Use`, or a validated ChatGPT workspace association. A fresh call to the installed connector `atlas_ping` still returned `ATLAS_TUNNEL_CANARY_OK_NO_MAC_ACCESS`. Do not change the app default setting to full access to shortcut the tunnel RBAC review.

The next reviewed Mac-only check is the existing standalone `scripts/atlas-tunnel-cutover-contract-20261026.mjs --inspect-only` (Git blob `f0481f9e713c4186eafcc08fa59b4092a111e309`). It verifies more of the immutable original launch/reconstruction contract than the Stage3 property probe, and prints a bounded, redacted HOLD/REVIEW receipt only. **No service switch, Docker write or key read is allowed by this command.** Actual Mac result still pending at this entry's timestamp.

## 27 October 2026 09:51 UK — first REAL Stage4 Mac inspection and corrected Docker lifecycle contract

The owner ran the original immutable `scripts/atlas-tunnel-cutover-contract-20261026.mjs` from commit `6a153c34834bdfecfc55a4fea57f0b4621ddd9d0` with file Git blob `f0481f9e713c4186eafcc08fa59b4092a111e309`, using a verified `.mjs` file and their already functioning iPhone-to-Mac SSH. Screenshot receipt (private conversation): `ATLAS_STAGE4_STARTED`, `DOWNLOAD_OK`, `SOURCE_VERIFIED`, `ATLAS_CUTOVER_CONTRACT=HOLD_STOP_REMOVAL_CONTRACT_UNKNOWN`, `ATLAS_STAGE4_DIAGNOSTIC_COMPLETE`. The diagnostic wrapper intentionally exited 0 to preserve the redacted HOLD stdout in Shortcuts; **the Stage4 review itself returned HOLD, not a successful cutover**.

Since the reviewed inspector reached its final `HostConfig.AutoRemove===true` assertion without any earlier HOLD, all preceding checks of existing container identity, private networking, readonly constraints, image pin, file-backed read-only key mount, environment allowlist, original canary 18787 and fixed intended Observer 18788 passed in that Mac execution. The final HOLD means existing AutoRemove was not the hardcoded value true; the Docker daemon might have `false` (normal default) or an unavailable field. It is NOT evidence of tunnel outage or security defect.

The Stage4 inspection script was therefore patched on this SAME draft PR47 branch, solely to recognise exact Boolean `AutoRemove=true` **or** `AutoRemove=false` with different nonsecret rollback outcomes:
- true: `STOP_AUTO_REMOVES_OLD_CONTAINER_RECREATE_REQUIRED`;
- false: `STOP_RETAINS_ORIGINAL_CONTAINER_NAME_COLLISION_REVIEW_REQUIRED` (stopped original remains, so plan staged name-safe replacement/rollback rather than assuming it disappears);
- absent/non-Boolean: `HOLD_STOP_REMOVAL_CONTRACT_UNKNOWN`.

New source/test commits `e376f14c30efd81eff59e32eab89a96fc14db41a` and `7cc956b01accb4744d5f6885a56b869c0bb709dc`; **exact head `7cc956b01accb4744d5f6885a56b869c0bb709dc` passed website-quality CI workflow `40484259047`**. The revised inspector has *no Docker writes, stop/start, host shell exposure, credential values, plugin changes or live cutover*. Its on-Mac result is PENDING owner-run read-only verification.

**Hard holds unchanged:** OpenAI Platform runtime principal Tunnels Read + Use and intended ChatGPT workspace association not verified; actual effective rollback/reconstruction not rehearsed; original canary still presumed running, live tunnel cutover not attempted; ChatGPT `atlas_capabilities` / `atlas_status` unavailable until explicit scoped and reversible activation. In particular, review-ready is NOT cutover approval or proof of remote Mac access. Do not run a second tunnel against the same identity or stop the original until these gates and scoped user approval are complete.

## 27 October 2026 10:03 BST — REAL MAC revised Stage4 inspection PASS; live cutover still HOLD

The owner ran the revised **Git-blob-pinned, read-only** `scripts/atlas-tunnel-cutover-contract-20261026.mjs` from commit `7cc956b01accb4744d5f6885a56b869c0bb709dc`, file blob `cabb212c842bc482cdfb5f4cead7fe8b1f9a5e6d`, via the existing functioning iPhone SSH Shortcut on the actual Mac. The screenshot's exact diagnostic values (private conversation, 10:03 UK) are:

- `ATLAS_STAGE4_RECHECK`
- `SOURCE_VERIFIED`
- `ATLAS_CUTOVER_STAGE=REVIEW_READY_NO_MAC_CHANGES`
- `ATLAS_CUTOVER_CURRENT=CANARY_18787`
- `ATLAS_CUTOVER_DESIRED=OBSERVER_18788`
- `ATLAS_CUTOVER_ROLLBACK=STOP_RETAINS_ORIGINAL_CONTAINER_NAME_COLLISION_REVIEW_REQUIRED`
- `ATLAS_CUTOVER_KEY=READONLY_FILE_REFERENCE_ONLY`
- `ATLAS_CUTOVER_ENVIRONMENT=EXACT_RECONSTRUCTION_ALLOWLIST`
- `ATLAS_CUTOVER_DOCKERWRITES=0`
- `ATLAS_CUTOVER_REMOTEATLASSTATUS=NOT_VERIFIED`
- `ATLAS_CUTOVER_CONTRACT=REVIEW_READY_NO_CHANGES`
- `ATLAS_STAGE4_RECHECK_FINISHED`

**Evidence classification:** `STAGE4_MAC_LOCAL_INSPECTION=PASS`; `AUTOREMOVE=false` for the current tunnel, meaning stopping the original tunnel would **retain the container and its name**. An approved replacement would need a carefully reviewed, name-safe procedure, immutable reconstruction inputs and an independent rollback demonstration; the source inspector does not provide or authorise that procedure. The current tunnel is still directed at original canary `18787`, Observer local target `18788`; read-only key file reference, expected environment allowlist and confinement pass. **There were zero Docker writes.** The old Stage4 `HOLD_STOP_REMOVAL_CONTRACT_UNKNOWN` was resolved by correcting the overly narrow script assumption; it is no longer a blocker.

**Next two independent gates:** (1) In existing Platform organization, inspect current tunnel's ChatGPT workspace association and current runtime API key principal's **Tunnels Read + Use** privilege (not Manage), *without showing, exporting, changing or rotating key bytes*. ChatGPT app default permission does not substitute for the Platform RBAC role. (2) Independently document exact restoration of the retained original Docker tunnel with its original name and single polling process before separately authorised cutover. Do not run a parallel client on the same tunnel identity, remove old containers or modify private mounts just to test.

**Definition of completion unchanged:** approved and reversible switch to the Observer, genuine ChatGPT `atlas_capabilities` and `atlas_status` with fresh, redacted, matching Mac-local evidence; negative checks and tested restoration to the original canary token. Current ChatGPT connector `atlas_ping` still yielded `ATLAS_TUNNEL_CANARY_OK_NO_MAC_ACCESS` after this inspection, so **remote Mac access is NOT achieved**. Observer read-only scope does not confer broad Mac command or Activepieces access. Existing runner PR31, revenue PR45, all five P0 automations, £0 spending and no unapproved outbound remain unchanged.

Official documentation: https://developers.openai.com/api/docs/guides/secure-mcp-tunnels and https://github.com/openai/tunnel-client/blob/master/docs/permissions.md.
