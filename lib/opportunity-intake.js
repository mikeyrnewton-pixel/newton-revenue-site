// NEWTON UNIVERSAL SALES — offline offer intake and preliminary routing v0.1.
// This module is stateless and has no network, storage, messaging or payment effects.
// It never promotes an opportunity to a buyer, outreach, contract or cash event.
import {createHash} from "node:crypto";

const KEYS=["version","opportunityId","description","category","buyerType","territory",
  "sellerAuthority","pricing","fulfilment","restrictions","sourceEvidence"];
const VALUES=Object.freeze({
  category:["PRODUCT","SERVICE","PROPERTY","BUSINESS","DIGITAL_ASSET","INTRODUCTION","OTHER"],
  buyerType:["BUSINESS","CONSUMER","UNKNOWN"],
  territory:["UK","EU","US","OTHER","UNKNOWN"],
  sellerAuthority:["OWNER_VERIFIED","WRITTEN_MANDATE_VERIFIED","UNKNOWN"],
  pricing:["FIXED","QUOTE_REQUIRED","UNKNOWN"],
  fulfilment:["READY_VERIFIED","THIRD_PARTY_UNVERIFIED","UNKNOWN"],
  restrictions:["NONE_IDENTIFIED","POSSIBLE_OR_REGULATED","UNKNOWN"],
  sourceEvidence:["INDEPENDENTLY_VERIFIED","UNVERIFIED"],
});
const VALID_ID=/^OPP-[A-Z0-9]{4,24}$/;

function hold(ok,reason){if(!ok)throw new Error("OFFER INTAKE HOLD: "+reason)}
function exactDataRecord(value,keys){
  if(value===null||typeof value!=="object"||Array.isArray(value))return false;
  const proto=Object.getPrototypeOf(value);
  if(proto!==Object.prototype&&proto!==null)return false;
  const names=Reflect.ownKeys(value);
  if(names.length!==keys.length||!names.every(key=>typeof key==="string"&&keys.includes(key)))return false;
  return names.every(key=>{
    const descriptor=Object.getOwnPropertyDescriptor(value,key);
    return descriptor&&Object.hasOwn(descriptor,"value")&&descriptor.enumerable;
  });
}

export function routeOfflineOpportunity(input){
  hold(exactDataRecord(input,KEYS),"exact, inert opportunity fields required");
  hold(input.version===1&&VALID_ID.test(input.opportunityId),"version and opaque opportunity ID required");
  hold(typeof input.description==="string"&&input.description.trim().length>=12&&
    input.description.length<=800&&!/[\u0000-\u001f\u007f]/u.test(input.description),
    "bounded descriptive text required");
  for(const [key,choices] of Object.entries(VALUES))
    hold(typeof input[key]==="string"&&choices.includes(input[key]),"invalid "+key);

  const checks=[];
  if(input.sellerAuthority==="UNKNOWN")checks.push("SELLER_AUTHORITY_REQUIRED");
  if(input.restrictions==="POSSIBLE_OR_REGULATED")checks.push("REGULATED_OR_RESTRICTED_REVIEW");
  if(input.restrictions==="UNKNOWN")checks.push("RESTRICTION_CLASSIFICATION_REQUIRED");
  if(input.fulfilment!=="READY_VERIFIED")checks.push("DELIVERY_OR_AVAILABILITY_UNVERIFIED");
  if(input.territory==="UNKNOWN")checks.push("MARKET_JURISDICTION_REQUIRED");
  if(input.buyerType==="UNKNOWN")checks.push("BUYER_PROFILE_REQUIRED");
  if(input.pricing==="UNKNOWN")checks.push("PRICE_OR_QUOTE_BASIS_REQUIRED");
  if(input.sourceEvidence==="UNVERIFIED")checks.push("OFFER_SOURCE_EVIDENCE_REQUIRED");
  const specialist=["PROPERTY","BUSINESS","DIGITAL_ASSET","INTRODUCTION"].includes(input.category);
  const route=specialist?"SPECIALIST_MANDATE_REVIEW":
    input.buyerType==="BUSINESS"?"B2B_BUYER_RESEARCH":
      input.buyerType==="CONSUMER"?"CONSUMER_CHANNEL_RESEARCH":
        "BUYER_CLASSIFICATION_REVIEW";
  const result={
    schema:"NEWTON_OFFLINE_OPPORTUNITY_ROUTER_V1",
    opportunityId:input.opportunityId,
    // Privacy: digest the owner-supplied description rather than echoing it in a tool result.
    inputDigest:"sha256:"+createHash("sha256").update(JSON.stringify(input)).digest("hex"),
    route,
    readiness:checks.length===0?"INTERNAL_SALES_PREPARATION_READY":"REVIEW_HOLD",
    checks:Object.freeze(checks),
    contactCustomers:false,
    placeListings:false,
    acceptOffers:false,
    issueInvoices:false,
    processPayments:false,
    recordClearedRevenue:false,
    storageWrites:false,
    customerDataAccess:false,
    ownerApprovalRequiredForExternalActions:true,
  };
  return Object.freeze(result);
}
