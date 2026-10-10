const form = document.querySelector("#enquiry-form");
const status = document.querySelector("#form-status");
const button = document.querySelector("#send");
let pendingSubmissionId = crypto.randomUUID();
if (form) form.addEventListener("submit", async (event) => {
  event.preventDefault();
  status.className = "status";
  if (!form.reportValidity()) return;
  button.disabled = true;
  status.textContent = "Securely submitting your enquiry…";
  const fields = new FormData(form);
  const payload = {
    submissionId: pendingSubmissionId,
    name: String(fields.get("name") || ""),
    company: String(fields.get("company") || ""),
    email: String(fields.get("email") || ""),
    problem: String(fields.get("problem") || ""),
    website: String(fields.get("website") || ""),
    contactPermission: fields.get("contactPermission") === "on",
  };
  try {
    const response = await fetch("/api/enquiry", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok || !result.received) throw new Error("Server did not confirm storage");
    form.reset();
    pendingSubmissionId = crypto.randomUUID();
    status.className = "status success";
    status.textContent = "Thank you. Your enquiry has been received. We'll review it and get back to you.";
  } catch {
    status.className = "status error";
    status.textContent = "The form couldn't confirm your enquiry. Please email newtonrevenue@gmail.com instead.";
  } finally {
    button.disabled = false;
  }
});