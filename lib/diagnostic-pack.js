// Pure, offline renderer for a FICTIONAL Enquiry Ownership Diagnostic rehearsal.
// Deliberately refuses real client data. Never an authorised delivery or payment.
const topKeys = new Set(["synthetic", "projectRef", "channel", "records", "findings", "fixes"]);
const rowKeys = new Set(["id", "evidenceRef", "classification", "duplicateOf", "receivedAt", "status", "owner", "nextAction", "dueAt", "exception"]);
const findingKeys = new Set(["id", "title", "explanation", "evidenceRefs", "limitation"]);
const fixKeys = new Set(["priority", "action", "impact", "effort", "owner", "acceptanceTest", "evidenceRefs"]);
const statuses = new Set(["NEW", "IN_PROGRESS", "WAITING", "RESOLVED", "EXCEPTION", "DUPLICATE", "EXCLUDED"]);
const classes = new Set(["canonical", "duplicate", "excluded"]);
const personalEmail = /[^\s@|]+@[^\s@|]+\.[a-z]{2,}/i;
const telephone = /(?:^|[^\d])(?:\+44|0[127])[\d \-()]{8,}\d(?:$|[^\d])/;
const credentials = /\b(?:sk-proj-|sk-[A-Za-z0-9_-]{16}|BEGIN PRIVATE KEY|Bearer [A-Za-z0-9_-]{16})/i;

function fail(message) { throw new Error("DEMO HOLD: " + message); }
function object(value, label, allowed) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(label + " must be an object");
  for (const key of Object.keys(value)) if (!allowed.has(key)) fail(label + " contains unapproved field " + key);
  return value;
}
function line(value, label, max = 180) {
  if (typeof value !== "string" || !value.trim() || value.length > max) fail(label + " must be nonempty and at most " + max + " characters");
  if (personalEmail.test(value) || telephone.test(value) || credentials.test(value) || /https?:\/\/|<[^>]+>/.test(value)) {
    fail(label + " contains possible identifying, credential or markup content");
  }
  return value.trim().replace(/[\r\n\t|]+/g, " ").replace(/\s{2,}/g, " ");
}
function time(value, label) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value) ||
      !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value.replace("Z", ".000Z").replace(".000.000Z", ".000Z")) {
    // ISO round trips are deliberately verified below to prevent invalid dates.
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value) ||
        !Number.isFinite(Date.parse(value)) ||
        new Date(value).toISOString().slice(0, 19) + "Z" !== value) fail(label + " must be valid UTC ISO seconds");
  }
  return value;
}
function evidenceList(value, label, known) {
  if (!Array.isArray(value) || !value.length || new Set(value).size !== value.length) fail(label + " must have distinct evidence references");
  for (const ref of value) if (typeof ref !== "string" || !known.has(ref)) fail(label + " cites missing or excluded evidence " + ref);
  return value.join(", ");
}
function tableValue(value) { return value ? String(value) : "—"; }
function table(headers, rows) {
  return ["| " + headers.join(" | ") + " |",
    "| " + headers.map(() => "---").join(" | ") + " |",
    ...rows.map(row => "| " + row.map(tableValue).join(" | ") + " |")].join("\n");
}

