import { buildDomainRecords, organizationalDomain, providerFor } from "./records.js";

// Email authentication analysis (isomorphic, pure): turns DNS answers into per-record verification
// status plus SPF/DKIM/DMARC/BIMI health with plain-language fixes. The server feeds it live lookups
// (lib/deliverability/verify.js); the playground feeds it seeded answers.
//
// lookups: { "TXT host": { answers: ["..."], error: null | "missing" | "<dns code>" }, "MX host": { answers: [{ exchange, priority }] } }

const SPF_LOOKUP_LIMIT = 10;

export function lookupKey(type, host) {
  return `${type} ${String(host).toLowerCase()}`;
}

function lookupOf(lookups, type, host) {
  const hit = lookups?.[lookupKey(type, host)];
  if (!hit) return { answers: [], error: "missing" };
  return { answers: Array.isArray(hit.answers) ? hit.answers : [], error: hit.error || null };
}

const isMissing = (error) => !error || error === "missing";
const dnsError = (error) => (isMissing(error) ? null : error);

// "v=DMARC1; p=none; rua=mailto:x" -> { v: "DMARC1", p: "none", rua: "mailto:x" }
export function parseTags(value) {
  const tags = {};
  for (const part of String(value || "").split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const key = part.slice(0, i).trim().toLowerCase();
    if (key) tags[key] = part.slice(i + 1).trim();
  }
  return tags;
}

function outcome(issues, { pass = "pass" } = {}) {
  if (issues.some((i) => i.level === "error")) return "fail";
  if (issues.some((i) => i.level === "warn")) return "warn";
  return pass;
}

const lookupFailed = (host, error, kind) => ({
  status: "error",
  recordStatus: "error",
  summary: "Lookup failed",
  host,
  value: null,
  issues: [{ level: "error", message: `Couldn't look up the ${kind} records at ${host} (${error}). DNS may be slow to answer; check again in a few minutes.` }],
});

// SPF --------------------------------------------------------------------------

export function isSpf(txt) {
  return /^v=spf1(\s|$)/i.test(String(txt).trim());
}

function mergeSpf(records, include) {
  const terms = [];
  let all = "~all";
  for (const record of records) {
    for (const term of record.trim().split(/\s+/).slice(1)) {
      if (/^[+~?-]?all$/i.test(term)) {
        if (term.startsWith("-")) all = "-all";
        continue;
      }
      if (!terms.includes(term)) terms.push(term);
    }
  }
  if (include && !terms.some((t) => t.toLowerCase().endsWith(`include:${include}`))) terms.push(`include:${include}`);
  return ["v=spf1", ...terms, all].join(" ");
}

