import { Resolver } from "node:dns/promises";

// Live DNS lookups for deliverability checks (server-only). Every call resolves to
// { answers, error } and never throws: error is null on success, "missing" for NXDOMAIN / no data,
// or the resolver's code (ETIMEOUT, ESERVFAIL, …). DELIVERABILITY_DNS_SERVERS overrides the resolvers
// (some blocklists refuse queries from large public resolvers).

const TIMEOUT_MS = 4000;
const MISSING = new Set(["ENOTFOUND", "ENODATA", "NXDOMAIN", "NODATA"]);

let resolver = null;

function getResolver() {
  if (resolver) return resolver;
  resolver = new Resolver({ timeout: TIMEOUT_MS, tries: 2 });
  const servers = String(process.env.DELIVERABILITY_DNS_SERVERS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (servers.length) {
    try {
      resolver.setServers(servers);
    } catch (e) {
      console.error("[deliverability.dns] invalid DELIVERABILITY_DNS_SERVERS", e?.message);
    }
  }
  return resolver;
}

// `code` keeps the raw resolver code so callers can tell NXDOMAIN (ENOTFOUND) from no data (ENODATA).
async function run(fn) {
  try {
    return { answers: await fn(getResolver()), error: null, code: null };
  } catch (e) {
    const code = e?.code || "EUNKNOWN";
    return { answers: [], error: MISSING.has(code) ? "missing" : code, code };
  }
}

export const lookupTxt = (host) => run((r) => r.resolveTxt(host)).then((res) => ({ ...res, answers: res.answers.map((chunks) => chunks.join("")) }));
export const lookupMx = (host) => run((r) => r.resolveMx(host)).then((res) => ({ ...res, answers: [...res.answers].sort((a, b) => a.priority - b.priority) }));
export const lookupCname = (host) => run((r) => r.resolveCname(host));
export const lookupA = (host) => run((r) => r.resolve4(host));
export const lookupAaaa = (host) => run((r) => r.resolve6(host));
export const lookupPtr = (ip) => run((r) => r.reverse(ip));

export async function lookup(type, host) {
  switch (type) {
    case "TXT":
      return lookupTxt(host);
    case "MX":
      return lookupMx(host);
    case "CNAME":
      return lookupCname(host);
    case "A":
      return lookupA(host);
    default:
      return { answers: [], error: "EUNSUPPORTED" };
  }
}

// Runs fn over items with at most `limit` in flight; results keep input order.
export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

export function isIpv4(value) {
  return IPV4.test(String(value || "").trim());
}

export function isIpv6(value) {
  const v = String(value || "").trim();
  return v.includes(":") && /^[0-9a-f:.]+$/i.test(v);
}

// Forward-confirmed reverse DNS: the PTR exists and its hostname resolves back to the IP.
export async function checkReverseDns(ip, expectedHostname = "") {
  const ptr = await lookupPtr(ip);
  if (ptr.error && ptr.error !== "missing") return { status: "error", hostname: null, detail: `PTR lookup failed (${ptr.error}).` };
  const hostname = ptr.answers[0] ? String(ptr.answers[0]).replace(/\.$/, "").toLowerCase() : null;
  if (!hostname) return { status: "missing", hostname: null, detail: "No PTR record. Ask the provider to set reverse DNS for this IP." };
  const forward = isIpv4(ip) ? await lookupA(hostname) : await lookupAaaa(hostname);
  const confirmed = forward.answers.some((a) => String(a).toLowerCase() === String(ip).toLowerCase());
  const expected = String(expectedHostname || "").trim().toLowerCase().replace(/\.$/, "");
  if (expected && hostname !== expected) {
    return { status: "mismatch", hostname, detail: `PTR points to ${hostname}, not ${expected}.` };
  }
  if (!confirmed) {
    return { status: "mismatch", hostname, detail: `${hostname} doesn't resolve back to ${ip}, so receivers can't confirm it (FCrDNS fails).` };
  }
  return { status: "pass", hostname, detail: `${ip} → ${hostname} → ${ip}` };
}
