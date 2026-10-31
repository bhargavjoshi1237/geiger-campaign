import { checkBlocklists, saveBlocklistRun } from "./blocklist_check.js";
import { checkReverseDns } from "./dns.js";
import { verifyAndSaveDomain } from "./verify.js";
import { planState } from "./warmup_curves.js";

// deliverability worker job, run by app/api/internal/worker on every scheduler tick (server-only).
// Daily, in bounded batches: re-verify sending domains' DNS, re-check reverse DNS and blocklists for
// dedicated IPs and domains, and complete warm-up plans that ran past their schedule. Idempotent: each
// item is due again only 24h after its last check.
export const name = "deliverability";

const DAY_MS = 24 * 60 * 60 * 1000;
const DOMAIN_BATCH = 10;
const IP_BATCH = 10;
const BLOCKLIST_DOMAIN_BATCH = 5;
const SAFETY_MS = 20_000;

const due = (column, cutoff) => `${column}.is.null,${column}.lt.${cutoff}`;

async function previousListings(db, projectId, target) {
  const { data } = await db
    .from("blocklist_checks")
    .select("run_id, list, checked_value, status")
    .eq("project_id", projectId)
    .eq("target", target)
    .is("deleted_at", null)
    .order("checked_at", { ascending: false })
    .limit(40);
  const runId = data?.[0]?.run_id;
  return new Set((data || []).filter((r) => r.run_id === runId && r.status === "listed").map((r) => `${r.list}|${r.checked_value}`));
}

async function blocklistRun(db, { projectId, target, sendingDomainId = null, dedicatedIpId = null }) {
  const before = await previousListings(db, projectId, target);
  const run = await checkBlocklists(target);
  if (!run) return { listed: 0, newlyListed: 0 };
  await saveBlocklistRun(db, { projectId, run, sendingDomainId, dedicatedIpId });
  const listed = run.results.filter((r) => r.listed);
  return { listed: listed.length, newlyListed: listed.filter((r) => !before.has(`${r.list}|${r.checkedValue}`)).length };
}

export async function run({ db, now = new Date(), deadline = Date.now() + 60_000 }) {
  const summary = { domainsVerified: 0, ipsChecked: 0, domainsBlocklisted: 0, listings: 0, newListings: 0, plansCompleted: 0 };
  const cutoff = new Date(now.getTime() - DAY_MS).toISOString();
  const timeLeft = () => Date.now() < deadline - SAFETY_MS;

  // 1. DNS re-verification.
  const { data: domains } = await db
    .from("sending_domains")
    .select("*")
    .is("deleted_at", null)
    .or(due("last_checked_at", cutoff))
    .order("last_checked_at", { ascending: true, nullsFirst: true })
    .limit(DOMAIN_BATCH);
  for (const row of domains || []) {
    if (!timeLeft()) break;
    if (await verifyAndSaveDomain(db, row, { now })) summary.domainsVerified += 1;
  }

  // 2. Dedicated IPs: reverse DNS + IP blocklists.
  const { data: ips } = await db
    .from("dedicated_ips")
    .select("id, project_id, ip, expected_rdns")
    .is("deleted_at", null)
    .or(due("blocklist_checked_at", cutoff))
    .order("blocklist_checked_at", { ascending: true, nullsFirst: true })
    .limit(IP_BATCH);
  for (const ip of ips || []) {
    if (!timeLeft()) break;
    const rdns = await checkReverseDns(ip.ip, ip.expected_rdns);
    await db
      .from("dedicated_ips")
      .update({ reverse_dns: rdns.hostname, rdns_status: rdns.status, rdns_checked_at: now.toISOString() })
      .eq("id", ip.id);
    const res = await blocklistRun(db, { projectId: ip.project_id, target: ip.ip, dedicatedIpId: ip.id });
    summary.ipsChecked += 1;
    summary.listings += res.listed;
    summary.newListings += res.newlyListed;
  }

  // 3. Sending domains: domain lists + the IPs behind their A/MX records.
  const { data: listedDomains } = await db
    .from("sending_domains")
    .select("id, project_id, domain")
    .is("deleted_at", null)
    .or(due("blocklist_checked_at", cutoff))
    .order("blocklist_checked_at", { ascending: true, nullsFirst: true })
    .limit(BLOCKLIST_DOMAIN_BATCH);
  for (const d of listedDomains || []) {
    if (!timeLeft()) break;
    const res = await blocklistRun(db, { projectId: d.project_id, target: d.domain, sendingDomainId: d.id });
    summary.domainsBlocklisted += 1;
    summary.listings += res.listed;
    summary.newListings += res.newlyListed;
  }

  // 4. Warm-up plans that ran past their last scheduled day; their IPs move from warming to active.
  const { data: plans } = await db
    .from("warmup_plans")
    .select("id, start_date, schedule, status")
    .eq("status", "active")
    .is("deleted_at", null)
    .limit(200);
  const finished = (plans || []).filter((p) => planState(p, now) === "completed").map((p) => p.id);
  if (finished.length) {
    await db.from("warmup_plans").update({ status: "completed", completed_at: now.toISOString() }).in("id", finished);
    await db.from("dedicated_ips").update({ status: "active" }).in("warmup_plan_id", finished).eq("status", "warming");
    summary.plansCompleted = finished.length;
  }

  return summary;
}
