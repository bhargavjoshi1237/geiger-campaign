import { csvLine } from "./csv";
import { DEFAULT_BATCH_SIZE, MAX_BATCH_SIZE, scheduleMs } from "./sync_catalog";
import { signatureHeader, SIGNATURE_HEADER } from "@/lib/webhooks/signing";
import { destinationUrlError } from "@/lib/webhooks/urls";

// Warehouse sync runner (server-only, admin db). Webhook syncs page through a source table in
// (updated_at, id) order after the stored cursor and POST signed JSON batches; the cursor advances only
// after a 2xx, so a failed run resumes where it stopped. Download syncs stream a full CSV / JSONL export.

const SOURCES = {
  contacts: {
    table: "contacts",
    columns: ["id", "email", "phone", "first_name", "last_name", "status", "source", "tags", "attributes", "lead_score", "timezone", "locale", "company_id", "last_activity_at", "unsubscribed_at", "created_at", "updated_at", "deleted_at"],
  },
  events: {
    table: "tracked_events",
    columns: ["id", "name", "contact_id", "anonymous_id", "source", "campaign_id", "delivery_id", "revenue", "currency", "url", "referrer", "utm", "properties", "occurred_at", "created_at", "updated_at", "deleted_at"],
  },
  deliveries: {
    table: "deliveries",
    columns: ["id", "channel", "status", "contact_id", "to_address", "source_type", "source_id", "campaign_id", "variant", "subject", "provider", "error", "cost", "currency", "open_count", "click_count", "sent_at", "delivered_at", "opened_at", "clicked_at", "bounced_at", "unsubscribed_at", "created_at", "updated_at", "deleted_at"],
  },
  // Owned by Commerce; its columns aren't fixed here, so every column is passed through.
  orders: { table: "orders", columns: null, external: true },
};

const MAX_BATCHES_PER_RUN = 20;
const EXPORT_ROW_LIMIT = 100_000;
const EXPORT_PAGE = 1000;
const BATCH_TIMEOUT_MS = 20_000;

const iso = (ms = Date.now()) => new Date(ms).toISOString();

export function parseCursor(value) {
  if (!value || !String(value).includes("|")) return null;
  const [ts, id] = String(value).split("|");
  return ts && id ? { ts, id } : null;
}

const cursorOf = (row) => `${row.updated_at}|${row.id}`;

function friendlyError(source, error) {
  const message = error?.message || String(error);
  if (SOURCES[source]?.external && /does not exist|schema cache|Could not find/i.test(message)) {
    return "Orders aren't available yet — connect a store in Commerce first.";
  }
  return message;
}

