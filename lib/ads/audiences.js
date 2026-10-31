import { randomInt } from "node:crypto";
import { graphRequest } from "@/lib/social/meta_graph";
import { isSuppressed, loadSuppressionIndex, matchSegments } from "@/lib/audience/resolve";
import { loadProjectContacts, loadSegments } from "@/lib/audience/server_data";
import { nextSyncAt } from "./catalog";
import { hashEmail, hashPhone } from "./hash";
import { graphErrorMessage } from "./meta_ads";

// Custom Audience sync (server-only, service-role db): resolves a segment's members with the Audience
// rule engine, normalizes + SHA-256 hashes their emails / phones and uploads them to a Meta
// Custom Audience in session batches (/users for the first upload, /usersreplace for refreshes).

const UPLOAD_BATCH = 5000;
const EXCLUDED_STATUSES = new Set(["unsubscribed", "complained"]);

// Members of a segment (raw contact rows) via the Audience rule engine, excluding unsubscribed /
// complained contacts; suppressed emails / phones are blanked so they're never uploaded.
export async function resolveSegmentMembers(db, projectId, segmentId) {
  const segments = await loadSegments(db, projectId, [segmentId]);
  if (!segments.length) return { ok: false, error: "The segment no longer exists." };
  const contacts = await loadProjectContacts(db, projectId);
  const hits = await matchSegments(db, projectId, contacts, segments);
  const suppressions = await loadSuppressionIndex(db, projectId);
  const members = contacts
    .filter((row) => hits.has(row.id) && !EXCLUDED_STATUSES.has(row.status))
    .map((row) => ({
      ...row,
      email: row.email && !isSuppressed(suppressions, "email", String(row.email).toLowerCase()) ? row.email : null,
      phone: row.phone && !isSuppressed(suppressions, "sms", row.phone) ? row.phone : null,
    }));
  return { ok: true, members };
}

// Hashed upload rows for the chosen match keys; contacts with nothing usable are dropped.
export function audienceRows(members, { matchKeys = ["email"], defaultCountryCode = "" } = {}) {
  const keys = matchKeys.filter((k) => k === "email" || k === "phone");
  const schema = keys.map((k) => (k === "email" ? "EMAIL" : "PHONE"));
  const data = [];
  for (const row of members) {
    const values = keys.map((k) => (k === "email" ? hashEmail(row.email) : hashPhone(row.phone, defaultCountryCode)) || "");
    if (values.some(Boolean)) data.push(values);
  }
  return { schema, data, skipped: members.length - data.length };
}

async function ensureAudience(token, account, sync) {
  if (sync.external_audience_id) return { ok: true, id: sync.external_audience_id, created: false };
  const res = await graphRequest(`${account.external_id}/customaudiences`, {
    token,
    method: "POST",
    body: {
      name: `${sync.name} (Geiger Campaign)`.slice(0, 200),
      subtype: "CUSTOM",
      description: "Synced from a Geiger Campaign segment. Hashed emails / phone numbers.",
      customer_file_source: "USER_PROVIDED_ONLY",
    },
  });
  if (!res.ok || !res.data?.id) return { ok: false, error: graphErrorMessage(res, "Couldn't create the Custom Audience.") };
  return { ok: true, id: String(res.data.id), created: true };
}

