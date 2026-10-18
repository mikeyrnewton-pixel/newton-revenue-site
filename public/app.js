const form = document.querySelector("#enquiry-form");
const status = document.querySelector("#form-status");
const button = document.querySelector("#send");
// A retry keeps its ID only while the submitted enquiry is unchanged.
// If someone edits the form after a lost network reply, it becomes a new
// submission: otherwise KV's earlier receipt could falsely confirm the edit.
let pendingSubmissionId = null;
let pendingSubmissionFingerprint = null;
if (form) form.addEventListener("submit", async (event) => {
  event.preventDefault();
  status.className = "status";
  if (!form.reportValidity()) return;
  button.disabled = true;
  status.textContent = "Securely submitting your enquiry…";
  const fields = new FormData(form);
  const payload = {
    source: ["ai-profit-brief", "newton-reset", "autopilot-8", "enquiry-check"].includes(new URLSearchParams(location.search).get("source")) ? new URLSearchParams(location.search).get("source") : "newton-revenue-site",
    channel: ["facebook", "instagram", "youtube", "search", "partner"].includes(new URLSearchParams(location.search).get("utm_source")) ? new URLSearchParams(location.search).get("utm_source") : "direct",
    name: String(fields.get("name") || ""),
    company: String(fields.get("company") || ""),
    email: String(fields.get("email") || ""),
    problem: String(fields.get("problem") || ""),
    website: String(fields.get("website") || ""),
    contactPermission: fields.get("contactPermission") === "on",
  };
  // Includes source/channel/consent, never persisted in the browser.
  // Stable ID for a true retry; fresh ID for any changed payload.
  const fingerprint = JSON.stringify(payload);
  if (fingerprint !== pendingSubmissionFingerprint) {
    pendingSubmissionId = crypto.randomUUID();
    pendingSubmissionFingerprint = fingerprint;
  }
  payload.submissionId = pendingSubmissionId;
  try {
    const response = await fetch("/api/enquiry", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok || !result.received) throw new Error("Server did not confirm storage");
    form.reset();
    pendingSubmissionId = null;
    pendingSubmissionFingerprint = null;
    status.className = "status success";
    status.textContent = "Thank you. Your enquiry has been received. We'll review it and get back to you.";
  } catch {
    status.className = "status error";
    status.textContent = "The form couldn't confirm your enquiry. Please email newtonrevenue@gmail.com instead.";
  } finally {
    button.disabled = false;
  }
});