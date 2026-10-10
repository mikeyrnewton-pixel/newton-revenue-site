# Newton Revenue — website

Source code for the Newton Revenue customer-facing website and Cloudflare Pages Functions.

**Status:** source repository only until a Cloudflare deployment, KV binding, and real enquiry test are verified.

## Safe Cloudflare Pages Git deployment

- Repository: `mikeyrnewton-pixel/newton-revenue-site`.
- Production branch: `main`.
- Framework preset: `None`.
- Build command: leave blank.
- Build output directory: `public`.
- Root directory: blank (repository root).
- Pages Functions: `functions/api/enquiry.js` and `functions/api/leads.js`.

## Before using the form with customers

1. Create a Cloudflare KV namespace dedicated to the site. Bind it as `LEADS` (preview and production environments as applicable).
2. Add a private Cloudflare secret `ADMIN_TOKEN` with a unique, long random value (32+ characters). **Never commit the value to GitHub, enter it in chat or screenshots, or expose it in site JavaScript.**
3. Test an actual deployed synthetic form submission and independently retrieve it from `/leads.html`. Form errors must show the fallback email address. The administrator interface is a bearer-token utility, not a complete user-account system.
4. Apply Cloudflare rate limiting/bot protection and verify the privacy notice and agreed 30-day lead retention before broad promotion.
5. Arrange a dependable human lead-review and reply routine. **No automated email alert, CRM sync, automatic responses, live payment flow or booked appointment integration is implemented yet.**
6. Preserve the existing `newton-revenue.pages.dev` site until the new project passes tests and a controlled cutover is approved.

The introductory £495 pilot is a **proposed test price**, subject to specific scope and feasibility. Do not claim live installations, guaranteed returns or verified revenue without evidence.

## Offline test

Node.js 20+:

```sh
npm test
```

Mocks and local tests are not a substitute for live Cloudflare deployment testing.

**Important: this repository is PUBLIC.** Keep it limited to website code, without customer records, proprietary business data, credentials or internal operating-system source.
