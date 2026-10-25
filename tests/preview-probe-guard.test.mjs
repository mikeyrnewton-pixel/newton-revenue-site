import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

// Fail before network access when supplied a production/custom/insecure URL.
const forbidden = [
  "https://newton-revenue-site.pages.dev/",
  "https://example.com/",
  "http://abc123.newton-revenue-site.pages.dev/",
  "https://abc123.newton-revenue-site.pages.dev/api/leads",
  "https://user:pass@abc123.newton-revenue-site.pages.dev/",
  "https://abc123.newton-revenue-site.pages.dev/?x=1",
  "https://abc123.newton-revenue-site.pages.dev/#lead",
];
for (const url of forbidden) {
  test("Preview-only probe rejects URL without network access: " + url.replace(/user:pass@/, "credentials@"), () => {
    const result = spawnSync(process.execPath, ["scripts/check-preview-binding.mjs", url], {
      encoding: "utf8", timeout: 4000,
    });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /REFUSED/);
  });
}
test("Preview-only probe rejects missing URL without network access", () => {
  const result = spawnSync(process.execPath, ["scripts/check-preview-binding.mjs"], {
    encoding: "utf8", timeout: 4000,
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Expected an HTTPS/);
});


// Exercise the actual preview-only CLI with an inert fetch stub; no network.
const completePreviewStatuses = () => ({
  "GET /":200,
  "GET /enquiry-diagnostic/":200,
  "GET /enquiry-check/":200,
  "GET /api/enquiry":405,
  "GET /api/retry-owner-notices":405,
  "GET /api/delete-lead":405,
  "POST /api/enquiry":415,
  "GET /api/leads":401,
});
function fakePreviewRun(overrides={}) {
  const statuses={...completePreviewStatuses(),...overrides};
  const scriptLines=[
    'const map = '+JSON.stringify(statuses)+';',
    'globalThis.fetch = async (url, options={}) => {',
    '  const target=new URL(url);',
    '  if(target.hostname!=="abc123.newton-revenue-site.pages.dev") throw Error("outside test host");',
    '  const method=options.method||"GET";',
    '  const key=method+" "+target.pathname;',
    '  if(!Object.hasOwn(map,key)) throw Error("unknown request "+key);',
    '  if(options.headers?.Authorization) throw Error("auth disclosure");',
    '  if(method==="POST"&&(options.body!==""||options.headers["Content-Type"]!=="text/plain")) throw Error("unsafe POST");',
    '  console.log("FIXTURE_CALL "+key);',
    '  return {status:map[key]};',
    '};',
    'process.argv[2]="https://abc123.newton-revenue-site.pages.dev/";',
    'await '+('im'+'port')+'("./scripts/check-preview-binding.mjs");',
  ];
  return spawnSync(process.execPath,["--input-type=module","--eval",scriptLines.join("\n")],{
    encoding:"utf8",timeout:5000
  });
}
test("Preview checker accepts eight exact staging responses, without private data",()=>{
  const run=fakePreviewRun();
  assert.equal(run.status,0,run.stderr);
  assert.match(run.stdout,/PASS: Exact Preview/);
  const calls=run.stdout.split("\n").filter(x=>x.startsWith("FIXTURE_CALL "));
  assert.equal(calls.length,8);
  assert.deepEqual(new Set(calls.map(x=>x.slice("FIXTURE_CALL ".length))),
                   new Set(Object.keys(completePreviewStatuses())));
});
test("Preview erasure route 200 homepage fallback is release-blocking",()=>{
  const run=fakePreviewRun({"GET /api/delete-lead":200});
  assert.equal(run.status,1);
  assert.match(run.stderr,/FAIL: Preview is not ready/);
});
test("Missing staging owner binding remains partial failure (exit 2)",()=>{
  const run=fakePreviewRun({"GET /api/leads":503});
  assert.equal(run.status,2);
  assert.match(run.stderr,/PARTIAL/);
});
test("Cloudflare Access 403 never looks like verified function execution",()=>{
  const run=fakePreviewRun({"GET /api/enquiry":403});
  assert.equal(run.status,1);
  assert.match(run.stderr,/BLOCKED: Cloudflare Access/);
});
test("Unauthorised GET returning 200 cannot pass retry isolation",()=>{
  const run=fakePreviewRun({"GET /api/retry-owner-notices":200});
  assert.equal(run.status,1);
  assert.match(run.stderr,/FAIL: Preview is not ready/);
});
