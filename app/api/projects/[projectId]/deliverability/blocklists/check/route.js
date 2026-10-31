import { requirePermission } from "@/lib/server/auth";
import { badRequest, handle, readJson } from "@/lib/server/http";
import { checkBlocklists, linkedTarget, parseTarget, saveBlocklistRun } from "@/lib/deliverability/blocklist_check";

// Runs a live DNSBL check for an IP or domain (body { target }) and appends it to the history. A target
// that matches a registered sending domain or dedicated IP links its run to that row.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request, { params }) {
  return handle("deliverability.blocklists.check", async () => {
    const { projectId } = await params;
    const { db, user } = await requirePermission(projectId, "campaign.deliverability.manage");
    const body = await readJson(request);
    const parsed = parseTarget(body?.target);
    if (!parsed) throw badRequest("Enter an IPv4 address or a domain name.");
    const link = await linkedTarget(db, projectId, parsed);
    const run = await checkBlocklists(parsed);
    const rows = await saveBlocklistRun(db, { projectId, run, ...link, createdBy: user.id });
    if (rows === null) throw badRequest("Couldn't save the check results.");
    return { target: parsed.target, targetType: parsed.targetType, rows, note: run.note || null, resolvedIps: run.resolvedIps || [] };
  });
}
