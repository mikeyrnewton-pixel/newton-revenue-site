import test from "node:test";
import assert from "node:assert/strict";
import {assessSyntheticPaymentObservation,assessSyntheticPaymentObservationBatch,emptySyntheticPaymentEvidenceCursor,preparePaymentEvidenceConnector} from "../lib/payment-evidence-connector.js";

const assessBatch=(items,prior=emptySyntheticPaymentEvidenceCursor())=>
  assessSyntheticPaymentObservationBatch(items,prior);

const base=()=>({
  version:1,
  provider:"UNSET",
  credentialEnv:"NEWTON_PAYMENT_READ_TOKEN",
  accountRefEnv:"NEWTON_PAYMENT_ACCOUNT_REF",
  currency:"GBP",
  priceMinor:19500,
  readOnly:true,
  allowCharges:false,
  allowRefunds:false,
  allowPayouts:false,
});

test("unset provider is safe and explicitly needs connection",()=>{
  const result=preparePaymentEvidenceConnector(base());
  assert.equal(result.state,"NEEDS_CONNECTION");
  assert.deepEqual(result.blockers,["PAYMENT_PROVIDER_UNSET"]);
  assert.equal(result.networkCalled,false);
  assert.equal(result.connected,false);
  assert.equal(result.paymentRecorded,false);
  assert.equal(result.clearedEvidenceGBP,0);
  assert.equal(result.canCharge,false);
  assert.equal(result.canRefund,false);
  assert.equal(result.canPayout,false);
});

test("named provider is only ready for owner connection, never connected",()=>{
  const result=preparePaymentEvidenceConnector({...base(),provider:"OWNER_SELECTED_PROVIDER"});
  assert.equal(result.state,"READY_FOR_OWNER_CONNECTION");
  assert.deepEqual(result.blockers,[]);
  assert.equal(result.capability,"READ_PAYMENT_EVIDENCE_ONLY");
  assert.equal(result.connected,false);
  assert.equal(result.expectedAmountMinor,19500);
  assert.equal(result.expectedCurrency,"GBP");
});

test("money-moving permissions fail closed",()=>{
  for(const key of ["allowCharges","allowRefunds","allowPayouts"]){
    assert.throws(
      ()=>preparePaymentEvidenceConnector({...base(),[key]:true}),
      /money-moving permissions must remain disabled/,
    );
  }
  assert.throws(
    ()=>preparePaymentEvidenceConnector({...base(),readOnly:false}),
    /read-only access required/,
  );
});

test("raw-looking values and ambiguous placeholders are rejected",()=>{
  for(const value of [
    "sk_live_example",
    "https://provider.example/token",
    "actual secret",
    "TOKEN_VALUE",
  ]){
    assert.throws(
      ()=>preparePaymentEvidenceConnector({...base(),credentialEnv:value}),
      /credential environment name required/,
    );
  }
  assert.throws(
    ()=>preparePaymentEvidenceConnector({...base(),accountRefEnv:"NEWTON_PAYMENT_READ_TOKEN"}),
    /placeholders must differ/,
  );
});

test("price, currency, schema and extra fields fail closed",()=>{
  assert.throws(()=>preparePaymentEvidenceConnector({...base(),priceMinor:19499}),
    /fixed GBP 195.00/);
  assert.throws(()=>preparePaymentEvidenceConnector({...base(),currency:"USD"}),
    /fixed GBP 195.00/);
  assert.throws(()=>preparePaymentEvidenceConnector({...base(),version:2}),
    /version 1/);
  assert.throws(()=>preparePaymentEvidenceConnector({...base(),webhook:"secret"}),
    /exact non-secret configuration/);
});

const observation=(status)=>({
  version:1,
  synthetic:true,
  observationId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  sourceRecordId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  invoiceEventId:"ccccccec-cccc-4ccc-8ccc-cccccccccccc",
  provider:"OWNER_SELECTED_PROVIDER",
  currency:"GBP",
  amountMinor:19500,
  observedAt:"2026-10-20T11:00:00.000Z",
  status,
  evidenceDigest:"a".repeat(64),
});
const binding=()=>({
  sourceRecordId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  sourceEvidenceDigest:"b".repeat(64),
  invoiceEventId:"ccccccec-cccc-4ccc-8ccc-cccccccccccc",
  invoiceEvidenceDigest:"c".repeat(64),
  invoicedAt:"2026-10-20T10:59:59.000Z",
  verifiedAt:"2026-10-20T11:10:00.000Z",
  provider:"OWNER_SELECTED_PROVIDER",
});

test("pending evidence is review-only and cannot become cleared",()=>{
  const result=assessSyntheticPaymentObservation(observation("PENDING"),binding());
  assert.equal(result.state,"PAYMENT_RECORDED_REVIEW");
  assert.equal(result.commercialEventCandidate,"PAYMENT_RECORDED");
  assert.equal(result.sourceRecordId,binding().sourceRecordId);
  assert.equal(result.invoiceEventId,binding().invoiceEventId);
  assert.deepEqual(result.blockers,[
    "PROVIDER_SETTLEMENT_NOT_OBSERVED",
    "OWNER_APPROVAL_REQUIRED",
  ]);
  assert.equal(result.automaticTransition,false);
  assert.equal(result.paymentRecorded,false);
  assert.equal(result.clearedEvidenceGBP,0);
  assert.equal(result.customerDelivery,"HOLD");
});

