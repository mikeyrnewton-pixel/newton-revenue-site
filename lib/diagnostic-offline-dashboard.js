// ATLAS £195: generated, owner-only OFFLINE readiness snapshot.
// Uses the canonical tested pilot+buyer+CRM integration, not a separate browser
// implementation or customer-data store. It NEVER authorises a transaction.
import {buildOfflineDiagnosticFirstSaleDesk} from "./diagnostic-first-sale-desk.js";

const escape=s=>String(s).replace(/[&<>"']/g,c=>({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[c]));

function metric(title,value,subtitle){
  return '<div class="metric"><span>'+escape(title)+'</span><strong>'+escape(value)+
    '</strong><small>'+escape(subtitle)+'</small></div>';
}
function pill(content){return '<span class="pill">'+escape(content)+'</span>';}
function items(list){
  return '<ul>'+list.map(x=>'<li>'+escape(x)+'</li>').join('')+'</ul>';
}
export function renderOfflineDiagnosticPilotDashboard(config){
  const snapshot=buildOfflineDiagnosticFirstSaleDesk(config);
  const pilot=snapshot.pilot;
  const research=snapshot.buyerResearch;
  const blockers=pilot.blockers.length?pilot.blockers:["Owner checkboxes present, independent evidence still required"];
  const actions=snapshot.nextActions.map(x=>x.desk+": "+x.action);
  const publicRows=research.records.map(x=>x.candidateId+" — "+x.triageDesk+
    " — claimed "+x.signalClass+" — independently verified: NO");
  const head='<!doctype html><html lang="en-GB"><head><meta charset="utf-8">'+
    '<meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<meta name="robots" content="noindex,nofollow">'+
    '<meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;;'+
    ' style-src &#39;unsafe-inline&#39;; script-src &#39;none&#39;;'+
    ' img-src &#39;none&#39;; connect-src &#39;none&#39;;'+
    ' form-action &#39;none&#39;; base-uri &#39;none&#39;">'+
    '<title>ATLAS | £195 Pilot Review Snapshot</title><style>'+
    ':root{font-family:Inter,system-ui,sans-serif;color:#ebf1f8;background:#07131e;line-height:1.55}'+
    '*{box-sizing:border-box}body{margin:0;padding:26px 17px 60px}main{max-width:1050px;margin:auto}'+
    'h1{font-size:clamp(29px,5vw,50px);line-height:1.07;letter-spacing:-.05em;margin:8px 0 12px}'+
    'h2{font-size:19px}p,small{color:#acc1d5}'+
    '.brand{font-size:12px;letter-spacing:.16em;font-weight:850;color:#91f1db}'+
    '.status{display:inline-block;color:#ffe1a8;background:#3a3020;border:1px solid #9b7646;'+
    'padding:5px 10px;border-radius:20px;font-size:12px;font-weight:800}'+
    '.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:26px 0}'+
    '.metric,.card{background:#122335;border:1px solid #30485b;border-radius:14px;padding:20px}'+
    '.metric span,.metric small{display:block;color:#aac0d3;font-size:12px}'+
    '.metric strong{display:block;font-size:28px;letter-spacing:-.03em;color:#fff;margin:3px 0}'+
    '.sections{display:grid;grid-template-columns:1fr 1fr;gap:12px}'+
    '.pill{background:#193d40;color:#aff3e3;padding:5px 9px;border-radius:16px;font-size:12px}'+
    'li{margin:9px 0;overflow-wrap:anywhere}'+
    '.muted{font-size:12px;color:#a5b8cb}'+
    '.notice{border-left:4px solid #f0b26e;padding:11px 14px;background:#332c21;margin:18px 0}'+
    '@media(max-width:720px){.grid{grid-template-columns:1fr 1fr}.sections{grid-template-columns:1fr}}'+
    '@media(max-width:390px){.grid{grid-template-columns:1fr}}'+
    '</style></head><body><main>';
  const body='<div class="brand">ATLAS / NEWTON REVENUE · OWNER REVIEW</div>'+
    '<h1>£195 Diagnostic Pilot</h1>'+
    '<p class="status">INTERNAL ONLY · NOT RELEASED</p>'+
    '<p>A snapshot generated from the tested offline sales modules. No browser login, saved'+
    ' customer records, outbound contact, real invoice, live payment or network connection.</p>'+
    '<div class="grid">'+
    metric("Proposed pilot fee","£"+pilot.proposedPriceGBP,"VAT and exact total still subject to review")+
    metric("Verified paying buyers",snapshot.buyerQualifiedCount,"No public research claim establishes purchase")+
    metric("Actual cleared revenue","£"+snapshot.clearedCashGBP,"No bank/merchant settlement checked")+
    metric("Research sources",research.uniqueSourceCount,"Public claims, not verified buyers")+
    metric("Commercial proof holds",pilot.blockers.length,"A checked field is not independent evidence")+
    metric("Database write authority","DISABLED","Private sign-in and owner-only RLS not yet activated")+
    '</div><div class="notice"><strong>Release hold:</strong> This view is a synthetic rehearsal.'+
    ' Buyer contact, deployment, commercial documents, customer data and payments each need'+
    ' separate approvals and verified evidence.</div>'+
    '<div class="sections"><section class="card"><h2>Pilot deliverables</h2>'+
    items(pilot.scope)+'<p class="muted">One authorised channel, fictional or appropriately anonymised'+
    ' examples, no performance guarantees.</p></section>'+
    '<section class="card"><h2>Before first real sale</h2>'+items(blockers)+
    '<p class="muted">Additionally required: independent buyer evidence, secure auth/RLS,'+
    ' real transaction/settlement checks and separately approved launch.</p></section>'+
    '<section class="card"><h2>Internal next actions</h2>'+items(actions)+'</section>'+
    '<section class="card"><h2>Public buyer evidence</h2>'+
    (publicRows.length?items(publicRows):'<p>No supported public buyer brief entered.'+
    ' That means zero qualified buyers, not missing database data.</p>')+'</section></div>'+
    '<p class="muted">Reference '+escape(pilot.demoRef)+
    ' · review timestamp '+escape(research.asOf)+
    ' · read-only output · no forms, scripts, cookies or third-party assets.</p>';
  return Object.freeze({html:head+body+'</main></body></html>',
    schema:"NEWTON_DIAGNOSTIC_OFFLINE_DASHBOARD_V1",
    sourceSchema:snapshot.schema,
    release:"INTERNAL_SNAPSHOT_NOT_LIVE",
    networkCalls:0,
    storageWrites:0,
    verifiedRevenueGBP:0});
}
