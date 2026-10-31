import { normalizeAdvanced } from "./defaults";

// settings worker job (server-only, service-role db): enforces each workspace's data retention
// (workspace_settings.advanced.retentionMonths) by retiring — soft-deleting — sends and tracked events
// older than the cutoff, in bounded batches so one tick never runs long. Idempotent: retired rows drop
// out of the next query.
export const name = "settings";

const BATCH = 500;
const MAX_BATCHES = 4;
const TABLES = [
  ["deliveries", "created_at"],
  ["tracked_events", "occurred_at"],
];

function cutoffFor(now, months) {
  const d = new Date(now);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString();
}

export async function run({ db, now = new Date(), deadline = Date.now() + 60_000 } = {}) {
  const { data, error } = await db.from("workspace_settings").select("project_id, advanced").is("deleted_at", null).limit(1000);
  if (error) {
    console.error("[settings.worker]", error.message);
    return { error: "settings unreadable" };
  }

  const due = (data || [])
    .map((row) => ({ projectId: row.project_id, months: normalizeAdvanced(row.advanced).retentionMonths }))
    .filter((row) => row.months);
  const retired = { deliveries: 0, tracked_events: 0 };

  for (const { projectId, months } of due) {
    const cutoff = cutoffFor(now, months);
    for (const [table, column] of TABLES) {
      for (let i = 0; i < MAX_BATCHES; i += 1) {
        if (Date.now() > deadline) return { projects: due.length, retired, stopped: "time budget" };
        const { data: old, error: readError } = await db
          .from(table)
          .select("id")
          .eq("project_id", projectId)
          .is("deleted_at", null)
          .lt(column, cutoff)
          .limit(BATCH);
        if (readError) {
          console.error(`[settings.worker.${table}]`, readError.message);
          break;
        }
        if (!old?.length) break;
        const { error: writeError } = await db
          .from(table)
          .update({ deleted_at: now.toISOString() })
          .in("id", old.map((r) => r.id));
        if (writeError) {
          console.error(`[settings.worker.${table}]`, writeError.message);
          break;
        }
        retired[table] += old.length;
        if (old.length < BATCH) break;
      }
    }
  }

  return { projects: due.length, retired };
}
