# Owner enquiry notifications — activation pending

This change prepares an owner-only notification path. It is disabled until secure configuration and a live receiver are verified. It does not implement marketing or customer replies.

## Contract

New valid enquiries are saved first with a pending notice. An optional background request sends only the lead reference, timestamp and source to an owner-controlled Google Apps Script web app. No name, email, company or problem text is sent. A matching JSON acknowledgement is required; an HTTP 200 alone is not delivery proof. Intake remains successful when the receiver is unavailable.

The receiver must authenticate the shared token, validate the fields, deduplicate using `leadId`, deliver an owner notification, and acknowledge only after successful delivery. Internal Apps Script code and credentials must stay outside this public repository. Do not reuse a receiver that sends to arbitrary destinations. Owner review uses the existing private lead dashboard.

## Configuration and activation

Use Cloudflare encrypted environment secrets `OWNER_NOTICE_URL` (the owner's approved Google Apps Script `/exec` URL) and `OWNER_NOTICE_TOKEN` (a unique random value of at least 32 characters). Configure the matching token privately in the receiving script. The receiver's recipient must be fixed to the owner. Never paste credentials into chat, commit them, or put them in frontend code.

The existing `ADMIN_TOKEN` must also be securely configured before the owner dashboard or retry route can be used. Broadening access or publishing a web-app receiver requires owner-controlled authorisation. No new paid notification service is required by this code; platform quotas and receiver availability must still be checked.

## Retry and retention

`POST /api/retry-owner-notices`, authenticated with the existing owner bearer token, processes at most five stored records per page. Follow `nextCursor` until `hasMore` is false. Call it from an authorised private scheduled worker after the receiver is configured. This PR does not install that worker. Failed notices remain pending; delivered ones and legacy records are skipped. Original 30-day lead expiry is retained. Retry status contains no customer details.

Notification state is stored separately as `notice:<leadId>` to avoid overwriting lead edits or the per-key KV write limit. The private lead API merges that state for owner review. Both keys retain the original lead expiry.

KV is eventually consistent. Delivery is at least once, not exactly once; receiver deduplication is mandatory. A simultaneous retry or an ACK lost before persistence can cause repeat delivery. No reliability or zero-duplicate guarantee is made.

## Required live acceptance evidence

1. Existing WATCH and ENGINE triggers remain present.
2. One synthetic enquiry is saved in production and independently retrieved privately.
3. The corresponding owner notification arrives; matching ACK and delivered state are observed.
4. With the receiver unavailable, intake succeeds and the record remains pending.
5. The scheduled retry delivers that notice after recovery, without retaining customer data beyond the original expiry.
6. Unauthenticated retry requests fail and public responses disclose no customer details.

Until these pass, status is **prepared and locally tested; not live verified**. Test records are never counted as buyers or revenue.
