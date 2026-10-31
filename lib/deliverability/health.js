import { planState } from "./warmup_curves.js";

// Deliverability inputs for the campaign health score (raw rows): authentication, blocklist listings,
// list quality and warm-up state, plus a 0–100 score with the reasons behind it.

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Pure scoring over already-loaded rows (checks newest first).
export function computeDeliverabilityHealth({ domains = [], checks = [], validations = [], plans = [] }, { now = new Date() } = {}) {
  const latest = new Map();
  for (const c of checks) {
    if (Date.parse(c.checked_at) < now.getTime() - WEEK_MS) continue;
    const key = `${c.target}|${c.list}|${c.checked_value}`;
    if (!latest.has(key)) latest.set(key, c);
  }
  const listings = [...latest.values()].filter((c) => c.status === "listed");
  const invalid = validations.filter((v) => v.result === "invalid").length;
  const risky = validations.filter((v) => v.result === "risky").length;

  const reasons = [];
  let score = 100;
  const verified = domains.filter((d) => d.status === "verified").length;
  if (!domains.length) {
    score -= 30;
    reasons.push("No sending domain is set up.");
  } else if (verified < domains.length) {
    score -= 15;
    reasons.push(`${domains.length - verified} of ${domains.length} sending domains aren't verified.`);
  }
  const enforced = domains.filter((d) => ["quarantine", "reject"].includes(d.auth?.dmarc?.policy)).length;
  const noDmarc = domains.filter((d) => d.auth?.dmarc && !d.auth.dmarc.policy).length;
  if (noDmarc) {
    score -= 15;
    reasons.push(`${noDmarc} domain${noDmarc === 1 ? " has" : "s have"} no DMARC record.`);
  } else if (domains.length && !enforced) {
    score -= 5;
    reasons.push("DMARC is monitoring only (p=none).");
  }
  if (listings.length) {
    score -= Math.min(30, listings.length * 10);
    reasons.push(`Listed on ${listings.length} blocklist${listings.length === 1 ? "" : "s"}.`);
  }
  const invalidRate = validations.length ? invalid / validations.length : 0;
  if (invalidRate > 0.02) {
    score -= invalidRate > 0.05 ? 15 : 8;
    reasons.push(`${Math.round(invalidRate * 1000) / 10}% of validated addresses are invalid.`);
  }
  return {
    score: Math.max(0, score),
    reasons,
    domains: { total: domains.length, verified, failing: domains.filter((d) => d.status === "failing").length, dmarcEnforced: enforced },
    blocklists: { listings: listings.length, targets: new Set([...latest.values()].map((c) => c.target)).size },
    validation: { checked: validations.length, invalid, risky, invalidRate },
    warmup: { active: plans.filter((p) => planState(p, now) === "active").length },
  };
}

export async function getDeliverabilityHealth(db, projectId, { now = new Date() } = {}) {
  if (!db || !projectId) return null;
  try {
    const since = new Date(now.getTime() - WEEK_MS).toISOString();
    const [domains, checks, validations, plans] = await Promise.all([
      db.from("sending_domains").select("domain, status, auth").eq("project_id", projectId).is("deleted_at", null),
      db.from("blocklist_checks").select("target, list, checked_value, status, checked_at").eq("project_id", projectId).is("deleted_at", null).gte("checked_at", since).order("checked_at", { ascending: false }).limit(2000),
      db.from("email_validations").select("result").eq("project_id", projectId).is("deleted_at", null).limit(20000),
      db.from("warmup_plans").select("status, start_date, schedule").eq("project_id", projectId).is("deleted_at", null),
    ]);
    return computeDeliverabilityHealth(
      { domains: domains.data || [], checks: checks.data || [], validations: validations.data || [], plans: plans.data || [] },
      { now },
    );
  } catch (e) {
    console.error("[deliverability.health]", e);
    return null;
  }
}
