// reports worker job, run by app/api/internal/worker on every scheduler tick (server-only): delivers each
// scheduled custom report once per period to its recipients through the suite email API (geiger-dash),
// computed with the same engine the screen uses. Idempotent per (report, period, recipient).

import { isEmailConfigured, sendSuiteEmail } from "@/lib/email/client";
import { publicUrl } from "@/lib/server/urls";
import { formatChange, formatMetric, formatPts } from "./format";
import { normalizeDefinition, prepareSources, resultTable, runQuery } from "./query";
import { loadSince } from "./ranges";
import { describeSchedule, isDue, normalizeSchedule } from "./schedule";
import { loadServerSources } from "./server_sources";

export const name = "reports";

const BATCH = 50;
const MAX_RUNS = 10;

const escapeHtml = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function renderEmail(report, result, link) {
  const { columns, rows } = resultTable(result);
  const fmt = (col, value) => (col.key === "value" ? formatMetric(value, result.metric.format, result.currency) : col.key === "label" ? value : formatMetric(value, "number"));
  const change = result.metric.rate ? formatPts(result.value != null && result.previous != null ? result.value - result.previous : null) : formatChange(result.value, result.previous);
  const head = columns.map((c) => `<th align="${c.key === "label" ? "left" : "right"}" style="padding:8px 12px;border-bottom:1px solid #e4e4e7;font-size:12px;color:#71717a;font-weight:600">${escapeHtml(c.header)}</th>`).join("");
  const body = rows
    .slice(0, 50)
    .map(
      (r) =>
        `<tr>${columns
          .map((c) => `<td align="${c.key === "label" ? "left" : "right"}" style="padding:8px 12px;border-bottom:1px solid #f4f4f5;font-size:13px;color:#18181b">${escapeHtml(fmt(c, r[c.key]))}</td>`)
          .join("")}</tr>`,
    )
    .join("");
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#fafafa;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e4e4e7;border-radius:12px">
<tr><td style="padding:24px 24px 8px">
<p style="margin:0;font-size:12px;color:#71717a">${escapeHtml(result.range.label)} · ${escapeHtml(describeSchedule(report.schedule))}</p>
<h1 style="margin:4px 0 0;font-size:20px;color:#18181b">${escapeHtml(report.name)}</h1>
${report.description ? `<p style="margin:6px 0 0;font-size:14px;color:#52525b">${escapeHtml(report.description)}</p>` : ""}
<p style="margin:16px 0 0;font-size:13px;color:#52525b">${escapeHtml(result.metric.label)}: <strong style="color:#18181b">${escapeHtml(formatMetric(result.value, result.metric.format, result.currency))}</strong>${change ? ` (${escapeHtml(change)} vs previous period)` : ""}</p>
</td></tr>
<tr><td style="padding:16px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></td></tr>
<tr><td style="padding:8px 24px 24px"><a href="${escapeHtml(link)}" style="font-size:13px;color:#18181b">Open the report in Geiger Campaign</a></td></tr>
</table></body></html>`;
}

export async function run({ db, now = new Date(), deadline = Date.now() + 60_000 }) {
  if (!isEmailConfigured()) return { processed: 0, skipped: "GEIGER_EMAIL_API_KEY isn't configured" };
  const { data, error } = await db
    .from("reports")
    .select("*")
    .is("deleted_at", null)
    .neq("schedule->>frequency", "manual")
    .order("last_run_at", { ascending: true, nullsFirst: true })
    .limit(BATCH);
  if (error) throw new Error(error.message);

  const due = (data || [])
    .map((row) => ({ row, schedule: normalizeSchedule(row.schedule || {}), key: null }))
    .map((r) => ({ ...r, key: isDue(r.schedule, r.row.metadata?.scheduledKey, now) }))
    .filter((r) => r.key && r.schedule.recipients.length);

  const cache = new Map();
  let delivered = 0;
  let failed = 0;
  let processed = 0;
  for (const { row, schedule, key } of due) {
    if (Date.now() > deadline) break;
    const definition = normalizeDefinition(row.definition || {});
    const projectKey = `${row.project_id}:${definition.range}:${definition.dimension === "segment"}`;
    if (!cache.has(projectKey)) {
      const sources = await loadServerSources(db, row.project_id, {
        since: loadSince(definition.range, { lookbackDays: 30, now }),
        needsSegments: definition.dimension === "segment",
      });
      cache.set(projectKey, prepareSources(sources));
    }
    const result = runQuery(definition, cache.get(projectKey), { now });
    const report = { name: row.name, description: row.description, schedule };
    const link = publicUrl(`/project/${row.project_id}/customreports`, { record: row.id });
    const html = renderEmail(report, result, link);

    const sentTo = [];
    for (const to of schedule.recipients) {
      const res = await sendSuiteEmail({
        to,
        subject: `${row.name} — ${result.range.label}`,
        html,
        template: "campaign.report",
        idempotencyKey: `report:${row.id}:${key}:${to}`,
      });
      if (res.ok) sentTo.push(to);
      else failed += 1;
    }
    delivered += sentTo.length;
    processed += 1;

    const at = now.toISOString();
    const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
    const runs = [{ at, trigger: "schedule", rows: result.rows.length, value: result.value, sentTo }, ...(Array.isArray(meta.runs) ? meta.runs : [])].slice(0, MAX_RUNS);
    const { error: updateError } = await db
      .from("reports")
      .update({ last_run_at: at, metadata: { ...meta, runs, scheduledKey: sentTo.length ? key : meta.scheduledKey ?? null } })
      .eq("id", row.id);
    if (updateError) console.error("[worker.reports] update", updateError.message);
  }
  return { processed, delivered, failed, due: due.length };
}
