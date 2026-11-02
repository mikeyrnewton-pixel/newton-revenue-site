# ATLAS PRIME — Stage 2B independently authenticated remote action gate

Date: 2 November 2026  
Status: **OFFLINE CODE + TESTS ONLY; NO MAC DEPLOYMENT, NEW CONNECTOR, OR REMOTE WRITE PERMISSION**  
Parent: ATLAS Stage 2A draft PR #48; retains existing Stage 1 read-only Observer and exact Mac rollback.

## What was actually verified

- Stage 1: the existing ATLAS read-only MCP tools `atlas_status`, `atlas_capabilities` and `atlas_ping` returned live results from Mac on 2 Nov.
- Stage 2A: owner-initiated and approved local harmless proof at 17:16 UK, request `0468ce24cde4fadb7d6f69aa`, receipt verified, exit 0.
- **Not yet verified:** ChatGPT-triggered Mac writes, independent owner authentication, Activepieces writes, outbound communications, sales execution, autonomous deployment.
- Original Observer read-only capabilities continue to report `macShell=false`, `dockerControl=false`, `activepiecesAccess=false`, `writeActions=false`.

## Stage 2B problem and user-value

Owner wants 99% AI execution with final approval for consequential actions, without running arbitrary commands from an AI chat or paying for additional infrastructure. ChatGPT's approval prompts **alone are not a cryptographic security boundary**. Any executable work on the Mac must enforce action permissions independently.

OpenAI's documentation says MCP tool annotations do not replace server-side authorization:
https://developers.openai.com/plugins/build/mcp-server

As of current documentation, full custom MCP write/modify actions are beta features subject to account/workspace policies; do **not** assume this Plus account can invoke custom Mac write tools:
https://help.openai.com/en/articles/12584461-developer-mode-and-full-mcp-connectors-in-chatgpt

## This PR — implemented, but only offline

`scripts/atlas-stage2b-signed-intent-gate.mjs` builds a pure Node verifier for exactly one harmless proof action:
- Intent proposes `local_proof_v1` with **empty** arguments and unpredictable 128-bit id.
- Intent may be held for **24 hours** before owner review — no more racing a 30-minute proposal expiry.
- A distinct approval object is cryptographically signed using Ed25519 **off the Mac / off the agent**. The verifier accepts only the *public* key. The private key must never be present in an agent-accessible environment.
- After owner signs, the approval is valid for at most **10 minutes**. It binds the exact intent SHA-256 digest, ID, action, purpose, and timestamps. Changing any field invalidates verification.
- A bounded private, exclusive receipt prevents duplicate execution across restarts. A partially completed operation remains reserved for manual reconciliation, not automatic replay.
- A *valid approval* permits only a local proof receipt. The implementation has **no shell, HTTP listener, network requests, Mac filesystem browsing, Docker operations, Activepieces access, payments, trading, customer contact or credentials**.
- This draft does NOT supply a production key generator, signing app, remote receiver, tunnel service, or deployment script.

### Signature encoding — fixed contract

Intent fields, in order for hashing (UTF-8 JSON without whitespace):
```json
{"schema":"atlas.stage2b.intent.v1","id":"<32 lowercase hex>","action":"local_proof_v1","args":{},"requestedAt":"<ISO UTC milliseconds>","validUntil":"<ISO UTC milliseconds>"}
```
Compute SHA-256 hex digest of the canonical intent JSON. Approval fields, in order:
```json
{"schema":"atlas.stage2b.approval.v1","id":"<same id>","intentDigest":"<intent SHA256 hex>","purpose":"ATLAS_STAGE2B_LOCAL_PROOF_ONLY","approvedAt":"<ISO UTC milliseconds>","validUntil":"<ISO UTC milliseconds>"}
```
Ed25519 signature covers exactly the UTF-8 bytes of that canonical approval JSON. Send unpadded Base64URL signature (64 bytes encoded to 86 characters). Unknown keys, nonempty arguments, unsupported actions or malformed timestamp formats fail closed.

## Necessary independent-approval boundary

Security is **not** achieved by saving the private signing key in the same macOS user account that a future ATLAS agent can control. It must stay in a truly separate authority (e.g., iPhone Secure Enclave/key store through a dedicated reviewed signer, or separate owner-controlled hardware/key service). A generic Shortcuts SSH command executed as the same Mac user is **not independent** authorization once remote shell is enabled.

No private signing key, token, mnemonic, password or other secret should be pasted into ChatGPT, GitHub, logs or screenshots.

## Recommended production migration gates

1. Verify a mobile owner-only key storage and signing method exists and is usable with the desired iPhone version. Don't invent Secure Enclave commands, claim unsigned approval is equivalent, or enable remote execution until tested.
2. Establish an authenticated, integrity-protected delivery channel for *proposals only*. Do not use unauthenticated internet endpoints or trust chat text alone as execution approval.
3. Deploy a separate least-privilege **local verifier process** holding only the pinned owner public key. Disallow general Mac shell commands, arbitrary filesystem paths or Docker socket mounts. Keep Stage 1 read-only Observer unmodified.
4. Demonstrate a signed `local_proof_v1` from an actual separate owner device, verify exactly one private receipt and prove replay/tamper rejection **on the Mac**, not just CI.
5. Introduce the **first useful operation**, likely a fixed internal Observer snapshot refresh or Activepieces read-only self-check; require a separately reviewed rollback and limited action schema. No outreach or spending without separate explicit approval.
6. Only after permission, security and plan checks: expose narrow tool(s) to ChatGPT, audit actual remote calls, and verify end-to-end. Do not advertise custom write tools as available before actual test.

## Evidence and risk notes

- Tests generate ephemeral Ed25519 keypairs in CI only. Those test keys are **not** production credentials.
- Current receipt logic is suitable for a harmless proof: O_EXCL creates an exclusive receipt, and failures remain fail-closed. For nontrivial real actions, reserve-before-side-effect and durable reconciliation logic must be implemented before approval.
- No unsupervised spend, outreach, CRM changes, trading, deployment or irreversible actions are authorised by this draft.
- Preserve the original tunnel client rollback, Observer, Activepieces and existing £0 new spend constraint.

## Completion checklist

- [x] Stage 1 read-only status connection verified
- [x] Stage 2A owner-approved local proof verified
- [x] Stage 2B independent signed owner approval gate drafted
- [ ] Stage 2B automated test suite green on exact PR head
- [ ] Independent security review + production signer selection
- [ ] Owner-bound public key + separate mobile private key provisioned
- [ ] Isolated Mac deployment approved and tested
- [ ] True authenticated ChatGPT-to-Mac end-to-end write test verified
- [ ] Real business workflow enabled after explicit commercial approvals