// Runs one sync end to end and writes the outcome onto the audience_syncs row; returns the updated row.
export async function runAudienceSync(db, sync, { now = new Date() } = {}) {
  const fail = async (message) => {
    const { data } = await db
      .from("audience_syncs")
      .update({ status: "failed", last_error: message, next_sync_at: nextSyncAt(sync.schedule, now) })
      .eq("id", sync.id)
      .select("*")
      .single();
    return { ok: false, error: message, sync: data || sync };
  };
  if (!sync.segment_id) return fail("Choose a segment to sync.");
  if (!sync.ad_account_id) return fail("Choose an ad account.");
  const { data: account } = await db.from("ad_accounts").select("*").eq("id", sync.ad_account_id).is("deleted_at", null).maybeSingle();
  if (!account || account.status !== "connected") return fail("The ad account isn't connected.");
  const { data: secretRow } = await db.from("ad_account_secrets").select("secrets").eq("ad_account_id", account.id).maybeSingle();
  const token = secretRow?.secrets?.accessToken;
  if (!token) return fail("The ad account has no access token — reconnect it.");

  await db.from("audience_syncs").update({ status: "syncing", last_error: null }).eq("id", sync.id);

  let resolved;
  try {
    resolved = await resolveSegmentMembers(db, sync.project_id, sync.segment_id);
  } catch (e) {
    console.error("[ads.audience.resolve]", e);
    return fail("Couldn't read the segment's contacts.");
  }
  if (!resolved.ok) return fail(resolved.error);
  const { schema, data, skipped } = audienceRows(resolved.members, { matchKeys: sync.match_keys, defaultCountryCode: sync.default_country_code });
  if (!schema.length) return fail("Pick at least one match key.");
  if (!data.length) return fail("No contacts in this segment have a usable email or phone number.");

  const audience = await ensureAudience(token, account, sync);
  if (!audience.ok) return fail(audience.error);

  // First upload adds; later runs replace so contacts who left the segment drop out of the audience.
  const replace = !audience.created && Boolean(sync.last_synced_at);
  const endpoint = `${audience.id}/${replace ? "usersreplace" : "users"}`;
  const sessionId = randomInt(1, 2 ** 47);
  const batches = Math.max(1, Math.ceil(data.length / UPLOAD_BATCH));
  let received = 0;
  let invalid = 0;
  for (let i = 0; i < batches; i += 1) {
    const chunk = data.slice(i * UPLOAD_BATCH, (i + 1) * UPLOAD_BATCH);
    const res = await graphRequest(endpoint, {
      token,
      method: "POST",
      body: {
        payload: { schema, data: chunk },
        session: { session_id: sessionId, batch_seq: i + 1, last_batch_flag: i === batches - 1, estimated_num_total: data.length },
      },
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      await db.from("audience_syncs").update({ external_audience_id: audience.id }).eq("id", sync.id);
      return fail(graphErrorMessage(res, "Meta rejected the upload."));
    }
    received += Number(res.data?.num_received ?? chunk.length);
    invalid += Number(res.data?.num_invalid_entries ?? 0);
  }

  const info = await graphRequest(audience.id, { token, query: { fields: "approximate_count_lower_bound,operation_status" } });
  const lower = Number(info.data?.approximate_count_lower_bound);
  const at = now.toISOString();
  const run = { at, uploaded: data.length, received, invalid, skipped, batches, sessionId: String(sessionId), mode: replace ? "replace" : "add" };
  const { data: updated } = await db
    .from("audience_syncs")
    .update({
      external_audience_id: audience.id,
      status: "synced",
      last_error: null,
      last_synced_at: at,
      next_sync_at: nextSyncAt(sync.schedule, now),
      uploaded_count: data.length,
      invalid_count: invalid,
      matched_count: Number.isFinite(lower) && lower >= 0 ? lower : sync.matched_count ?? null,
      runs: [run, ...(Array.isArray(sync.runs) ? sync.runs : [])].slice(0, 20),
    })
    .eq("id", sync.id)
    .select("*")
    .single();
  return { ok: true, sync: updated || sync };
}

// Worker entry: syncs whose schedule is due, a few per tick.
export async function runDueAudienceSyncs(db, { now = new Date(), deadline = Infinity, limit = 3 } = {}) {
  const { data: due } = await db
    .from("audience_syncs")
    .select("*")
    .is("deleted_at", null)
    .neq("schedule", "manual")
    .in("status", ["queued", "synced", "failed", "draft"])
    .lte("next_sync_at", now.toISOString())
    .order("next_sync_at", { ascending: true })
    .limit(limit);
  const summary = { due: (due || []).length, synced: 0, failed: 0 };
  for (const sync of due || []) {
    if (Date.now() > deadline) break;
    const result = await runAudienceSync(db, sync, { now });
    if (result.ok) summary.synced += 1;
    else summary.failed += 1;
  }
  return summary;
}
