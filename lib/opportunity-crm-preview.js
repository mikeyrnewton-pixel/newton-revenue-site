// ATLAS Universal Sales: private-CRM compatibility preview (no writes, credentials or network).
// The owner-facing offline HTML remains independent of production Supabase Auth/RLS.
import {routeOfflineOpportunity} from "./opportunity-intake.js";
import {buildOpportunityEvidenceRequirements} from "./opportunity-evidence-requirements.js";

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
