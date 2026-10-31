import { SIGNATURE_HEADER, signatureHeader } from "./signing";
import { destinationUrlError } from "./urls";
import { slackMessage } from "@/lib/integrations/slack";

// Delivery engine for campaign.webhook_deliveries (server-only, admin db). One attempt = claim the row
// (optimistic on `attempts`), POST with a 10s timeout and no redirects, record the response, then either
// finish or reschedule with exponential backoff. 15 consecutive failures disable the endpoint / app.

export const TIMEOUT_MS = 10_000;
export const MAX_ATTEMPTS = 10;
export const DISABLE_AFTER_FAILURES = 15;
const LEASE_MS = 120_000;
const BODY_LIMIT = 2048;
const USER_AGENT = "GeigerCampaign-Webhooks/1.0";

// 1m, 2m, 4m … capped at 12h: ten attempts span roughly eight and a half hours.
export function backoffMs(attempt) {
  return Math.min(60_000 * 2 ** Math.max(0, attempt - 1), 12 * 3_600_000);
}

const iso = (ms = Date.now()) => new Date(ms).toISOString();

async function claim(db, row) {
  const { data, error } = await db
    .from("webhook_deliveries")
    .update({ status: "delivering", attempts: row.attempts + 1, next_attempt_at: iso(Date.now() + LEASE_MS) })
    .eq("id", row.id)
    .eq("attempts", row.attempts)
    .in("status", ["queued", "delivering"])
    .select("*")
    .maybeSingle();
  if (error) console.error("[webhooks.claim]", error.message);
  return data || null;
}

async function loadEndpoint(db, endpointId) {
  const [{ data: endpoint }, { data: secret }] = await Promise.all([
    db.from("webhook_endpoints").select("*").eq("id", endpointId).maybeSingle(),
    db.from("webhook_secrets").select("secret, previous_secret, previous_expires_at").eq("endpoint_id", endpointId).maybeSingle(),
  ]);
  const secrets = [];
  if (secret?.secret) secrets.push(secret.secret);
  if (secret?.previous_secret && secret.previous_expires_at && Date.parse(secret.previous_expires_at) > Date.now()) secrets.push(secret.previous_secret);
  return { endpoint, secrets };
}

async function loadIntegration(db, integrationId) {
  const [{ data: integration }, { data: secret }] = await Promise.all([
    db.from("integrations").select("*").eq("id", integrationId).maybeSingle(),
    db.from("integration_secrets").select("secrets").eq("integration_id", integrationId).maybeSingle(),
  ]);
  return { integration, webhookUrl: secret?.secrets?.webhook_url || null };
}

