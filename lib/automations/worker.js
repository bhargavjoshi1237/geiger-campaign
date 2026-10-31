import { runTick } from "./engine.js";
import { serverDeps } from "./server_deps.js";

// automations worker job, run by app/api/internal/worker on every scheduler tick (server-only): matches new
// tracked events and scheduled triggers, advances due enrollments and refreshes stats, bounded by `deadline`.
export const name = "automations";

export async function run({ db, now = new Date(), deadline = null }) {
  return runTick(db, { now, deadline, deps: serverDeps() });
}
