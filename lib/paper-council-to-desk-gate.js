// ATLAS / TASK-018 — paper council -> existing £50 Paper Desk quality gate.
// This is an INERT, IN-MEMORY review adapter; it has no network, file, broker,
// wallet, storage or AI calls. No review packet, however convincing, is an order.
// The external Python council receipt is untrusted; its SHA is a reference only,
// NOT a signature or proof of independent model executions.
import {evaluatePaperSpec} from '../scripts/paper-desk-quality-gate.mjs';

const VERSION='ATLAS_PAPER_COUNCIL_REVIEW_V1';
const RESULTS=['WAIT','REJECT','RESEARCH_CANDIDATE_ONLY'];
const BLOCKERS=[
  'LESS_THAN_TWO_SOURCE_DOMAINS','UNSOURCED_REVIEW',
  'REVIEWERS_REPORT_MISSING_EVIDENCE','INSUFFICIENT_REVIEW_CONFIDENCE',
  'DISAGREEMENT_OR_REJECTION','RISK_HARD_STOP'
];
const KEYS=[
  'schema','market','as_of','research_digest','disposition','blockers',
  'human_review_required','model_runs_independently_verified',
  'market_data_independently_verified','trade_execution_authorised',
  'paper_order_created','real_order_created','broker_calls',
  'paid_model_calls','reported_pnl_gbp'
];
const ISO=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/;
const SHA=/^[0-9a-f]{64}$/;
const MARKET=/^(BTC|ETH)-USD$/;
function fail(s){throw Error('PAPER_COUNCIL_BRIDGE_HOLD: '+s);}
function exactObject(value,keys){
  if(!value||typeof value!=='object'||Array.isArray(value)||
     Object.getPrototypeOf(value)!==Object.prototype ||
     Reflect.ownKeys(value).length!==keys.length) return false;
  return keys.every(key=>{
    const descriptor=Object.getOwnPropertyDescriptor(value,key);
    return descriptor?.enumerable===true&&Object.hasOwn(descriptor,'value');
  });
}
function validateReceipt(receipt) {
  if(!exactObject(receipt,KEYS))fail('untrusted or incomplete review receipt');
  if(receipt.schema!==VERSION||typeof receipt.market!=='string'||
     !MARKET.test(receipt.market)||typeof receipt.as_of!=='string'||
     !ISO.test(receipt.as_of)||!Number.isFinite(Date.parse(receipt.as_of))||
     new Date(receipt.as_of).toISOString()!==receipt.as_of.replace('Z','.000Z'))
     fail('unsupported or invalid market timestamp/schema');
  if(typeof receipt.research_digest!=='string'||!SHA.test(receipt.research_digest)||
     !RESULTS.includes(receipt.disposition))fail('invalid receipt digest or disposition');
  if(!Array.isArray(receipt.blockers)||
     Object.getPrototypeOf(receipt.blockers)!==Array.prototype||
     receipt.blockers.length>BLOCKERS.length||
     receipt.blockers.some(b=>typeof b!=='string'||!BLOCKERS.includes(b))||
     new Set(receipt.blockers).size!==receipt.blockers.length)
     fail('unknown or duplicate blocker');
  const incomplete=receipt.blockers.length>0;
  if((receipt.disposition==='RESEARCH_CANDIDATE_ONLY'&&incomplete)||
     (receipt.disposition!=='RESEARCH_CANDIDATE_ONLY'&&!incomplete)||
     (receipt.disposition==='REJECT'&&!receipt.blockers.includes('RISK_HARD_STOP')))
     fail('conflicting review verdict and blockers');
  if(receipt.human_review_required!==true||
     receipt.model_runs_independently_verified!==false||
     receipt.market_data_independently_verified!==false||
     receipt.trade_execution_authorised!==false||
     receipt.paper_order_created!==false||
     receipt.real_order_created!==false||
     receipt.broker_calls!==0||receipt.paid_model_calls!==0||
     receipt.reported_pnl_gbp!==null)
     fail('external/model/trading/financial claims cannot be trusted');
  return receipt;
}
export function reviewPaperCouncilHandoff(receipt,spec,now=new Date()){
  const council=validateReceipt(receipt);
  if(!(now instanceof Date)||!Number.isFinite(now.getTime()))fail('invalid review time');
  const age=now.getTime()-Date.parse(council.as_of);
  const stale=age<0||age>48*3600000;
  // Re-evaluate original existing Paper Desk strategy quality from supplied spec.
  // This is SCHEMA/REVIEW validation; claimed 30 trades are NOT independently audited.
  const desk=evaluatePaperSpec(spec);
  const asset=council.market.slice(0,3);
  const allocated=Array.isArray(spec?.sizing?.allocations)&&
    spec.sizing.allocations.some(x=>x?.asset===asset&&x.virtualGBP>0);
  const reasons=[
    ...council.blockers.map(x=>'COUNCIL_'+x),
    ...(council.disposition==='REJECT'?['COUNCIL_RISK_REJECT']:[]),
    ...(council.disposition==='WAIT'?['COUNCIL_WAIT']:[]),
    ...(stale?['COUNCIL_STALE_OR_FUTURE']:[]),
    ...(allocated?[]:['NO_CORRESPONDING_VIRTUAL_ASSET_ALLOCATION']),
    ...desk.issues.map(x=>'DESK_'+x.code),
  ];
  // Even full, compatible and recent information is never an execution permit.
  // Before a human considers a virtual ledger proposal, independently prove
  // provider/market sources, strategy holdout and concrete virtual fill rules.
  const researchCandidate=reasons.length===0&&
    council.disposition==='RESEARCH_CANDIDATE_ONLY'&&
    desk.status==='QUALIFIED_FOR_FORWARD_PAPER_LEDGER';
  return Object.freeze({
    schema:'ATLAS_COUNCIL_DESK_HANDOFF_V1',
    market:council.market,asOf:council.as_of,
    researchDigest:council.research_digest,
    status:researchCandidate?'REVIEW_ONLY_VIRTUAL_LEDGER_CANDIDATE':'VIRTUAL_LEDGER_REVIEW_HOLD',
    blockers:Object.freeze(reasons),
    deskQualityStatus:desk.status,
    // A source digest is not an authenticity signature. These facts never change.
    evidenceAuthenticityVerified:false,
    providerIndependenceVerified:false,
    holdoutTradeProvenanceVerified:false,
    modelCallsMade:0,brokerCallsMade:0,paperOrdersCreated:0,realOrdersCreated:0,
    virtualBalanceChangedGBP:0,realMoneySpentGBP:0,
    humanApprovalStillRequired:true,automaticPaperExecutionAllowed:false,
    liveTradingAllowed:false,
    nextRequired:researchCandidate
      ? 'Independent evidence and real holdout audit, then separate human approval for any virtual ledger proposal.'
      : 'Address council/quality holds using independently verified evidence; preserve the existing £50 virtual ledger.',
  });
}
