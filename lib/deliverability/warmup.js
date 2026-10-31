import { capForDay, planState, warmupDay } from "./warmup_curves.js";

// IP/number warm-up caps (server-only): the most messages a project may still send today on a channel
// under its active warm-up plans, or null when no plan caps it. Today's cap is the sum of every active
// plan's scheduled cap (one per IP/number) minus today's sends on that channel from campaign.deliveries
// (anything not failed / not_sent, UTC day). Pass connectionId to scope to one number's plan.
// WhatsApp caps are also clamped to the connection's reported Meta limit (health.messagingLimit) when known.

const startOfUtcDay = (now) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();

export async function getDailySendCap(db, projectId, { channel = "email", connectionId = null, now = new Date() } = {}) {
  if (!db || !projectId) return null;
  try {
    let query = db
      .from("warmup_plans")
      .select("id, channel, connection_id, start_date, schedule, status, paused_at")
      .eq("project_id", projectId)
      .eq("channel", channel)
      .eq("status", "active")
      .is("deleted_at", null);
    if (connectionId) query = query.eq("connection_id", connectionId);
    const { data: plans, error } = await query;
    if (error) {
      console.error("[deliverability.warmup.plans]", error.message);
      return null;
    }

    let cap = 0;
    let capped = false;
    const limits = new Map();
    for (const plan of plans || []) {
      if (planState(plan, now) !== "active") continue;
      const dayCap = capForDay(plan.schedule, warmupDay(plan, now));
      if (dayCap == null) continue;
      cap += dayCap;
      capped = true;
      if (plan.connection_id) limits.set(plan.connection_id, dayCap);
    }
    if (!capped) return null;

    if (channel === "whatsapp" && limits.size) {
      const { data: connections } = await db.from("channel_connections").select("id, health").in("id", [...limits.keys()]);
      for (const c of connections || []) {
        const limit = Number(c.health?.messagingLimit);
        if (Number.isFinite(limit) && limit > 0 && limit < limits.get(c.id)) cap -= limits.get(c.id) - limit;
      }
    }

    let sent = db
      .from("deliveries")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .eq("channel", channel)
      .gte("created_at", startOfUtcDay(now))
      .not("status", "in", "(failed,not_sent)");
    if (connectionId) sent = sent.eq("connection_id", connectionId);
    const { count, error: countError } = await sent;
    if (countError) {
      console.error("[deliverability.warmup.sent]", countError.message);
      return 0;
    }
    return Math.max(0, cap - (count || 0));
  } catch (e) {
    console.error("[deliverability.warmup]", e);
    return null;
  }
}

// Today's cap, sends and remaining for one plan row (raw snake_case), for the screens' summary route.
export async function planUsageToday(db, plan, { now = new Date() } = {}) {
  const day = warmupDay(plan, now);
  const capToday = planState(plan, now) === "active" ? capForDay(plan.schedule, day) : null;
  let query = db
    .from("deliveries")
    .select("id", { count: "exact", head: true })
    .eq("project_id", plan.project_id)
    .eq("channel", plan.channel)
    .gte("created_at", startOfUtcDay(now))
    .not("status", "in", "(failed,not_sent)");
  if (plan.connection_id) query = query.eq("connection_id", plan.connection_id);
  const { count } = await query;
  const sentToday = count || 0;
  return { planId: plan.id, day, capToday, sentToday, remaining: capToday == null ? null : Math.max(0, capToday - sentToday) };
}
