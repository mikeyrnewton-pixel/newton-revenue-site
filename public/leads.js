const form = document.querySelector("#private-form");
const tokenInput = document.querySelector("#token");
const results = document.querySelector("#results");
const feedback = document.querySelector("#feedback");
const more = document.querySelector("#next");
let cursor = null;
let adminToken = "";
const el = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined && text !== null) node.textContent = String(text);
  if (className) node.className = className;
  return node;
};
// Human action only; no automatic customer reply, invoice or status change.
function buildSelect(title, options, previous) {
  const field = el("label", title + " ");
  const select = el("select");
  for (const [value, display] of options) {
    const option = el("option", display);
    option.value = value;
    option.selected = value === previous;
    select.append(option);
  }
  select.required = true;
  field.append(select);
  return {field, select};
}
function appendOwnerAction(card, lead) {
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(String(lead.id || ""))) return;
  const action = lead.triage || {};
  const panel = el("form");
  panel.style.cssText = "display:grid;gap:12px;margin-top:18px;padding-top:18px;border-top:1px solid #294050";
  panel.append(el("h4", "Owner action — internal only"));
  const state = buildSelect("Status", [
    ["new", "New"], ["assigned", "Assigned"], ["waiting", "Waiting"], ["resolved", "Resolved"]
  ], action.status || "new");
  const responsible = buildSelect("Accountable role", [
    ["owner", "Owner"], ["office", "Office"], ["delivery", "Delivery"], ["unassigned", "Unassigned"]
  ], action.responsibility || "owner");
  const step = buildSelect("Next action", [
    ["review", "Review"], ["reply", "Reply manually"], ["prepare-quote", "Prepare quote"],
    ["follow-up", "Follow up manually"], ["deliver", "Prepare delivery"], ["close", "Close"]
  ], action.nextStep || "review");
  const due = el("label", "Due by (local time) ");
  const dueInput = el("input");
  dueInput.type = "datetime-local";
  if (action.dueAt) {
    const parsed = new Date(action.dueAt);
    if (Number.isFinite(parsed.getTime())) {
      dueInput.value = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    }
  }
  due.append(dueInput);
  panel.append(state.field, responsible.field, step.field, due);
  const button = el("button", "Save internal action");
  button.type = "submit";
  const result = el("p", "", "status");
  result.setAttribute("role", "status");
  panel.append(button, result);
  panel.addEventListener("submit", async event => {
    event.preventDefault();
    const resolved = state.select.value === "resolved";
    if (resolved && (step.select.value !== "close" || responsible.select.value === "unassigned")) {
      result.textContent = "Resolved requires a named role and Close as the next action.";
      return;
    }
    if (!resolved && (step.select.value === "close" || !dueInput.value)) {
      result.textContent = "Open enquiries need a next action and due time.";
      return;
    }
    const date = resolved ? null : new Date(dueInput.value);
    if (date && !Number.isFinite(date.getTime())) {
      result.textContent = "Please enter a valid due date.";
      return;
    }
    const payload = {
      leadId: lead.id, actionId: crypto.randomUUID(),
      status: state.select.value, responsibility: responsible.select.value,
      nextStep: step.select.value,
      dueAt: date ? date.toISOString().slice(0, 19) + "Z" : null
    };
    button.disabled = true;
    result.textContent = "Saving internal owner action…";
    try {
      const response = await fetch("/api/lead-action", {
        method: "POST",
        headers: {"Authorization": "Bearer " + adminToken, "Content-Type": "application/json"},
        body: JSON.stringify(payload), cache: "no-store"
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Could not save");
      result.textContent = "Internal action saved. No customer message was sent.";
    } catch (error) {
      result.textContent = String(error.message || "Save not confirmed. Use the manual tracker.");
    } finally {
      button.disabled = false;
    }
  });
  card.append(panel);
}

async function getLeads(append = false) {
  feedback.textContent = "Checking enquiries…";
  more.hidden = true;
  try {
    const query = append && cursor ? "?cursor=" + encodeURIComponent(cursor) : "";
    const res = await fetch("/api/leads" + query, {
      headers: { "Authorization": "Bearer " + adminToken },
      cache: "no-store",
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not retrieve enquiries");
    if (!append) results.replaceChildren();
    for (const lead of data.records) {
      const card = el("article");
      card.style.cssText = "border:1px solid #294050;border-radius:14px;padding:20px;margin:16px 0;background:#102231";
      card.append(el("h3", lead.company || "Business enquiry"));
      card.append(el("p", (lead.name || "") + " · " + (lead.createdAt || "") + " · " + (lead.status || "new")));
      card.append(el("p", lead.problem || ""));
      if (typeof lead.email === "string") {
        const mail = el("a", "Reply by email →");
        mail.href = "mailto:" + encodeURIComponent(lead.email) + "?subject=" +
          encodeURIComponent("Re: your Newton Revenue enquiry");
        card.append(mail);
      }
      appendOwnerAction(card, lead);
      results.append(card);
    }
    cursor = data.nextCursor;
    more.hidden = !data.hasMore || !cursor;
    feedback.textContent = data.records.length ?
      "Showing " + data.records.length + " enquiry/enquiries from this page." :
      (append ? "No more enquiries." : "No enquiries recorded yet.");
  } catch (error) {
    feedback.textContent = error.message || "Could not load the private dashboard.";
  }
}
form.addEventListener("submit", event => {
  event.preventDefault();
  adminToken = tokenInput.value;
  tokenInput.value = "";
  cursor = null;
  getLeads(false);
});
more.addEventListener("click", () => getLeads(true));
