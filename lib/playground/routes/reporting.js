// Playground stand-in for the reporting API. The narrative route never calls a model here: it strings the
// computed findings into a clearly labelled sample so the "Explain" flow can be clicked through.

import { json } from "../intercept_fetch.js";

const pct = (v) => (v == null || !Number.isFinite(Number(v)) ? "—" : `${(Number(v) * 100).toFixed(1)}%`);

function sampleNarrative(body) {
  const findings = Array.isArray(body?.findings) ? body.findings : [];
  const helped = findings.filter((f) => f.direction === "positive").slice(0, 2);
  const hurt = findings.find((f) => f.direction === "negative");
  const lead = (body?.headline || [])[0];
  const parts = [
    "Sample explanation — the playground doesn't call an AI model.",
    lead ? `${body?.campaign?.name || "This campaign"} reached a ${pct(lead.value)} ${String(lead.label || "").toLowerCase()} against a ${pct(lead.baseline)} baseline.` : body?.summary || "",
    helped.length ? `The clearest drivers were ${helped.map((f) => `${f.title.toLowerCase()} (${f.confidence} confidence)`).join(" and ")}.` : "",
    hurt ? `${hurt.title} likely held it back.` : "",
    "Next send: keep what worked and change one variable at a time so the effect is measurable.",
  ];
  return parts.filter(Boolean).join(" ");
}

export const reportingRoutes = [
  [
    "POST",
    "/api/projects/:projectId/reporting/insights",
    ({ body }) => {
      if (!body?.findings?.length && !body?.headline?.length) return json({ error: "There are no findings to explain yet." }, 400);
      return { narrative: sampleNarrative(body), model: "playground sample", generatedAt: new Date().toISOString(), sample: true };
    },
  ],
];
