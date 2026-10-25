// ATLAS Universal Sales: private-CRM compatibility preview (no writes, credentials or network).
// The owner-facing offline HTML remains independent of production Supabase Auth/RLS.
import {routeOfflineOpportunity} from "./opportunity-intake.js";
import {buildOpportunityEvidenceRequirements} from "./opportunity-evidence-requirements.js";
import {triageOfflineBuyerResearch} from "./buyer-research-triage.js";
import {createHash} from "node:crypto";
import {reviewExistingCrmCutover} from "./diagnostic-crm-cutover-gate.js";

function freeze(value){for(const v of Object.values(value)){if(v&&typeof v==="object")freeze(v);}return Object.freeze(value);}
const DIGEST=/^sha256:[0-9a-f]{64}$/;
function hold(ok,message){if(!ok)throw new Error("CRM SYNC HOLD: "+message);}
function crmSyncKey(candidateId){
  return "sha256:"+createHash("sha256").update(JSON.stringify({
    version:1,
    table:"public.newton_opportunities",
    source:"offline_public_research_preview",
    candidateId,
  })).digest("hex");
}
function inertDigestArray(value){
  if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||
    value.length>100000)return false;
  const descriptors=Object.getOwnPropertyDescriptors(value);
  if(Reflect.ownKeys(descriptors).length!==value.length+1)return false;
  for(let i=0;i<value.length;i+=1){
    const d=descriptors[i];
    if(!d||!Object.hasOwn(d,"value")||d.enumerable!==true||
      !DIGEST.test(d.value))return false;
  }
  return true;
}

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
        sync_key_digest:crmSyncKey(candidateId),
        sync_key_scope:"INSERT_IF_ABSENT_REVIEW_ONLY",
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
      idempotencyKeyCount:rows.length,
      legacyCollisionCheckRequired:true,
      insertAuthorised:false,
      upsertAuthorised:false,
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


export function reviewOfflineBuyerResearchCrmCutover(records,asOf,observation){
  const preview=previewOfflineBuyerResearchCrmRows(records,asOf);
  const cutover=reviewExistingCrmCutover(observation);
  const blockers=[
    ...cutover.blockers,
    "LEGACY_IDENTITY_MAPPING_NOT_REVIEWED",
    "PREVIEW_TO_EXISTING_ROW_COLLISION_TEST_NOT_RUN",
    "AUTHENTICATED_IDEMPOTENCY_RECEIPT_NOT_IMPLEMENTED",
  ];
  return freeze({
    schema:"NEWTON_OFFLINE_BUYER_SIGNAL_CRM_CUTOVER_REVIEW_V1",
    table:preview.table,
    reviewedAt:preview.reviewedAt,
    previewDigest:preview.previewDigest,
    previewRecordCount:preview.rows.length,
    observedLegacyRecordCount:cutover.observedOpportunityRows,
    cutoverOutcome:cutover.outcome,
    blockers,
    operation:"NO_WRITE_CUTOVER_REVIEW",
    legacyRecordsPreserved:true,
    legacyRecordMutationAllowed:false,
    insertAllowed:false,
    updateAllowed:false,
    upsertAllowed:false,
    deleteAllowed:false,
    collisionTestPassed:false,
    identityMappingReviewed:false,
    authenticatedIdempotencyReceipt:false,
    ownerSecurityApprovalRecorded:false,
    databaseConnected:false,
    customerDataAccess:false,
    externalContact:false,
    invoices:false,
    clearedEvidenceGBP:0,
    release:"HOLD_PENDING_LEGACY_MAPPING_COLLISION_TEST_AUTH_RLS_AND_OWNER_APPROVAL",
  });
}



export function reviewOfflineBuyerResearchCrmKeyspace(records,asOf,legacySyncKeyDigests){
  hold(inertDigestArray(legacySyncKeyDigests),
    "bounded inert legacy sync-key digest array required");
  const legacy=new Set(legacySyncKeyDigests);
  hold(legacy.size===legacySyncKeyDigests.length,
    "legacy sync-key snapshot must not contain duplicates");
  const preview=previewOfflineBuyerResearchCrmRows(records,asOf);
  const previewKeys=preview.rows.map(row=>row.metadata.sync_key_digest);
  hold(new Set(previewKeys).size===previewKeys.length,
    "preview sync-key collision detected");
  const collisionCount=previewKeys.reduce(
    (count,key)=>count+(legacy.has(key)?1:0),0,
  );
  return freeze({
    schema:"NEWTON_OFFLINE_BUYER_SIGNAL_CRM_KEYSPACE_REVIEW_V1",
    table:preview.table,
    reviewedAt:preview.reviewedAt,
    previewDigest:preview.previewDigest,
    previewKeyCount:previewKeys.length,
    legacyKeyCount:legacy.size,
    collisionCount,
    collisionFreeInProvidedSnapshot:collisionCount===0,
    snapshotAuthority:"CALLER_SUPPLIED_DIGESTS_NOT_DATABASE_PROOF",
    operation:"NO_WRITE_KEYSPACE_REVIEW",
    insertAllowed:false,
    updateAllowed:false,
    upsertAllowed:false,
    deleteAllowed:false,
    databaseConnected:false,
    customerDataAccess:false,
    externalContact:false,
    invoices:false,
    clearedEvidenceGBP:0,
    release:"HOLD_PENDING_AUTHENTICATED_COMPLETE_LEGACY_SNAPSHOT_AND_OWNER_APPROVAL",
  });
}
