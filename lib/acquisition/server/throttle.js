// Basic abuse limits for public ingest. A per-instance sliding window catches bursts immediately; the
// database count over recent submissions holds across serverless instances. Server-only.

const windows = new Map();
const MAX_KEYS = 5000;

// True when `key` has already been seen `limit` times inside `windowMs` (and records this hit).
export function overLimit(key, { limit, windowMs }) {
  const now = Date.now();
  const hits = (windows.get(key) || []).filter((t) => now - t < windowMs);
  hits.push(now);
  windows.set(key, hits);
  if (windows.size > MAX_KEYS) {
    for (const [k, v] of windows) if (!v.length || now - v[v.length - 1] > windowMs) windows.delete(k);
  }
  return hits.length > limit;
}

// Form submissions: 5 a minute per IP per form on this instance, 30 per IP in 10 minutes overall.
export async function submissionThrottled(db, { ip, formId }) {
  if (!ip) return false;
  if (overLimit(`submit:${ip}:${formId}`, { limit: 5, windowMs: 60_000 })) return true;
  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  const { count, error } = await db
    .from("form_submissions")
    .select("id", { count: "exact", head: true })
    .eq("ip", ip)
    .gte("created_at", since);
  if (error) {
    console.error("[acquisition.throttle]", error.message);
    return false;
  }
  return (count || 0) >= 30;
}

export async function responseThrottled(db, { ip, surveyId }) {
  if (!ip) return false;
  if (overLimit(`survey:${ip}:${surveyId}`, { limit: 5, windowMs: 60_000 })) return true;
  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  const { count, error } = await db
    .from("survey_responses")
    .select("id", { count: "exact", head: true })
    .eq("ip", ip)
    .gte("created_at", since);
  if (error) {
    console.error("[acquisition.throttle]", error.message);
    return false;
  }
  return (count || 0) >= 30;
}

// Views / impressions / clicks: count at most once a minute per IP per record on this instance.
export function countOnce(kind, ip, id) {
  return !overLimit(`${kind}:${ip || "anon"}:${id}`, { limit: 1, windowMs: 60_000 });
}