export function analyzeSpf(txts, { host, include = null, lookupCount = null, error = null, required = true } = {}) {
  if (dnsError(error)) return lookupFailed(host, error, "TXT");
  const records = txts.filter(isSpf);
  if (!records.length) {
    return {
      status: required ? "fail" : "none",
      recordStatus: "missing",
      summary: "No SPF record",
      host,
      value: null,
      issues: [
        {
          level: required ? "error" : "info",
          message: `There's no SPF record at ${host}.`,
          fix: include ? `Publish a TXT record at ${host}: v=spf1 include:${include} ~all` : null,
        },
      ],
    };
  }
  const issues = [];
  if (records.length > 1) {
    issues.push({
      level: "error",
      message: `${host} has ${records.length} SPF records. Receivers treat more than one as a permanent error, so SPF fails for every message.`,
      fix: `Delete the extra records and publish one: ${mergeSpf(records, include)}`,
    });
  }
  const record = records[0].trim();
  const terms = record.split(/\s+/).slice(1).map((t) => t.toLowerCase());
  if (include && !terms.some((t) => t.replace(/^[+~?-]/, "") === `include:${include}`)) {
    issues.push({
      level: "error",
      message: `The SPF record doesn't authorise the provider's servers (include:${include}).`,
      fix: `Add include:${include} before the all mechanism: ${mergeSpf([record], include)}`,
    });
  }
  const all = terms.find((t) => /^[+~?-]?all$/.test(t));
  if (all === "all" || all === "+all") {
    issues.push({
      level: "error",
      message: "+all lets any server on the internet pass SPF as this domain.",
      fix: "Replace +all with ~all (soft fail) or -all (fail).",
    });
  } else if (all === "?all") {
    issues.push({ level: "warn", message: "?all gives unlisted servers a neutral result, so SPF protects nothing.", fix: "Use ~all or -all." });
  } else if (!all && !terms.some((t) => t.startsWith("redirect="))) {
    issues.push({ level: "info", message: "The record has no all mechanism, so mail from unlisted servers gets a neutral result." });
  }
  if (terms.some((t) => /^[+~?-]?ptr(:|$)/.test(t))) {
    issues.push({ level: "warn", message: "The ptr mechanism is deprecated (RFC 7208) and some receivers ignore it.", fix: "Replace ptr with ip4:/ip6: or include: mechanisms." });
  }
  if (lookupCount != null && lookupCount > SPF_LOOKUP_LIMIT) {
    issues.push({
      level: "error",
      message: `Evaluating this record takes ${lookupCount} DNS lookups; the limit is ${SPF_LOOKUP_LIMIT}, so receivers return a permanent error.`,
      fix: "Remove includes for services you no longer use, or replace them with their ip4:/ip6: ranges.",
    });
  } else if (lookupCount != null && lookupCount >= SPF_LOOKUP_LIMIT - 2) {
    issues.push({ level: "warn", message: `This record uses ${lookupCount} of the ${SPF_LOOKUP_LIMIT} DNS lookups SPF allows. One more include will break it.` });
  }
  const status = outcome(issues);
  return {
    status,
    recordStatus: status === "fail" ? "mismatch" : "verified",
    summary: status === "fail" ? "SPF is broken" : status === "warn" ? "SPF passes with warnings" : "SPF passes",
    host,
    value: record,
    lookupCount,
    issues,
  };
}

// DKIM -------------------------------------------------------------------------

