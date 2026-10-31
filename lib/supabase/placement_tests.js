"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";

// Data layer for campaign.placement_tests — seed-list inbox placement tests. The test send runs
// server-side (POST /api/projects/:projectId/deliverability/placement/:id/send, through dispatch);
// results are recorded per mailbox here. Pure: console.error on failure and return null / false / [].

const TABLE = "placement_tests";
const bag = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
const list = (v) => (Array.isArray(v) ? v : []);

export function normalizePlacementTest(row) {
  if (!row) return null;
  return {
    ...bag(row.metadata),
    id: row.id,
    projectId: row.project_id ?? null,
    name: row.name ?? "Untitled test",
    subject: row.subject ?? "",
    fromEmail: row.from_email ?? "",
    contentSource: row.content_source ?? "custom",
    campaignId: row.campaign_id ?? null,
    html: row.html ?? "",
    seeds: list(row.seed_addresses),
    results: list(row.results),
    preflight: bag(row.preflight),
    status: row.status ?? "draft",
    sentAt: row.sent_at ?? null,
    completedAt: row.completed_at ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function placementTestToRow(input) {
  const row = {};
  const map = { name: "name", subject: "subject", fromEmail: "from_email", contentSource: "content_source", campaignId: "campaign_id", html: "html", status: "status", createdBy: "created_by" };
  for (const [key, col] of Object.entries(map)) if (key in input) row[col] = input[key] ?? (col === "campaign_id" ? null : "");
  if ("seeds" in input) row.seed_addresses = list(input.seeds);
  if ("results" in input) row.results = list(input.results);
  if ("preflight" in input) row.preflight = bag(input.preflight);
  if ("completedAt" in input) row.completed_at = input.completedAt || null;
  if ("metadata" in input) row.metadata = bag(input.metadata);
  return row;
}

export async function listPlacementTests(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[placement_tests.list]", error.message);
      return null;
    }
    return (data || []).map(normalizePlacementTest);
  } catch (e) {
    console.error("[placement_tests.list]", e);
    return null;
  }
}

export async function getPlacementTest(projectId, id) {
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
      console.error("[placement_tests.get]", error.message);
      return null;
    }
    return normalizePlacementTest(data);
  } catch (e) {
    console.error("[placement_tests.get]", e);
    return null;
  }
}

export async function createPlacementTest(projectId, input) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const payload = { ...placementTestToRow(input), project_id: projectId };
    if (input.id) payload.id = input.id;
    const { data, error } = await schemaClient().from(TABLE).insert(payload).select("*").single();
    if (error) {
      console.error("[placement_tests.create]", error.message);
      return null;
    }
    return normalizePlacementTest(data);
  } catch (e) {
    console.error("[placement_tests.create]", e);
    return null;
  }
}

export async function updatePlacementTest(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .update(placementTestToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[placement_tests.update]", error.message);
      return null;
    }
    return normalizePlacementTest(data);
  } catch (e) {
    console.error("[placement_tests.update]", e);
    return null;
  }
}

export async function softDeletePlacementTest(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient().from(TABLE).update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      console.error("[placement_tests.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[placement_tests.delete]", e);
    return false;
  }
}
