// ATLAS Universal Sales: authenticated evidence requirements for an offline opportunity.
// This module accepts no evidence documents and performs no authentication, storage, network or contact action.
// It prevents owner-declared flags from being mistaken for independently verified commercial evidence.
import {routeOfflineOpportunity} from "./opportunity-intake.js";

const SPECIALIST=new Set(["PROPERTY","BUSINESS","DIGITAL_ASSET","INTRODUCTION"]);
const BASE_CODES=Object.freeze([
  "SELLER_AUTHORITY_PROOF",
  "OFFER_SOURCE_PROOF",
  "FULFILMENT_OR_AVAILABILITY_PROOF",
  "RESTRICTIONS_AND_JURISDICTION_REVIEW",
  "OFFER_TERMS_PROOF",
]);

function deepFreeze(value){
  for(const item of Object.values(value)){
    if(item&&typeof item==="object"&&!Object.isFrozen(item))deepFreeze(item);
  }
  return Object.freeze(value);
}

export function buildOpportunityEvidenceRequirements(input){
  const assessment=routeOfflineOpportunity(input);
  const codes=[
    ...(SPECIALIST.has(input.category)?["SPECIALIST_MANDATE_AND_COMPLIANCE_REVIEW"]:[]),
    ...BASE_CODES,
  ];
  return deepFreeze({
    schema:"NEWTON_OPPORTUNITY_EVIDENCE_REQUIREMENTS_V1",
    opportunityId:assessment.opportunityId,
    declaredInputDigest:assessment.inputDigest,
    preliminaryRoute:assessment.route,
    preliminaryReadiness:assessment.readiness,
    evidenceGate:"AUTHENTICATED_EVIDENCE_REQUIRED",
    requirements:codes.map(code=>({code,status:"AUTHENTICATED_PROOF_REQUIRED"})),
    authenticatedSourceConnected:false,
    evidenceAccepted:false,
    buyerDiscoveryPermitted:false,
    externalActionPermitted:false,
    writeIntent:"NONE",
    ownerApprovalRequired:true,
  });
}
