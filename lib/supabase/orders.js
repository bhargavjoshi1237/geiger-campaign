"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";

// Data layer for campaign.orders — orders streamed in by connected stores (server ingest writes them;
// screens read them, correct their status and remove them from Geiger). Each row carries its
// last-click campaign attribution. Pure: console.error and null / false / [].

const TABLE = "orders";
const SELECT = "*, contact:contact_id(id, email, first_name, last_name)";
const bag = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

export function normalizeLineItem(item) {
  const i = bag(item);
  return {
    productId: i.product_id ?? null,
    externalId: i.external_id ?? null,
    title: i.title ?? "Item",
    sku: i.sku ?? "",
    quantity: Number(i.quantity ?? 1),
    price: Number(i.price ?? 0),
    imageUrl: i.image_url ?? "",
    url: i.url ?? "",
  };
}

function contactName(contact) {
  if (!contact) return "";
  return [contact.first_name, contact.last_name].filter(Boolean).join(" ");
}

export function normalizeOrder(row) {
  if (!row) return null;
  const contact = row.contact && typeof row.contact === "object" ? row.contact : null;
  const items = Array.isArray(row.items) ? row.items.map(normalizeLineItem) : [];
  const email = contact?.email || row.customer_email || "";
  const attribution = bag(row.attribution);
  return {
    ...bag(row.metadata),
    id: row.id,
    projectId: row.project_id ?? null,
    storeId: row.store_id ?? null,
    contactId: row.contact_id ?? null,
    cartId: row.cart_id ?? null,
    externalId: row.external_id ?? null,
    number: row.number || (row.external_id ? `#${row.external_id}` : "—"),
    customer: contactName(contact) || row.customer_name || email || "Guest",
    email,
    subtotal: Number(row.subtotal ?? 0),
    discount: Number(row.discount ?? 0),
    shipping: Number(row.shipping ?? 0),
    tax: Number(row.tax ?? 0),
    total: Number(row.total ?? 0),
    refundedAmount: Number(row.refunded_amount ?? 0),
    currency: row.currency ?? "USD",
    items,
    itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
    status: row.status ?? "paid",
    couponCode: row.coupon_code ?? "",
    placedAt: row.placed_at ?? row.created_at ?? null,
    attributedCampaignId: row.attributed_campaign_id ?? null,
    attribution: {
      model: attribution.model ?? "last_click",
      windowDays: Number(attribution.window_days ?? 5),
      deliveryId: attribution.delivery_id ?? null,
      campaignId: attribution.campaign_id ?? row.attributed_campaign_id ?? null,
      sourceType: attribution.source_type ?? null,
      sourceId: attribution.source_id ?? null,
      clickedAt: attribution.clicked_at ?? null,
    },
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

// Screens only correct status / refund amount and customer details; everything else comes from the store.
export function orderToRow(input) {
  const row = {};
  if ("status" in input) row.status = input.status || "paid";
  if ("refundedAmount" in input) row.refunded_amount = Math.max(0, Number(input.refundedAmount) || 0);
  if ("customerName" in input) row.customer_name = String(input.customerName || "").trim();
  if ("customerEmail" in input) row.customer_email = String(input.customerEmail || "").trim().toLowerCase() || null;
  if ("metadata" in input) row.metadata = bag(input.metadata);
  return row;
}

// Filters: { storeId, contactId, campaignId, since, withCoupon, limit }.
export async function listOrders(projectId, filters = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  const { storeId, contactId, campaignId, since, withCoupon, limit = 1000 } = filters;
  try {
    let query = schemaClient()
      .from(TABLE)
      .select(SELECT)
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("placed_at", { ascending: false })
      .limit(limit);
    if (storeId) query = query.eq("store_id", storeId);
    if (contactId) query = query.eq("contact_id", contactId);
    if (campaignId) query = query.eq("attributed_campaign_id", campaignId);
    if (since) query = query.gte("placed_at", since);
    if (withCoupon) query = query.not("coupon_code", "is", null);
    const { data, error } = await query;
    if (error) {
      console.error("[orders.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeOrder);
  } catch (e) {
    console.error("[orders.list]", e);
    return null;
  }
}

export async function countOrders(projectId, { storeId, since } = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    let query = schemaClient()
      .from(TABLE)
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .is("deleted_at", null);
    if (storeId) query = query.eq("store_id", storeId);
    if (since) query = query.gte("placed_at", since);
    const { count, error } = await query;
    if (error) {
      console.error("[orders.count]", error.message);
      return null;
    }
    return count ?? 0;
  } catch (e) {
    console.error("[orders.count]", e);
    return null;
  }
}

export async function getOrder(projectId, id) {
  if (!projectId || !id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .select(SELECT)
      .eq("project_id", projectId)
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) {
      console.error("[orders.get]", error.message);
      return null;
    }
    return normalizeOrder(data);
  } catch (e) {
    console.error("[orders.get]", e);
    return null;
  }
}

export async function updateOrder(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .update(orderToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select(SELECT)
      .single();
    if (error) {
      console.error("[orders.update]", error.message);
      return null;
    }
    return normalizeOrder(data);
  } catch (e) {
    console.error("[orders.update]", e);
    return null;
  }
}

// Removes the order from Geiger's reporting only; the store keeps its own copy.
export async function softDeleteOrder(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient()
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[orders.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[orders.delete]", e);
    return false;
  }
}
