import { randomUUID } from "node:crypto";
import { DOMAIN_BLOCKLISTS, IP_BLOCKLISTS, interpretAnswer, queryName, testQueryName } from "./blocklists.js";
import { isIpv4, isIpv6, lookupA, lookupMx, lookupTxt, mapLimit } from "./dns.js";
import { normalizeDomainName } from "./records.js";

// Live DNSBL checks (server-only). An IP target is queried on every IP list; a domain target on every
// domain list plus the IPs behind its A and MX records on the IP lists. Results are appended to
// campaign.blocklist_checks as one run (shared run_id), so history is a plain query.

const MAX_DOMAIN_IPS = 4;

export function parseTarget(input) {
  const value = String(input || "").trim().toLowerCase();
  if (isIpv4(value)) return { target: value, targetType: "ip" };
  if (isIpv6(value)) return { target: value, targetType: "ip", ipv6: true };
  const domain = normalizeDomainName(value);
  return domain ? { target: domain, targetType: "domain" } : null;
}

// One "is this list answering?" probe per list per run, via its RFC 5782 test entry.
async function listHealth(lists, kind, dqsKey) {
  const health = new Map();
  await mapLimit(lists, 4, async (list) => {
    const res = await lookupA(testQueryName(list, { kind, dqsKey }));
    const verdict = interpretAnswer(list, res);
    health.set(list.zone, verdict.status === "listed");
  });
  return health;
}

async function queryList(list, value, kind, dqsKey, healthy) {
  const res = await lookupA(queryName(list, value, { kind, dqsKey }));
  let verdict = interpretAnswer(list, res);
  if (verdict.status === "clear" && !healthy) {
    verdict = { status: "error", detail: "The list didn't answer its test entry, so a clear result can't be trusted. The resolver may be blocked or rate-limited.", codes: [] };
  }
  if (verdict.status === "listed") {
    const txt = await lookupTxt(queryName(list, value, { kind, dqsKey }));
    if (txt.answers[0]) verdict = { ...verdict, detail: `${verdict.detail.replace(/\.$/, "")}. ${txt.answers[0]}`.slice(0, 500) };
  }
  return {
    list: list.zone,
    listName: list.name,
    checkedValue: value,
    status: verdict.status,
    listed: verdict.status === "listed",
    codes: verdict.codes || [],
    detail: verdict.detail,
  };
}

// IPs a domain resolves to through its A record and its MX hosts, deduped and capped.
async function domainIps(domain) {
  const ips = new Set();
  const a = await lookupA(domain);
  a.answers.forEach((ip) => ips.add(ip));
  const mx = await lookupMx(domain);
  for (const m of mx.answers.slice(0, 3)) {
    if (ips.size >= MAX_DOMAIN_IPS) break;
    const host = await lookupA(String(m.exchange).replace(/\.$/, ""));
    host.answers.forEach((ip) => ips.size < MAX_DOMAIN_IPS && ips.add(ip));
  }
  return [...ips].slice(0, MAX_DOMAIN_IPS);
}

export async function checkBlocklists(input) {
  const parsed = typeof input === "string" ? parseTarget(input) : input;
  if (!parsed) return null;
  const dqsKey = String(process.env.SPAMHAUS_DQS_KEY || "").trim();
  const { target, targetType } = parsed;

  if (targetType === "ip") {
    if (parsed.ipv6) {
      return { target, targetType, results: [], note: "IPv6 addresses aren't checked: these lists only publish IPv4 entries." };
    }
    const health = await listHealth(IP_BLOCKLISTS, "ip", dqsKey);
    const results = await mapLimit(IP_BLOCKLISTS, 4, (list) => queryList(list, target, "ip", dqsKey, health.get(list.zone)));
    return { target, targetType, results };
  }

  const ips = await domainIps(target);
  const [domainHealth, ipHealth] = await Promise.all([
    listHealth(DOMAIN_BLOCKLISTS, "domain", dqsKey),
    ips.length ? listHealth(IP_BLOCKLISTS, "ip", dqsKey) : Promise.resolve(new Map()),
  ]);
  const jobs = [
    ...DOMAIN_BLOCKLISTS.map((list) => () => queryList(list, target, "domain", dqsKey, domainHealth.get(list.zone))),
    ...ips.flatMap((ip) => IP_BLOCKLISTS.map((list) => () => queryList(list, ip, "ip", dqsKey, ipHealth.get(list.zone)))),
  ];
  const results = await mapLimit(jobs, 6, (job) => job());
  return { target, targetType, results, resolvedIps: ips };
}

// Appends one run to campaign.blocklist_checks and stamps the linked domain/IP; returns the inserted rows.
export async function saveBlocklistRun(db, { projectId, run, sendingDomainId = null, dedicatedIpId = null, createdBy = null, now = new Date() }) {
  if (!run?.results?.length) return [];
  const runId = randomUUID();
  const checkedAt = now.toISOString();
  const rows = run.results.map((r) => ({
    project_id: projectId,
    target: run.target,
    target_type: run.targetType,
    checked_value: r.checkedValue,
    list: r.list,
    list_name: r.listName,
    status: r.status,
    listed: r.listed,
    detail: r.detail || "",
    codes: r.codes || [],
    run_id: runId,
    sending_domain_id: sendingDomainId,
    dedicated_ip_id: dedicatedIpId,
    checked_at: checkedAt,
    created_by: createdBy,
  }));
  const { data, error } = await db.from("blocklist_checks").insert(rows).select("*");
  if (error) {
    console.error("[deliverability.blocklists.save]", error.message);
    return null;
  }
  if (sendingDomainId) await db.from("sending_domains").update({ blocklist_checked_at: checkedAt }).eq("id", sendingDomainId);
  if (dedicatedIpId) await db.from("dedicated_ips").update({ blocklist_checked_at: checkedAt }).eq("id", dedicatedIpId);
  return data || [];
}

// Finds the registered domain/IP row a target belongs to, so its run links back to it.
export async function linkedTarget(db, projectId, { target, targetType }) {
  if (targetType === "ip") {
    const { data } = await db.from("dedicated_ips").select("id").eq("project_id", projectId).eq("ip", target).is("deleted_at", null).maybeSingle();
    return { dedicatedIpId: data?.id || null, sendingDomainId: null };
  }
  const { data } = await db.from("sending_domains").select("id").eq("project_id", projectId).eq("domain", target).is("deleted_at", null).maybeSingle();
  return { sendingDomainId: data?.id || null, dedicatedIpId: null };
}