async function post(url, body, headers) {
  const started = Date.now();
  try {
    const res = await fetch(url, { method: "POST", headers, body, redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
    const text = (await res.text().catch(() => "")).slice(0, BODY_LIMIT);
    const ok = res.status >= 200 && res.status < 300;
    return { ok, status: res.status, body: text, ms: Date.now() - started, error: ok ? null : `HTTP ${res.status}${res.status >= 300 && res.status < 400 ? " (redirects aren't followed)" : ""}` };
  } catch (e) {
    const timedOut = e?.name === "TimeoutError" || e?.name === "AbortError";
    return { ok: false, status: null, body: null, ms: Date.now() - started, error: timedOut ? `Timed out after ${TIMEOUT_MS / 1000}s` : e?.cause?.code || e?.message || "Request failed" };
  }
}

// Builds the request for one claimed row: { url, label, body, headers } or { error, permanent }.
async function buildRequest(db, row) {
  if (row.endpoint_id) {
    const { endpoint, secrets } = await loadEndpoint(db, row.endpoint_id);
    if (!endpoint || endpoint.deleted_at) return { error: "The endpoint was deleted.", permanent: true };
    if (endpoint.status !== "active" && !row.is_test) return { error: "The endpoint is disabled.", permanent: true, target: { endpoint } };
    const urlError = destinationUrlError(endpoint.url);
    if (urlError) return { error: urlError, permanent: true, target: { endpoint } };
    if (!secrets.length) return { error: "The endpoint has no signing secret — rotate it to create one.", permanent: true, target: { endpoint } };
    const body = JSON.stringify(row.payload ?? {});
    const headers = {
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
      "X-Geiger-Event": row.event,
      "X-Geiger-Event-Id": row.event_id,
      "X-Geiger-Delivery": row.id,
      [SIGNATURE_HEADER]: signatureHeader(secrets, body),
    };
    return { url: endpoint.url, label: endpoint.url, body, headers, target: { endpoint } };
  }
  const { integration, webhookUrl } = await loadIntegration(db, row.integration_id);
  if (!integration || integration.deleted_at || integration.status === "disconnected") return { error: "The app is no longer connected.", permanent: true };
  if (!webhookUrl) return { error: "The app has no webhook URL — reconnect it.", permanent: true, target: { integration } };
  const body = JSON.stringify(slackMessage(row.event, row.payload?.data, { test: row.is_test }));
  const headers = { "Content-Type": "application/json", "User-Agent": USER_AGENT };
  return { url: webhookUrl, label: `Slack${integration.config?.channel ? ` · ${integration.config.channel}` : ""}`, body, headers, target: { integration } };
}

async function recordTargetOutcome(db, target, ok, error) {
  const now = iso();
  if (target?.endpoint) {
    const e = target.endpoint;
    if (ok) {
      await db.from("webhook_endpoints").update({ failure_count: 0, last_success_at: now, last_error: null }).eq("id", e.id);
      return;
    }
    const failures = (e.failure_count || 0) + 1;
    const patch = { failure_count: failures, last_failure_at: now, last_error: error };
    if (failures >= DISABLE_AFTER_FAILURES && e.status === "active") Object.assign(patch, { status: "disabled", disabled_reason: "failures" });
    await db.from("webhook_endpoints").update(patch).eq("id", e.id);
  } else if (target?.integration) {
    const i = target.integration;
    if (ok) {
      await db.from("integrations").update({ failure_count: 0, last_success_at: now, last_error: null, ...(i.status === "error" ? { status: "connected" } : {}) }).eq("id", i.id);
      return;
    }
    const failures = (i.failure_count || 0) + 1;
    const patch = { failure_count: failures, last_error: error };
    if (failures >= DISABLE_AFTER_FAILURES) patch.status = "error";
    await db.from("integrations").update(patch).eq("id", i.id);
  }
}

// One attempt for a queued row. Returns the updated row, or null when another worker claimed it.
export async function attemptDelivery(db, row) {
  const claimed = await claim(db, row);
  if (!claimed) return null;

  const request = await buildRequest(db, claimed);
  const result = request.error
    ? { ok: false, status: null, body: null, ms: null, error: request.error }
    : await post(request.url, request.body, request.headers);

  const terminal = result.ok || request.permanent || claimed.is_test || claimed.attempts >= MAX_ATTEMPTS;
  const patch = {
    status: result.ok ? "delivered" : terminal ? "failed" : "queued",
    next_attempt_at: terminal ? null : iso(Date.now() + backoffMs(claimed.attempts)),
    request_url: request.label ?? null,
    request_headers: request.headers ?? {},
    response_status: result.status,
    response_body: result.body,
    response_ms: result.ms,
    last_error: result.ok ? null : result.error,
    delivered_at: result.ok ? iso() : null,
  };
  const { data, error } = await db.from("webhook_deliveries").update(patch).eq("id", claimed.id).select("*").single();
  if (error) console.error("[webhooks.attempt]", error.message);

  // Tests never count toward auto-disable; a disabled/deleted target isn't re-counted either.
  if (!claimed.is_test && !request.permanent) await recordTargetOutcome(db, request.target, result.ok, result.error);
  return data || { ...claimed, ...patch };
}

async function inBatches(rows, size, fn, deadline) {
  const out = [];
  for (let i = 0; i < rows.length; i += size) {
    if (deadline && Date.now() > deadline - TIMEOUT_MS - 5_000) break;
    out.push(...(await Promise.all(rows.slice(i, i + size).map(fn))));
  }
  return out;
}

function tally(results) {
  const summary = { attempted: 0, delivered: 0, retrying: 0, failed: 0 };
  for (const r of results) {
    if (!r) continue;
    summary.attempted += 1;
    if (r.status === "delivered") summary.delivered += 1;
    else if (r.status === "queued") summary.retrying += 1;
    else summary.failed += 1;
  }
  return summary;
}

// Worker pass: every due row (queued, or delivering with an expired lease), oldest first.
export async function deliverDue(db, { now = new Date(), deadline = null, limit = 200, concurrency = 5 } = {}) {
  const { data, error } = await db
    .from("webhook_deliveries")
    .select("*")
    .in("status", ["queued", "delivering"])
    .lte("next_attempt_at", now.toISOString())
    .order("next_attempt_at", { ascending: true })
    .limit(limit);
  if (error) {
    console.error("[webhooks.due]", error.message);
    return { attempted: 0, delivered: 0, retrying: 0, failed: 0, error: error.message };
  }
  return tally(await inBatches(data || [], concurrency, (row) => attemptDelivery(db, row), deadline));
}

// Immediate attempt for rows just queued (emit, test, replay). Returns the updated rows.
export async function deliverByIds(db, ids, { concurrency = 5 } = {}) {
  if (!ids?.length) return [];
  const { data, error } = await db.from("webhook_deliveries").select("*").in("id", ids).eq("status", "queued");
  if (error) {
    console.error("[webhooks.byIds]", error.message);
    return [];
  }
  return (await inBatches(data || [], concurrency, (row) => attemptDelivery(db, row))).filter(Boolean);
}
