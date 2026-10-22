import test from "node:test";
import assert from "node:assert/strict";
import {buildVenueTourDiagnosticQuestions} from "../lib/venue-tour-diagnostic.js";

const valid = () => ({
  synthetic: true,
  segment: "uk-venue-tour",
  channel: "email",
});

test("builds a narrow evidence-led £195 venue-tour diagnostic", () => {
  const pack = buildVenueTourDiagnosticQuestions(valid());
  assert.equal(pack.schema, "NEWTON_ONE_CHANNEL_DIAGNOSTIC_V1");
  assert.equal(pack.synthetic, true);
  assert.equal(pack.segment, "uk-venue-tour");
  assert.equal(pack.channel, "email");
  assert.match(pack.offer, /£195 Enquiry Ownership Diagnostic/);
  assert.equal(pack.questions.length, 6);
  assert.match(pack.questions.join("\n"), /named owner/i);
  assert.match(pack.questions.join("\n"), /first human response/i);
  assert.match(pack.questions.join("\n"), /After a tour/i);
  assert.match(pack.questions.join("\n"), /historic open enquiries/i);
  assert.match(pack.questions.join("\n"), /recorded permission/i);
  assert.match(pack.result.readyWhen, /one owner, one next action, one due time/i);
  assert.equal(pack.result.customerDelivery, "HOLD");
  assert.match(pack.evidence.interpretation, /not a buyer, sale or permission to contact/i);
});

test("fails closed outside the fictional one-channel segment", () => {
  assert.throws(() => buildVenueTourDiagnosticQuestions({...valid(), synthetic: false}),
    /fictional rehearsal only/);
  assert.throws(() => buildVenueTourDiagnosticQuestions({...valid(), channel: "phone"}),
    /exactly one approved channel/);
  assert.throws(() => buildVenueTourDiagnosticQuestions({...valid(), segment: "generic"}),
    /approved segment/);
  assert.throws(() => buildVenueTourDiagnosticQuestions({...valid(), email: "person@example.com"}),
    /unapproved field/);
  assert.throws(() => buildVenueTourDiagnosticQuestions(null), /input required/);
});
