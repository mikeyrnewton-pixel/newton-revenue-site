#!/usr/bin/env node
// Generate a strictly fictional, local ATLAS £195 pilot dashboard from the
// canonical source modules. Never ingests live records or contacts anyone.
// Usage: node tools/build-diagnostic-pilot-snapshot.mjs /path/to/new-review.html
// Creates the named file only if it does not already exist. chmod 0600.
import {writeFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {resolve} from "node:path";
import {renderOfflineDiagnosticPilotDashboard} from "../lib/diagnostic-offline-dashboard.js";

export function makeDiagnosticPilotDemoInput(){
  return {
    pilot:{
      version:1,demoRef:"DEMO-195-OWNER",channel:"Website",exampleLimit:12,
      vatTreatment:"UNKNOWN",supplierIdentityReviewed:false,
      tradingAddressApproved:false,termsAndCancellationReviewed:false,
      privateDataRouteApproved:false,deliveryCapacityConfirmed:false,
    },
    publicResearch:[],
    asOf:"2026-10-25T12:10:00.000Z",
  };
}
export function buildSyntheticOwnerSnapshot(){
  return renderOfflineDiagnosticPilotDashboard(makeDiagnosticPilotDemoInput());
}
function cli(){
  if(process.argv.length!==3||!process.argv[2].endsWith(".html")){
    throw Error("Usage: node tools/build-diagnostic-pilot-snapshot.mjs /path/to/new-review.html");
  }
  const target=resolve(process.argv[2]);
  const output=buildSyntheticOwnerSnapshot();
  if(output.release!=="INTERNAL_SNAPSHOT_NOT_LIVE"||output.verifiedRevenueGBP!==0){
    throw Error("Release hold breached: no report written");
  }
  writeFileSync(target,output.html,{flag:"wx",mode:0o600,encoding:"utf8"});
  process.stdout.write("Wrote synthetic offline review snapshot (NOT LIVE): "+target+"\n");
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  cli();
}
