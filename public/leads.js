const form = document.querySelector("#private-form");
const tokenInput = document.querySelector("#token");
const results = document.querySelector("#results");
const feedback = document.querySelector("#feedback");
const more = document.querySelector("#next");
let cursor = null;
let adminToken = "";
let seenIntegrityWarning = false;
let seenLeadIds = new Set();
// A late response from a prior owner session must never repopulate private cards.
let sessionEpoch = 0;
const el = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined && text !== null) node.textContent = String(text);
  if (className) node.className = className;
  return node;
};
async function getLeads(append = false, epoch = sessionEpoch) {
  feedback.textContent = "Checking enquiries…";
  more.hidden = true;
  try {
    const query = append && cursor ? "?cursor=" + encodeURIComponent(cursor) : "";
    const res = await fetch("/api/leads" + query, {
      headers: { "Authorization": "Bearer " + adminToken },
      cache: "no-store",
    });
    const data = await res.json();
    if (epoch !== sessionEpoch) return; // Discard response from prior login.
    if (!res.ok) throw new Error(data.error || "Could not retrieve enquiries");
    if (!append) {
      results.replaceChildren();
      seenIntegrityWarning = false;
      seenLeadIds = new Set();
    }
    seenIntegrityWarning ||= data.dataIntegrityWarning === true;
    let displayedThisPage = 0;
    for (const lead of data.records) {
      const canonicalId = typeof lead?.id === "string" ? lead.id.toLowerCase() : "";
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(canonicalId) ||
          seenLeadIds.has(canonicalId)) {
        seenIntegrityWarning = true;
        continue;
      }
      seenLeadIds.add(canonicalId);
      displayedThisPage++;
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
      results.append(card);
    }
    cursor = data.nextCursor;
    more.hidden = !data.hasMore || !cursor;
    const summary = displayedThisPage ?
      "Showing " + displayedThisPage + " new enquiry/enquiries from this page." :
      (append ? "No more enquiries displayed on this page." : "No valid enquiries displayed on this page.");
    // Never misrepresent a partial/damaged storage page as an empty pipeline.
    feedback.textContent = seenIntegrityWarning ?
      summary + " WARNING: Some private records or notice states could not be verified. " +
      "Do not treat this as a complete lead count; inspect storage with authorised access." :
      summary;
  } catch (error) {
    if (epoch !== sessionEpoch) return;
    feedback.textContent = error.message || "Could not load the private dashboard.";
  }
}
form.addEventListener("submit", event => {
  event.preventDefault();
  sessionEpoch++;
  // Clear private data immediately, before attempting another authentication.
  // Incorrect tokens and network failures must not leave earlier leads visible.
  results.replaceChildren();
  seenIntegrityWarning = false;
  seenLeadIds = new Set();
  more.hidden = true;
  adminToken = tokenInput.value;
  tokenInput.value = "";
  cursor = null;
  getLeads(false);
});
more.addEventListener("click", () => getLeads(true));
