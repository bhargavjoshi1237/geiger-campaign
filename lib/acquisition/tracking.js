// UTM and short-link helpers shared by the Source Tracking screen, the /l/<slug> redirect and form
// ingest. Pure: no React, no database.

export const UTM_KEYS = ["source", "medium", "campaign", "term", "content"];

const SLUG_ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function isHttpUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

// { source, medium, … } with blank keys dropped and values trimmed.
export function cleanUtm(utm = {}) {
  const out = {};
  for (const key of UTM_KEYS) {
    const v = utm?.[key] ?? utm?.[`utm_${key}`];
    if (typeof v === "string" && v.trim()) out[key] = v.trim().slice(0, 200);
  }
  return out;
}

// Destination plus its UTM params (existing query params are kept; UTM keys are overwritten).
export function buildTrackedUrl(destination, utm = {}) {
  const raw = String(destination || "").trim();
  if (!isHttpUrl(raw)) return raw;
  const url = new URL(raw);
  for (const [key, value] of Object.entries(cleanUtm(utm))) url.searchParams.set(`utm_${key}`, value);
  return url.toString();
}

// UTM params from a URL, a query string or a URLSearchParams.
export function parseUtm(input) {
  try {
    let params;
    if (input instanceof URLSearchParams) params = input;
    else if (typeof input === "string" && /^https?:/i.test(input)) params = new URL(input).searchParams;
    else params = new URLSearchParams(String(input || "").replace(/^\?/, ""));
    const out = {};
    for (const key of UTM_KEYS) {
      const v = params.get(`utm_${key}`);
      if (v) out[key] = v.slice(0, 200);
    }
    return out;
  } catch {
    return {};
  }
}

export function randomSlug(length = 7) {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => SLUG_ALPHABET[b % SLUG_ALPHABET.length]).join("");
}

// A user-typed short-link slug: letters, digits, dashes and underscores only.
export function normalizeLinkSlug(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 64);
}

// Grouping key + label for a UTM set ("google / cpc / spring_sale").
export function utmKey(utm = {}, depth = 3) {
  const parts = ["source", "medium", "campaign"].slice(0, depth).map((k) => (utm?.[k] || "").toLowerCase());
  return parts.join("|");
}

export function utmLabel(utm = {}) {
  return [utm?.source || "(direct)", utm?.medium || "(none)"].join(" / ");
}
