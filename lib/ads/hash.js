import { createHash } from "node:crypto";

// Meta customer-information normalization + SHA-256 hashing (server-only), shared by Custom Audience
// uploads and the Conversions API: trim + lowercase emails, digits-only phones with country code,
// lowercase letters-only names. Returns null for anything that can't be matched.

export const sha256 = (value) => createHash("sha256").update(String(value), "utf8").digest("hex");

export function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

// Digits only, no leading zeros, country code required: numbers saved without one get `defaultCountryCode`.
export function normalizePhone(value, defaultCountryCode = "") {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const international = raw.startsWith("+") || raw.startsWith("00");
  let digits = raw.replace(/\D/g, "");
  if (raw.startsWith("00")) digits = digits.slice(2);
  if (!international) {
    const local = digits.replace(/^0+/, "");
    const code = String(defaultCountryCode || "").replace(/\D/g, "");
    if (!code) return local.length >= 11 ? local : null;
    digits = local.startsWith(code) && local.length > 10 ? local : `${code}${local}`;
  }
  digits = digits.replace(/^0+/, "");
  return digits.length >= 7 && digits.length <= 15 ? digits : null;
}

export function normalizeName(value) {
  const name = String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFC")
    .replace(/[\s\p{P}\p{S}]/gu, "");
  return name || null;
}

export const hashEmail = (value) => {
  const email = normalizeEmail(value);
  return email ? sha256(email) : null;
};

export const hashPhone = (value, defaultCountryCode) => {
  const phone = normalizePhone(value, defaultCountryCode);
  return phone ? sha256(phone) : null;
};

export const hashName = (value) => {
  const name = normalizeName(value);
  return name ? sha256(name) : null;
};

export const hashExternalId = (value) => (value ? sha256(String(value).trim()) : null);
