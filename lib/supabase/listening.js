"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";

// Data layer for campaign.listening_queries (editable monitoring queries) and campaign.listening_mentions
// (read-only results collected server-side from the platform APIs). Pure: null / false / [] on failure.

const QUERIES = "listening_queries";
const MENTIONS = "listening_mentions";
const bag = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
const strings = (v) => [...new Set((Array.isArray(v) ? v : []).map((s) => String(s || "").trim()).filter(Boolean))];

export const LISTENING_SOURCES = ["hashtags", "tags", "comments"];

export function normalizeListeningQuery(row) {
  if (!row) return null;
  return {
    ...bag(row.metadata),
    id: row.id,
    projectId: row.project_id ?? null,
    name: row.name ?? "Untitled query",
    terms: strings(row.terms),
    excluded: strings(row.excluded),
    networks: strings(row.networks),
    sources: strings(row.sources).filter((s) => LISTENING_SOURCES.includes(s)),
    active: row.active !== false,
    lastRunAt: row.last_run_at ?? null,
    lastError: row.last_error ?? "",
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
  };
}

export function listeningQueryToRow(input) {
  const row = {};
  if ("name" in input) row.name = String(input.name || "").trim() || "Untitled query";
  if ("terms" in input) row.terms = strings(input.terms);
  if ("excluded" in input) row.excluded = strings(input.excluded);
  if ("networks" in input) row.networks = strings(input.networks);
  if ("sources" in input) row.sources = strings(input.sources).filter((s) => LISTENING_SOURCES.includes(s));
  if ("active" in input) row.active = Boolean(input.active);
  if ("createdBy" in input) row.created_by = input.createdBy ?? null;
  if ("metadata" in input) row.metadata = bag(input.metadata);
  return row;
}

export function normalizeMention(row) {
  if (!row) return null;
  return {
    ...bag(row.metadata),
    id: row.id,
    queryId: row.query_id,
    connectionId: row.connection_id ?? null,
    network: row.network ?? "instagram",
    source: row.source ?? "hashtag_recent",
    externalId: row.external_id ?? "",
    text: row.text ?? "",
    author: row.author ?? "",
    url: row.url ?? "",
    matchedTerms: strings(row.matched_terms),
    sentiment: row.sentiment ?? null,
    engagement: bag(row.engagement),
    postedAt: row.posted_at ?? row.created_at ?? null,
  };
}

export async function listListeningQueries(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(QUERIES)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    if (error) {
      console.error("[listening.queries]", error.message);
      return null;
    }
    return (data || []).map(normalizeListeningQuery);
  } catch (e) {
    console.error("[listening.queries]", e);
    return null;
  }
}

export async function createListeningQuery(projectId, input) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const payload = { ...listeningQueryToRow(input), project_id: projectId };
    if (input.id) payload.id = input.id;
    const { data, error } = await schemaClient().from(QUERIES).insert(payload).select("*").single();
    if (error) {
      console.error("[listening.create]", error.message);
      return null;
    }
    return normalizeListeningQuery(data);
  } catch (e) {
    console.error("[listening.create]", e);
    return null;
  }
}

export async function updateListeningQuery(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(QUERIES)
      .update(listeningQueryToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[listening.update]", error.message);
      return null;
    }
    return normalizeListeningQuery(data);
  } catch (e) {
    console.error("[listening.update]", e);
    return null;
  }
}

export async function softDeleteListeningQuery(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient().from(QUERIES).update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      console.error("[listening.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[listening.delete]", e);
    return false;
  }
}

// Filters: { queryId, since, limit }.
export async function listMentions(projectId, { queryId, since, limit = 1000 } = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    let query = schemaClient()
      .from(MENTIONS)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("posted_at", { ascending: false, nullsFirst: false })
      .limit(limit);
    if (queryId) query = query.eq("query_id", queryId);
    if (since) query = query.gte("posted_at", since);
    const { data, error } = await query;
    if (error) {
      console.error("[listening.mentions]", error.message);
      return null;
    }
    return (data || []).map(normalizeMention);
  } catch (e) {
    console.error("[listening.mentions]", e);
    return null;
  }
}
