"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";

// Data layer for campaign.campaigns. The only place that talks to the table. Pure: console.error on
// failure and return null / false / [] — never throw, never toast. Sending/scheduling never happens
// here: the screen calls the send routes (app/api/projects/[projectId]/campaigns/...) via lib/api/client.

const TABLE = "campaigns";
const bag = (v) => (v && typeof v === "object" ? v : {});

export function normalizeCampaign(row) {
  if (!row) return null;
  return {
    ...bag(row.metadata),
    id: row.id,
    projectId: row.project_id ?? null,
    name: row.name ?? "Untitled campaign",
    channel: row.channel ?? "email",
    type: row.type ?? "regular",
    status: row.status ?? "draft",
    subject: row.subject ?? "",
    preheader: row.preheader ?? "",
    fromName: row.from_name ?? "",
    fromEmail: row.from_email ?? "",
    replyTo: row.reply_to ?? "",
    content: bag(row.content),
    html: row.html ?? "",
    templateId: row.template_id ?? null,
    audience: bag(row.audience),
    sendStrategy: bag(row.send_strategy),
    ab: bag(row.ab),
    metrics: bag(row.metrics),
    tags: Array.isArray(row.tags) ? row.tags : [],
    scheduledAt: row.scheduled_at ?? null,
    sentAt: row.sent_at ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function campaignToRow(input) {
  const row = {};
  const map = {
    projectId: "project_id",
    name: "name",
    channel: "channel",
    type: "type",
    status: "status",
    subject: "subject",
    preheader: "preheader",
    fromName: "from_name",
    fromEmail: "from_email",
    replyTo: "reply_to",
    html: "html",
    templateId: "template_id",
    createdBy: "created_by",
  };
  for (const [key, col] of Object.entries(map)) if (key in input) row[col] = input[key] ?? null;
  for (const [key, col] of [
    ["content", "content"],
    ["audience", "audience"],
    ["sendStrategy", "send_strategy"],
    ["ab", "ab"],
    ["metrics", "metrics"],
    ["metadata", "metadata"],
  ]) {
    if (key in input) row[col] = bag(input[key]);
  }
  if ("tags" in input) row.tags = Array.isArray(input.tags) ? input.tags : [];
  if ("scheduledAt" in input) row.scheduled_at = input.scheduledAt || null;
  if ("sentAt" in input) row.sent_at = input.sentAt || null;
  if ("name" in input) row.name = input.name || "Untitled campaign";
  return row;
}

export async function listCampaigns(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[campaigns.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeCampaign);
  } catch (e) {
    console.error("[campaigns.list]", e);
    return null;
  }
}

export async function getCampaign(projectId, id) {
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
      console.error("[campaigns.get]", error.message);
      return null;
    }
    return normalizeCampaign(data);
  } catch (e) {
    console.error("[campaigns.get]", e);
    return null;
  }
}

export async function createCampaign(projectId, input) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const payload = { ...campaignToRow(input), project_id: projectId };
    if (input.id) payload.id = input.id;
    const { data, error } = await schemaClient().from(TABLE).insert(payload).select("*").single();
    if (error) {
      console.error("[campaigns.create]", error.message);
      return null;
    }
    return normalizeCampaign(data);
  } catch (e) {
    console.error("[campaigns.create]", e);
    return null;
  }
}

export async function updateCampaign(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .update(campaignToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[campaigns.update]", error.message);
      return null;
    }
    return normalizeCampaign(data);
  } catch (e) {
    console.error("[campaigns.update]", e);
    return null;
  }
}

export async function softDeleteCampaign(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient()
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[campaigns.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[campaigns.delete]", e);
    return false;
  }
}

// A draft copy of a campaign: same content, audience and A/B setup, no schedule, sends or metrics.
export function campaignCopyInput(campaign, { name } = {}) {
  const c = campaign || {};
  const ab = c.ab && typeof c.ab === "object" ? { ...c.ab, winner: null, decidedAt: null } : {};
  return {
    name: name || `${c.name || "Untitled campaign"} (copy)`,
    channel: c.channel || "email",
    type: c.type === "automated" ? "regular" : c.type || "regular",
    status: "draft",
    subject: c.subject || "",
    preheader: c.preheader || "",
    fromName: c.fromName || "",
    fromEmail: c.fromEmail || "",
    replyTo: c.replyTo || "",
    content: c.content || {},
    templateId: c.templateId || null,
    audience: c.audience || {},
    sendStrategy: {},
    ab,
    metrics: {},
    tags: c.tags || [],
    scheduledAt: null,
    sentAt: null,
    metadata: c.description ? { description: c.description } : {},
  };
}

// Shallow-merges keys into the campaign's metadata bag (internal description, planning notes…).
export async function updateCampaignMeta(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient().rpc("merge_meta", { p_table: TABLE, p_id: id, p_patch: patch || {} });
    if (error) {
      console.error("[campaigns.updateMeta]", error.message);
      return null;
    }
    return data ?? {};
  } catch (e) {
    console.error("[campaigns.updateMeta]", e);
    return null;
  }
}

