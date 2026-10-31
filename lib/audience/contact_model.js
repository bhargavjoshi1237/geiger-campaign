// Contact view model and address/consent helpers shared by the browser data layer, the server audience
// code and the playground (pure and isomorphic — no "use client", no server imports).

export const CONTACT_STATUSES = ["subscribed", "pending", "unsubscribed", "bounced", "complained"];

export const CONTACT_STATUS_LABELS = {
  subscribed: "Subscribed",
  pending: "Pending",
  unsubscribed: "Unsubscribed",
  bounced: "Bounced",
  complained: "Complained",
};

// Every channel the consent ledger tracks, in display order.
export const CONSENT_CHANNELS = [
  { key: "email", label: "Email" },
  { key: "sms", label: "SMS" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "rcs", label: "RCS" },
  { key: "instagram", label: "Instagram" },
  { key: "messenger", label: "Messenger" },
  { key: "telegram", label: "Telegram" },
  { key: "tiktok", label: "TikTok" },
  { key: "push", label: "Push" },
  { key: "in_app", label: "In-app" },
];

export const CONSENT_STATUSES = ["opted_in", "opted_out", "pending"];

// Channels addressed by the contact's phone number.
export const PHONE_CHANNELS = ["sms", "whatsapp", "rcs"];

// Channels addressed by a platform identity in contacts.metadata.identities (written by inbound webhooks).
export const IDENTITY_CHANNELS = ["instagram", "messenger", "telegram", "tiktok", "push"];

// Channels that may send without an opt-in row (an explicit opt-out still blocks them).
export const CONSENT_EXEMPT_CHANNELS = ["email"];

export function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value ?? "").trim());
}

export function emailDomain(email) {
  const at = String(email ?? "").lastIndexOf("@");
  return at === -1 ? "" : normalizeEmail(String(email).slice(at + 1));
}

// "+351 912 345 678" / "00351912345678" -> "+351912345678"; national numbers keep their digits.
export function normalizePhone(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  let digits = raw.replace(/\D/g, "");
  let international = raw.startsWith("+");
  if (!international && raw.startsWith("00")) {
    digits = digits.slice(2);
    international = true;
  }
  if (!digits) return "";
  return international ? `+${digits}` : digits;
}

// Digits only, so "+1 (555) 010-2000" and "15550102000" match the same suppression.
export function phoneKey(value) {
  return String(value ?? "").replace(/\D/g, "").replace(/^00/, "");
}

// DB row (snake_case) -> camelCase view model. Spreads metadata first so promoted keys win.
export function toContactModel(row) {
  if (!row) return null;
  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const firstName = row.first_name ?? "";
  const lastName = row.last_name ?? "";
  return {
    ...meta,
    id: row.id,
    projectId: row.project_id ?? null,
    email: row.email ?? "",
    phone: row.phone ?? "",
    firstName,
    lastName,
    name: [firstName, lastName].filter(Boolean).join(" ") || row.email || row.phone || "Unnamed contact",
    status: row.status ?? "subscribed",
    source: row.source ?? "manual",
    tags: Array.isArray(row.tags) ? row.tags : [],
    attributes: row.attributes && typeof row.attributes === "object" ? row.attributes : {},
    identities: meta.identities && typeof meta.identities === "object" ? meta.identities : {},
    leadScore: Number(row.lead_score ?? 0),
    timezone: row.timezone ?? "",
    locale: row.locale ?? "",
    companyId: row.company_id ?? null,
    lastActivityAt: row.last_activity_at ?? null,
    unsubscribedAt: row.unsubscribed_at ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

// The send address for a channel from a raw row or a view model; "" when the contact can't be reached there.
export function addressFor(contact, channel = "email") {
  if (!contact) return "";
  if (channel === "email") {
    const email = normalizeEmail(contact.email);
    return isValidEmail(email) ? email : "";
  }
  if (PHONE_CHANNELS.includes(channel)) return normalizePhone(contact.phone);
  if (channel === "in_app") return contact.id ? String(contact.id) : "";
  const identities = contact.identities || contact.metadata?.identities || {};
  const identity = identities?.[channel];
  if (identity && typeof identity === "object") return String(identity.id ?? identity.psid ?? identity.token ?? "");
  if (identity) return String(identity);
  // The push provider resolves a contact id to every active subscription; the consent ledger gates it.
  return channel === "push" && contact.id ? String(contact.id) : "";
}

// Latest ledger row per channel from a list of consent rows/view models (any order).
export function latestConsentByChannel(consents = []) {
  const latest = {};
  for (const c of consents) {
    const channel = c.channel;
    const at = Date.parse(c.capturedAt ?? c.captured_at ?? c.createdAt ?? c.created_at ?? 0) || 0;
    const prev = latest[channel];
    if (!prev || at >= prev.at) latest[channel] = { ...c, at };
  }
  return latest;
}
