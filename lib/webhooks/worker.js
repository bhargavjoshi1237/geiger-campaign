import { deliverDue } from "./deliver";
import { runDueSyncs } from "@/lib/data/warehouse";

// webhooks worker job, run by app/api/internal/worker on every scheduler tick (server-only): delivers due
// webhook and app deliveries (retries included), then runs scheduled warehouse syncs. Bounded and idempotent.
export const name = "webhooks";

export async function run({ db, now = new Date(), deadline = null } = {}) {
  const webhooks = await deliverDue(db, { now, deadline });
  const syncs = await runDueSyncs(db, { now, deadline });
  return { webhooks, syncs };
}
