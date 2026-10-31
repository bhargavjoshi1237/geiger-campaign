"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";

// Data layer for campaign.ai_agents — persona, instructions, knowledge (text snippets + URLs whose text the
// server caches), channels, handover triggers and model settings. Sandbox tests and URL refreshes go
// through the chat agent routes. Pure: null / false / [].

const TABLE = "ai_agents";
const bag = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
const list = (v) => (Array.isArray(v) ? v : []);

export function normalizeKnowledgeItem(item, i = 0) {
  const k = bag(item);
  return {
    id: k.id || `k${i}`,
    type: k.type === "url" ? "url" : "text",
    title: k.title ?? "",
    content: k.content ?? "",
    url: k.url ?? "",
    fetchedAt: k.fetchedAt ?? null,
    error: k.error ?? null,
  };
}

export function normalizeAiAgent(row) {
  if (!row) return null;
  const triggers = bag(row.handover_triggers);
  const model = bag(row.model_settings);
  const stats = bag(row.stats);
  return {
    ...bag(row.metadata),
    id: row.id,
    projectId: row.project_id ?? null,
    name: row.name ?? "Untitled agent",
    description: row.description ?? "",
    status: row.status ?? "draft",
    persona: row.persona ?? "",
    instructions: row.instructions ?? "",
    knowledge: list(row.knowledge).map(normalizeKnowledgeItem),
    channels: list(row.channels),
    handoverTriggers: {
      ...triggers,
      minConfidence: Number(triggers.minConfidence ?? 0.6),
      intents: list(triggers.intents).map(String),
      keywords: list(triggers.keywords).map(String),
      onNegativeSentiment: triggers.onNegativeSentiment !== false,
      maxTurns: Number(triggers.maxTurns ?? 8),
      message: triggers.message ?? "",
    },
    modelSettings: {
      ...model,
      temperature: Number(model.temperature ?? 0.3),
      maxReplyChars: Number(model.maxReplyChars ?? 600),
      language: model.language ?? "auto",
    },
    stats: { replies: Number(stats.replies ?? 0), handovers: Number(stats.handovers ?? 0) },
    publishedAt: row.published_at ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function aiAgentToRow(input) {
  const row = {};
  const map = { name: "name", description: "description", status: "status", persona: "persona", instructions: "instructions", createdBy: "created_by" };
  for (const [key, col] of Object.entries(map)) if (key in input) row[col] = input[key] ?? null;
  if ("knowledge" in input) row.knowledge = list(input.knowledge);
  if ("channels" in input) row.channels = list(input.channels);
  if ("handoverTriggers" in input) row.handover_triggers = bag(input.handoverTriggers);
  if ("modelSettings" in input) row.model_settings = bag(input.modelSettings);
  if ("metadata" in input) row.metadata = bag(input.metadata);
  return row;
}

export async function listAiAgents(projectId, { limit = 200 } = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      console.error("[ai_agents.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeAiAgent);
  } catch (e) {
    console.error("[ai_agents.list]", e);
    return null;
  }
}

export async function getAiAgent(projectId, id) {
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
      console.error("[ai_agents.get]", error.message);
      return null;
    }
    return normalizeAiAgent(data);
  } catch (e) {
    console.error("[ai_agents.get]", e);
    return null;
  }
}

export async function createAiAgent(projectId, input) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const payload = { ...aiAgentToRow(input), project_id: projectId };
    if (input.id) payload.id = input.id;
    const { data, error } = await schemaClient().from(TABLE).insert(payload).select("*").single();
    if (error) {
      console.error("[ai_agents.create]", error.message);
      return null;
    }
    return normalizeAiAgent(data);
  } catch (e) {
    console.error("[ai_agents.create]", e);
    return null;
  }
}

export async function updateAiAgent(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .update(aiAgentToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[ai_agents.update]", error.message);
      return null;
    }
    return normalizeAiAgent(data);
  } catch (e) {
    console.error("[ai_agents.update]", e);
    return null;
  }
}

export async function softDeleteAiAgent(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient()
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString(), status: "archived" })
      .eq("id", id);
    if (error) {
      console.error("[ai_agents.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[ai_agents.delete]", e);
    return false;
  }
}
