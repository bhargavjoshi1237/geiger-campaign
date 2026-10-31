import { DISPOSABLE_SET } from "./disposable_domains.js";

// Email address checks that need no network (isomorphic, pure): RFC-practical syntax, disposable domains,
// role accounts and typo suggestions for common mailbox providers. The server adds MX/A lookups
// (lib/deliverability/validate.js) and combines both into one result with combineResult().

export const RESULT_LABELS = { valid: "Valid", risky: "Risky", invalid: "Invalid", unknown: "Unknown" };

export const REASON_LABELS = {
  syntax: "Malformed address",
  domain_not_found: "Domain doesn't exist",
  no_mx: "Domain has no mail server",
  null_mx: "Domain doesn't accept mail",
  a_fallback: "No MX record (falls back to A)",
  dns_error: "DNS lookup failed",
  disposable: "Disposable inbox",
  role_account: "Role account",
  typo: "Possible typo",
};

const ROLE_LOCAL_PARTS = new Set([
  "abuse", "accounts", "admin", "administrator", "billing", "careers", "contact", "customerservice", "enquiries",
  "enquiry", "feedback", "hello", "help", "helpdesk", "hostmaster", "hr", "info", "inquiries", "jobs", "legal",
  "mail", "mailer-daemon", "marketing", "media", "newsletter", "no-reply", "noreply", "do-not-reply", "donotreply",
  "office", "orders", "postmaster", "press", "privacy", "root", "sales", "security", "service", "support", "team",
  "webmaster", "www",
]);

const COMMON_DOMAINS = [
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "ymail.com", "hotmail.com", "hotmail.co.uk",
  "outlook.com", "live.com", "msn.com", "icloud.com", "me.com", "mac.com", "aol.com", "protonmail.com",
  "proton.me", "gmx.com", "gmx.de", "web.de", "yandex.com", "mail.com", "zoho.com", "fastmail.com",
  "comcast.net", "verizon.net", "att.net", "sbcglobal.net", "btinternet.com", "orange.fr", "free.fr",
];
const COMMON_SET = new Set(COMMON_DOMAINS);

const TLD_FIXES = { con: "com", cmo: "com", comm: "com", cpm: "com", vom: "com", xom: "com", ocm: "com", nte: "net", nett: "net", ogr: "org", orgg: "org" };

// Provider name labels worth fuzzy-matching (short ones like aol/msn collide with real domains).
const PROVIDER_BASES = {
  gmail: "gmail.com",
  googlemail: "googlemail.com",
  yahoo: "yahoo.com",
  hotmail: "hotmail.com",
  outlook: "outlook.com",
  icloud: "icloud.com",
  protonmail: "protonmail.com",
  yandex: "yandex.com",
  comcast: "comcast.net",
  verizon: "verizon.net",
  sbcglobal: "sbcglobal.net",
  btinternet: "btinternet.com",
};

const LOCAL_ATOM = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/i;
const DOMAIN_LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/i;

// Damerau-Levenshtein (optimal string alignment) distance, capped for speed.
function distance(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

// "gmial.com" -> "gmail.com", "example.con" -> "example.com"; regional variants (hotmail.fr) are left alone.
export function suggestDomain(domain) {
  if (!domain || COMMON_SET.has(domain)) return null;
  const labels = domain.split(".");
  const tld = labels[labels.length - 1];
  if (TLD_FIXES[tld]) return [...labels.slice(0, -1), TLD_FIXES[tld]].join(".");
  const [base, ...restLabels] = labels;
  const rest = restLabels.join(".");
  if (PROVIDER_BASES[base]) return base === "gmail" && rest !== "com" ? "gmail.com" : null;
  let best = null;
  let bestScore = 3;
  for (const [candidate, canonical] of Object.entries(PROVIDER_BASES)) {
    const score = distance(base, candidate);
    const limit = candidate.length <= 6 ? 1 : 2;
    if (base.length >= 3 && score <= limit && score < bestScore) {
      best = COMMON_SET.has(`${candidate}.${rest}`) ? `${candidate}.${rest}` : canonical;
      bestScore = score;
    }
  }
  return best;
}

// Syntax: { ok, email, local, domain, asciiDomain, problem }.
export function parseEmail(input) {
  const email = String(input ?? "").trim().replace(/^mailto:/i, "").toLowerCase();
  const fail = (problem) => ({ ok: false, email, local: "", domain: "", asciiDomain: "", problem });
  if (!email) return fail("The address is empty.");
  if (email.length > 254) return fail("The address is longer than 254 characters.");
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) return fail("The address needs a name, an @ and a domain.");
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (local.length > 64) return fail("The part before the @ is longer than 64 characters.");
  if (local.startsWith('"')) return fail("Quoted addresses aren't supported by most mailbox providers.");
  if (!LOCAL_ATOM.test(local)) return fail("The part before the @ has invalid characters or dots in the wrong place.");
  let asciiDomain = domain;
  try {
    asciiDomain = new URL(`http://${domain}`).hostname;
  } catch {
    return fail("The domain isn't a valid host name.");
  }
  const labels = asciiDomain.split(".");
  if (labels.length < 2) return fail("The domain needs a dot, like example.com.");
  if (!labels.every((l) => DOMAIN_LABEL.test(l))) return fail("The domain has an invalid label.");
  if (!/^(xn--[a-z0-9-]+|[a-z]{2,63})$/.test(labels[labels.length - 1])) return fail("The domain's ending isn't a real top-level domain.");
  return { ok: true, email, local, domain, asciiDomain, problem: null };
}

// Checks that need no DNS: { email, domain, reasons, suggestion, syntaxOk, problem }.
export function precheckEmail(input) {
  const parsed = parseEmail(input);
  if (!parsed.ok) return { email: parsed.email, domain: parsed.domain, reasons: ["syntax"], suggestion: null, syntaxOk: false, problem: parsed.problem };
  const reasons = [];
  if (DISPOSABLE_SET.has(parsed.asciiDomain)) reasons.push("disposable");
  const plainLocal = parsed.local.split("+")[0];
  if (ROLE_LOCAL_PARTS.has(plainLocal)) reasons.push("role_account");
  const suggested = suggestDomain(parsed.asciiDomain);
  if (suggested) reasons.push("typo");
  return {
    email: parsed.email,
    domain: parsed.asciiDomain,
    reasons,
    suggestion: suggested ? `${parsed.local}@${suggested}` : null,
    syntaxOk: true,
    problem: null,
  };
}

const INVALID = new Set(["syntax", "domain_not_found", "no_mx", "null_mx"]);
const RISKY = new Set(["disposable", "typo", "a_fallback", "role_account"]);

export function combineResult(reasons) {
  if (reasons.some((r) => INVALID.has(r))) return "invalid";
  if (reasons.includes("typo") || reasons.includes("disposable")) return "risky";
  if (reasons.includes("dns_error")) return "unknown";
  if (reasons.some((r) => RISKY.has(r))) return "risky";
  return "valid";
}

// Splits pasted text into unique candidate addresses (newlines, commas, semicolons, spaces).
export function splitEmails(text) {
  const seen = new Set();
  const out = [];
  for (const part of String(text || "").split(/[\s,;]+/)) {
    const value = part.trim().replace(/^<|>$/g, "").toLowerCase();
    if (value && !seen.has(value)) {
      seen.add(value);
      out.push(value);
    }
  }
  return out;
}
