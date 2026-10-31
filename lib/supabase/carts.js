"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";
import { normalizeLineItem } from "@/lib/supabase/orders";

// Data layer for campaign.carts — carts and checkouts streamed in by stores. The commerce worker marks
// idle carts abandoned and the ingest route closes them as converted / recovered when the order lands.
// Pure: console.error and null / false / [].

const TABLE = "carts";
const SELECT = "*, contact:contact_id(id, email, first_name, last_name, status)";
const bag = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

export function normalizeCart(row) {
  if (!row) return null;
  const contact = row.contact && typeof row.contact === "object" ? row.contact : null;
  const items = Array.isArray(row.items) ? row.items.map(normalizeLineItem) : [];
  const name = contact ? [contact.first_name, contact.last_name].filter(Boolean).join(" ") : "";
  const email = contact?.email || row.customer_email || "";
  return {
    ...bag(row.metadata),
    id: row.id,
    projectId: row.project_id ?? null,
    storeId: row.store_id ?? null,
    contactId: row.contact_id ?? null,
    contactStatus: contact?.status ?? null,
    externalId: row.external_id ?? null,
    customer: name || row.customer_name || email || "Anonymous shopper",
    email,
    items,
    itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
    value: Number(row.value ?? 0),
    currency: row.currency ?? "USD",
    status: row.status ?? "active",
    checkoutUrl: row.checkout_url ?? "",
    lastActivityAt: row.last_activity_at ?? row.updated_at ?? null,
    abandonedAt: row.abandoned_at ?? null,
    recoveredAt: row.recovered_at ?? null,
    recoveredValue: row.recovered_value == null ? null : Number(row.recovered_value),
    orderId: row.order_id ?? null,
    remindersSent: Number(row.reminders_sent ?? 0),
    lastRemindedAt: row.last_reminded_at ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function cartToRow(input) {
  const row = {};
  if ("status" in input) row.status = input.status || "active";
  if ("remindersSent" in input) row.reminders_sent = Math.max(0, Number(input.remindersSent) || 0);
  if ("lastRemindedAt" in input) row.last_reminded_at = input.lastRemindedAt || null;
  if ("metadata" in input) row.metadata = bag(input.metadata);
  return row;
}

// Filters: { statuses, storeId, contactId, since (last activity), limit }.
export async function listCarts(projectId, filters = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  const { statuses, storeId, contactId, since, limit = 1000 } = filters;
  try {
    let query = schemaClient()
      .from(TABLE)
      .select(SELECT)
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("last_activity_at", { ascending: false })
      .limit(limit);
    if (Array.isArray(statuses) && statuses.length) query = query.in("status", statuses);
    if (storeId) query = query.eq("store_id", storeId);
    if (contactId) query = query.eq("contact_id", contactId);
    if (since) query = query.gte("last_activity_at", since);
    const { data, error } = await query;
    if (error) {
      console.error("[carts.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeCart);
  } catch (e) {
    console.error("[carts.list]", e);
    return null;
  }
}

export async function getCart(projectId, id) {
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
      console.error("[carts.get]", error.message);
      return null;
    }
    return normalizeCart(data);
  } catch (e) {
    console.error("[carts.get]", e);
    return null;
  }
}

export async function updateCart(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .update(cartToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select(SELECT)
      .single();
    if (error) {
      console.error("[carts.update]", error.message);
      return null;
    }
    return normalizeCart(data);
  } catch (e) {
    console.error("[carts.update]", e);
    return null;
  }
}

export async function softDeleteCart(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient()
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[carts.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[carts.delete]", e);
    return false;
  }
}
