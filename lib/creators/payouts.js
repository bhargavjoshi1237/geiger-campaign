import { ApiError, badRequest } from "@/lib/server/http";
import { buildPayoutDrafts, isPeriod, mergePayoutLines, payoutsCsv, periodEnd, round2 } from "./ledger";

// Payout ledger generation and export (server-only, user-scoped db so RLS applies). Generation
// collects approved conversions and completed collaboration fees up to the end of the period that
// aren't on a payout yet, and adds them to the creator's pending payout for that period (or opens one).

export async function generatePayouts(db, { projectId, period, userId = null }) {
  if (!isPeriod(period)) throw badRequest("Choose a month to pay out (YYYY-MM).");
  const end = periodEnd(period);

  const [conversionsRes, collaborationsRes, existingRes] = await Promise.all([
    db
      .from("affiliate_conversions")
      .select("id, creator_id, status, payout_id, revenue, commission, currency, occurred_at")
      .eq("project_id", projectId)
      .eq("status", "approved")
      .is("payout_id", null)
      .is("deleted_at", null)
      .lt("occurred_at", end)
      .limit(5000),
    db
      .from("collaborations")
      .select("id, creator_id, status, payout_id, fee, currency, campaign_name, completed_at, updated_at")
      .eq("project_id", projectId)
      .eq("status", "completed")
      .is("payout_id", null)
      .is("deleted_at", null)
      .gt("fee", 0)
      .limit(2000),
    db.from("payouts").select("*").eq("project_id", projectId).eq("period", period).eq("status", "pending").is("deleted_at", null),
  ]);
  if (conversionsRes.error || collaborationsRes.error || existingRes.error) throw new ApiError(500, "Couldn't load what's owed.");

  const drafts = buildPayoutDrafts({ conversions: conversionsRes.data || [], collaborations: collaborationsRes.data || [], period });
  const existing = new Map((existingRes.data || []).map((p) => [`${p.creator_id}|${p.currency}`, p]));
  const results = [];

  for (const draft of drafts) {
    const prior = existing.get(`${draft.creatorId}|${draft.currency}`);
    let payout;
    if (prior) {
      const { data, error } = await db
        .from("payouts")
        .update({ amount: round2(Number(prior.amount) + draft.amount), lines: mergePayoutLines(prior.lines, draft.lines) })
        .eq("id", prior.id)
        .select("*")
        .single();
      if (error) throw new ApiError(500, "Couldn't update a payout.");
      payout = data;
    } else {
      const { data, error } = await db
        .from("payouts")
        .insert({
          project_id: projectId,
          creator_id: draft.creatorId,
          period,
          amount: draft.amount,
          currency: draft.currency,
          status: "pending",
          lines: draft.lines,
          created_by: userId,
        })
        .select("*")
        .single();
      if (error) throw new ApiError(500, "Couldn't create a payout.");
      payout = data;
    }
    // Claim the lines only while they're still unclaimed, so a concurrent run can't double-pay.
    await Promise.all([
      draft.conversionIds.length
        ? db.from("affiliate_conversions").update({ payout_id: payout.id }).in("id", draft.conversionIds).is("payout_id", null)
        : null,
      draft.collaborationIds.length
        ? db.from("collaborations").update({ payout_id: payout.id }).in("id", draft.collaborationIds).is("payout_id", null)
        : null,
    ]);
    results.push(payout);
  }

  return {
    period,
    created: results.filter((p) => !existing.has(`${p.creator_id}|${p.currency}`)).length,
    updated: results.filter((p) => existing.has(`${p.creator_id}|${p.currency}`)).length,
    total: round2(drafts.reduce((s, d) => s + d.amount, 0)),
    payouts: results,
  };
}

export async function exportPayoutsCsv(db, { projectId, period = null, status = null }) {
  let query = db.from("payouts").select("*").eq("project_id", projectId).is("deleted_at", null).order("period", { ascending: false });
  if (period && isPeriod(period)) query = query.eq("period", period);
  if (status && ["pending", "approved", "paid"].includes(status)) query = query.eq("status", status);
  const { data: payouts, error } = await query.limit(10000);
  if (error) throw new ApiError(500, "Couldn't load payouts.");
  const creatorIds = [...new Set((payouts || []).map((p) => p.creator_id))];
  const { data: creators } = creatorIds.length
    ? await db.from("creators").select("id, name, email").in("id", creatorIds)
    : { data: [] };
  return payoutsCsv(payouts || [], new Map((creators || []).map((c) => [c.id, c])));
}
