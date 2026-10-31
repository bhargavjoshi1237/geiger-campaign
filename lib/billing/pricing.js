import { PLANS, getPlan } from "./plans";

// Price math over the plan catalog (isomorphic, pure): a plan's monthly estimate for given volumes, the
// cheapest plan that fits, provider pass-through estimates and the current billing cycle window.

const per1k = (extra, rate) => (extra > 0 && rate ? Math.ceil(extra / 1000) * rate : 0);
const round2 = (n) => Math.round(n * 100) / 100;

// volumes: { contacts, emails }; interval: "monthly" | "annual" (annual is billed yearly, shown per month).
export function estimatePlan(planOrKey, { contacts = 0, emails = 0 } = {}, interval = "monthly") {
  const plan = typeof planOrKey === "string" ? getPlan(planOrKey) : planOrKey;
  const base = interval === "annual" ? plan.annualMonthly : plan.monthly;
  const extraContacts = Math.max(0, contacts - plan.contacts);
  const extraEmails = Math.max(0, emails - plan.emailsPerMonth);
  const fits =
    (extraContacts === 0 || plan.extraContactsPer1k != null) && (extraEmails === 0 || plan.extraEmailsPer1k != null);
  const contactOverage = per1k(extraContacts, plan.extraContactsPer1k);
  const emailOverage = per1k(extraEmails, plan.extraEmailsPer1k);
  return {
    plan,
    fits,
    base,
    extraContacts,
    extraEmails,
    contactOverage: round2(contactOverage),
    emailOverage: round2(emailOverage),
    total: round2(base + contactOverage + emailOverage),
  };
}

// The cheapest plan that can carry these volumes (Free hard-caps; paid plans bill overage).
export function recommendPlan(volumes, interval = "monthly") {
  const options = PLANS.map((p) => estimatePlan(p, volumes, interval)).filter((e) => e.fits);
  return options.sort((a, b) => a.total - b.total)[0] ?? estimatePlan(PLANS[PLANS.length - 1], volumes, interval);
}

// counts/rates keyed by channel ({ sms: 1200 }, { sms: 0.0079 }); a channel without a rate is left out.
export function estimatePassThrough(counts = {}, rates = {}) {
  const lines = Object.entries(counts)
    .filter(([key, count]) => count > 0 && Number(rates[key]) > 0)
    .map(([key, count]) => ({ channel: key, count, rate: Number(rates[key]), cost: round2(count * Number(rates[key])) }));
  return { lines, total: round2(lines.reduce((sum, l) => sum + l.cost, 0)) };
}

// The cycle containing `now` for a monthly anchor day (1–28): { start, end } as Dates.
export function billingCycle(now = new Date(), anchorDay = 1) {
  const day = Math.min(28, Math.max(1, Number(anchorDay) || 1));
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day));
  if (start > now) start.setUTCMonth(start.getUTCMonth() - 1);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { start, end };
}

// Share of an allowance used, clamped to 0–100 for meters (null when the allowance is unlimited).
export function usagePercent(used, limit) {
  if (!limit) return null;
  return Math.min(100, Math.round((used / limit) * 1000) / 10);
}
