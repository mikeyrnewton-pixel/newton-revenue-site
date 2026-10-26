#!/usr/bin/env node
// Preview-only, no customer or test-lead creation.
// Usage: node scripts/check-preview-binding.mjs https://<preview>.newton-revenue-site.pages.dev
// Will reject Production and custom domains before any network request.
const candidate = process.argv[2];
let base;
try { base = new URL(candidate); } catch { console.error('Expected an HTTPS Cloudflare Pages Preview URL.'); process.exit(2); }
if (base.protocol !== 'https:' ||
    !/^[a-z0-9-]+\.newton-revenue-site\.pages\.dev$/i.test(base.hostname) ||
    base.username || base.password || base.port || base.pathname !== '/' || base.search || base.hash) {
  console.error('REFUSED: URL must be a newton-revenue-site Preview hostname; Production/custom URLs are blocked.');
  process.exit(2);
}
async function probe(path, init) {
  const response = await fetch(new URL(path, base), {
    redirect: 'error', signal: AbortSignal.timeout(15000), ...init,
  });
  return response.status; // Deliberately never inspect response bodies/customer data.
}
try {
  const home = await probe('/');
  const diagnostic = await probe('/enquiry-diagnostic/');
  const enquiryCheck = await probe('/enquiry-check/');
  const enquiryGet = await probe('/api/enquiry');
  const retryGet = await probe('/api/retry-owner-notices');
  const erasureGet = await probe('/api/delete-lead');
  // Exercise the real owner-only erasure handler without credentials. It must
  // reject before parsing the body or reading/deleting any lead record.
  const erasurePost = await probe('/api/delete-lead', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  });
  // Enquiry function checks its LEADS storage BEFORE rejecting the invalid media type.
  // This deliberately invalid request cannot create a lead, consume consent or trigger a notice.
  const intake = await probe('/api/enquiry', {
    method: 'POST', headers: { 'Content-Type': 'text/plain', Origin: base.origin }, body: '',
  });
  // Owner-only route; no authentication header and no lead records requested/read.
  const admin = await probe('/api/leads');
  console.log('Preview homepage HTTP:', home);
  console.log('Preview diagnostic and enquiry-check HTTP:', diagnostic, enquiryCheck);
  console.log('Public GET /api/enquiry HTTP:', enquiryGet, '(405 expected)');
  console.log('Unauthorised GET /api/retry-owner-notices HTTP:', retryGet, '(405 expected)');
  console.log('Unauthorised GET /api/delete-lead HTTP:', erasureGet, '(405 expected, never 200 homepage fallback)');
  console.log('Unauthorised POST /api/delete-lead HTTP:', erasurePost, '(401 = owner-auth gate active; no lead read/deletion)');
  console.log('Non-writing invalid enquiry HTTP:', intake, '(415 = KV binding active; 503 = missing binding)');
  console.log('Unauthenticated owner route HTTP:', admin, '(401 = protected; 503 = Preview ADMIN_TOKEN/binding unavailable)');
  if ([home, diagnostic, enquiryCheck, enquiryGet, retryGet, erasureGet,
       erasurePost, intake, admin].includes(403)) {
    console.error('BLOCKED: Cloudflare Access / edge rules or request-network policy returned 403. This is NOT evidence the Pages Function ran.');
    process.exitCode = 1;
  } else if (home !== 200 || diagnostic !== 200 || enquiryCheck !== 200 ||
             enquiryGet !== 405 || retryGet !== 405 || erasureGet !== 405 ||
             erasurePost !== 401 || intake !== 415) {
    console.error('FAIL: Preview is not ready. Check the exact deployment, binding and Pages Functions.');
    process.exitCode = 1;
  } else if (admin === 503) {
    console.error('PARTIAL: Preview storage works, but owner route needs an independent Preview ADMIN_TOKEN.');
    process.exitCode = 2;
  } else if (admin !== 401) {
    console.error('FAIL: Unexpected unauthenticated owner-route status.');
    process.exitCode = 1;
  } else {
    console.log('PASS: Exact Preview public pages, route guards, authenticated erasure boundary, LEADS binding and owner-only protection verified; no customer records read or changed.');
  }
} catch (error) {
  console.error('FAIL: Network/TLS/redirect error:', error?.name ?? 'unknown');
  process.exitCode = 1;
}
