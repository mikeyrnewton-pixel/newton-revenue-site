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
