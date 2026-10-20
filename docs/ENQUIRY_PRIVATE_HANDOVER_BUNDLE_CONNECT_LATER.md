# Enquiry private handover bundle — CONNECT LATER

## Purpose and current state

This gate binds the existing fictional diagnostic report, redacted-report acceptance receipt, cross-PR compatibility manifest and privacy lifecycle receipt into one checksum-locked manifest. It is a private owner-review aid, not client delivery.

State: **READY / TESTED_OFFLINE / NEEDS_CONNECTION / customer delivery HOLD / not LIVE**.

## Offline self-check

1. Copy the four already-generated artefacts into an access-controlled working directory; keep each file at mode `0600`.
2. Copy `config/enquiry-private-handover-connect-later.template.json` without filling any blank adapter, route or recipient field.
3. Run:

   `node scripts/enquiry-private-handover-bundle.mjs --report <report.md> --acceptance <report-acceptance.json> --compatibility <compatibility.json> --lifecycle <lifecycle.json> --config <connect-later.json> --output <private-handover-manifest.json>`

4. Confirm the command returns `READY_FOR_OWNER_PRIVATE_HANDOVER_REVIEW`, four checksummed files, mode `0600`, `customerDelivery: HOLD`, `connectionState: NEEDS_CONNECTION` and `live: false`.
5. Modify one input byte and rerun to confirm checksum mismatch or a changed aggregate evidence digest. Restore the original private copy afterwards.

The gate fails closed for missing or reused paths, symlinks, non-private permissions, PII or credential-like text, mismatched project/evidence digests, promoted lifecycle states, delivery/payment claims, or populated connection settings.

## Wednesday human-assisted dry-run

One owner action only: review the private bundle and explicitly approve the intended storage adapter, delivery route and recipient role. After approval, an authorised operator must separately populate a private config, create a preview-only handover, compare all four SHA-256 values, and record the preview result. Do not infer approval from this manifest.

## Rollback

If any digest, route, recipient, scope or privacy check differs, stop. Preserve the source artefacts, revoke or delete only the unapproved preview copy through the authorised adapter, record what was removed, and return the manifest to `NEEDS_CONNECTION`. Production rollback, deployment, client communication, invoicing and payment handling are outside this gate and require separate approval.

## Tests not performed here

- Live browser: **NOT RUN**
- Cloudflare preview: **NOT RUN**
- Production deployment: **NOT RUN**
- Client acceptance: **NOT RUN**
- Payment clearance: **NOT RUN**
