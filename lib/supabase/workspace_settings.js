"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";
import {
  mergeSettings,
  normalizeAdvanced,
  normalizeBilling,
  normalizeGeneral,
  normalizeSending,
  normalizeTracking,
} from "@/lib/settings/defaults";

// Data layer for campaign.workspace_settings — one row per project holding the general, sending, tracking,
// advanced and billing sections (defaults in lib/settings/defaults.js). Also the read-only usage counts the
// Billing screen meters (contacts, sends and provider cost this cycle) and the connection rows the
// Connections overview lists. Pure: console.error on failure and return null / false / [] — never throw.

const TABLE = "workspace_settings";
const PAGE = 1000;
const bag = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

const SECTION_NORMALIZERS = {
  general: normalizeGeneral,
  sending: normalizeSending,
  tracking: normalizeTracking,
  advanced: normalizeAdvanced,
  billing: normalizeBilling,
};

// Row (or null when the project has none yet) -> complete sections with defaults.
export function normalizeWorkspaceSettings(row) {
  return {
    ...bag(row?.metadata),
    ...mergeSettings(row),
    id: row?.id ?? null,
    projectId: row?.project_id ?? null,
    exists: Boolean(row),
    createdAt: row?.created_at ?? null,
    updatedAt: row?.updated_at ?? null,
  };
}

// camelCase patch -> columns; only the sections present in the patch are emitted (each fully normalized).
export function workspaceSettingsToRow(input) {
  const row = {};
  for (const [section, normalize] of Object.entries(SECTION_NORMALIZERS)) {
    if (section in input) row[section] = normalize(input[section]);
  }
  if ("metadata" in input) row.metadata = bag(input.metadata);
  if ("createdBy" in input) row.created_by = input.createdBy || null;
  return row;
}

export async function getWorkspaceSettings(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient().from(TABLE).select("*").eq("project_id", projectId).maybeSingle();
    if (error) {
      console.error("[workspace_settings.get]", error.message);
      return null;
    }
    return normalizeWorkspaceSettings(data);
  } catch (e) {
    console.error("[workspace_settings.get]", e);
    return null;
  }
}

// Upserts the project's row, writing only the sections in `patch` ({ general, sending, … }).
export async function saveWorkspaceSettings(projectId, patch, { createdBy = null } = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const payload = { ...workspaceSettingsToRow(patch), project_id: projectId };
    if (createdBy) payload.created_by = createdBy;
    const { data, error } = await schemaClient().from(TABLE).upsert(payload, { onConflict: "project_id" }).select("*").single();
    if (error) {
      console.error("[workspace_settings.save]", error.message);
      return null;
    }
    return normalizeWorkspaceSettings(data);
  } catch (e) {
    console.error("[workspace_settings.save]", e);
    return null;
  }
}

async function count(table, apply) {
  const { count: n, error } = await apply(schemaClient().from(table).select("id", { count: "exact", head: true }));
  if (error) throw new Error(error.message);
  return n ?? 0;
}

const SENT_STATUSES = "(queued,failed,not_sent)";

// Usage since `since` (ISO): subscribed contacts, emails sent, and per text channel the message count and
// provider cost recorded on each delivery. { contacts, emails, messages: { sms: { count, cost } … }, capped }.
export async function getUsageSummary(projectId, { since, maxRows = 20000 } = {}) {
  if (!projectId || !since || !isSupabaseConfigured()) return null;
  try {
    const [contacts, emails] = await Promise.all([
      count("contacts", (q) => q.eq("project_id", projectId).is("deleted_at", null).eq("status", "subscribed")),
      count("deliveries", (q) =>
        q.eq("project_id", projectId).eq("channel", "email").neq("source_type", "test").gte("created_at", since).not("status", "in", SENT_STATUSES),
      ),
    ]);
    const messages = { sms: { count: 0, cost: 0 }, whatsapp: { count: 0, cost: 0 }, rcs: { count: 0, cost: 0 } };
    let currency = "USD";
    let capped = false;
    for (let from = 0; from < maxRows; from += PAGE) {
      const { data, error } = await schemaClient()
        .from("deliveries")
        .select("id, channel, status, cost, currency")
        .eq("project_id", projectId)
        .in("channel", ["sms", "whatsapp", "rcs"])
        .gte("created_at", since)
        .not("status", "in", SENT_STATUSES)
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      for (const d of data || []) {
        const bucket = messages[d.channel];
        if (!bucket) continue;
        bucket.count += 1;
        bucket.cost += Number(d.cost ?? 0);
        if (d.currency) currency = d.currency;
      }
      if (!data || data.length < PAGE) break;
      if (from + PAGE >= maxRows) capped = true;
    }
    for (const m of Object.values(messages)) m.cost = Math.round(m.cost * 100000) / 100000;
    return { contacts, emails, messages, currency, capped };
  } catch (e) {
    console.error("[workspace_settings.usage]", e?.message || e);
    return null;
  }
}

// Integration-style connections owned by other areas, normalized for the Connections overview. Each source
// is optional: a table that isn't there (or fails) contributes nothing.
const CONNECTION_SOURCES = [
  {
    table: "integrations",
    kind: "integration",
    destination: "Apps",
    map: (r) => ({ name: r.name || r.provider, provider: r.provider, handle: r.config?.channel || "", status: r.status, connectedAt: r.connected_at, error: r.last_error }),
  },
  {
    table: "stores",
    kind: "store",
    destination: "Stores",
    map: (r) => ({ name: r.name, provider: r.platform, handle: r.domain, status: r.status, connectedAt: r.last_event_at, error: r.last_error }),
  },
  {
    table: "ad_accounts",
    kind: "ads",
    destination: "Ad Campaigns",
    map: (r) => ({ name: r.name || r.external_id, provider: "meta_ads", handle: r.external_id, status: r.status, connectedAt: r.connected_at, error: r.last_error, expiresAt: r.token_expires_at }),
  },
];

export async function listLinkedAccounts(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  const results = await Promise.all(
    CONNECTION_SOURCES.map(async (source) => {
      try {
        const { data, error } = await schemaClient()
          .from(source.table)
          .select("*")
          .eq("project_id", projectId)
          .is("deleted_at", null)
          .order("created_at", { ascending: true });
        if (error) return [];
        return (data || []).map((row) => ({
          id: row.id,
          kind: source.kind,
          destination: source.destination,
          channel: null,
          ...source.map(row),
        }));
      } catch {
        return [];
      }
    }),
  );
  return results.flat();
}
