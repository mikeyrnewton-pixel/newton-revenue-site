// ATLAS Universal Sales: private-CRM compatibility preview (no writes, credentials or network).
// The owner-facing offline HTML remains independent of production Supabase Auth/RLS.
import {routeOfflineOpportunity} from "./opportunity-intake.js";
import {buildOpportunityEvidenceRequirements} from "./opportunity-evidence-requirements.js";
import {triageOfflineBuyerResearch} from "./buyer-research-triage.js";
import {createHash} from "node:crypto";

function freeze(value){for(const v of Object.values(value)){if(v&&typeof v==="object")freeze(v);}return Object.freeze(value);}

export function previewOfflineOpportunityCrmRow(input){
  const assessment=routeOfflineOpportunity(input);
  const evidence=buildOpportunityEvidenceRequirements(input);
  // The existing project has public.newton_opportunities with RLS enabled and no
  // owner access policy verified. These are proposed values, NOT a database write.
  const row={
    title:"Offline offer "+assessment.opportunityId,
    source:"offline_owner_preview",
    status:"discovered",
    estimated_value_gbp:null,
    evidence:[],
    next_action:"Owner review: satisfy authenticated evidence requirements before buyer discovery.",
    next_action_due:null,
    metadata:{
      source_schema:assessment.schema,
      local_opportunity_ref:assessment.opportunityId,
      preliminary_route:assessment.route,
      preliminary_readiness:assessment.readiness,
      hold_codes:[...assessment.checks],
      declared_input_digest:assessment.inputDigest,
      evidence_schema:evidence.schema,
      evidence_gate:evidence.evidenceGate,
      evidence_requirement_codes:evidence.requirements.map(item=>item.code),
      independently_authenticated:false,
      prospect_contact_authorised:false,
      buyer_discovery_permitted:false,
      buyer_verified:false,
      settled_cash_verified:false,
    },
  };
  return freeze({
    schema:"NEWTON_OFFLINE_OPPORTUNITY_CRM_PREVIEW_V1",
    synthetic:true,
    table:"public.newton_opportunities",
    state:"REVIEW_ONLY_NEEDS_AUTH_AND_RLS",
    writeIntent:"NONE",
    databaseConnected:false,
    customerDataAccess:false,
    externalContact:false,
    invoices:false,
    clearedEvidenceGBP:0,
    ownerApprovalRequired:true,
    row,
  });
}

export function previewOfflineBuyerResearchCrmRows(records,asOf){
  const triage=triageOfflineBuyerResearch(records,asOf);
  const grouped=new Map();
  for(const record of triage.records){
    if(record.triageDesk!=="VALIDATE_PUBLIC_BRIEF_SCOPE")continue;
    const current=grouped.get(record.candidateId)||[];
    current.push(record.evidenceDigest);
    grouped.set(record.candidateId,current);
  }
  const rows=[...grouped.entries()].sort(([a],[b])=>a.localeCompare(b)).map(
    ([candidateId,evidenceDigests])=>({
      title:"Unverified public buyer signal "+candidateId,
      source:"offline_public_research_preview",
      status:"discovered",
      estimated_value_gbp:null,
      evidence:[...evidenceDigests].sort(),
      next_action:"Manual validation: verify the public brief, organisation identity, lawful channel and contact permission.",
      next_action_due:null,
      metadata:{
        candidate_ref:candidateId,
        source_count:evidenceDigests.length,
        source_claim_verified:false,
        buyer_purchase_intent_verified:false,
        contact_permission_verified:false,
        lawful_channel_verified:false,
        outreach_approved:false,
        buyer_verified:false,
        settled_cash_verified:false,
      },
    }),
  );
  const syncProjection={
    schema:"NEWTON_OFFLINE_BUYER_SIGNAL_SYNC_PREVIEW_V1",
    reviewedAt:triage.asOf,
    targetTable:"public.newton_opportunities",
    rows,
  };
  const previewDigest="sha256:"+createHash("sha256")
    .update(JSON.stringify(syncProjection)).digest("hex");
  return freeze({
    schema:"NEWTON_OFFLINE_BUYER_SIGNAL_CRM_PREVIEW_V1",
    table:"public.newton_opportunities",
    reviewedAt:triage.asOf,
    previewDigest,
    syncEnvelope:{
      schema:syncProjection.schema,
      previewDigest,
      operation:"NO_WRITE_PREVIEW",
      recordCount:rows.length,
      writeAuthorised:false,
      syncAttempted:false,
      authenticatedReceiptRequired:true,
      release:"HOLD_PENDING_AUTH_RLS_SOURCE_VALIDATION_AND_OWNER_APPROVAL",
    },
    state:"REVIEW_ONLY_NEEDS_AUTH_RLS_AND_SOURCE_VALIDATION",
    sourceTruth:"UNVERIFIED_PUBLIC_CLAIMS",
    writeIntent:"NONE",
    databaseConnected:false,
    customerDataAccess:false,
    externalContact:false,
    invoices:false,
    clearedEvidenceGBP:0,
    uniqueOrganisationCount:rows.length,
    sourceEvidenceCount:rows.reduce((total,row)=>total+row.metadata.source_count,0),
    rows,
  });
}