const cleanKey = (value) => String(value || "").replace(/["\s]/g, "");

// Rough RSA modulus size from the base64 SubjectPublicKeyInfo length.
function estimateKeyBits(p) {
  const bytes = Math.floor((cleanKey(p).length * 3) / 4);
  if (bytes < 100) return 512;
  if (bytes < 200) return 1024;
  if (bytes < 330) return 2048;
  return 4096;
}

export function analyzeDkim(txts, { host, expectedKey = "", error = null } = {}) {
  if (dnsError(error)) return lookupFailed(host, error, "TXT");
  const records = txts.filter((t) => /(^|;)\s*p=/i.test(t));
  if (!records.length) {
    return {
      status: "fail",
      recordStatus: "missing",
      summary: "No DKIM key",
      host,
      value: null,
      issues: [
        {
          level: "error",
          message: `There's no DKIM key at ${host}, so messages can't be signed for this domain.`,
          fix: `Publish a TXT record at ${host} with the public key the provider issued for this domain. Long keys may be split into several quoted strings; that's fine.`,
        },
      ],
    };
  }
  const issues = [];
  if (records.length > 1) {
    issues.push({ level: "warn", message: `${host} has ${records.length} DKIM records; receivers may pick either one.`, fix: "Keep only the key the provider issued." });
  }
  const tags = parseTags(records[0]);
  const p = cleanKey(tags.p);
  const keyType = (tags.k || "rsa").toLowerCase();
  let bits = null;
  if (tags.v && tags.v.toUpperCase() !== "DKIM1") {
    issues.push({ level: "error", message: `The record starts with v=${tags.v}; DKIM keys must use v=DKIM1 or omit it.` });
  }
  if (!p) {
    issues.push({ level: "error", message: "The key is empty (p=), which revokes it. Every signature fails.", fix: "Publish the current public key from the provider." });
  } else if (keyType === "rsa") {
    bits = estimateKeyBits(p);
    if (bits < 1024) issues.push({ level: "error", message: `The key is about ${bits} bits. Gmail and Microsoft reject keys under 1024 bits.`, fix: "Ask the provider for a 2048-bit key." });
    else if (bits === 1024) issues.push({ level: "info", message: "This is a 1024-bit key. It works, but 2048-bit keys are recommended." });
  } else if (keyType !== "ed25519") {
    issues.push({ level: "warn", message: `Unknown key type k=${keyType}.` });
  }
  const expected = cleanKey(expectedKey).replace(/^p=/i, "");
  if (p && expected && p !== expected) {
    issues.push({
      level: "error",
      message: "The published key doesn't match the key the provider issued for this domain.",
      fix: `Replace the TXT value at ${host} with the expected key.`,
    });
  }
  const status = outcome(issues);
  return {
    status,
    recordStatus: status === "fail" ? "mismatch" : "verified",
    summary: status === "fail" ? "DKIM is broken" : expected ? "DKIM key matches" : "DKIM key published",
    host,
    value: records[0],
    keyBits: bits,
    issues,
  };
}

// DMARC ------------------------------------------------------------------------

const POLICIES = ["none", "quarantine", "reject"];

export function analyzeDmarc(txts, { host, domain, inheritedFrom = null, error = null, returnPathSubdomain = "send" } = {}) {
  if (dnsError(error)) return lookupFailed(host, error, "TXT");
  const records = txts.filter((t) => /^v=DMARC1\s*(;|$)/i.test(String(t).trim()));
  if (!records.length) {
    return {
      status: "fail",
      recordStatus: "missing",
      summary: "No DMARC record",
      host,
      value: null,
      policy: null,
      issues: [
        {
          level: "error",
          message: "There's no DMARC record. Gmail and Yahoo require one for anyone sending more than 5,000 messages a day, and receivers can't tell spoofed mail from yours.",
          fix: `Publish a TXT record at ${host}: v=DMARC1; p=none; rua=mailto:dmarc@${organizationalDomain(domain)}`,
        },
      ],
    };
  }
  const issues = [];
  const source = inheritedFrom || host;
  if (records.length > 1) {
    issues.push({ level: "error", message: `${source} has ${records.length} DMARC records. Receivers ignore DMARC entirely when there's more than one.`, fix: "Delete all but one." });
  }
  const tags = parseTags(records[0]);
  const ownPolicy = (tags.p || "").toLowerCase();
  const policy = (inheritedFrom ? tags.sp || tags.p : tags.p || "").toLowerCase();
  if (!POLICIES.includes(ownPolicy)) {
    issues.push({ level: "error", message: "The record has no valid p= tag, so receivers ignore it.", fix: "Add p=none, p=quarantine or p=reject." });
  }
  if (inheritedFrom) {
    issues.push({ level: "info", message: `There's no record at ${host}, so the organisational domain's policy applies (${tags.sp ? `sp=${tags.sp}` : `p=${tags.p}`} from ${inheritedFrom}).` });
  }
  if (policy === "none") {
    issues.push({
      level: "warn",
      message: "p=none only monitors: mail that fails authentication, including spoofed mail, is still delivered.",
      fix: "Once aggregate reports show your legitimate mail passing, move to p=quarantine, then p=reject.",
    });
  }
  if (!tags.rua) {
    issues.push({
      level: "warn",
      message: "There's no rua= address, so you won't receive aggregate reports and can't tell when it's safe to tighten the policy.",
      fix: `Add rua=mailto:dmarc@${organizationalDomain(domain)} (any mailbox you read, or a DMARC reporting service).`,
    });
  }
  const pct = tags.pct != null ? Number(tags.pct) : 100;
  if (Number.isFinite(pct) && pct < 100) {
    issues.push({ level: "info", message: `pct=${pct}: the policy applies to ${pct}% of failing mail; the rest is treated as p=none.` });
  }
  if ((tags.aspf || "").toLowerCase() === "s") {
    issues.push({
      level: "warn",
      message: `aspf=s requires the return path to match the From domain exactly. The provider's return path is ${returnPathSubdomain}.${domain}, so SPF never aligns and DMARC relies on DKIM alone.`,
      fix: "Use aspf=r (relaxed).",
    });
  }
  const status = outcome(issues);
  return {
    status,
    recordStatus: status === "fail" ? "mismatch" : "verified",
    summary: status === "fail" ? "DMARC is broken" : policy === "none" ? "Monitoring only (p=none)" : `Enforced (p=${policy})`,
    host,
    value: records[0],
    inheritedFrom,
    policy: policy || null,
    pct: Number.isFinite(pct) ? pct : 100,
    rua: tags.rua || null,
    adkim: tags.adkim || "r",
    aspf: tags.aspf || "r",
    issues,
  };
}

// BIMI -------------------------------------------------------------------------

export function analyzeBimi(txts, { host, dmarc = null, enabled = false, error = null } = {}) {
  if (dnsError(error)) return lookupFailed(host, error, "TXT");
  const record = txts.find((t) => /^v=BIMI1\s*(;|$)/i.test(String(t).trim()));
  if (!record) {
    return {
      status: enabled ? "fail" : "none",
      recordStatus: "missing",
      summary: enabled ? "No BIMI record" : "Not set up",
      host,
      value: null,
      issues: [
        enabled
          ? { level: "error", message: `There's no BIMI record at ${host}.`, fix: `Publish the TXT record shown at ${host}.` }
          : { level: "info", message: "Optional. BIMI shows your logo beside authenticated mail in Gmail, Yahoo and Apple Mail. It needs DMARC at quarantine or reject first." },
      ],
    };
  }
  const issues = [];
  const tags = parseTags(record);
  const logo = tags.l || "";
  if (!/^https:\/\/.+\.svg(\?.*)?$/i.test(logo)) {
    issues.push({ level: "error", message: "l= must be an HTTPS link to an SVG Tiny PS logo.", fix: "Host the logo as .svg over HTTPS and point l= at it." });
  }
  if (!tags.a) {
    issues.push({ level: "warn", message: "There's no certificate (a=). Gmail and Apple Mail only show BIMI logos with a VMC or CMC." });
  }
  const enforced = dmarc && ["quarantine", "reject"].includes(dmarc.policy) && (dmarc.pct ?? 100) === 100;
  if (!enforced) {
    issues.push({ level: "error", message: "BIMI is ignored until DMARC is enforced (p=quarantine or p=reject at pct=100).", fix: "Tighten the DMARC policy first." });
  }
  const status = outcome(issues);
  return {
    status,
    recordStatus: status === "fail" ? "mismatch" : "verified",
    summary: status === "fail" ? "BIMI won't display" : "BIMI published",
    host,
    value: record,
    issues,
  };
}

// MX (bounce routing) ----------------------------------------------------------

const cleanHost = (h) => String(h || "").toLowerCase().replace(/\.$/, "");

function analyzeBounceMx(mx, { host, expectedExchange, error = null }) {
  if (dnsError(error)) return lookupFailed(host, error, "MX");
  if (!mx.length) {
    return { recordStatus: "missing", message: `No MX record at ${host}; bounces can't reach the provider.` };
  }
  const ok = mx.some((m) => cleanHost(m.exchange) === cleanHost(expectedExchange));
  return ok
    ? { recordStatus: "verified", message: "Bounces route to the provider." }
    : { recordStatus: "mismatch", message: `MX at ${host} points to ${mx.map((m) => cleanHost(m.exchange)).join(", ")}, not ${expectedExchange}.` };
}

// Whole domain -----------------------------------------------------------------

const formatTxt = (answers) => answers.map((a) => String(a));
const formatMx = (answers) => answers.map((m) => `${m.priority} ${cleanHost(m.exchange)}`);

// The DNS names a domain check has to query (verify.js resolves exactly these).
export function domainQueries(domain, { provider, region, settings } = {}) {
  const records = buildDomainRecords(domain, { provider, region, settings });
  const queries = records.map((r) => ({ type: r.type, host: r.host }));
  const org = organizationalDomain(domain);
  if (org !== domain) queries.push({ type: "TXT", host: `_dmarc.${org}` });
  queries.push({ type: "TXT", host: domain });
  if (!settings?.bimiLogoUrl) queries.push({ type: "TXT", host: `default._bimi.${domain}` });
  return queries;
}

// Re-evaluates a domain from DNS answers: { records, auth, status, verifiedAt }.
export function evaluateDomain({ domain, provider, region, settings = {}, verifiedAt = null }, lookups, { spfLookupCounts = {}, now = new Date() } = {}) {
  const p = providerFor(provider);
  const records = buildDomainRecords(domain, { provider, region, settings });
  const org = organizationalDomain(domain);
  const checkedAt = now.toISOString();

  const dkimRec = records.find((r) => r.key === "dkim");
  const spfRec = records.find((r) => r.key === "spf");
  const mxRec = records.find((r) => r.key === "mx");
  const dmarcRec = records.find((r) => r.key === "dmarc");
  const bimiRec = records.find((r) => r.key === "bimi");

  const dkimL = lookupOf(lookups, "TXT", dkimRec.host);
  const dkim = analyzeDkim(dkimL.answers, { host: dkimRec.host, expectedKey: settings.dkimKey, error: dkimL.error });

  const spfL = lookupOf(lookups, "TXT", spfRec.host);
  const spf = analyzeSpf(spfL.answers, { host: spfRec.host, include: p.spfInclude, lookupCount: spfLookupCounts[spfRec.host] ?? null, error: spfL.error });

  const mxL = lookupOf(lookups, "MX", mxRec.host);
  const mx = analyzeBounceMx(mxL.answers, { host: mxRec.host, expectedExchange: p.bounceMx(region || p.defaultRegion), error: mxL.error });

  let dmarcL = lookupOf(lookups, "TXT", dmarcRec.host);
  let inheritedFrom = null;
  if (!dmarcL.answers.some((t) => /^v=DMARC1/i.test(String(t).trim())) && isMissing(dmarcL.error) && org !== domain) {
    const orgL = lookupOf(lookups, "TXT", `_dmarc.${org}`);
    if (orgL.answers.some((t) => /^v=DMARC1/i.test(String(t).trim()))) {
      dmarcL = orgL;
      inheritedFrom = `_dmarc.${org}`;
    }
  }
  const dmarc = analyzeDmarc(dmarcL.answers, { host: dmarcRec.host, domain, inheritedFrom, error: dmarcL.error, returnPathSubdomain: p.returnPathSubdomain });

  const bimiHost = `default._bimi.${domain}`;
  const bimiL = lookupOf(lookups, "TXT", bimiHost);
  const bimi = analyzeBimi(bimiL.answers, { host: bimiHost, dmarc, enabled: Boolean(settings.bimiLogoUrl), error: bimiL.error });

  const rootL = lookupOf(lookups, "TXT", domain);
  const rootSpf = analyzeSpf(rootL.answers, { host: domain, lookupCount: spfLookupCounts[domain] ?? null, error: rootL.error, required: false });

  const resolved = {
    dkim: { status: dkim.recordStatus, found: formatTxt(dkimL.answers), message: dkim.summary },
    spf: { status: spf.recordStatus, found: formatTxt(spfL.answers), message: spf.summary },
    mx: { status: mx.recordStatus, found: formatMx(mxL.answers), message: mx.message || mx.summary },
    dmarc: { status: dmarc.recordStatus, found: formatTxt(dmarcL.answers), foundHost: inheritedFrom, message: dmarc.summary },
    bimi: bimiRec ? { status: bimi.recordStatus, found: formatTxt(bimiL.answers), message: bimi.summary } : null,
  };
  const nextRecords = records.map((r) => (resolved[r.key] ? { ...r, ...resolved[r.key] } : r));

  const allRequired = nextRecords.filter((r) => r.required).every((r) => r.status === "verified");
  const status = allRequired ? "verified" : verifiedAt ? "failing" : "pending";
  return {
    records: nextRecords,
    auth: { spf, dkim, dmarc, bimi, rootSpf, checkedAt },
    status,
    verifiedAt: allRequired ? verifiedAt || checkedAt : verifiedAt,
    checkedAt,
  };
}

// Rebuilds a lookups map from a row's stored records (the playground has no DNS).
export function lookupsFromRecords(records = []) {
  const lookups = {};
  for (const r of records) {
    const host = r.foundHost || r.host;
    const found = Array.isArray(r.found) ? r.found : [];
    lookups[lookupKey(r.type, host)] = {
      answers: r.type === "MX"
        ? found.map((f) => {
            const [priority, exchange] = String(f).split(/\s+/);
            return { priority: Number(priority) || 0, exchange: exchange || "" };
          })
        : found,
      error: found.length ? null : "missing",
    };
  }
  return lookups;
}

// One-word health for a check card: pass | warn | fail | missing | none | error.
export const AUTH_CHECKS = [
  { key: "spf", label: "SPF" },
  { key: "dkim", label: "DKIM" },
  { key: "dmarc", label: "DMARC" },
  { key: "bimi", label: "BIMI" },
];
