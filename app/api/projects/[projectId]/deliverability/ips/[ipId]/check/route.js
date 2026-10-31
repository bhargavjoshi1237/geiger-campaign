import { assertUuid, requirePermission } from "@/lib/server/auth";
import { handle, notFound } from "@/lib/server/http";
import { checkBlocklists, saveBlocklistRun } from "@/lib/deliverability/blocklist_check";
import { checkReverseDns } from "@/lib/deliverability/dns";

// Checks one dedicated IP now: forward-confirmed reverse DNS (live PTR + A lookup) and every IP blocklist.
// Returns the updated IP row and the blocklist rows written for this run.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(_request, { params }) {
  return handle("deliverability.ips.check", async () => {
    const { projectId, ipId } = await params;
    assertUuid(ipId, "IP id");
    const { db, user } = await requirePermission(projectId, "campaign.deliverability.manage");
    const { data: ip } = await db
      .from("dedicated_ips")
      .select("*")
      .eq("project_id", projectId)
      .eq("id", ipId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!ip) throw notFound("Dedicated IP not found.");

    const [rdns, run] = await Promise.all([checkReverseDns(ip.ip, ip.expected_rdns), checkBlocklists(ip.ip)]);
    await db
      .from("dedicated_ips")
      .update({ reverse_dns: rdns.hostname, rdns_status: rdns.status, rdns_checked_at: new Date().toISOString() })
      .eq("id", ip.id);
    const checks = run ? await saveBlocklistRun(db, { projectId, run, dedicatedIpId: ip.id, createdBy: user.id }) : [];
    const { data: updated } = await db.from("dedicated_ips").select("*").eq("id", ip.id).single();
    return { ip: updated, rdns, checks: checks || [], note: run?.note || null };
  });
}
