import { domainQueries, evaluateDomain, isSpf, lookupKey } from "./auth_checks.js";
import { lookup, lookupTxt, mapLimit } from "./dns.js";
import { buildDomainRecords } from "./records.js";

// Sending-domain verification (server-only): live TXT/MX lookups for every record the provider needs,
// SPF lookup counting, then the pure evaluation in auth_checks.js. Writes go through the caller's db
// (user-scoped in routes, service role in the worker).

const MAX_SPF_QUERIES = 25;

// RFC 7208 §4.6.4: include, a, mx, ptr, exists and redirect each cost one DNS lookup, recursively.
async function countSpfLookups(host, state, depth = 0) {
  if (depth > 10 || state.queries >= MAX_SPF_QUERIES) return 0;
  const key = host.toLowerCase();
  if (!state.cache.has(key)) {
    state.queries += 1;
    state.cache.set(key, await lookupTxt(key));
  }
  const record = state.cache.get(key).answers.find(isSpf);
  if (!record) return 0;
  let count = 0;
  for (const raw of record.trim().split(/\s+/).slice(1)) {
    const term = raw.replace(/^[+~?-]/, "").toLowerCase();
    if (term.startsWith("include:") || term.startsWith("redirect=")) {
      const target = term.slice(term.indexOf(term.startsWith("include:") ? ":" : "=") + 1);
      count += 1;
      if (!target.includes("%{")) count += await countSpfLookups(target, state, depth + 1);
    } else if (/^(a|mx|ptr)([:/]|$)/.test(term) || term.startsWith("exists:")) {
      count += 1;
    }
  }
  return count;
}

export async function verifyDomain(row, { now = new Date() } = {}) {
  const input = {
    domain: row.domain,
    provider: row.provider,
    region: row.region,
    settings: row.settings || {},
    verifiedAt: row.verified_at || null,
  };
  const queries = domainQueries(row.domain, input);
  const lookups = {};
  await mapLimit(queries, 6, async ({ type, host }) => {
    lookups[lookupKey(type, host)] = await lookup(type, host);
  });

  const spfHost = buildDomainRecords(row.domain, input).find((r) => r.key === "spf").host;
  const state = { cache: new Map(), queries: 0 };
  const spfLookupCounts = {
    [spfHost]: await countSpfLookups(spfHost, state),
    [row.domain]: await countSpfLookups(row.domain, state),
  };
  return evaluateDomain(input, lookups, { spfLookupCounts, now });
}

// Verifies and persists one sending_domains row; returns the updated raw row (or null on a write failure).
export async function verifyAndSaveDomain(db, row, { now = new Date() } = {}) {
  const result = await verifyDomain(row, { now });
  const { data, error } = await db
    .from("sending_domains")
    .update({
      records: result.records,
      auth: result.auth,
      status: result.status,
      verified_at: result.verifiedAt,
      last_checked_at: result.checkedAt,
    })
    .eq("id", row.id)
    .select("*")
    .single();
  if (error) {
    console.error("[deliverability.verify]", error.message);
    return null;
  }
  return data;
}
