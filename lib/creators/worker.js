import { processOutreach } from "./outreach";
import { sendDeliverableReminders } from "./reminders";
import { sweepAffiliateAttribution } from "./attribution";
import { expireUgcRights } from "./rights";
import { refreshStaleCreators } from "./profiles";

// creators worker job, run by app/api/internal/worker on every scheduler tick (server-only): sends due
// outreach steps (stopping on reply/opt-out), deliverable due reminders, attributes affiliate orders,
// expires UGC rights past their term and refreshes stale Instagram metrics. Each part is bounded and
// idempotent, and one failing part never stops the others.
export const name = "creators";

async function safely(label, fn) {
  try {
    return await fn();
  } catch (error) {
    console.error(`[worker.creators.${label}]`, error);
    return { error: "failed" };
  }
}

export async function run({ db, now = new Date(), deadline = Infinity } = {}) {
  if (!db) return { skipped: "no database" };
  const outreach = await safely("outreach", () => processOutreach(db, { now, deadline }));
  const reminders = Date.now() < deadline ? await safely("reminders", () => sendDeliverableReminders(db, { now, deadline })) : { skipped: "time budget" };
  const attribution = Date.now() < deadline ? await safely("attribution", () => sweepAffiliateAttribution(db, { now, deadline })) : { skipped: "time budget" };
  const rightsExpired = Date.now() < deadline ? await safely("rights", () => expireUgcRights(db, { now })) : 0;
  const metrics = Date.now() < deadline ? await safely("metrics", () => refreshStaleCreators(db, { now, deadline })) : { skipped: "time budget" };
  return { outreach, reminders, attribution, rightsExpired, metrics };
}
