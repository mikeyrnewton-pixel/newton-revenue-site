# ATLAS PRIME — Stage 2 controlled execution (proof-first)
Date: 2 November 2026
Status: DRAFT / OFFLINE; **NOT DEPLOYED TO MAC**. Existing Stage 1 Observer MUST remain read-only.

## Evidence-based starting point
- ChatGPT `atlas_status` returned a fresh allowlisted macOS status snapshot on 2 November 2026.
- Read-only MCP exposes exactly `atlas_ping`, `atlas_capabilities` and `atlas_status`.
- No verified Mac shell, Docker control, Activepieces write access or autonomous sales execution over that connection.
- Last snapshot reported `tunnelClient: NOT_RUNNING` despite a successful remote call; collector may still check the original stopped tunnel. Resolve separately; **do not infer runtime breakage** from this field alone.

## Design boundary
**Keep the current Observer unchanged.** Stage 2 local executor is deliberately a different process and code path. It is not an MCP endpoint, it opens no network listener, and it takes no user-supplied shell commands, file paths or URLs.

A future remote write tool must be a separately reviewed authenticated component, with per-action approval enforced server-side. Client-side tool annotations and ChatGPT permission prompts are defence in depth, NOT authorization. Changing the existing Observer into a general terminal is expressly prohibited.

## Implemented draft (this PR)
`scripts/atlas-stage2-controlled-executor.mjs`

Single allowlisted action: `local_proof_v1`.
- Creates only a local, private receipt under `~/.atlas-stage2-control/receipts/`.
- No external messages, money movements, browser work, trading, Activepieces changes, Docker actions, Mac shell execution, or arbitrary data access.
- Proposal expires in 30 minutes and carries unpredictable 96-bit ID.
- Explicit local owner approval uses exact phrase `I_APPROVE_STAGE2_LOCAL_PROOF`.
- A private approval file binds to the proposal's SHA-256 digest. One-way per-request lock and exclusive receipt creation prevent repeat execution.
- Private owner-only directories and files; symlinks, suspicious permissions, tampered approvals, unknown actions and non-allowlisted commands fail closed. Each action has a local receipt.
- **Important threat boundary:** owner approval and executor use the same macOS account in this prototype. This is *not* robust against a remote process already holding arbitrary shell access as that user. DO NOT expose `approve` or `execute` through MCP. Production must use independent authorization (separate principal/key or physically separated owner approval) and server-side enforcement.

## Owner-only LOCAL proof trial, AFTER QA approval
1. Use the separately pinned `scripts/atlas-stage2-local-proof-bootstrap-20261102.sh` through the trusted iPhone SSH channel, with a checked Git blob. It downloads exactly the reviewed source and runs `list` in a one-off, no-network, no-privilege Docker container reusing the locally cached Node image. It does not start a daemon or restart the Observer.
2. The private source is installed at `~/.atlas-stage2-proof-source/atlas-stage2-controlled-executor.mjs`. Private state is mounted from `~/.atlas-stage2-proof-private`; no shared folders or Docker socket.
3. For the subsequent owner-only proof, run the *same* isolated Docker configuration with `propose local_proof_v1` instead of `list`, after its wrapper is independently reviewed. Do not run a host Node command, assume Node is installed on macOS, or enable arbitrary commands.
4. The tool returns a one-time request ID. Only on an explicit owner decision, issue:
   `node atlas-stage2-controlled-executor.mjs approve <request-id> I_APPROVE_STAGE2_LOCAL_PROOF`
5. Then the owner can test:
   `node atlas-stage2-controlled-executor.mjs execute <request-id>`
   and separately query:
   `node atlas-stage2-controlled-executor.mjs receipt <request-id>`
6. Verify one receipt, no repeats, no external actions and no change to `atlas_status`.

**No owner-side installation action is required to review this draft.** Do not deploy until tests pass and the trial command is independently reviewed.

## Future steps (NOT yet implemented or authorised)
A. Reconcile Observer collector's old tunnel name, without restarting or modifying the live tunnel.
B. Define specific low-impact allowed operations; each operation requires exact arguments, preconditions, idempotency, rate limits, and a rollback/recovery plan. Suggested first real operation: regenerate the sanitized Observer snapshot using its pinned publisher.
C. Add an isolated service with a separate Unix user / permission boundary and a proper authenticated request channel; owner approval must be independent of any agent credential.
D. Only if the owner's ChatGPT plan/workspace supports full MCP write actions, register explicitly narrow, correctly annotated tools as a **new development integration**. Do not repurpose the read-only Observer or silently grant it Mac access. OpenAI docs: https://help.openai.com/en/articles/12584461-developer-mode-and-full-mcp-connectors-in-chatgpt
E. Prepare a discrete owner-approved local proof and remote proof. No live outreach, purchasing, trading, or CRM changes without explicit commercial approval.

## Definition of Done
- [x] Stage 1 remote read-only snapshot evidence previously verified
- [x] Stage 2 source and negative tests drafted
- [ ] Exact-head CI green
- [ ] Independent code review + owner-approved local test
- [ ] Independent authorization principal introduced
- [ ] Bounded remote write tool introduced and tested
- [ ] Fresh remote action audit observed with rollback proof
- [ ] Commercial actions separately approved

Operating constraints: £0 new spending, preserve existing tunnels / rollback, no outreach or spending without explicit approval.
