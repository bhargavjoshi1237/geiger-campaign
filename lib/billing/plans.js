// Geiger Campaign's public plan catalog (config, isomorphic). Priced by marketing contacts and monthly
// email sends; everything over a paid plan's allowance is billed per 1,000 at the listed rate. SMS,
// WhatsApp and RCS go out through the workspace's own provider accounts and are charged by the provider
// at cost — Geiger adds no markup. Prices are USD per month.

export const PLANS = [
  {
    key: "free",
    name: "Free",
    monthly: 0,
    annualMonthly: 0,
    contacts: 500,
    emailsPerMonth: 2500,
    extraContactsPer1k: null,
    extraEmailsPer1k: null,
    seats: 2,
    features: ["Email campaigns and templates", "Forms and landing pages", "Basic reporting"],
  },
  {
    key: "starter",
    name: "Starter",
    monthly: 19,
    annualMonthly: 16,
    contacts: 2500,
    emailsPerMonth: 25000,
    extraContactsPer1k: 6,
    extraEmailsPer1k: 0.8,
    seats: 5,
    features: ["Everything in Free", "Automations and journeys", "A/B testing", "SMS and WhatsApp (provider cost)"],
  },
  {
    key: "growth",
    name: "Growth",
    monthly: 59,
    annualMonthly: 49,
    contacts: 10000,
    emailsPerMonth: 120000,
    extraContactsPer1k: 4,
    extraEmailsPer1k: 0.6,
    seats: 15,
    features: ["Everything in Starter", "AI assistant", "Send-time optimization", "Revenue attribution", "Approvals"],
  },
  {
    key: "scale",
    name: "Scale",
    monthly: 249,
    annualMonthly: 209,
    contacts: 50000,
    emailsPerMonth: 750000,
    extraContactsPer1k: 3,
    extraEmailsPer1k: 0.4,
    seats: null,
    features: ["Everything in Growth", "Unlimited seats", "Dedicated IPs", "Warehouse sync"],
  },
];

export const PASS_THROUGH_CHANNELS = [
  { key: "sms", label: "SMS" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "rcs", label: "RCS" },
];

export function getPlan(key) {
  return PLANS.find((p) => p.key === key) ?? PLANS[0];
}
