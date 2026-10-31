import { requireMember } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";
import { getDailySendCap, planUsageToday } from "@/lib/deliverability/warmup";

// Today's warm-up usage for every unfinished plan ({ plans: { [id]: { day, capToday, sentToday, remaining } } })
// and the enforced remaining cap per channel, as the senders see it through getDailySendCap.
export const runtime = "nodejs";

export async function GET(_request, { params }) {
  return handle("deliverability.warmup.usage", async () => {
    const { projectId } = await params;
    const { db } = await requireMember(projectId);
    const { data: plans } = await db
      .from("warmup_plans")
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .neq("status", "completed")
      .limit(100);
    const usage = await Promise.all((plans || []).map((p) => planUsageToday(db, p)));
    const channels = [...new Set((plans || []).map((p) => p.channel))];
    const remaining = Object.fromEntries(
      await Promise.all(channels.map(async (channel) => [channel, await getDailySendCap(db, projectId, { channel })])),
    );
    return { plans: Object.fromEntries(usage.map((u) => [u.planId, u])), remaining };
  });
}