test("settled evidence remains an owner-reviewed candidate, never cash",()=>{
  const result=assessSyntheticPaymentObservation(observation("SETTLED"),binding());
  assert.equal(result.state,"CLEARED_EVIDENCE_REVIEW");
  assert.equal(result.commercialEventCandidate,"CLEARED");
  assert.deepEqual(result.blockers,["OWNER_APPROVAL_REQUIRED"]);
  assert.equal(result.ownerApprovalRequired,true);
  assert.equal(result.connected,false);
  assert.equal(result.networkCalled,false);
  assert.equal(result.recordedPaymentEvidenceGBP,0);
  assert.equal(result.clearedEvidenceGBP,0);
  assert.equal(result.commercialTruth,"SYNTHETIC_OBSERVATION_NOT_REVENUE");
});

test("failed refunded and disputed observations enter reconciliation hold",()=>{
  for(const status of ["FAILED","REFUNDED","DISPUTED"]){
    const result=assessSyntheticPaymentObservation(observation(status),binding());
    assert.equal(result.state,"PAYMENT_EXCEPTION_HOLD");
    assert.equal(result.commercialEventCandidate,null);
    assert.deepEqual(result.blockers,[`PAYMENT_${status}_REQUIRES_RECONCILIATION`]);
    assert.equal(result.automaticTransition,false);
    assert.equal(result.customerDelivery,"HOLD");
  }
});

test("observation boundary rejects real activity raw references and malformed evidence",()=>{
  assert.throws(
    ()=>assessSyntheticPaymentObservation({...observation("SETTLED"),synthetic:false},binding()),
    /fictional observation/,
  );
  assert.throws(
    ()=>assessSyntheticPaymentObservation({...observation("SETTLED"),provider:"UNSET"},binding()),
    /named provider/,
  );
  assert.throws(
    ()=>assessSyntheticPaymentObservation({...observation("SETTLED"),amountMinor:19501},binding()),
    /fixed GBP 195.00/,
  );
  assert.throws(
    ()=>assessSyntheticPaymentObservation({...observation("SETTLED"),evidenceDigest:"raw-ref"},binding()),
    /SHA-256 evidence digest/,
  );
  assert.throws(
    ()=>assessSyntheticPaymentObservation({...observation("SETTLED"),evidenceDigest:"A".repeat(64)},binding()),
    /SHA-256 evidence digest/,
    "uppercase digest must not bypass the canonical lowercase cross-PR contract",
  );
  assert.throws(
    ()=>assessSyntheticPaymentObservation({...observation("SETTLED"),providerReference:"pi_secret"},binding()),
    /exact synthetic observation/,
  );
  for(const key of ["observationId","sourceRecordId","invoiceEventId"]){
    assert.throws(
      ()=>assessSyntheticPaymentObservation({
        ...observation("SETTLED"),
        [key]:observation("SETTLED")[key].toUpperCase(),
      },binding()),
      /valid .* ID required/,
      `uppercase ${key} aliases must fail closed`,
    );
  }
});


test("payment stage identifiers must remain pairwise distinct",()=>{
  for(const overrides of [
    {observationId:observation("SETTLED").sourceRecordId},
    {observationId:observation("SETTLED").invoiceEventId},
    {sourceRecordId:observation("SETTLED").invoiceEventId},
  ]){
    const changed={...observation("SETTLED"),...overrides};
    const expected={
      ...binding(),
      sourceRecordId:changed.sourceRecordId,
      invoiceEventId:changed.invoiceEventId,
    };
    assert.throws(
      ()=>assessSyntheticPaymentObservation(changed,expected),
      /observation, source record and invoice event IDs must differ/,
    );
  }
});


