import { badRequest, notFound } from "@/lib/server/http";
import { lastFour, newSigningSecret } from "@/lib/integrations/secrets";
import { destinationUrlError } from "@/lib/webhooks/urls";
import { DEFAULT_BATCH_SIZE, EXPORT_FORMATS, MAX_BATCH_SIZE, SYNC_SCHEDULES, SYNC_SOURCES, syncDestination } from "./sync_catalog";
import { exportStream, runWebhookSync } from "./warehouse";

// Warehouse sync operations behind the workspace routes (server-only, admin db): create (signing secret
// returned once for webhook syncs), rotate the secret, run now, and stream a download export.

export async function loadSync(db, projectId, syncId) {
  const { data } = await db.from("warehouse_syncs").select("*").eq("id", syncId).eq("project_id", projectId).is("deleted_at", null).maybeSingle();
  if (!data) throw notFound("That sync doesn't exist.");
  return data;
}

export async function createSync(db, projectId, input, userId) {
  const name = String(input?.name || "").trim().slice(0, 120);
  if (!name) throw badRequest("Give the sync a name.");
  const source = SYNC_SOURCES.some((s) => s.value === input?.source) ? input.source : null;
  if (!source) throw badRequest("Pick what to sync.");
  const destination = syncDestination(input?.destination);
  if (destination.value !== input?.destination || !destination.supported) throw badRequest(`${destination.label} isn't available yet. Use a webhook or a file download.`);

  const row = { project_id: projectId, name, source, destination: destination.value, created_by: userId, status: "active" };
  let secret = null;
  if (destination.value === "webhook") {
    const url = String(input?.config?.url || "").trim();
    const urlError = destinationUrlError(url);
    if (urlError) throw badRequest(urlError);
    const batchSize = Math.min(MAX_BATCH_SIZE, Math.max(1, Number(input?.config?.batchSize) || DEFAULT_BATCH_SIZE));
    const schedule = SYNC_SCHEDULES.some((s) => s.value === input?.schedule) ? input.schedule : "manual";
    secret = newSigningSecret();
    Object.assign(row, { config: { url, batchSize }, schedule, secret_hint: lastFour(secret), next_run_at: schedule === "manual" ? null : new Date().toISOString() });
  } else {
    const format = EXPORT_FORMATS.some((f) => f.value === input?.config?.format) ? input.config.format : "csv";
    Object.assign(row, { config: { format }, schedule: "manual" });
  }

  const { data: sync, error } = await db.from("warehouse_syncs").insert(row).select("*").single();
  if (error) throw new Error(error.message);
  if (secret) {
    const { error: secretError } = await db.from("warehouse_sync_secrets").insert({ project_id: projectId, sync_id: sync.id, secret });
    if (secretError) {
      await db.from("warehouse_syncs").delete().eq("id", sync.id);
      throw new Error(secretError.message);
    }
  }
  return { sync, secret };
}

export async function rotateSyncSecret(db, projectId, syncId) {
  const sync = await loadSync(db, projectId, syncId);
  if (sync.destination !== "webhook") throw badRequest("Only webhook syncs are signed.");
  const secret = newSigningSecret();
  const { error } = await db.from("warehouse_sync_secrets").upsert({ project_id: projectId, sync_id: syncId, secret }, { onConflict: "sync_id" });
  if (error) throw new Error(error.message);
  const { data } = await db.from("warehouse_syncs").update({ secret_hint: lastFour(secret) }).eq("id", syncId).select("*").single();
  return { sync: data || sync, secret };
}

export async function runSyncNow(db, projectId, syncId, userId) {
  const sync = await loadSync(db, projectId, syncId);
  if (sync.destination !== "webhook") throw badRequest("Download syncs run when you download them.");
  if (sync.status !== "active") throw badRequest("Resume the sync before running it.");
  return runWebhookSync(db, sync, { trigger: "manual", createdBy: userId });
}

// A streamed file Response for one sync's source; the run row is finished when the stream ends.
export async function exportSync(db, projectId, syncId, { format: requested, userId } = {}) {
  const sync = await loadSync(db, projectId, syncId);
  const format = EXPORT_FORMATS.some((f) => f.value === requested) ? requested : sync.config?.format === "jsonl" ? "jsonl" : "csv";
  const { data: run, error } = await db
    .from("warehouse_sync_runs")
    .insert({ project_id: projectId, sync_id: sync.id, trigger: "download", status: "running", created_by: userId })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  const stream = exportStream(db, projectId, sync.source, format, {
    onDone: async ({ rows, error: exportError }) => {
      const now = new Date().toISOString();
      const status = exportError ? "failed" : "succeeded";
      await db.from("warehouse_sync_runs").update({ status, row_count: rows, error: exportError, finished_at: now }).eq("id", run.id);
      await db
        .from("warehouse_syncs")
        .update({ last_run_at: now, last_status: status, last_error: exportError, ...(exportError ? {} : { rows_synced: Number(sync.rows_synced || 0) + rows }) })
        .eq("id", sync.id);
    },
  });
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `${sync.source}-${stamp}.${format === "jsonl" ? "jsonl" : "csv"}`;
  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": format === "jsonl" ? "application/x-ndjson; charset=utf-8" : "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
