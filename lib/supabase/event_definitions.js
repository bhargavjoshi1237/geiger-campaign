"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";

// Data layer for campaign.event_definitions (the event catalog, kept current by a trigger on
// tracked_events), per-name counts over a window, and campaign.tracking_identities (anonymous visitor ->
// contact links written at ingest). Pure: null / false / [] on failure, never throws or toasts.

const TABLE = "event_definitions";

export function normalizeEventDefinition(row) {
  if (!row) return null;
  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    ...meta,
    id: row.id,
    projectId: row.project_id ?? null,
    name: row.name ?? "",
    description: row.description ?? "",
    status: row.status === "blocked" ? "blocked" : "active",
    properties: row.properties && typeof row.properties === "object" ? row.properties : {},
    sources: Array.isArray(row.sources) ? row.sources : [],
    totalCount: Number(row.total_count ?? 0),
    firstSeenAt: row.first_seen_at ?? null,
    lastSeenAt: row.last_seen_at ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function eventDefinitionToRow(input) {
  const row = {};
  if ("name" in input) row.name = String(input.name || "").trim();
  if ("description" in input) row.description = String(input.description || "").trim();
  if ("status" in input) row.status = input.status === "blocked" ? "blocked" : "active";
  if ("createdBy" in input) row.created_by = input.createdBy ?? null;
  if ("metadata" in input) row.metadata = input.metadata && typeof input.metadata === "object" ? input.metadata : {};
  return row;
}

export async function listEventDefinitions(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("last_seen_at", { ascending: false, nullsFirst: false });
    if (error) {
      console.error("[event_definitions.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeEventDefinition);
  } catch (e) {
    console.error("[event_definitions.list]", e);
    return null;
  }
}

export async function createEventDefinition(projectId, input) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const payload = { ...eventDefinitionToRow(input), project_id: projectId };
    if (input.id) payload.id = input.id;
    const { data, error } = await schemaClient().from(TABLE).insert(payload).select("*").single();
    if (error) {
      console.error("[event_definitions.create]", error.message);
      return null;
    }
    return normalizeEventDefinition(data);
  } catch (e) {
    console.error("[event_definitions.create]", e);
    return null;
  }
}

export async function updateEventDefinition(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient().from(TABLE).update(eventDefinitionToRow(patch)).eq("id", id).is("deleted_at", null).select("*").single();
    if (error) {
      console.error("[event_definitions.update]", error.message);
      return null;
    }
    return normalizeEventDefinition(data);
  } catch (e) {
    console.error("[event_definitions.update]", e);
    return null;
  }
}

export async function softDeleteEventDefinition(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient().from(TABLE).update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      console.error("[event_definitions.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[event_definitions.delete]", e);
    return false;
  }
}

// { [name]: { events, contacts } } since `since`. Uses campaign.event_counts(); where that RPC isn't
// available it counts a bounded read of tracked_events instead.
export async function countEventsSince(projectId, since) {
  if (!projectId || !since || !isSupabaseConfigured()) return null;
  try {
    const sb = schemaClient();
    const { data, error } = await sb.rpc("event_counts", { p_project: projectId, p_since: since });
    if (!error && Array.isArray(data)) {
      return Object.fromEntries(data.map((r) => [r.name, { events: Number(r.events || 0), contacts: Number(r.contacts || 0) }]));
    }
    const { data: rows, error: readError } = await sb
      .from("tracked_events")
      .select("name, contact_id")
      .eq("project_id", projectId)
      .gte("occurred_at", since)
      .is("deleted_at", null)
      .limit(10000);
    if (readError) {
      console.error("[event_definitions.counts]", readError.message);
      return null;
    }
    const counts = {};
    const contacts = {};
    for (const r of rows || []) {
      counts[r.name] = (counts[r.name] || 0) + 1;
      if (r.contact_id) (contacts[r.name] ||= new Set()).add(r.contact_id);
    }
    return Object.fromEntries(Object.entries(counts).map(([name, events]) => [name, { events, contacts: contacts[name]?.size || 0 }]));
  } catch (e) {
    console.error("[event_definitions.counts]", e);
    return null;
  }
}

// id -> { email, name } for labelling a stream of events (a lookup only; contacts are owned by lib/supabase/contacts).
export async function contactLabels(projectId, ids) {
  const list = [...new Set((ids || []).filter(Boolean))];
  if (!projectId || !list.length || !isSupabaseConfigured()) return {};
  try {
    const { data, error } = await schemaClient().from("contacts").select("id, email, phone, first_name, last_name").eq("project_id", projectId).in("id", list.slice(0, 200));
    if (error) {
      console.error("[event_definitions.contactLabels]", error.message);
      return {};
    }
    return Object.fromEntries(
      (data || []).map((c) => [c.id, { email: c.email || c.phone || "", name: [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || c.phone || "Contact" }]),
    );
  } catch (e) {
    console.error("[event_definitions.contactLabels]", e);
    return {};
  }
}

export async function countTrackingIdentities(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { count, error } = await schemaClient()
      .from("tracking_identities")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .is("deleted_at", null);
    if (error) {
      console.error("[tracking_identities.count]", error.message);
      return null;
    }
    return count ?? 0;
  } catch (e) {
    console.error("[tracking_identities.count]", e);
    return null;
  }
}