test("payment observation cannot be reused across leads or invoices",()=>{
  assert.throws(
    ()=>assessSyntheticPaymentObservation(observation("SETTLED"),{
      ...binding(),sourceRecordId:"dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    }),
    /source record mismatch/,
  );
  assert.throws(
    ()=>assessSyntheticPaymentObservation(observation("SETTLED"),{
      ...binding(),invoiceEventId:"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    }),
    /invoice event mismatch/,
  );
  assert.throws(
    ()=>assessSyntheticPaymentObservation(observation("SETTLED")),
    /expected commercial binding/,
  );
});


test("payment observation cannot switch the selected provider",()=>{
  assert.throws(
    ()=>assessSyntheticPaymentObservation({
      ...observation("SETTLED"),
      provider:"OTHER_PROVIDER",
    },binding()),
    /provider mismatch/,
  );
  assert.throws(
    ()=>assessSyntheticPaymentObservation(observation("SETTLED"),{
      ...binding(),
      provider:"UNSET",
    }),
    /named expected provider/,
  );
});

test("payment evidence cannot reuse source or invoice-stage evidence",()=>{
  for(const key of ["sourceEvidenceDigest","invoiceEvidenceDigest"]){
    assert.throws(
      ()=>assessSyntheticPaymentObservation({
        ...observation("SETTLED"),
        evidenceDigest:binding()[key],
      },binding()),
      /reused from an earlier commercial stage/,
      `${key} must identify a distinct artefact`,
    );
  }
  assert.throws(
    ()=>assessSyntheticPaymentObservation(observation("SETTLED"),{
      ...binding(),invoiceEvidenceDigest:"C".repeat(64),
    }),
    /canonical source and invoice evidence digests/,
  );
});


test("source and invoice evidence bindings must remain distinct",()=>{
  assert.throws(
    ()=>assessSyntheticPaymentObservation(observation("SETTLED"),{
      ...binding(),
      invoiceEvidenceDigest:binding().sourceEvidenceDigest,
    }),
    /source and invoice evidence digests must differ/,
    "one artefact cannot prove both intake provenance and invoicing",
  );
});


test("payment observation must follow its bound invoice event",()=>{
  assert.throws(
    ()=>assessSyntheticPaymentObservation(observation("SETTLED"),{
      ...binding(),invoicedAt:"2026-10-20T11:00:01.000Z",
    }),
    /cannot predate invoice event/,
  );
  assert.throws(
    ()=>assessSyntheticPaymentObservation(observation("SETTLED"),{
      ...binding(),invoicedAt:"20 October 2026 10:59:59 UTC",
    }),
    /canonical UTC invoice timestamp/,
  );
});


test("payment observation requires a fresh non-future verification boundary",()=>{
  assert.throws(
    ()=>assessSyntheticPaymentObservation(observation("SETTLED"),{
      ...binding(),verifiedAt:"2026-10-20T10:59:59.000Z",
    }),
    /cannot postdate verification/,
    "future-dated observations cannot support payment review",
  );
  assert.throws(
    ()=>assessSyntheticPaymentObservation(observation("SETTLED"),{
      ...binding(),verifiedAt:"2026-10-20T11:15:00.001Z",
    }),
    /stale at verification/,
    "observations older than 15 minutes require a fresh provider read",
  );
  assert.throws(
    ()=>assessSyntheticPaymentObservation(observation("SETTLED"),{
      ...binding(),verifiedAt:"20 October 2026 11:00:01 UTC",
    }),
    /canonical UTC verification timestamp/,
  );
});


test("synthetic payment batch remains review-only and records no cash",()=>{
  const result=assessBatch([{
    providerTransactionDigest:"d".repeat(64),
    observation:observation("SETTLED"),
    expectedBinding:binding(),
  }]);
  assert.equal(result.state,"PAYMENT_BATCH_REVIEW");
  assert.equal(result.observationCount,1);
  assert.equal(result.candidates[0].state,"CLEARED_EVIDENCE_REVIEW");
  assert.equal(result.automaticTransition,false);
  assert.equal(result.networkCalled,false);
  assert.equal(result.paymentRecorded,false);
  assert.equal(result.clearedEvidenceGBP,0);
  assert.equal(result.commercialTruth,"SYNTHETIC_BATCH_NOT_REVENUE");
  assert.equal(result.customerDelivery,"HOLD");
});

test("one provider transaction cannot create multiple payment observations",()=>{
  const first={
    providerTransactionDigest:"d".repeat(64),
    observation:observation("SETTLED"),
    expectedBinding:binding(),
  };
  const second={
    providerTransactionDigest:first.providerTransactionDigest,
    observation:{
      ...observation("SETTLED"),
      observationId:"dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      evidenceDigest:"e".repeat(64),
    },
    expectedBinding:binding(),
  };
  assert.throws(
    ()=>assessBatch([first,second]),
    /provider transaction reused across payment observations/,
  );
  assert.throws(
    ()=>assessBatch([{
      ...first,providerTransactionDigest:first.observation.evidenceDigest,
    }]),
    /distinct evidence boundary/,
  );
  assert.throws(
    ()=>assessBatch([first,{...first}]),
    /duplicate payment observation ID/,
  );
});

test("one invoice event cannot create competing payment observations",()=>{
  const first={
    providerTransactionDigest:"d".repeat(64),
    observation:observation("SETTLED"),
    expectedBinding:binding(),
  };
  const second={
    providerTransactionDigest:"e".repeat(64),
    observation:{
      ...observation("SETTLED"),
      observationId:"dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      evidenceDigest:"f".repeat(64),
    },
    expectedBinding:binding(),
  };
  assert.throws(
    ()=>assessBatch([first,second]),
    /invoice event reused across payment observations/,
  );
});

test("one source record cannot create competing payment observations",()=>{
  const first={
    providerTransactionDigest:"d".repeat(64),
    observation:observation("SETTLED"),
    expectedBinding:binding(),
  };
  const replacementInvoiceId="eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  const second={
    providerTransactionDigest:"e".repeat(64),
    observation:{
      ...observation("SETTLED"),
      observationId:"dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      invoiceEventId:replacementInvoiceId,
      evidenceDigest:"f".repeat(64),
    },
    expectedBinding:{
      ...binding(),
      invoiceEventId:replacementInvoiceId,
      invoiceEvidenceDigest:"1".repeat(64),
    },
  };
  assert.throws(
    ()=>assessBatch([first,second]),
    /source record reused across payment observations/,
  );
});

test("payment batch emits a frozen cumulative replay cursor",()=>{
  const result=assessBatch([{
    providerTransactionDigest:"d".repeat(64),
    observation:observation("SETTLED"),
    expectedBinding:binding(),
  }]);
  assert.deepEqual(result.reconciliationCursor,{
    version:1,
    synthetic:true,
    observationIds:[observation("SETTLED").observationId],
    evidenceDigests:[observation("SETTLED").evidenceDigest],
    sourceEvidenceDigests:[binding().sourceEvidenceDigest],
    invoiceEvidenceDigests:[binding().invoiceEvidenceDigest],
    providerTransactions:[{
      providerTransactionDigest:"d".repeat(64),
      sourceRecordId:observation("SETTLED").sourceRecordId,
      sourceEvidenceDigest:binding().sourceEvidenceDigest,
      invoiceEventId:observation("SETTLED").invoiceEventId,
      invoiceEvidenceDigest:binding().invoiceEvidenceDigest,
      provider:observation("SETTLED").provider,
      observedAt:observation("SETTLED").observedAt,
      status:"SETTLED",
    }],
  });
  assert.ok(Object.isFrozen(result.reconciliationCursor));
  assert.ok(Object.isFrozen(result.reconciliationCursor.observationIds));
  assert.ok(Object.isFrozen(result.reconciliationCursor.evidenceDigests));
  assert.ok(Object.isFrozen(result.reconciliationCursor.sourceEvidenceDigests));
  assert.ok(Object.isFrozen(result.reconciliationCursor.invoiceEvidenceDigests));
  assert.ok(Object.isFrozen(result.reconciliationCursor.providerTransactions));
  assert.ok(Object.isFrozen(result.reconciliationCursor.providerTransactions[0]));
});

test("prior reconciliation cursor blocks cross-batch observation replay",()=>{
  const first=assessBatch([{
    providerTransactionDigest:"d".repeat(64),
    observation:observation("PENDING"),
    expectedBinding:binding(),
  }]);
  assert.throws(
    ()=>assessBatch([{
      providerTransactionDigest:"d".repeat(64),
      observation:observation("PENDING"),
      expectedBinding:binding(),
    }],first.reconciliationCursor),
    /observation ID already reconciled/,
  );
  assert.throws(
    ()=>assessBatch([{
      providerTransactionDigest:"d".repeat(64),
      observation:{
        ...observation("SETTLED"),
        observationId:"dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      },
      expectedBinding:binding(),
    }],first.reconciliationCursor),
    /evidence digest already reconciled/,
  );
});

test("new evidence can update a prior provider transaction without replay",()=>{
  const first=assessBatch([{
    providerTransactionDigest:"d".repeat(64),
    observation:observation("PENDING"),
    expectedBinding:binding(),
  }]);
  const second=assessBatch([{
    providerTransactionDigest:"d".repeat(64),
    observation:{
      ...observation("SETTLED"),
      observationId:"dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      observedAt:"2026-10-20T11:05:00.000Z",
      evidenceDigest:"e".repeat(64),
    },
    expectedBinding:binding(),
  }],first.reconciliationCursor);
  assert.equal(second.candidates[0].state,"CLEARED_EVIDENCE_REVIEW");
  assert.equal(second.reconciliationCursor.observationIds.length,2);
  assert.equal(second.reconciliationCursor.evidenceDigests.length,2);
  assert.equal(second.reconciliationCursor.providerTransactions.length,1);
  assert.equal(second.reconciliationCursor.providerTransactions[0].status,"SETTLED");
  assert.equal(second.clearedEvidenceGBP,0);
});

test("status changes require strictly newer provider evidence",()=>{
  const first=assessBatch([{
    providerTransactionDigest:"d".repeat(64),
    observation:observation("PENDING"),
    expectedBinding:binding(),
  }]);
  assert.throws(
    ()=>assessBatch([{
      providerTransactionDigest:"d".repeat(64),
      observation:{
        ...observation("SETTLED"),
        observationId:"dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        evidenceDigest:"e".repeat(64),
      },
      expectedBinding:binding(),
    }],first.reconciliationCursor),
    /reused provider transaction requires newer evidence/,
  );
});

test("same-status polling cannot replay an identical provider timestamp",()=>{
  const first=assessBatch([{
    providerTransactionDigest:"d".repeat(64),
    observation:observation("PENDING"),
    expectedBinding:binding(),
  }]);
  assert.throws(
    ()=>assessBatch([{
      providerTransactionDigest:"d".repeat(64),
      observation:{
        ...observation("PENDING"),
        observationId:"dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        evidenceDigest:"e".repeat(64),
      },
      expectedBinding:binding(),
    }],first.reconciliationCursor),
    /reused provider transaction requires newer evidence/,
  );
});

test("provider transaction ownership and lifecycle persist across batches",()=>{
  const settled=assessBatch([{
    providerTransactionDigest:"d".repeat(64),
    observation:observation("SETTLED"),
    expectedBinding:binding(),
  }]);
  const nextObservation={
    ...observation("PENDING"),
    observationId:"dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    observedAt:"2026-10-20T11:05:00.000Z",
    evidenceDigest:"e".repeat(64),
  };
  assert.throws(
    ()=>assessBatch([{
      providerTransactionDigest:"d".repeat(64),
      observation:{
        ...nextObservation,
        sourceRecordId:"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      },
      expectedBinding:{
        ...binding(),
        sourceRecordId:"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      },
    }],settled.reconciliationCursor),
    /ownership changed across batches/,
  );
  assert.throws(
    ()=>assessBatch([{
      providerTransactionDigest:"d".repeat(64),
      observation:nextObservation,
      expectedBinding:binding(),
    }],settled.reconciliationCursor),
    /status regressed across batches/,
  );
  assert.throws(
    ()=>assessBatch([{
      providerTransactionDigest:"d".repeat(64),
      observation:{
        ...nextObservation,
        status:"REFUNDED",
        observedAt:"2026-10-20T10:59:59.000Z",
      },
      expectedBinding:binding(),
    }],settled.reconciliationCursor),
    /reused provider transaction requires newer evidence/,
  );
});

test("provider transaction commercial evidence binding persists across batches",()=>{
  const first=assessBatch([{
    providerTransactionDigest:"d".repeat(64),
    observation:observation("PENDING"),
    expectedBinding:binding(),
  }]);
  const laterObservation={
    ...observation("SETTLED"),
    observationId:"dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    observedAt:"2026-10-20T11:05:00.000Z",
    evidenceDigest:"e".repeat(64),
  };
  assert.throws(
    ()=>assessBatch([{
      providerTransactionDigest:"d".repeat(64),
      observation:laterObservation,
      expectedBinding:{
        ...binding(),
        sourceEvidenceDigest:"1".repeat(64),
      },
    }],first.reconciliationCursor),
    /evidence binding changed across batches/,
  );
  assert.throws(
    ()=>assessBatch([{
      providerTransactionDigest:"d".repeat(64),
      observation:laterObservation,
      expectedBinding:{
        ...binding(),
        invoiceEvidenceDigest:"2".repeat(64),
      },
    }],first.reconciliationCursor),
    /evidence binding changed across batches/,
  );
});

test("invoice and source ownership persist across provider transactions",()=>{
  const first=assessBatch([{
    providerTransactionDigest:"d".repeat(64),
    observation:observation("PENDING"),
    expectedBinding:binding(),
  }]);
  const replacement={
    providerTransactionDigest:"e".repeat(64),
    observation:{
      ...observation("SETTLED"),
      observationId:"dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      observedAt:"2026-10-20T11:05:00.000Z",
      evidenceDigest:"f".repeat(64),
    },
    expectedBinding:binding(),
  };
  assert.throws(
    ()=>assessBatch([replacement],first.reconciliationCursor),
    /invoice event already bound to another provider transaction/,
  );
  const replacementInvoiceId="eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  assert.throws(
    ()=>assessBatch([{
      ...replacement,
      observation:{
        ...replacement.observation,
        invoiceEventId:replacementInvoiceId,
      },
      expectedBinding:{
        ...binding(),
        invoiceEventId:replacementInvoiceId,
        invoiceEvidenceDigest:"1".repeat(64),
      },
    }],first.reconciliationCursor),
    /source record already bound to another provider transaction/,
  );
});

test("malformed cursor rejects historical duplicate invoice ownership",()=>{
  const prior={
    ...emptySyntheticPaymentEvidenceCursor(),
    observationIds:[
      "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      "ffffffff-ffff-4fff-8fff-ffffffffffff",
    ],
    evidenceDigests:["4".repeat(64),"5".repeat(64)],
    sourceEvidenceDigests:[binding().sourceEvidenceDigest],
    invoiceEvidenceDigests:[binding().invoiceEvidenceDigest],
    providerTransactions:[
      {
        providerTransactionDigest:"d".repeat(64),
        sourceRecordId:observation("PENDING").sourceRecordId,
        sourceEvidenceDigest:binding().sourceEvidenceDigest,
        invoiceEventId:observation("PENDING").invoiceEventId,
        invoiceEvidenceDigest:binding().invoiceEvidenceDigest,
        provider:observation("PENDING").provider,
        observedAt:observation("PENDING").observedAt,
        status:"PENDING",
      },
      {
        providerTransactionDigest:"e".repeat(64),
        sourceRecordId:"dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        sourceEvidenceDigest:binding().sourceEvidenceDigest,
        invoiceEventId:observation("PENDING").invoiceEventId,
        invoiceEvidenceDigest:binding().invoiceEvidenceDigest,
        provider:observation("PENDING").provider,
        observedAt:observation("PENDING").observedAt,
        status:"PENDING",
      },
    ],
  };
  assert.throws(
    ()=>assessBatch([{
      providerTransactionDigest:"f".repeat(64),
      observation:{
        ...observation("SETTLED"),
        observationId:"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        sourceRecordId:"ffffffff-ffff-4fff-8fff-ffffffffffff",
        invoiceEventId:"11111111-1111-4111-8111-111111111111",
        evidenceDigest:"2".repeat(64),
      },
      expectedBinding:{
        ...binding(),
        sourceRecordId:"ffffffff-ffff-4fff-8fff-ffffffffffff",
        invoiceEventId:"11111111-1111-4111-8111-111111111111",
        invoiceEvidenceDigest:"3".repeat(64),
      },
    }],prior),
    /prior invoice event bound to multiple provider transactions/,
  );
});

test("payment and provider-transaction digest roles remain disjoint",()=>{
  const firstItem={
    providerTransactionDigest:"d".repeat(64),
    observation:observation("PENDING"),
    expectedBinding:binding(),
  };
  const first=assessBatch([firstItem]);
  const distinctItem={
    providerTransactionDigest:"e".repeat(64),
    observation:{
      ...observation("SETTLED"),
      observationId:"dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      sourceRecordId:"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      invoiceEventId:"ffffffff-ffff-4fff-8fff-ffffffffffff",
      observedAt:"2026-10-20T11:05:00.000Z",
      evidenceDigest:"1".repeat(64),
    },
    expectedBinding:{
      ...binding(),
      sourceRecordId:"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      sourceEvidenceDigest:"2".repeat(64),
      invoiceEventId:"ffffffff-ffff-4fff-8fff-ffffffffffff",
      invoiceEvidenceDigest:"3".repeat(64),
    },
  };
  assert.throws(
    ()=>assessBatch([{
      ...distinctItem,
      providerTransactionDigest:firstItem.observation.evidenceDigest,
    }],first.reconciliationCursor),
    /provider transaction digest reused from payment evidence/,
    "later transaction identity cannot reuse earlier observation evidence",
  );
  assert.throws(
    ()=>assessBatch([{
      ...distinctItem,
      observation:{
        ...distinctItem.observation,
        evidenceDigest:firstItem.providerTransactionDigest,
      },
    }],first.reconciliationCursor),
    /payment evidence digest reused as provider transaction/,
    "later observation evidence cannot reuse earlier transaction identity",
  );
  assert.throws(
    ()=>assessBatch([
      firstItem,
      {...distinctItem,providerTransactionDigest:firstItem.observation.evidenceDigest},
    ]),
    /provider transaction digest reused from payment evidence/,
    "same-batch transaction identity cannot reuse earlier observation evidence",
  );
  assert.throws(
    ()=>assessBatch([
      firstItem,
      {
        ...distinctItem,
        observation:{
          ...distinctItem.observation,
          evidenceDigest:firstItem.providerTransactionDigest,
        },
      },
    ]),
    /payment evidence digest reused as provider transaction/,
    "same-batch observation evidence cannot reuse earlier transaction identity",
  );
});

test("commercial evidence roles remain disjoint across payment batches",()=>{
  const firstItem={
    providerTransactionDigest:"d".repeat(64),
    observation:observation("PENDING"),
    expectedBinding:binding(),
  };
  const first=assessBatch([firstItem]);
  const sourceRecordId="dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const invoiceEventId="eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  const distinct={
    providerTransactionDigest:"f".repeat(64),
    observation:{
      ...observation("SETTLED"),
      observationId:"ffffffff-ffff-4fff-8fff-ffffffffffff",
      sourceRecordId,
      invoiceEventId,
      evidenceDigest:"3".repeat(64),
    },
    expectedBinding:{
      ...binding(),
      sourceRecordId,
      invoiceEventId,
      sourceEvidenceDigest:"1".repeat(64),
      invoiceEvidenceDigest:"2".repeat(64),
    },
  };
  assert.throws(
    ()=>assessBatch([{
      ...distinct,
      observation:{
        ...distinct.observation,
        evidenceDigest:firstItem.expectedBinding.sourceEvidenceDigest,
      },
    }],first.reconciliationCursor),
    /payment evidence digest reused from commercial binding/,
  );
  assert.throws(
    ()=>assessBatch([{
      ...distinct,
      providerTransactionDigest:firstItem.expectedBinding.invoiceEvidenceDigest,
    }],first.reconciliationCursor),
    /provider transaction digest reused from commercial binding/,
  );
  assert.throws(
    ()=>assessBatch([{
      ...distinct,
      expectedBinding:{
        ...distinct.expectedBinding,
        sourceEvidenceDigest:firstItem.observation.evidenceDigest,
      },
    }],first.reconciliationCursor),
    /source evidence digest reused from payment evidence/,
  );
});

test("historical cursor rejects evidence digest role collisions",()=>{
  const item=[{
    providerTransactionDigest:"d".repeat(64),
    observation:observation("SETTLED"),
    expectedBinding:binding(),
  }];
  assert.throws(
    ()=>assessBatch(item,{
      ...emptySyntheticPaymentEvidenceCursor(),
      sourceEvidenceDigests:["1".repeat(64)],
      invoiceEvidenceDigests:["1".repeat(64)],
    }),
    /source evidence digest reused from invoice binding/,
  );
  assert.throws(
    ()=>assessBatch(item,{
      ...emptySyntheticPaymentEvidenceCursor(),
      observationIds:["dddddddd-dddd-4ddd-8ddd-dddddddddddd"],
      evidenceDigests:["1".repeat(64)],
      sourceEvidenceDigests:["1".repeat(64)],
    }),
    /payment evidence digest reused from commercial binding/,
  );
  assert.throws(
    ()=>assessBatch(item,{
      ...emptySyntheticPaymentEvidenceCursor(),
      observationIds:["dddddddd-dddd-4ddd-8ddd-dddddddddddd"],
      evidenceDigests:["d".repeat(64)],
      providerTransactions:[{
        providerTransactionDigest:"d".repeat(64),
        sourceRecordId:observation("PENDING").sourceRecordId,
        sourceEvidenceDigest:binding().sourceEvidenceDigest,
        invoiceEventId:observation("PENDING").invoiceEventId,
        invoiceEvidenceDigest:binding().invoiceEvidenceDigest,
        provider:observation("PENDING").provider,
        observedAt:observation("PENDING").observedAt,
        status:"PENDING",
      }],
    }),
    /provider transaction digest reused from another evidence role/,
  );
});

test("identifier roles remain immutable across payment batches",()=>{
  const first=assessBatch([{
    providerTransactionDigest:"d".repeat(64),
    observation:observation("PENDING"),
    expectedBinding:binding(),
  }]);
  const nextBase={
    providerTransactionDigest:"e".repeat(64),
    observation:{
      ...observation("SETTLED"),
      observationId:"dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      sourceRecordId:"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      invoiceEventId:"ffffffff-ffff-4fff-8fff-ffffffffffff",
      observedAt:"2026-10-20T11:05:00.000Z",
      evidenceDigest:"1".repeat(64),
    },
    expectedBinding:{
      ...binding(),
      sourceRecordId:"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      sourceEvidenceDigest:"2".repeat(64),
      invoiceEventId:"ffffffff-ffff-4fff-8fff-ffffffffffff",
      invoiceEvidenceDigest:"3".repeat(64),
    },
  };
  for(const mutation of [
    item=>({
      ...item,
      observation:{
        ...item.observation,
        observationId:observation("PENDING").sourceRecordId,
      },
    }),
    item=>({
      ...item,
      observation:{
        ...item.observation,
        sourceRecordId:observation("PENDING").observationId,
      },
      expectedBinding:{
        ...item.expectedBinding,
        sourceRecordId:observation("PENDING").observationId,
      },
    }),
    item=>({
      ...item,
      observation:{
        ...item.observation,
        invoiceEventId:observation("PENDING").sourceRecordId,
      },
      expectedBinding:{
        ...item.expectedBinding,
        invoiceEventId:observation("PENDING").sourceRecordId,
      },
    }),
  ]){
    assert.throws(
      ()=>assessBatch([mutation(nextBase)],first.reconciliationCursor),
      /identifier reused across payment roles/,
    );
  }
});

test("same-batch identifiers cannot change roles between observations",()=>{
  const first={
    providerTransactionDigest:"d".repeat(64),
    observation:observation("PENDING"),
    expectedBinding:binding(),
  };
  const second={
    providerTransactionDigest:"e".repeat(64),
    observation:{
      ...observation("SETTLED"),
      observationId:first.observation.sourceRecordId,
      sourceRecordId:"dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      invoiceEventId:"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      observedAt:"2026-10-20T11:05:00.000Z",
      evidenceDigest:"1".repeat(64),
    },
    expectedBinding:{
      ...binding(),
      sourceRecordId:"dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      sourceEvidenceDigest:"2".repeat(64),
      invoiceEventId:"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      invoiceEvidenceDigest:"3".repeat(64),
    },
  };
  assert.throws(
    ()=>assessBatch([first,second]),
    /identifier reused across payment roles/,
  );
});

test("historical cursor rejects identifier role collisions",()=>{
  const item=[{
    providerTransactionDigest:"e".repeat(64),
    observation:{
      ...observation("SETTLED"),
      observationId:"dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      sourceRecordId:"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      invoiceEventId:"ffffffff-ffff-4fff-8fff-ffffffffffff",
      evidenceDigest:"1".repeat(64),
    },
    expectedBinding:{
      ...binding(),
      sourceRecordId:"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      sourceEvidenceDigest:"2".repeat(64),
      invoiceEventId:"ffffffff-ffff-4fff-8fff-ffffffffffff",
      invoiceEvidenceDigest:"3".repeat(64),
    },
  }];
  assert.throws(
    ()=>assessBatch(item,{
      ...emptySyntheticPaymentEvidenceCursor(),
      observationIds:[observation("PENDING").sourceRecordId],
      evidenceDigests:["4".repeat(64)],
      sourceEvidenceDigests:[binding().sourceEvidenceDigest],
      invoiceEvidenceDigests:[binding().invoiceEvidenceDigest],
      providerTransactions:[{
        providerTransactionDigest:"d".repeat(64),
        sourceRecordId:observation("PENDING").sourceRecordId,
        sourceEvidenceDigest:binding().sourceEvidenceDigest,
        invoiceEventId:observation("PENDING").invoiceEventId,
        invoiceEvidenceDigest:binding().invoiceEvidenceDigest,
        provider:observation("PENDING").provider,
        observedAt:observation("PENDING").observedAt,
        status:"PENDING",
      }],
    }),
    /identifier reused across payment roles/,
  );
});

test("malformed or omitted prior cursor fails closed",()=>{
  const item=[{
    providerTransactionDigest:"d".repeat(64),
    observation:observation("SETTLED"),
    expectedBinding:binding(),
  }];
  assert.throws(
    ()=>assessSyntheticPaymentObservationBatch(item),
    /prior payment evidence cursor/,
  );
  assert.throws(
    ()=>assessSyntheticPaymentObservationBatch(item,{
      ...emptySyntheticPaymentEvidenceCursor(),
      observationIds:[
        "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      ],
    }),
    /sorted unique prior observation IDs/,
  );
  assert.throws(
    ()=>assessSyntheticPaymentObservationBatch(item,{
      ...emptySyntheticPaymentEvidenceCursor(),
      evidenceDigests:["A".repeat(64)],
    }),
    /canonical prior evidence digests/,
  );
});



test("historical cursor rejects orphan observation IDs or evidence digests",()=>{
  const item=[{
    providerTransactionDigest:"d".repeat(64),
    observation:observation("SETTLED"),
    expectedBinding:binding(),
  }];
  assert.throws(
    ()=>assessBatch(item,{
      ...emptySyntheticPaymentEvidenceCursor(),
      observationIds:["dddddddd-dddd-4ddd-8ddd-dddddddddddd"],
    }),
    /one-to-one cardinality/,
  );
  assert.throws(
    ()=>assessBatch(item,{
      ...emptySyntheticPaymentEvidenceCursor(),
      evidenceDigests:["1".repeat(64)],
    }),
    /one-to-one cardinality/,
  );
});

test("historical provider transaction requires observation evidence",()=>{
  const first=assessBatch([{
    providerTransactionDigest:"d".repeat(64),
    observation:observation("PENDING"),
    expectedBinding:binding(),
  }]);
  assert.throws(
    ()=>assessBatch([{
      providerTransactionDigest:"e".repeat(64),
      observation:{
        ...observation("SETTLED"),
        observationId:"dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        sourceRecordId:"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        invoiceEventId:"ffffffff-ffff-4fff-8fff-ffffffffffff",
        evidenceDigest:"1".repeat(64),
      },
      expectedBinding:{
        ...binding(),
        sourceRecordId:"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        sourceEvidenceDigest:"2".repeat(64),
        invoiceEventId:"ffffffff-ffff-4fff-8fff-ffffffffffff",
        invoiceEvidenceDigest:"3".repeat(64),
      },
    }],{
      ...first.reconciliationCursor,
      observationIds:[],
      evidenceDigests:[],
    }),
    /lacks payment observation evidence/,
  );
});

test("cursor capacity fails closed before emitting an unusable next cursor",()=>{
  const fullEvidence=Array.from({length:1000},(_,index)=>
    index.toString(16).padStart(64,"0"));
  const fullObservationIds=Array.from({length:1000},(_,index)=>{
    const prefix=index.toString(16).padStart(8,"0");
    const suffix=index.toString(16).padStart(12,"0");
    return `${prefix}-0000-4000-8000-${suffix}`;
  });
  const prior={
    version:1,
    synthetic:true,
    observationIds:fullObservationIds,
    evidenceDigests:fullEvidence,
    sourceEvidenceDigests:[],
    invoiceEvidenceDigests:[],
    providerTransactions:[],
  };
  assert.throws(
    ()=>assessBatch([{
      providerTransactionDigest:"d".repeat(64),
      observation:observation("SETTLED"),
      expectedBinding:binding(),
    }],prior),
    /payment evidence cursor capacity exceeded/,
  );
});

test("source evidence digest ownership persists across payment transactions",()=>{
  const first=assessBatch([{
    providerTransactionDigest:"d".repeat(64),
    observation:observation("PENDING"),
    expectedBinding:binding(),
  }]);
  const sourceRecordId="eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  const invoiceEventId="ffffffff-ffff-4fff-8fff-ffffffffffff";
  assert.throws(
    ()=>assessBatch([{
      providerTransactionDigest:"e".repeat(64),
      observation:{
        ...observation("PENDING"),
        observationId:"dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        sourceRecordId,
        invoiceEventId,
        observedAt:"2026-10-20T11:05:00.000Z",
        evidenceDigest:"1".repeat(64),
      },
      expectedBinding:{
        ...binding(),
        sourceRecordId,
        sourceEvidenceDigest:binding().sourceEvidenceDigest,
        invoiceEventId,
        invoiceEvidenceDigest:"2".repeat(64),
      },
    }],first.reconciliationCursor),
    /source evidence digest already bound to another source record/,
  );
});

test("invoice evidence digest ownership persists across payment transactions",()=>{
  const first=assessBatch([{
    providerTransactionDigest:"d".repeat(64),
    observation:observation("PENDING"),
    expectedBinding:binding(),
  }]);
  const sourceRecordId="eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  const invoiceEventId="ffffffff-ffff-4fff-8fff-ffffffffffff";
  assert.throws(
    ()=>assessBatch([{
      providerTransactionDigest:"e".repeat(64),
      observation:{
        ...observation("PENDING"),
        observationId:"dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        sourceRecordId,
        invoiceEventId,
        observedAt:"2026-10-20T11:05:00.000Z",
        evidenceDigest:"1".repeat(64),
      },
      expectedBinding:{
        ...binding(),
        sourceRecordId,
        sourceEvidenceDigest:"2".repeat(64),
        invoiceEventId,
        invoiceEvidenceDigest:binding().invoiceEvidenceDigest,
      },
    }],first.reconciliationCursor),
    /invoice evidence digest already bound to another invoice event/,
  );
});

test("historical cursor rejects unowned commercial evidence digests",()=>{
  const item=[{
    providerTransactionDigest:"d".repeat(64),
    observation:observation("PENDING"),
    expectedBinding:binding(),
  }];
  assert.throws(
    ()=>assessBatch(item,{
      ...emptySyntheticPaymentEvidenceCursor(),
      sourceEvidenceDigests:["1".repeat(64)],
    }),
    /commercial evidence digest lacks transaction ownership/,
  );
  assert.throws(
    ()=>assessBatch(item,{
      ...emptySyntheticPaymentEvidenceCursor(),
      invoiceEvidenceDigests:["2".repeat(64)],
    }),
    /commercial evidence digest lacks transaction ownership/,
  );
});



test("historical provider bindings are copied and frozen before cursor reuse",()=>{
  const first=assessBatch([{
    providerTransactionDigest:"d".repeat(64),
    observation:observation("PENDING"),
    expectedBinding:binding(),
  }]);
  const mutableHistoricalBinding={
    ...first.reconciliationCursor.providerTransactions[0],
  };
  const prior={
    ...first.reconciliationCursor,
    providerTransactions:[mutableHistoricalBinding],
  };
  const sourceRecordId="dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const invoiceEventId="eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  const next=assessBatch([{
    providerTransactionDigest:"e".repeat(64),
    observation:{
      ...observation("SETTLED"),
      observationId:"ffffffff-ffff-4fff-8fff-ffffffffffff",
      sourceRecordId,
      invoiceEventId,
      observedAt:"2026-10-20T11:05:00.000Z",
      evidenceDigest:"1".repeat(64),
    },
    expectedBinding:{
      ...binding(),
      sourceRecordId,
      sourceEvidenceDigest:"2".repeat(64),
      invoiceEventId,
      invoiceEvidenceDigest:"3".repeat(64),
    },
  }],prior);
  const retained=next.reconciliationCursor.providerTransactions.find(
    item=>item.providerTransactionDigest==="d".repeat(64),
  );
  assert.notStrictEqual(retained,mutableHistoricalBinding);
  assert.equal(Object.isFrozen(retained),true);
  mutableHistoricalBinding.sourceRecordId="11111111-1111-4111-8111-111111111111";
  assert.equal(retained.sourceRecordId,observation("PENDING").sourceRecordId);
});
