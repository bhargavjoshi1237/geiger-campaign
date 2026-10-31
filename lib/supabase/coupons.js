"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";

// Data layer for campaign.coupons and campaign.coupon_codes. Coupons are edited here; single-use codes
// are generated server-side (cryptographically random) by the coupon codes route and only read here.
// Redemptions are counted by the ingest route when an order arrives. Pure: null / false / [].

const TABLE = "coupons";
const CODES = "coupon_codes";
const PAGE = 1000;
const bag = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
const intOrNull = (v) => (v == null || v === "" ? null : Math.max(0, Math.trunc(Number(v) || 0)));

export function normalizeCoupon(row) {
  if (!row) return null;
  return {
    ...bag(row.metadata),
    id: row.id,
    projectId: row.project_id ?? null,
    storeId: row.store_id ?? null,
    code: row.code ?? "",
    kind: row.kind ?? "percent",
    value: Number(row.value ?? 0),
    minSubtotal: Number(row.min_subtotal ?? 0),
    usageLimit: row.usage_limit == null ? null : Number(row.usage_limit),
    perCustomerLimit: row.per_customer_limit == null ? null : Number(row.per_customer_limit),
    usedCount: Number(row.used_count ?? 0),
    startsAt: row.starts_at ?? null,
    expiresAt: row.expires_at ?? null,
    uniqueCodes: Boolean(row.unique_codes),
    status: row.status ?? "active",
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function couponToRow(input) {
  const row = {};
  if ("storeId" in input) row.store_id = input.storeId || null;
  if ("code" in input) row.code = String(input.code || "").trim().toUpperCase().replace(/\s+/g, "");
  if ("kind" in input) row.kind = input.kind || "percent";
  if ("value" in input) row.value = Math.max(0, Number(input.value) || 0);
  if ("minSubtotal" in input) row.min_subtotal = Math.max(0, Number(input.minSubtotal) || 0);
  if ("usageLimit" in input) row.usage_limit = intOrNull(input.usageLimit);
  if ("perCustomerLimit" in input) row.per_customer_limit = intOrNull(input.perCustomerLimit);
  if ("startsAt" in input) row.starts_at = input.startsAt || null;
  if ("expiresAt" in input) row.expires_at = input.expiresAt || null;
  if ("uniqueCodes" in input) row.unique_codes = Boolean(input.uniqueCodes);
  if ("status" in input) row.status = input.status === "paused" ? "paused" : "active";
  if ("createdBy" in input) row.created_by = input.createdBy ?? null;
  if ("metadata" in input) row.metadata = bag(input.metadata);
  return row;
}

export function normalizeCouponCode(row) {
  if (!row) return null;
  return {
    id: row.id,
    couponId: row.coupon_id ?? null,
    code: row.code ?? "",
    batch: row.batch ?? "",
    contactId: row.contact_id ?? null,
    orderId: row.order_id ?? null,
    redeemedAt: row.redeemed_at ?? null,
    createdAt: row.created_at ?? null,
  };
}

export async function listCoupons(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[coupons.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeCoupon);
  } catch (e) {
    console.error("[coupons.list]", e);
    return null;
  }
}

export async function getCoupon(projectId, id) {
  if (!projectId || !id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) {
      console.error("[coupons.get]", error.message);
      return null;
    }
    return normalizeCoupon(data);
  } catch (e) {
    console.error("[coupons.get]", e);
    return null;
  }
}

export async function createCoupon(projectId, input) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const payload = { status: "active", used_count: 0, unique_codes: false, ...couponToRow(input), project_id: projectId };
    if (input.id) payload.id = input.id;
    const { data, error } = await schemaClient().from(TABLE).insert(payload).select("*").single();
    if (error) {
      console.error("[coupons.create]", error.message);
      return null;
    }
    return normalizeCoupon(data);
  } catch (e) {
    console.error("[coupons.create]", e);
    return null;
  }
}

export async function updateCoupon(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .update(couponToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[coupons.update]", error.message);
      return null;
    }
    return normalizeCoupon(data);
  } catch (e) {
    console.error("[coupons.update]", e);
    return null;
  }
}

export async function softDeleteCoupon(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient()
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[coupons.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[coupons.delete]", e);
    return false;
  }
}

// Every single-use code of a coupon, newest first, paged through PostgREST's row cap (export-sized).
export async function listCouponCodes(projectId, couponId, { limit = 50000 } = {}) {
  if (!projectId || !couponId || !isSupabaseConfigured()) return null;
  try {
    const rows = [];
    for (let from = 0; from < limit; from += PAGE) {
      const to = Math.min(from + PAGE, limit) - 1;
      const { data, error } = await schemaClient()
        .from(CODES)
        .select("*")
        .eq("project_id", projectId)
        .eq("coupon_id", couponId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to);
      if (error) {
        console.error("[coupons.listCodes]", error.message);
        return null;
      }
      rows.push(...(data || []));
      if (!data || data.length < to - from + 1) break;
    }
    return rows.map(normalizeCouponCode);
  } catch (e) {
    console.error("[coupons.listCodes]", e);
    return null;
  }
}

// { total, redeemed } for one coupon's single-use codes; null on failure.
export async function countCouponCodes(projectId, couponId) {
  if (!projectId || !couponId || !isSupabaseConfigured()) return null;
  try {
    const base = () =>
      schemaClient()
        .from(CODES)
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId)
        .eq("coupon_id", couponId)
        .is("deleted_at", null);
    const [all, redeemed] = await Promise.all([base(), base().not("redeemed_at", "is", null)]);
    if (all.error || redeemed.error) {
      console.error("[coupons.countCodes]", all.error?.message || redeemed.error?.message);
      return null;
    }
    return { total: all.count ?? 0, redeemed: redeemed.count ?? 0 };
  } catch (e) {
    console.error("[coupons.countCodes]", e);
    return null;
  }
}
