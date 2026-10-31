import { refreshCampaignMetrics } from "./metrics";
import { decideFinishedTests, launchDueCampaigns, listRunnableJobs, processSendJob } from "./sender";

// campaigns worker job, run by app/api/internal/worker on every scheduler tick (server-only): launches
// scheduled campaigns that are due, advances live send jobs in bounded batches (resumable, idempotent),
// decides finished A/B tests and refreshes the cached metrics of recently sent campaigns.
export const name = "campaigns";

// Leave the rest of the tick's budget to the jobs that run after this one.
const SHARE_MS = 150_000;
const METRICS_STALE_MS = 10 * 60_000;

async function refreshRecentMetrics(db, { deadline, limit = 10 }) {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data } = await db
    .from("campaigns")
    .select("id, project_id, metrics")
    .in("status", ["sent", "cancelled"])
    .gte("sent_at", since)
    .is("deleted_at", null)
    .order("sent_at", { ascending: false })
    .limit(50);
  let refreshed = 0;
  for (const c of data || []) {
    if (refreshed >= limit || Date.now() > deadline) break;
    const updatedAt = Date.parse(c.metrics?.updatedAt || "");
    if (!Number.isNaN(updatedAt) && Date.now() - updatedAt < METRICS_STALE_MS) continue;
    if (await refreshCampaignMetrics(db, c.project_id, c.id)) refreshed += 1;
  }
  return refreshed;
}

export async function run({ db, deadline = Date.now() + SHARE_MS } = {}) {
  const budget = Math.min(deadline, Date.now() + SHARE_MS);
  const summary = { launched: 0, jobs: 0, sent: 0, failed: 0, skipped: 0, uncertain: 0, completed: 0, decided: 0, refreshed: 0 };
  if (!db) return summary;

  summary.launched = (await launchDueCampaigns(db)).length;

  for (const jobId of await listRunnableJobs(db)) {
    if (Date.now() > budget - 10_000) break;
    const result = await processSendJob(db, jobId, { deadline: budget });
    if (result.leased) continue;
    summary.jobs += 1;
    for (const key of ["sent", "failed", "skipped", "uncertain"]) summary[key] += result[key] || 0;
    if (result.completed) summary.completed += 1;
  }

  if (Date.now() < budget) summary.decided = await decideFinishedTests(db);
  if (Date.now() < budget) summary.refreshed = await refreshRecentMetrics(db, { deadline: budget });
  return summary;
}
