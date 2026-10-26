import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {renderOfflineDiagnosticPilotDashboard} from "../lib/diagnostic-offline-dashboard.js";

const pilot=()=>({version:1,demoRef:"DEMO-FIRST-SALE195",channel:"Website",exampleLimit:12,
  vatTreatment:"UNKNOWN",supplierIdentityReviewed:false,tradingAddressApproved:false,
  termsAndCancellationReviewed:false,privateDataRouteApproved:false,
  deliveryCapacityConfirmed:false});
const config=()=>({pilot:pilot(),publicResearch:[],asOf:"2026-10-25T12:10:00.000Z"});

test("canonical £195 modules render owner snapshot without claiming live readiness",()=>{
  const a=renderOfflineDiagnosticPilotDashboard(config());
  assert.equal(a.sourceSchema,"NEWTON_DIAGNOSTIC_FIRST_SALE_OFFLINE_WORKSPACE_V1");
  assert.equal(a.release,"INTERNAL_SNAPSHOT_NOT_LIVE");
  assert.match(a.html,/<h1>£195 Diagnostic Pilot<\/h1>/);
  assert.match(a.html,/Commercial proof holds/);
  assert.match(a.html,/Verified paying buyers/);
  assert.match(a.html,/Actual cleared revenue/);
  assert.match(a.html,/INTERNAL ONLY · NOT RELEASED/);
  assert.equal(a.verifiedRevenueGBP,0);
  assert.equal(a.networkCalls,0);
  assert.equal(a.storageWrites,0);
});
test("HTML has zero-network CSP with no forms, scripts, third-party assets or claims",()=>{
  const html=renderOfflineDiagnosticPilotDashboard(config()).html;
  assert.match(html,/default-src &#39;none&#39;/);
  assert.match(html,/connect-src &#39;none&#39;/);
  assert.match(html,/script-src &#39;none&#39;/);
  assert.match(html,/form-action &#39;none&#39;/);
  assert.doesNotMatch(html,/<script|<form|<iframe|<link|<img|https?:\/\//i);
  assert.match(html,/No bank\/merchant settlement checked/);
  assert.match(html,/No supported public buyer brief entered/);
});
test("source records never expose private notes or create unverified sales authority",()=>{
  const cfg=config();
  cfg.publicResearch=[{
    version:1,candidateId:"ORG-EXAMPLE0001",candidateType:"ORGANISATION",
    sourceId:"SRC-EXAMPLE0001",sourceKind:"PUBLIC_BRIEF",
    sourceUrl:"https://example.org/public/diagnostic",
    publishedAt:"2026-10-24T09:00:00.000Z",
    observedAt:"2026-10-25T10:00:00.000Z",
    signalClass:"OPEN_PURCHASE_BRIEF",fit:"MEDIUM",
    notes:"A private-looking but fictional research note, never a buyer.",
  }];
  const html=renderOfflineDiagnosticPilotDashboard(cfg).html;
  assert.match(html,/ORG-EXAMPLE0001/);
  assert.match(html,/independently verified: NO/);
  assert.doesNotMatch(html,/private-looking/);
  assert.doesNotMatch(html,/https:\/\/example\.org/);
  assert.doesNotMatch(html,/<script/);
});
test("malformed owner records and impossible evidence are still rejected",()=>{
  assert.throws(()=>renderOfflineDiagnosticPilotDashboard({...config(),creditCard:"secret"}),
    /PILOT DESK HOLD/);
  const cfg=config();
  cfg.pilot.demoRef="<img src=x onerror=alert(1)>";
  assert.throws(()=>renderOfflineDiagnosticPilotDashboard(cfg),/DIAGNOSTIC PILOT HOLD/);
});
test("staged SQL policy tests assert owner, nonowner and anonymous isolation without running",()=>{
  const sql=readFileSync(new URL("../docs/ATLAS_DIAGNOSTIC_OWNER_CRM_PGTAP_STAGING_20261025.sql.review",
    import.meta.url),"utf8");
  assert.match(sql,/STAGING ONLY/);
  assert.match(sql,/NOT executed by GitHub Actions/);
  assert.match(sql,/^BEGIN;$/m);
  assert.match(sql,/^ROLLBACK;$/m);
  assert.equal(Number(sql.match(/SELECT plan\((\d+)\)/)[1]),19);
  assert.equal((sql.match(/^SELECT (?:ok|is|is_empty|throws_ok|results_eq)\s*\(/gm)||[]).length,19);
  assert.match(sql,/SET LOCAL ROLE anon/);
  assert.match(sql,/SET LOCAL ROLE authenticated/);
  assert.match(sql,/is_anonymous":true/);
  assert.match(sql,/non-owner cannot impersonate owner/);
  assert.match(sql,/owner cannot reassign a record/);
  assert.doesNotMatch(sql,/\b(?:CREATE|DROP)\s+(?:DATABASE|ROLE|USER)\b/i);
});
