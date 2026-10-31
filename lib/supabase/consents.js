"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";
import { CONSENT_CHANNELS, CONSENT_STATUSES } from "@/lib/audience/contact_model";

// Data layer for campaign.contact_consents — the append-only per-channel opt-in ledger (source, timestamp,
// proof). The latest row per (contact, channel) is the contact's consent. Clients only ever insert.

const TABLE = "contact_consents";
const CHANNEL_KEYS = CONSENT_CHANNELS.map((c) => c.key);

export function normalizeConsent(row) {
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id ?? null,
    contactId: row.contact_id,
    channel: row.channel,
    status: row.status,
    source: row.source ?? "",
    proof: row.proof && typeof row.proof === "object" ? row.proof : {},
    ip: row.ip ?? null,
    userAgent: row.user_agent ?? null,
    capturedAt: row.captured_at ?? row.created_at ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
  };
}

// The ledger for one contact (newest first), or for the project when contactId is omitted.
export async function listConsents(projectId, { contactId = null, channel = null, limit = 500 } = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    let query = schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("captured_at", { ascending: false })
      .limit(limit);
    if (contactId) query = query.eq("contact_id", contactId);
    if (channel) query = query.eq("channel", channel);
    const { data, error } = await query;
    if (error) {
      console.error("[consents.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeConsent);
  } catch (e) {
    console.error("[consents.list]", e);
    return null;
  }
}

// Appends ledger rows: [{ contactId, channel, status, source, proof }] -> created view models, or null.
export async function recordConsents(projectId, entries, { createdBy = null } = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  const rows = (entries || [])
    .filter((e) => e?.contactId && CHANNEL_KEYS.includes(e.channel) && CONSENT_STATUSES.includes(e.status))
    .map((e) => ({
      project_id: projectId,
      contact_id: e.contactId,
      channel: e.channel,
      status: e.status,
      source: String(e.source || "").trim(),
      proof: e.proof && typeof e.proof === "object" ? e.proof : {},
      captured_at: e.capturedAt || new Date().toISOString(),
      created_by: createdBy,
    }));
  if (!rows.length) return [];
  try {
    const out = [];
    for (let i = 0; i < rows.length; i += 500) {
      const { data, error } = await schemaClient().from(TABLE).insert(rows.slice(i, i + 500)).select("*");
      if (error) {
        console.error("[consents.record]", error.message);
        return null;
      }
      out.push(...(data || []).map(normalizeConsent));
    }
    return out;
  } catch (e) {
    console.error("[consents.record]", e);
    return null;
  }
}

export async function recordConsent(projectId, entry, options) {
  const rows = await recordConsents(projectId, [entry], options);
  return rows ? rows[0] ?? null : null;
}
