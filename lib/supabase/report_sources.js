"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";
import { normalizeContact } from "./contacts";
import { normalizeDelivery } from "./deliveries";
import { normalizeTrackedEvent } from "./tracked_events";
import { DELIVERY_COLUMNS, EVENT_COLUMNS, listFromRow, memberFromRow, segmentFromRow } from "@/lib/reporting/rows";

// Read-only loaders for reporting. Reports scan whole windows of the core send log and event stream, which
// PostgREST caps per request, so these page through with .range() (normalizing with the core normalizers)
// and say when a cap was hit. Lists, memberships and segments are read here directly for the same reason.
// Pure: null on failure, never throws or toasts.

const PAGE = 1000;
const MAX_ROWS = 30000;

async function pageThrough(label, build, normalize, maxRows = MAX_ROWS) {
  const rows = [];
  for (let from = 0; from < maxRows; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) {
      console.error(`[report_sources.${label}]`, error.message);
      return null;
    }
    const page = data || [];
    for (const row of page) rows.push(normalize(row));
    if (page.length < PAGE) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

// Deliveries logged since `since` (ISO), newest first; optional campaign narrowing.
export async function loadDeliveries(projectId, { since, campaignIds, maxRows } = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    return await pageThrough(
      "deliveries",
      () => {
        let q = schemaClient()
          .from("deliveries")
          .select(DELIVERY_COLUMNS)
          .eq("project_id", projectId)
          .is("deleted_at", null)
          .order("created_at", { ascending: false });
        if (since) q = q.gte("created_at", since);
        if (campaignIds?.length) q = q.in("campaign_id", campaignIds);
        return q;
      },
      normalizeDelivery,
      maxRows,
    );
  } catch (e) {
    console.error("[report_sources.deliveries]", e);
    return null;
  }
}

// Events that matter to reporting: revenue-bearing, tied to a message, or one of the named conversion events.
export async function loadReportEvents(projectId, { since, names = [] } = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  const safe = names.filter((n) => /^[\w.:-]+$/.test(n));
  const clauses = ["revenue.not.is.null", "delivery_id.not.is.null", "campaign_id.not.is.null"];
  if (safe.length) clauses.push(`name.in.(${safe.join(",")})`);
  try {
    return await pageThrough(
      "events",
      () => {
        let q = schemaClient()
          .from("tracked_events")
          .select(EVENT_COLUMNS)
          .eq("project_id", projectId)
          .is("deleted_at", null)
          .or(clauses.join(","))
          .order("occurred_at", { ascending: false });
        if (since) q = q.gte("occurred_at", since);
        return q;
      },
      normalizeTrackedEvent,
    );
  } catch (e) {
    console.error("[report_sources.events]", e);
    return null;
  }
}

// Distinct event names seen recently, for the conversion-event picker.
export async function listEventNames(projectId, { since } = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    let q = schemaClient()
      .from("tracked_events")
      .select("name, revenue")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("occurred_at", { ascending: false })
      .limit(PAGE);
    if (since) q = q.gte("occurred_at", since);
    const { data, error } = await q;
    if (error) {
      console.error("[report_sources.eventNames]", error.message);
      return null;
    }
    const counts = new Map();
    for (const row of data || []) {
      const entry = counts.get(row.name) || { name: row.name, count: 0, withRevenue: 0 };
      entry.count += 1;
      if (Number(row.revenue) > 0) entry.withRevenue += 1;
      counts.set(row.name, entry);
    }
    return [...counts.values()].sort((a, b) => b.count - a.count);
  } catch (e) {
    console.error("[report_sources.eventNames]", e);
    return null;
  }
}

export async function loadContacts(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    return await pageThrough(
      "contacts",
      () =>
        schemaClient()
          .from("contacts")
          .select("*")
          .eq("project_id", projectId)
          .is("deleted_at", null)
          .order("created_at", { ascending: false }),
      normalizeContact,
    );
  } catch (e) {
    console.error("[report_sources.contacts]", e);
    return null;
  }
}

// Lists plus every membership row (removed ones too, so growth can count removals).
export async function loadListsWithMembers(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from("lists")
      .select("id, name, created_at")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    if (error) {
      console.error("[report_sources.lists]", error.message);
      return null;
    }
    const members = await pageThrough(
      "list_members",
      () =>
        schemaClient()
          .from("list_members")
          .select("id, list_id, contact_id, status, created_at, updated_at, deleted_at")
          .eq("project_id", projectId)
          .order("created_at", { ascending: false }),
      memberFromRow,
    );
    if (!members) return null;
    return { lists: (data || []).map(listFromRow), members: members.rows, truncated: members.truncated };
  } catch (e) {
    console.error("[report_sources.lists]", e);
    return null;
  }
}

export async function loadSegments(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from("segments")
      .select("id, name, match, conditions, contact_count")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    if (error) {
      console.error("[report_sources.segments]", error.message);
      return null;
    }
    return (data || []).map(segmentFromRow);
  } catch (e) {
    console.error("[report_sources.segments]", e);
    return null;
  }
}