// One page of rows after `after` ({ ts, id }), oldest change first.
export async function fetchSourcePage(db, projectId, source, { after = null, limit = DEFAULT_BATCH_SIZE, includeDeleted = false } = {}) {
  const def = SOURCES[source];
  if (!def) return { rows: [], error: "Unknown source." };
  let query = db
    .from(def.table)
    .select(def.columns ? def.columns.join(", ") : "*")
    .eq("project_id", projectId)
    .order("updated_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(limit);
  if (!includeDeleted && !def.external) query = query.is("deleted_at", null);
  if (after) query = query.or(`updated_at.gt."${after.ts}",and(updated_at.eq."${after.ts}",id.gt.${after.id})`);
  const { data, error } = await query;
  if (error) return { rows: [], error: friendlyError(source, error) };
  return { rows: data || [], error: null };
}

async function syncSecret(db, syncId) {
  const { data } = await db.from("warehouse_sync_secrets").select("secret").eq("sync_id", syncId).maybeSingle();
  return data?.secret || null;
}

async function postBatch(url, body, headers) {
  const started = Date.now();
  try {
    const res = await fetch(url, { method: "POST", headers, body, redirect: "manual", signal: AbortSignal.timeout(BATCH_TIMEOUT_MS), cache: "no-store" });
    const text = (await res.text().catch(() => "")).slice(0, 500);
    return res.ok ? { ok: true, ms: Date.now() - started } : { ok: false, error: `HTTP ${res.status}${text ? ` — ${text}` : ""}` };
  } catch (e) {
    const timedOut = e?.name === "TimeoutError" || e?.name === "AbortError";
    return { ok: false, error: timedOut ? `Timed out after ${BATCH_TIMEOUT_MS / 1000}s` : e?.cause?.code || e?.message || "Request failed" };
  }
}

async function finishRun(db, sync, run, { status, rows, batches, cursor, error, trigger }) {
  const now = iso();
  const { data: finished } = await db
    .from("warehouse_sync_runs")
    .update({ status, row_count: rows, batch_count: batches, cursor_to: cursor ?? null, error: error ?? null, finished_at: now })
    .eq("id", run.id)
    .select("*")
    .single();
  const every = scheduleMs(sync.schedule);
  const patch = { last_run_at: now, last_status: status, last_error: error ?? null };
  if (trigger !== "schedule") patch.next_run_at = every && sync.status === "active" ? iso(Date.now() + every) : null;
  const { data: updated } = await db.from("warehouse_syncs").update(patch).eq("id", sync.id).select("*").single();
  return { run: finished || { ...run, status }, sync: updated || { ...sync, ...patch } };
}

// Pushes new/changed rows for one webhook sync. Returns { run, sync }.
export async function runWebhookSync(db, sync, { trigger = "manual", deadline = null, createdBy = null } = {}) {
  const { data: run, error: runError } = await db
    .from("warehouse_sync_runs")
    .insert({ project_id: sync.project_id, sync_id: sync.id, trigger, status: "running", cursor_from: sync.sync_cursor, created_by: createdBy })
    .select("*")
    .single();
  if (runError) throw new Error(runError.message);

  const fail = (error, progress = {}) => finishRun(db, sync, run, { status: "failed", rows: 0, batches: 0, cursor: sync.sync_cursor, trigger, ...progress, error });

  const url = sync.config?.url;
  const urlError = destinationUrlError(url);
  if (urlError) return fail(urlError);
  const secret = await syncSecret(db, sync.id);
  if (!secret) return fail("This sync has no signing secret — rotate it to create one.");

  const batchSize = Math.min(MAX_BATCH_SIZE, Math.max(1, Number(sync.config?.batchSize) || DEFAULT_BATCH_SIZE));
  let cursor = sync.sync_cursor;
  let rows = 0;
  let batches = 0;
  let synced = Number(sync.rows_synced || 0);

  while (batches < MAX_BATCHES_PER_RUN) {
    if (deadline && Date.now() > deadline - BATCH_TIMEOUT_MS - 5_000) break;
    const page = await fetchSourcePage(db, sync.project_id, sync.source, { after: parseCursor(cursor), limit: batchSize, includeDeleted: true });
    if (page.error) return fail(page.error, { rows, batches, cursor });
    if (!page.rows.length) break;

    const nextCursor = cursorOf(page.rows[page.rows.length - 1]);
    const body = JSON.stringify({
      sync_id: sync.id,
      run_id: run.id,
      source: sync.source,
      batch: batches + 1,
      cursor_from: cursor,
      cursor_to: nextCursor,
      sent_at: iso(),
      rows: page.rows,
    });
    const headers = {
      "Content-Type": "application/json",
      "User-Agent": "GeigerCampaign-Sync/1.0",
      "X-Geiger-Sync": sync.id,
      "X-Geiger-Sync-Run": run.id,
      [SIGNATURE_HEADER]: signatureHeader(secret, body),
    };
    const sent = await postBatch(url, body, headers);
    if (!sent.ok) return fail(`Batch ${batches + 1}: ${sent.error}`, { rows, batches, cursor });

    cursor = nextCursor;
    rows += page.rows.length;
    batches += 1;
    synced += page.rows.length;
    await db.from("warehouse_syncs").update({ sync_cursor: cursor, rows_synced: synced }).eq("id", sync.id);
    if (page.rows.length < batchSize) break;
  }

  return finishRun(db, { ...sync, sync_cursor: cursor, rows_synced: synced }, run, { status: "succeeded", rows, batches, cursor, trigger });
}

// Worker pass: scheduled webhook syncs whose next_run_at has come, claimed by moving next_run_at forward.
export async function runDueSyncs(db, { now = new Date(), deadline = null, limit = 5 } = {}) {
  const { data, error } = await db
    .from("warehouse_syncs")
    .select("*")
    .eq("status", "active")
    .eq("destination", "webhook")
    .neq("schedule", "manual")
    .is("deleted_at", null)
    .or(`next_run_at.is.null,next_run_at.lte."${now.toISOString()}"`)
    .order("next_run_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) return { ran: 0, error: error.message };

  const summary = { ran: 0, succeeded: 0, failed: 0, rows: 0 };
  for (const sync of data || []) {
    if (deadline && Date.now() > deadline - 30_000) break;
    const every = scheduleMs(sync.schedule) || 3_600_000;
    let claim = db.from("warehouse_syncs").update({ next_run_at: iso(now.getTime() + every) }).eq("id", sync.id);
    claim = sync.next_run_at ? claim.eq("next_run_at", sync.next_run_at) : claim.is("next_run_at", null);
    const { data: claimed } = await claim.select("*").maybeSingle();
    if (!claimed) continue;
    try {
      const { run } = await runWebhookSync(db, claimed, { trigger: "schedule", deadline });
      summary.ran += 1;
      summary.rows += run.row_count || 0;
      if (run.status === "succeeded") summary.succeeded += 1;
      else summary.failed += 1;
    } catch (e) {
      console.error("[warehouse.due]", e);
      summary.failed += 1;
    }
  }
  return summary;
}

function exportColumns(source, firstRow) {
  const cols = SOURCES[source]?.columns || Object.keys(firstRow || {});
  return cols.filter((c) => c !== "deleted_at");
}

function csvValue(value) {
  if (Array.isArray(value)) return value.every((v) => typeof v !== "object") ? value.join(";") : JSON.stringify(value);
  return value;
}

// Streams every live row of a source as CSV or JSONL; onDone({ rows, error }) records the run.
export function exportStream(db, projectId, source, format, { onDone } = {}) {
  const encoder = new TextEncoder();
  let after = null;
  let total = 0;
  let columns = null;
  let finished = false;

  const done = async (error = null) => {
    if (finished) return;
    finished = true;
    try {
      await onDone?.({ rows: total, error });
    } catch (e) {
      console.error("[warehouse.export.done]", e);
    }
  };

  return new ReadableStream({
    async pull(controller) {
      try {
        const page = await fetchSourcePage(db, projectId, source, { after, limit: EXPORT_PAGE });
        if (page.error) {
          if (total === 0 && format === "csv") controller.enqueue(encoder.encode(csvLine(["error"]) + csvLine([page.error])));
          await done(page.error);
          controller.close();
          return;
        }
        if (!columns) {
          columns = exportColumns(source, page.rows[0]);
          if (format === "csv") controller.enqueue(encoder.encode(csvLine(columns)));
        }
        const rows = page.rows.slice(0, Math.max(0, EXPORT_ROW_LIMIT - total));
        const chunk = rows
          .map((row) => (format === "csv" ? csvLine(columns.map((c) => csvValue(row[c]))) : `${JSON.stringify(Object.fromEntries(columns.map((c) => [c, row[c] ?? null])))}\n`))
          .join("");
        if (chunk) controller.enqueue(encoder.encode(chunk));
        total += rows.length;
        if (page.rows.length < EXPORT_PAGE || total >= EXPORT_ROW_LIMIT) {
          await done(null);
          controller.close();
          return;
        }
        after = { ts: page.rows[page.rows.length - 1].updated_at, id: page.rows[page.rows.length - 1].id };
      } catch (e) {
        console.error("[warehouse.export]", e);
        await done(e?.message || "Export failed");
        controller.error(e);
      }
    },
    async cancel() {
      await done("Download cancelled");
    },
  });
}
