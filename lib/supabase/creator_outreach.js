"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";

// Data layer for creator outreach: campaign.creator_outreach (the sequences), creator_outreach_recipients
// (per-creator progress) and creator_outreach_steps_log (send history). Sending, start and stop run on
// the server (/api/projects/:id/creators/outreach/*); this file edits drafts and reads progress.
// Pure: console.error on failure and return null / false / [].

const TABLE = "creator_outreach";
const RECIPIENTS = "creator_outreach_recipients";
const LOG = "creator_outreach_steps_log";
const bag = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

export function normalizeStep(step, i = 0) {
  const s = bag(step);
  return {
    id: s.id || `step-${i + 1}`,
    delayDays: Math.max(0, Number(s.delayDays) || 0),
    subject: s.subject ?? "",
    body: s.body ?? "",
  };
}

export function normalizeOutreach(row) {
  if (!row) return null;
  const stats = bag(row.stats);
  const sender = bag(row.sender);
  return {
    ...bag(row.metadata),
    id: row.id,
    projectId: row.project_id ?? null,
    name: row.name || "Untitled sequence",
    status: row.status ?? "draft",
    steps: (Array.isArray(row.steps) ? row.steps : []).map(normalizeStep),
    creatorIds: Array.isArray(row.creator_ids) ? row.creator_ids : [],
    sender: { fromName: sender.fromName ?? "", fromEmail: sender.fromEmail ?? "", replyTo: sender.replyTo ?? "" },
    stopOnReply: row.stop_on_reply !== false,
    stats: {
      enrolled: Number(stats.enrolled) || 0,
      active: Number(stats.active) || 0,
      sent: Number(stats.sent) || 0,
      failed: Number(stats.failed) || 0,
      replied: Number(stats.replied) || 0,
      optedOut: Number(stats.optedOut) || 0,
      completed: Number(stats.completed) || 0,
    },
    startedAt: row.started_at ?? null,
    completedAt: row.completed_at ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function outreachToRow(input) {
  const row = {};
  if ("name" in input) row.name = String(input.name || "").trim() || "Untitled sequence";
  if ("status" in input) row.status = input.status || "draft";
  if ("steps" in input) row.steps = (Array.isArray(input.steps) ? input.steps : []).map(normalizeStep);
  if ("creatorIds" in input) row.creator_ids = [...new Set(Array.isArray(input.creatorIds) ? input.creatorIds : [])];
  if ("sender" in input) row.sender = bag(input.sender);
  if ("stopOnReply" in input) row.stop_on_reply = input.stopOnReply !== false;
  if ("createdBy" in input) row.created_by = input.createdBy || null;
  if ("metadata" in input) row.metadata = bag(input.metadata);
  return row;
}

export function normalizeRecipient(row) {
  if (!row) return null;
  return {
    ...bag(row.metadata),
    id: row.id,
    outreachId: row.outreach_id ?? null,
    creatorId: row.creator_id ?? null,
    status: row.status ?? "active",
    nextStep: Number(row.next_step) || 0,
    nextDueAt: row.next_due_at ?? null,
    lastSentAt: row.last_sent_at ?? null,
    repliedAt: row.replied_at ?? null,
    stoppedReason: row.stopped_reason ?? "",
    createdAt: row.created_at ?? null,
  };
}

export function normalizeLogEntry(row) {
  if (!row) return null;
  return {
    ...bag(row.metadata),
    id: row.id,
    outreachId: row.outreach_id ?? null,
    recipientId: row.recipient_id ?? null,
    creatorId: row.creator_id ?? null,
    stepIndex: Number(row.step_index) || 0,
    event: row.event ?? "sent",
    deliveryId: row.delivery_id ?? null,
    subject: row.subject ?? "",
    error: row.error ?? "",
    occurredAt: row.occurred_at ?? row.created_at ?? null,
  };
}

export async function listOutreach(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[creator_outreach.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeOutreach);
  } catch (e) {
    console.error("[creator_outreach.list]", e);
    return null;
  }
}

export async function createOutreach(projectId, input) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const payload = { ...outreachToRow(input), project_id: projectId };
    if (input.id) payload.id = input.id;
    const { data, error } = await schemaClient().from(TABLE).insert(payload).select("*").single();
    if (error) {
      console.error("[creator_outreach.create]", error.message);
      return null;
    }
    return normalizeOutreach(data);
  } catch (e) {
    console.error("[creator_outreach.create]", e);
    return null;
  }
}

export async function updateOutreach(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .update(outreachToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[creator_outreach.update]", error.message);
      return null;
    }
    return normalizeOutreach(data);
  } catch (e) {
    console.error("[creator_outreach.update]", e);
    return null;
  }
}

export async function softDeleteOutreach(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient()
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString(), status: "paused" })
      .eq("id", id);
    if (error) {
      console.error("[creator_outreach.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[creator_outreach.delete]", e);
    return false;
  }
}

// Filters: { outreachId, creatorId }.
export async function listOutreachRecipients(projectId, { outreachId, creatorId } = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    let query = schemaClient()
      .from(RECIPIENTS)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    if (outreachId) query = query.eq("outreach_id", outreachId);
    if (creatorId) query = query.eq("creator_id", creatorId);
    const { data, error } = await query;
    if (error) {
      console.error("[creator_outreach.recipients]", error.message);
      return null;
    }
    return (data || []).map(normalizeRecipient);
  } catch (e) {
    console.error("[creator_outreach.recipients]", e);
    return null;
  }
}

// Manual progress changes from the screen (mark replied, stop, resume); logged alongside.
export async function updateOutreachRecipient(projectId, recipient, { status, reason = null }) {
  if (!projectId || !recipient?.id || !isSupabaseConfigured()) return null;
  try {
    const now = new Date().toISOString();
    const patch = { status, stopped_reason: status === "active" ? null : reason };
    if (status === "replied") patch.replied_at = now;
    if (status === "active") patch.next_due_at = recipient.nextDueAt || now;
    const sb = schemaClient();
    const { data, error } = await sb
      .from(RECIPIENTS)
      .update(patch)
      .eq("id", recipient.id)
      .select("*")
      .single();
    if (error) {
      console.error("[creator_outreach.updateRecipient]", error.message);
      return null;
    }
    const event = { replied: "replied", opted_out: "opted_out", stopped: "stopped" }[status];
    if (event) {
      await sb.from(LOG).insert({
        project_id: projectId,
        outreach_id: recipient.outreachId,
        recipient_id: recipient.id,
        creator_id: recipient.creatorId,
        step_index: recipient.nextStep,
        event,
        occurred_at: now,
        metadata: { manual: true },
      });
    }
    return normalizeRecipient(data);
  } catch (e) {
    console.error("[creator_outreach.updateRecipient]", e);
    return null;
  }
}

// Filters: { outreachId, creatorId, limit }.
export async function listOutreachLog(projectId, { outreachId, creatorId, limit = 500 } = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    let query = schemaClient()
      .from(LOG)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("occurred_at", { ascending: false })
      .limit(limit);
    if (outreachId) query = query.eq("outreach_id", outreachId);
    if (creatorId) query = query.eq("creator_id", creatorId);
    const { data, error } = await query;
    if (error) {
      console.error("[creator_outreach.log]", error.message);
      return null;
    }
    return (data || []).map(normalizeLogEntry);
  } catch (e) {
    console.error("[creator_outreach.log]", e);
    return null;
  }
}
