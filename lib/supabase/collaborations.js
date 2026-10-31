"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";

// Data layer for campaign.collaborations — one creator on one campaign: brief, deliverables with due
// dates, contract status and fee. Due reminders are sent by the creators worker. Pure: null / false / [].

const TABLE = "collaborations";
const bag = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

export function normalizeDeliverable(d, i = 0) {
  const x = bag(d);
  return {
    id: x.id || `deliverable-${i + 1}`,
    kind: x.kind || "instagram_post",
    dueAt: x.due_at || x.dueAt || "",
    status: x.status || "pending",
    url: x.url || "",
    notes: x.notes || "",
  };
}

const deliverableToJson = (d, i) => {
  const x = normalizeDeliverable(d, i);
  return { id: x.id, kind: x.kind, due_at: x.dueAt || null, status: x.status, url: x.url, notes: x.notes };
};

export function normalizeCollaboration(row) {
  if (!row) return null;
  const brief = bag(row.brief);
  const contract = bag(row.contract);
  return {
    ...bag(row.metadata),
    id: row.id,
    projectId: row.project_id ?? null,
    creatorId: row.creator_id ?? null,
    campaignName: row.campaign_name || "Untitled collaboration",
    status: row.status ?? "planned",
    brief: {
      objective: brief.objective ?? "",
      keyMessages: brief.keyMessages ?? "",
      dos: brief.dos ?? "",
      donts: brief.donts ?? "",
      hashtags: brief.hashtags ?? "",
      mentions: brief.mentions ?? "",
      linkUrl: brief.linkUrl ?? "",
      discountCode: brief.discountCode ?? "",
      usageRights: brief.usageRights ?? "",
    },
    deliverables: (Array.isArray(row.deliverables) ? row.deliverables : []).map(normalizeDeliverable),
    contract: {
      terms: contract.terms ?? "",
      status: contract.status || "draft",
      sentAt: contract.sent_at ?? null,
      signedAt: contract.signed_at ?? null,
      signedBy: contract.signed_by ?? "",
    },
    fee: Number(row.fee ?? 0),
    currency: row.currency || "USD",
    startsOn: row.starts_on ?? "",
    endsOn: row.ends_on ?? "",
    affiliateLinkId: row.affiliate_link_id ?? null,
    sendReminders: row.send_reminders !== false,
    completedAt: row.completed_at ?? null,
    payoutId: row.payout_id ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function collaborationToRow(input) {
  const row = {};
  if ("creatorId" in input) row.creator_id = input.creatorId;
  if ("campaignName" in input) row.campaign_name = String(input.campaignName || "").trim();
  if ("status" in input) row.status = input.status || "planned";
  if ("brief" in input) row.brief = bag(input.brief);
  if ("deliverables" in input) row.deliverables = (Array.isArray(input.deliverables) ? input.deliverables : []).map(deliverableToJson);
  if ("contract" in input) {
    const c = bag(input.contract);
    row.contract = {
      terms: c.terms ?? "",
      status: c.status || "draft",
      sent_at: c.sentAt ?? null,
      signed_at: c.signedAt ?? null,
      signed_by: c.signedBy ?? "",
    };
  }
  if ("fee" in input) row.fee = Math.max(0, Number(input.fee) || 0);
  if ("currency" in input) row.currency = String(input.currency || "USD").toUpperCase();
  if ("startsOn" in input) row.starts_on = input.startsOn || null;
  if ("endsOn" in input) row.ends_on = input.endsOn || null;
  if ("affiliateLinkId" in input) row.affiliate_link_id = input.affiliateLinkId || null;
  if ("sendReminders" in input) row.send_reminders = input.sendReminders !== false;
  if ("completedAt" in input) row.completed_at = input.completedAt || null;
  if ("createdBy" in input) row.created_by = input.createdBy || null;
  if ("metadata" in input) row.metadata = bag(input.metadata);
  return row;
}

export async function listCollaborations(projectId, { creatorId } = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    let query = schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (creatorId) query = query.eq("creator_id", creatorId);
    const { data, error } = await query;
    if (error) {
      console.error("[collaborations.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeCollaboration);
  } catch (e) {
    console.error("[collaborations.list]", e);
    return null;
  }
}

export async function createCollaboration(projectId, input) {
  if (!projectId || !input?.creatorId || !isSupabaseConfigured()) return null;
  try {
    const payload = { ...collaborationToRow(input), project_id: projectId };
    if (input.id) payload.id = input.id;
    const { data, error } = await schemaClient().from(TABLE).insert(payload).select("*").single();
    if (error) {
      console.error("[collaborations.create]", error.message);
      return null;
    }
    return normalizeCollaboration(data);
  } catch (e) {
    console.error("[collaborations.create]", e);
    return null;
  }
}

export async function updateCollaboration(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .update(collaborationToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[collaborations.update]", error.message);
      return null;
    }
    return normalizeCollaboration(data);
  } catch (e) {
    console.error("[collaborations.update]", e);
    return null;
  }
}

export async function softDeleteCollaboration(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient()
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[collaborations.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[collaborations.delete]", e);
    return false;
  }
}
