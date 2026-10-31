import { assertUuid, requireMember } from "@/lib/server/auth";
import { ApiError, handle, notFound } from "@/lib/server/http";
import { addDaysIso, warmupDay } from "@/lib/deliverability/warmup_curves";
import { planUsageToday } from "@/lib/deliverability/warmup";

// Warm-up progress from real sends: per-day delivery counts on the plan's channel (and number) since its
// start date, aligned with the scheduled cap, plus today's usage.
export const runtime = "nodejs";

export async function GET(_request, { params }) {
  return handle("deliverability.warmup.progress", async () => {
    const { projectId, planId } = await params;
    assertUuid(planId, "plan id");
    const { db } = await requireMember(projectId);
    const { data: plan } = await db
      .from("warmup_plans")
      .select("*")
      .eq("project_id", projectId)
      .eq("id", planId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!plan) throw notFound("Warm-up plan not found.");

    const { data: counts, error } = await db.rpc("deliverability_daily_sends", {
      p_project: projectId,
      p_channel: plan.channel,
      p_since: `${plan.start_date}T00:00:00Z`,
      p_connection: plan.connection_id || null,
    });
    if (error) throw new ApiError(500, "Couldn't count sends for this plan.", "count_failed");
    const byDate = new Map((counts || []).map((c) => [String(c.day).slice(0, 10), Number(c.sent) || 0]));
    const schedule = Array.isArray(plan.schedule) ? plan.schedule : [];
    const lastDay = Math.min(schedule.length, Math.max(0, warmupDay(plan)));
    const days = schedule.slice(0, Math.max(lastDay, 0)).map((s) => {
      const date = addDaysIso(plan.start_date, s.day - 1);
      return { day: s.day, date, cap: s.cap, sent: byDate.get(date) || 0 };
    });
    return { days, today: await planUsageToday(db, plan) };
  });
}
