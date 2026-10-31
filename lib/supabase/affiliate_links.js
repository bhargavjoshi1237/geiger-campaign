"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";

// Data layer for campaign.affiliate_links and campaign.affiliate_conversions. Links redirect through
// /a/<code> (server, counts clicks); conversions are attributed by the creators worker from
// order_completed events and approved or rejected here. Pure: null / false / [].

const TABLE = "affiliate_links";
const CONVERSIONS = "affiliate_conversions";
const bag = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

export function normalizeAffiliateLink(row) {
  if (!row) return null;
  const commission = bag(row.commission);
  return {
    ...bag(row.metadata),
    id: row.id,
    projectId: row.project_id ?? null,
    creatorId: row.creator_id ?? null,
    code: row.code ?? "",
    name: row.name ?? "",
    destinationUrl: row.destination_url ?? "",
    discountCode: row.discount_code ?? "",
    couponId: row.coupon_id ?? null,
    commission: {
      kind: commission.kind === "flat" ? "flat" : "percent",
      value: Number(commission.value ?? 0),
      holdDays: Math.max(0, Number(commission.holdDays) || 0),
    },
    currency: row.currency || "USD",
    attributionWindowDays: Number(row.attribution_window_days ?? 30),
    status: row.status ?? "active",
    clicks: Number(row.clicks ?? 0),
    conversions: Number(row.conversions ?? 0),
    revenue: Number(row.revenue ?? 0),
    commissionEarned: Number(row.commission_earned ?? 0),
    lastClickAt: row.last_click_at ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function normalizeCode(value) {
  return String(value || "").trim().replace(/\s+/g, "-").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
}

export function affiliateLinkToRow(input) {
  const row = {};
  if ("creatorId" in input) row.creator_id = input.creatorId;
  if ("code" in input) row.code = normalizeCode(input.code);
  if ("name" in input) row.name = String(input.name || "").trim();
  if ("destinationUrl" in input) row.destination_url = String(input.destinationUrl || "").trim();
  if ("discountCode" in input) row.discount_code = String(input.discountCode || "").trim().toUpperCase() || null;
  if ("couponId" in input) row.coupon_id = input.couponId || null;
  if ("commission" in input) {
    const c = bag(input.commission);
    row.commission = {
      kind: c.kind === "flat" ? "flat" : "percent",
      value: Math.max(0, Number(c.value) || 0),
      holdDays: Math.max(0, Math.round(Number(c.holdDays) || 0)),
    };
  }
  if ("currency" in input) row.currency = String(input.currency || "USD").toUpperCase();
  if ("attributionWindowDays" in input) row.attribution_window_days = Math.min(365, Math.max(1, Math.round(Number(input.attributionWindowDays) || 30)));
  if ("status" in input) row.status = input.status === "paused" ? "paused" : "active";
  if ("createdBy" in input) row.created_by = input.createdBy || null;
  if ("metadata" in input) row.metadata = bag(input.metadata);
  return row;
}

export function normalizeConversion(row) {
  if (!row) return null;
  return {
    ...bag(row.metadata),
    id: row.id,
    projectId: row.project_id ?? null,
    affiliateLinkId: row.affiliate_link_id ?? null,
    creatorId: row.creator_id ?? null,
    trackedEventId: row.tracked_event_id ?? null,
    contactId: row.contact_id ?? null,
    orderExternalId: row.order_external_id ?? "",
    revenue: Number(row.revenue ?? 0),
    commission: Number(row.commission ?? 0),
    currency: row.currency || "USD",
    attributedVia: row.attributed_via || "code",
    status: row.status ?? "pending",
    payoutId: row.payout_id ?? null,
    occurredAt: row.occurred_at ?? row.created_at ?? null,
    approvedAt: row.approved_at ?? null,
    createdAt: row.created_at ?? null,
  };
}

export async function listAffiliateLinks(projectId, { creatorId } = {}) {
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
      console.error("[affiliate_links.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeAffiliateLink);
  } catch (e) {
    console.error("[affiliate_links.list]", e);
    return null;
  }
}

export async function createAffiliateLink(projectId, input) {
  if (!projectId || !input?.creatorId || !isSupabaseConfigured()) return null;
  try {
    const payload = { ...affiliateLinkToRow(input), project_id: projectId };
    if (input.id) payload.id = input.id;
    const { data, error } = await schemaClient().from(TABLE).insert(payload).select("*").single();
    if (error) {
      console.error("[affiliate_links.create]", error.message);
      return null;
    }
    return normalizeAffiliateLink(data);
  } catch (e) {
    console.error("[affiliate_links.create]", e);
    return null;
  }
}

export async function updateAffiliateLink(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .update(affiliateLinkToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[affiliate_links.update]", error.message);
      return null;
    }
    return normalizeAffiliateLink(data);
  } catch (e) {
    console.error("[affiliate_links.update]", e);
    return null;
  }
}

export async function softDeleteAffiliateLink(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient()
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString(), status: "paused" })
      .eq("id", id);
    if (error) {
      console.error("[affiliate_links.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[affiliate_links.delete]", e);
    return false;
  }
}

// Filters: { linkId, creatorId, status, payoutId, limit }.
export async function listAffiliateConversions(projectId, { linkId, creatorId, status, payoutId, limit = 2000 } = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    let query = schemaClient()
      .from(CONVERSIONS)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("occurred_at", { ascending: false })
      .limit(limit);
    if (linkId) query = query.eq("affiliate_link_id", linkId);
    if (creatorId) query = query.eq("creator_id", creatorId);
    if (status) query = query.eq("status", status);
    if (payoutId) query = query.eq("payout_id", payoutId);
    const { data, error } = await query;
    if (error) {
      console.error("[affiliate_links.conversions]", error.message);
      return null;
    }
    return (data || []).map(normalizeConversion);
  } catch (e) {
    console.error("[affiliate_links.conversions]", e);
    return null;
  }
}

// Approve or reject one or more conversions (paid is set by the payout ledger, not here).
export async function setConversionsStatus(ids, status) {
  if (!Array.isArray(ids) || !ids.length || !["pending", "approved", "rejected"].includes(status) || !isSupabaseConfigured()) {
    return false;
  }
  try {
    const patch = { status, approved_at: status === "approved" ? new Date().toISOString() : null };
    const { error } = await schemaClient()
      .from(CONVERSIONS)
      .update(patch)
      .in("id", ids)
      .is("payout_id", null);
    if (error) {
      console.error("[affiliate_links.setConversionsStatus]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[affiliate_links.setConversionsStatus]", e);
    return false;
  }
}

// Commerce coupons (campaign.coupons) to link a discount code to. [] when Commerce isn't set up.
export async function listCommerceCoupons(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from("coupons")
      .select("id, code, kind, value, status")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) {
      console.error("[affiliate_links.coupons]", error.message);
      return [];
    }
    return (data || []).map((c) => ({
      id: c.id,
      code: String(c.code || "").toUpperCase(),
      kind: c.kind || "percent",
      value: Number(c.value ?? 0),
      status: c.status || "active",
    }));
  } catch (e) {
    console.error("[affiliate_links.coupons]", e);
    return [];
  }
}
