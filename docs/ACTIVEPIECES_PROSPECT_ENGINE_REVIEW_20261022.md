# Activepieces Prospect Engine v1 — read-only acceptance (22 Oct 2026)

**Scope:** owner's existing Mac / Activepieces Personal Project. This review is deliberately separate from the five ChatGPT automations. No Mac command, job, webhook, customer outreach, payment, deploy or flow change is executed by this document or its offline validator.

## Directly observed from owner-supplied 22 October iPhone screenshots

- Mac SSH responsive; Docker running `activepieces-app-1`, `activepieces-worker-1`, PostgreSQL and Redis. App and worker reported healthy. Local GET `http://127.0.0.1:8080/` returned HTTP 200.
- Existing macOS watchdog LaunchAgent loaded; latest heartbeat was stamped 22 Oct 2026 at 20:28:46. Does **not** establish that Slack alerts are delivering.
- Activepieces Personal Project lists `NEWTON REVENUE - Prospect Engine v1` and `Untitled`, both last modified September 29.
- **Runs** page displayed `No flow runs found` (not proof of all-time zero activity).
- `NEWTON REVENUE - Prospect Engine v1` editor showed four stages: `New Prospect` (Webhook), `Qualify Prospect` (Code), `Draft Outreach` (Code), `Build Follow-up` (Code).
- Trigger settings showed `Authentication: None`; flow publish/status, trigger public reachability, code bodies, actions, enabled state and actual run results **not verified**.
- The Mac's Activepieces is exposed on Docker host port 8080 (all host interfaces), but external/public reachability has not been checked; tailnet access was observed.

## Release HOLD

1. **Do not publish, enable, test against real contacts, or POST to the webhook.** No authenticated trigger was verified; a webhook exposed without authentication would create an unapproved execution surface.
2. Keep original flow, its code, database and Secrets unmodified. No GitHub change is itself a Mac deployment.
3. Do not upload raw Activepieces exports or code/credentials to public GitHub, email or ChatGPT by default. Raw exported step inputs may embed private data. A trusted read-only accessor should extract the minimum needed for local audit.
4. Review all three code steps *in place* through an authenticated, read-only connection before signing off on PII, source legality, outbound-send absence, idempotency, dedupe, webhook authentication, approval gates, and failure/retry behavior.
5. Before live adoption, verify flow status, authenticated test with synthetic data, run receipt, owner approval and full security review. Disabled/unknown flow remains HOLD. Real sales, invoicing and cleared funds are all **£0 verified**.

## Existing direct-access gap and safe next architecture

ChatGPT GitHub connector can edit/test **review branches**; it cannot reach the user's private Tailscale Mac address. The existing iPhone Shortcuts SSH session is authenticated, but is **not delegated to the assistant**. Activepieces has official MCP discovery tools (`ap_list_flows`, `ap_flow_structure`, `ap_read_step_code`, `ap_validate_flow`), documented at https://www.activepieces.com/docs/mcp/tools. These tools are not currently connected to this chat, and the Mac's private HTTP address is not externally reachable by default. Do **not** toggle open Internet access, expose a plaintext HTTP MCP endpoint, or grant broad write/tool-run permission to work around this.

A future owner-reviewed secure bridge should use authenticated encrypted transport, private-scope read-only access, least-privilege flow inspection, no secrets returned, explicit dry-run reporting and audited approval before **any** write. MCP documentation: https://www.activepieces.com/docs/mcp/overview. On the existing instance, verify feature availability before promising it.

## Safe offline assessment

`lib/activepieces-prospect-engine-review.js` accepts **only bounded, non-secret observation metadata**, never raw exported code, lead PII, API URLs or credentials. Its result can only be `REVIEW_ONLY_HOLD` and cash fields remain zero. The validated screenshot-based fixture is in `tests/activepieces-prospect-engine-review.test.mjs`. This is a **release gate**, not a replacement for source inspection or a claim the flow has run.

**Hard rule:** owner approval required for real outreach, any live flow publication, webhook exposure, paid provider, production access, contract, invoice or money movement.