export function buildDemoPack(input) {
  object(input, "Input", topKeys);
  if (input.synthetic !== true) fail("only explicitly fictional input is accepted; real client data is prohibited");
  if (!/^DEMO-[A-Z0-9-]{3,30}$/.test(input.projectRef || "")) fail("projectRef must be a non-identifying DEMO- reference");
  const channel = line(input.channel, "channel", 40);
  if (!["Website", "Email", "Phone", "WhatsApp"].includes(channel)) fail("channel must be a single approved fictional channel");
  if (!Array.isArray(input.records) || input.records.length === 0 || input.records.length > 20) fail("provide 1–20 fictional source examples");

  const rows = [];
  const ids = new Set(), refs = new Set(), canonical = new Set();
  for (const [index, value] of input.records.entries()) {
    const label = "records[" + index + "]";
    object(value, label, rowKeys);
    const id = line(value.id, label + ".id", 30);
    const ref = line(value.evidenceRef, label + ".evidenceRef", 30);
    if (!/^SYN-\d{3}$/.test(id) || ids.has(id)) fail("source ID must be unique SYN-###");
    if (!/^EV-\d{3}$/.test(ref) || refs.has(ref)) fail("evidence reference must be unique EV-###");
    ids.add(id); refs.add(ref);
    if (!classes.has(value.classification)) fail(label + ".classification invalid");
    if (!statuses.has(value.status)) fail(label + ".status invalid");
    if ((value.classification === "duplicate") !== (value.status === "DUPLICATE")) fail(label + " duplicate status/classification mismatch");
    if ((value.classification === "excluded") !== (value.status === "EXCLUDED")) fail(label + " excluded status/classification mismatch");
    if (value.classification === "canonical") canonical.add(id);
    if (value.classification !== "duplicate" && value.duplicateOf !== undefined) fail(label + " cannot reference duplicateOf");
    const receivedAt = time(value.receivedAt, label + ".receivedAt");
    const owner = line(value.owner, label + ".owner", 60);
    const action = line(value.nextAction, label + ".nextAction", 220);
    const dueAt = time(value.dueAt, label + ".dueAt");
    const exception = line(value.exception, label + ".exception", 200);
    if (Date.parse(dueAt) < Date.parse(receivedAt)) fail(label + " deadline before receipt");
    if (owner === "UNASSIGNED" && exception === "None") fail(label + " unassigned owner needs an explicit exception");
    rows.push({ id, ref, receivedAt, classification: value.classification, duplicateOf: value.duplicateOf,
      status: value.status, owner, action, dueAt, exception });
  }
  for (const row of rows) {
    if (row.classification === "duplicate" && (!canonical.has(row.duplicateOf) || row.duplicateOf === row.id)) {
      fail(row.id + " duplicate must reference a canonical source ID");
    }
  }
  const usable = new Set(rows.filter(row => row.classification !== "excluded").map(row => row.ref));
  if (!Array.isArray(input.findings) || input.findings.length !== 3) fail("exactly 3 evidence-linked findings required for this rehearsal");
  if (!Array.isArray(input.fixes) || input.fixes.length !== 3) fail("exactly 3 separate, evidence-linked fixes required");
  const findingIds = new Set();
  const findings = input.findings.map((value, i) => {
    const label = "findings[" + i + "]";
    object(value, label, findingKeys);
    const id = line(value.id, label + ".id", 12);
    if (!/^F-0[1-3]$/.test(id) || findingIds.has(id)) fail("findings require unique F-01/02/03");
    findingIds.add(id);
    return [id, line(value.title, label + ".title"), line(value.explanation, label + ".explanation", 240),
      evidenceList(value.evidenceRefs, label + ".evidenceRefs", usable),
      line(value.limitation, label + ".limitation", 180)];
  });
  const fixPriorities = new Set();
  const fixes = input.fixes.map((value, i) => {
    const label = "fixes[" + i + "]";
    object(value, label, fixKeys);
    if (!Number.isInteger(value.priority) || value.priority < 1 || value.priority > 3 || fixPriorities.has(value.priority)) fail("fixes must have distinct priorities 1, 2, 3");
    fixPriorities.add(value.priority);
    return [value.priority, line(value.action, label + ".action", 220),
      evidenceList(value.evidenceRefs, label + ".evidenceRefs", usable),
      line(value.impact, label + ".impact", 100),
      line(value.effort, label + ".effort", 100),
      line(value.owner, label + ".owner", 60),
      line(value.acceptanceTest, label + ".acceptanceTest", 220)];
  }).sort((a, b) => a[0] - b[0]);

  const uniques = rows.filter(row => row.classification === "canonical").length;
  const duplicates = rows.filter(row => row.classification === "duplicate").length;
  const excluded = rows.filter(row => row.classification === "excluded").length;
  const count = rows.length;
  const header = [
    "# Enquiry Ownership Diagnostic — FICTIONAL DEMONSTRATION",
    "",
    "**NOT CLIENT WORK · NO GENUINE BUYER · NOT AN INVOICE · NO PAYMENT.**",
    "**Preflight: structural validation passed. Delivery release: HOLD pending real scope, privacy, tax, payment and human approval.**",
    "",
    "Project: " + input.projectRef + " · Channel: " + channel,
    "Source reconciliation: " + count + " = " + uniques + " canonical + " + duplicates + " duplicate + " + excluded + " excluded.",
    "",
    "## Fictional evidence tracker",
    table(["ID", "Evidence", "Received (UTC)", "Class", "Duplicate of", "State", "Owner", "Next action", "Due (UTC)", "Exception"],
      rows.map(row => [row.id, row.ref, row.receivedAt, row.classification, row.duplicateOf,
        row.status, row.owner, row.action, row.dueAt, row.exception])),
    "",
    "## Three fictional findings",
    table(["ID", "Observation", "Consequence", "Evidence", "Limits"], findings),
    "",
    "## Three recommended fixes — illustrative only",
    table(["Priority", "Action", "Evidence", "Potential impact", "Effort", "Owner", "Pass/fail acceptance test"], fixes),
    "",
    "## Human release gate — HOLD",
    "- [ ] Signed-off client scope and correct one-channel sample boundary",
    "- [ ] Written privacy, data-sharing and retention decisions",
    "- [ ] Final company, VAT, cancellation and payment terms approved",
    "- [ ] Independent reviewer checked source references and all 12 QA tests",
    "- [ ] Approved secure handover route and recipient recorded",
    "",
    "**This synthetic pack must never be counted as a real enquiry, customer result, invoice, delivery or revenue.**",
    ""
  ];
  return header.join("\n");
}
