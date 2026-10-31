"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";
import { isValidEmail, normalizeEmail, normalizePhone } from "@/lib/audience/contact_model";

// Data layer for campaign.suppressions — addresses (email, phone, whole domains) that never receive sends.
// lib/audience/resolve.js honours every active row. Pure: null / false / [] on failure.

const TABLE = "suppressions";

export const SUPPRESSION_KINDS = ["email", "phone", "domain"];
export const SUPPRESSION_REASONS = ["unsubscribed", "hard_bounce", "complaint", "manual", "invalid"];

const DOMAIN = /^@?([a-z0-9-]+\.)+[a-z]{2,}$/i;

// Detects the kind of a raw address and normalises it -> { kind, value } or null when it's not usable.
export function parseSuppressionAddress(raw, kindHint = null) {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  if (kindHint === "domain" || (!kindHint && DOMAIN.test(text))) {
    const value = normalizeEmail(text.replace(/^@/, ""));
    return DOMAIN.test(value) ? { kind: "domain", value } : null;
  }
  if (kindHint === "email" || text.includes("@")) {
    const value = normalizeEmail(text);
    return isValidEmail(value) ? { kind: "email", value } : null;
  }
  const value = normalizePhone(text);
  return value.replace(/\D/g, "").length >= 6 ? { kind: "phone", value } : null;
}

export function normalizeSuppression(row) {
  if (!row) return null;
  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    ...meta,
    id: row.id,
    projectId: row.project_id ?? null,
    kind: SUPPRESSION_KINDS.includes(row.kind) ? row.kind : "email",
    value: row.value ?? "",
    reason: SUPPRESSION_REASONS.includes(row.reason) ? row.reason : "manual",
    source: row.source ?? "",
    note: meta.note ?? "",
    expiresAt: row.expires_at ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function suppressionToRow(input) {
  const row = {};
  if ("kind" in input) row.kind = SUPPRESSION_KINDS.includes(input.kind) ? input.kind : "email";
  if ("value" in input) row.value = String(input.value || "").trim().toLowerCase();
  if ("reason" in input) row.reason = SUPPRESSION_REASONS.includes(input.reason) ? input.reason : "manual";
  if ("source" in input) row.source = String(input.source || "").trim();
  if ("expiresAt" in input) row.expires_at = input.expiresAt || null;
  if ("createdBy" in input) row.created_by = input.createdBy || null;
  if ("note" in input) row.metadata = { note: String(input.note || "").trim() };
  return row;
}

export async function listSuppressions(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const out = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await schemaClient()
        .from(TABLE)
        .select("*")
        .eq("project_id", projectId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, from + 999);
      if (error) {
        console.error("[suppressions.list]", error.message);
        return null;
      }
      out.push(...(data || []).map(normalizeSuppression));
      if (!data || data.length < 1000) break;
    }
    return out;
  } catch (e) {
    console.error("[suppressions.list]", e);
    return null;
  }
}

export async function createSuppression(projectId, input) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const payload = { ...suppressionToRow(input), project_id: projectId };
    if (input.id) payload.id = input.id;
    const { data, error } = await schemaClient().from(TABLE).insert(payload).select("*").single();
    if (error) {
      console.error("[suppressions.create]", error.message);
      return null;
    }
    return normalizeSuppression(data);
  } catch (e) {
    console.error("[suppressions.create]", e);
    return null;
  }
}

// Bulk insert of new rows (callers drop addresses already on the list) -> created view models, or null.
export async function createSuppressions(projectId, inputs) {
  if (!projectId || !isSupabaseConfigured()) return null;
  if (!inputs?.length) return [];
  try {
    const out = [];
    for (let i = 0; i < inputs.length; i += 500) {
      const rows = inputs.slice(i, i + 500).map((input) => ({ ...suppressionToRow(input), project_id: projectId, ...(input.id ? { id: input.id } : {}) }));
      const { data, error } = await schemaClient().from(TABLE).insert(rows).select("*");
      if (error) {
        console.error("[suppressions.createMany]", error.message);
        return null;
      }
      out.push(...(data || []).map(normalizeSuppression));
    }
    return out;
  } catch (e) {
    console.error("[suppressions.createMany]", e);
    return null;
  }
}

export async function updateSuppression(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .update(suppressionToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[suppressions.update]", error.message);
      return null;
    }
    return normalizeSuppression(data);
  } catch (e) {
    console.error("[suppressions.update]", e);
    return null;
  }
}

// Lifting a suppression (the address can receive sends again) is a soft delete; restore undoes it.
export async function softDeleteSuppression(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient().from(TABLE).update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      console.error("[suppressions.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[suppressions.delete]", e);
    return false;
  }
}

export async function restoreSuppression(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient().from(TABLE).update({ deleted_at: null }).eq("id", id);
    if (error) {
      console.error("[suppressions.restore]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[suppressions.restore]", e);
    return false;
  }
}
