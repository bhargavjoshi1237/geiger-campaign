// ads worker job, run by app/api/internal/worker on every scheduler tick (server-only): refreshes ad
// insights snapshots, evaluates automated rules, rolls up Click-to-Message stats, forwards queued
// conversions to the Conversions API, runs due audience syncs and routes new ad comments. Bounded per tick.
import { listConnectedAccounts, syncAccountSnapshots } from "./accounts";
import { runDueAudienceSyncs } from "./audiences";
import { runCapiForwarder } from "./capi";
import { refreshCtwaStats } from "./ctwa";
import { evaluateAdRules, routeAdComments } from "./rules";

export const name = "ads";

const SNAPSHOT_TTL_MS = 55 * 60_000;
const ACCOUNTS_PER_TICK = 5;

async function refreshSnapshots(db, { now, deadline }) {
  const accounts = await listConnectedAccounts(db);
  const stale = accounts
    .filter((a) => !a.last_synced_at || now.getTime() - new Date(a.last_synced_at).getTime() > SNAPSHOT_TTL_MS)
    .slice(0, ACCOUNTS_PER_TICK);
  const summary = { accounts: 0, failed: 0 };
  for (const account of stale) {
    if (Date.now() > deadline) break;
    const { data: secretRow } = await db.from("ad_account_secrets").select("secrets").eq("ad_account_id", account.id).maybeSingle();
    const token = secretRow?.secrets?.accessToken;
    if (!token) continue;
    const result = await syncAccountSnapshots(db, account, token);
    if (result.ok) summary.accounts += 1;
    else summary.failed += 1;
  }
  return summary;
}

export async function run({ db, now = new Date(), deadline = Infinity }) {
  const steps = [
    ["snapshots", () => refreshSnapshots(db, { now, deadline })],
    ["rules", () => evaluateAdRules(db, { now, deadline }).then(({ evaluated, triggered }) => ({ evaluated, triggered }))],
    ["ctwa", () => refreshCtwaStats(db, { now: now.getTime() })],
    ["capi", () => runCapiForwarder(db, { now: now.getTime(), deadline })],
    ["audiences", () => runDueAudienceSyncs(db, { now, deadline })],
    ["comments", () => routeAdComments(db, { now, deadline })],
  ];
  const summary = {};
  for (const [key, step] of steps) {
    if (Date.now() > deadline) {
      summary[key] = { skipped: "time budget" };
      continue;
    }
    try {
      summary[key] = await step();
    } catch (error) {
      console.error(`[worker.ads.${key}]`, error);
      summary[key] = { error: "failed" };
    }
  }
  return summary;
}
