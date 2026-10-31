"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";

// Data layer for campaign.payouts — the creator payout ledger. Payouts are generated on the server from
// approved conversions and completed collaboration fees (/creators/payouts/generate); here they are
// approved, marked paid (money moves outside Geiger) or cancelled, which releases their lines.
// Pure: null / false / [].

const TABLE = "payouts";
const bag = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

export function normalizePayout(row) {
  if (!row) return null;
  const lines = bag(row.lines);
  const conversions = bag(lines.conversions);
  return {
    ...bag(row.metadata),
    id: row.id,
    projectId: row.project_id ?? null,
    creatorId: row.creator_id ?? null,
    period: row.period ?? "",
    amount: Number(row.amount ?? 0),
    currency: row.currency || "USD",
    status: row.status ?? "pending",
    lines: {
      conversions: {
        count: Number(conversions.count) || 0,
        commission: Number(conversions.commission) || 0,
        revenue: Number(conversions.revenue) || 0,
      },
      collaborations: Array.isArray(lines.collaborations) ? lines.collaborations : [],
    },
    method: row.method ?? "",
    reference: row.reference ?? "",
    notes: row.notes ?? "",
    approvedAt: row.approved_at ?? null,
    paidAt: row.paid_at ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export async function listPayouts(projectId, { creatorId } = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    let query = schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (creatorId) query = query.eq("creator_id", creatorId);
    const { data, error } = await query;
    if (error) {
      console.error("[payouts.list]", error.message);
      return null;
    }
    return (data || []).map(normalizePayout);
  } catch (e) {
    console.error("[payouts.list]", e);
    return null;
  }
}

async function patchPayout(id, patch, label) {
  const { data, error } = await schemaClient()
    .from(TABLE)
    .update(patch)
    .eq("id", id)
    .is("deleted_at", null)
    .select("*")
    .single();
  if (error) {
    console.error(`[payouts.${label}]`, error.message);
    return null;
  }
  return normalizePayout(data);
}

export async function approvePayout(id) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    return await patchPayout(id, { status: "approved", approved_at: new Date().toISOString() }, "approve");
  } catch (e) {
    console.error("[payouts.approve]", e);
    return null;
  }
}

// Records a payment made outside Geiger and marks its conversions paid.
export async function markPayoutPaid(id, { method = "", reference = "", paidAt = null, notes } = {}) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const at = paidAt ? new Date(paidAt).toISOString() : new Date().toISOString();
    const patch = { status: "paid", paid_at: at, method: String(method || ""), reference: String(reference || "").trim() };
    if (notes !== undefined) patch.notes = String(notes || "");
    const payout = await patchPayout(id, patch, "markPaid");
    if (!payout) return null;
    const { error } = await schemaClient().from("affiliate_conversions").update({ status: "paid" }).eq("payout_id", id);
    if (error) console.error("[payouts.markPaid.conversions]", error.message);
    return payout;
  } catch (e) {
    console.error("[payouts.markPaid]", e);
    return null;
  }
}

export async function updatePayoutNotes(id, notes) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    return await patchPayout(id, { notes: String(notes || "") }, "notes");
  } catch (e) {
    console.error("[payouts.notes]", e);
    return null;
  }
}

// Cancels an unpaid payout: its conversions and collaboration fees go back to "ready to pay out".
export async function cancelPayout(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const sb = schemaClient();
    const released = await Promise.all([
      sb.from("affiliate_conversions").update({ payout_id: null }).eq("payout_id", id),
      sb.from("collaborations").update({ payout_id: null }).eq("payout_id", id),
    ]);
    const failed = released.find((r) => r.error);
    if (failed) {
      console.error("[payouts.cancel.release]", failed.error.message);
      return false;
    }
    const { error } = await sb
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .neq("status", "paid");
    if (error) {
      console.error("[payouts.cancel]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[payouts.cancel]", e);
    return false;
  }
}
