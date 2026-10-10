(() => {
  "use strict";
  const form = document.getElementById("audit-form");
  const panel = document.getElementById("audit-result");
  const score = document.getElementById("audit-score");
  const summary = document.getElementById("audit-summary");
  const actions = document.getElementById("audit-actions");
  if (!form || !panel || !score || !summary || !actions) return;
  const recommendations = [
    ["log", "Create one enquiry log with a date, contact channel, reference and current status."],
    ["owner", "Assign one named person to every open enquiry and make ownership visible to the team."],
    ["urgency", "Write a simple rule for safety-critical or urgent work: immediate human handoff, never automated promises."],
    ["next", "Add a next-action date and last-response date to each open request; check overdue ones daily."],
    ["human", "Require a person to approve replies, commitments and quotes before anything is sent."],
    ["review", "Once a week, count genuine enquiries, quotes, conversations and paid jobs separately."]
  ];
  form.addEventListener("submit", event => {
    event.preventDefault();
    const checked = new Set([...form.querySelectorAll('input[name="check"]:checked')].map(input => input.value));
    const count = checked.size;
    score.textContent = count + " of 6 foundations in place";
    summary.textContent = count >= 5
      ? "You report strong basics. Keep the human review and look at the weakest remaining handoff before buying more tools."
      : count >= 3
      ? "Some good habits are in place. Focus on one missing handoff or follow-up rule, then reassess."
      : "A few simple ownership and follow-up habits are the best place to start. You do not need AI or a new CRM to begin.";
    const missing = recommendations.filter(([key]) => !checked.has(key)).slice(0, 2);
    const next = missing.length ? missing : [
      ["improve", "Review a random sample of ten recent enquiries and check whether the promised next step happened."],
      ["measure", "Compare real booked work and cleared payments against your enquiry log; do not count website visits as leads."]
    ];
    actions.replaceChildren();
    next.forEach(([, advice]) => {
      const li = document.createElement("li");
      li.textContent = advice;
      actions.appendChild(li);
    });
    panel.hidden = false;
    panel.focus({ preventScroll: true });
    panel.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  });
})();