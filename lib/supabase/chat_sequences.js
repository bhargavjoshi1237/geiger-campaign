"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";

// Data layer for campaign.chat_sequences, chat_sequence_steps and chat_sequence_enrollments — timed DM
// follow-ups. Steps are saved as a whole list (upsert + soft delete of removed steps); enrollments are
// written by the chat engine and can be stopped from the screen. Pure: null / false / [].

const TABLE = "chat_sequences";
const STEPS = "chat_sequence_steps";
const ENROLLMENTS = "chat_sequence_enrollments";
const bag = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
const list = (v) => (Array.isArray(v) ? v : []);

export function normalizeChatSequence(row) {
  if (!row) return null;
  const stats = bag(row.stats);
  const settings = bag(row.settings);
  const trigger = bag(row.trigger);
  return {
    ...bag(row.metadata),
    id: row.id,
    projectId: row.project_id ?? null,
    name: row.name ?? "Untitled sequence",
    description: row.description ?? "",
    status: row.status ?? "draft",
    channels: list(row.channels),
    trigger: { ...trigger, type: trigger.type ?? "manual", automationId: trigger.automationId ?? null, flowId: trigger.flowId ?? null, tag: trigger.tag ?? "" },
    settings: { ...settings, stopOnReply: settings.stopOnReply !== false, quietHours: bag(settings.quietHours) },
    stats: {
      enrolled: Number(stats.enrolled ?? 0),
      completed: Number(stats.completed ?? 0),
      stopped: Number(stats.stopped ?? 0),
      sent: Number(stats.sent ?? 0),
      blocked: Number(stats.blocked ?? 0),
    },
    publishedAt: row.published_at ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function chatSequenceToRow(input) {
  const row = {};
  const map = { name: "name", description: "description", status: "status", createdBy: "created_by" };
  for (const [key, col] of Object.entries(map)) if (key in input) row[col] = input[key] ?? null;
  if ("channels" in input) row.channels = list(input.channels);
  if ("trigger" in input) row.trigger = bag(input.trigger);
  if ("settings" in input) row.settings = bag(input.settings);
  if ("metadata" in input) row.metadata = bag(input.metadata);
  return row;
}

export function normalizeSequenceStep(row) {
  if (!row) return null;
  const message = bag(row.message);
  return {
    id: row.id,
    sequenceId: row.sequence_id,
    position: Number(row.position ?? 0),
    delayMinutes: Number(row.delay_minutes ?? 0),
    message: { ...message, text: message.text ?? "", buttons: list(message.buttons) },
    template: row.template ? bag(row.template) : null,
  };
}

export function normalizeEnrollment(row) {
  if (!row) return null;
  return {
    id: row.id,
    sequenceId: row.sequence_id,
    contactId: row.contact_id ?? null,
    conversationId: row.conversation_id ?? null,
    channel: row.channel ?? "",
    currentStep: Number(row.current_step ?? 0),
    nextRunAt: row.next_run_at ?? null,
    status: row.status ?? "active",
    stopReason: row.stop_reason ?? "",
    lastSentAt: row.last_sent_at ?? null,
    source: bag(row.source),
    createdAt: row.created_at ?? null,
  };
}

export async function listChatSequences(projectId, { limit = 500 } = {}) {
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
      console.error("[chat_sequences.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeChatSequence);
  } catch (e) {
    console.error("[chat_sequences.list]", e);
    return null;
  }
}

export async function getChatSequence(projectId, id) {
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
      console.error("[chat_sequences.get]", error.message);
      return null;
    }
    return normalizeChatSequence(data);
  } catch (e) {
    console.error("[chat_sequences.get]", e);
    return null;
  }
}

export async function createChatSequence(projectId, input) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const payload = { ...chatSequenceToRow(input), project_id: projectId };
    if (input.id) payload.id = input.id;
    const { data, error } = await schemaClient().from(TABLE).insert(payload).select("*").single();
    if (error) {
      console.error("[chat_sequences.create]", error.message);
      return null;
    }
    return normalizeChatSequence(data);
  } catch (e) {
    console.error("[chat_sequences.create]", e);
    return null;
  }
}

export async function updateChatSequence(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .update(chatSequenceToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[chat_sequences.update]", error.message);
      return null;
    }
    return normalizeChatSequence(data);
  } catch (e) {
    console.error("[chat_sequences.update]", e);
    return null;
  }
}

export async function softDeleteChatSequence(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient()
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString(), status: "archived" })
      .eq("id", id);
    if (error) {
      console.error("[chat_sequences.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[chat_sequences.delete]", e);
    return false;
  }
}

// Steps for one sequence, or for every sequence in the project when sequenceId is omitted.
export async function listSequenceSteps(projectId, { sequenceId } = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    let query = schemaClient()
      .from(STEPS)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("position", { ascending: true });
    if (sequenceId) query = query.eq("sequence_id", sequenceId);
    const { data, error } = await query;
    if (error) {
      console.error("[chat_sequences.steps]", error.message);
      return null;
    }
    return (data || []).map(normalizeSequenceStep);
  } catch (e) {
    console.error("[chat_sequences.steps]", e);
    return null;
  }
}

// Saves the full ordered step list: upserts each step (position = index) and soft-deletes removed ones.
export async function saveSequenceSteps(projectId, sequenceId, steps) {
  if (!projectId || !sequenceId || !isSupabaseConfigured()) return null;
  try {
    const sb = schemaClient();
    const rows = list(steps).map((s, i) => ({
      id: s.id,
      project_id: projectId,
      sequence_id: sequenceId,
      position: i,
      delay_minutes: Math.max(0, Math.round(Number(s.delayMinutes) || 0)),
      message: bag(s.message),
      template: s.template && s.template.name ? bag(s.template) : null,
      deleted_at: null,
    }));
    if (rows.length) {
      const { error } = await sb.from(STEPS).upsert(rows, { onConflict: "id" });
      if (error) {
        console.error("[chat_sequences.saveSteps]", error.message);
        return null;
      }
    }
    const { data: existing, error: listError } = await sb.from(STEPS).select("id").eq("sequence_id", sequenceId).is("deleted_at", null);
    if (listError) {
      console.error("[chat_sequences.saveSteps]", listError.message);
      return null;
    }
    const keep = new Set(rows.map((r) => r.id));
    const removed = (existing || []).map((r) => r.id).filter((id) => !keep.has(id));
    if (removed.length) {
      const { error } = await sb.from(STEPS).update({ deleted_at: new Date().toISOString() }).in("id", removed);
      if (error) {
        console.error("[chat_sequences.saveSteps]", error.message);
        return null;
      }
    }
    return listSequenceSteps(projectId, { sequenceId });
  } catch (e) {
    console.error("[chat_sequences.saveSteps]", e);
    return null;
  }
}

// Filters: { sequenceId, status, limit }.
export async function listSequenceEnrollments(projectId, { sequenceId, status, limit = 500 } = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    let query = schemaClient()
      .from(ENROLLMENTS)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (sequenceId) query = query.eq("sequence_id", sequenceId);
    if (status) query = query.eq("status", status);
    const { data, error } = await query;
    if (error) {
      console.error("[chat_sequences.enrollments]", error.message);
      return null;
    }
    return (data || []).map(normalizeEnrollment);
  } catch (e) {
    console.error("[chat_sequences.enrollments]", e);
    return null;
  }
}

export async function stopEnrollment(id, reason = "stopped_manually") {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(ENROLLMENTS)
      .update({ status: "stopped", stop_reason: reason, next_run_at: null })
      .eq("id", id)
      .select("*")
      .single();
    if (error) {
      console.error("[chat_sequences.stopEnrollment]", error.message);
      return null;
    }
    return normalizeEnrollment(data);
  } catch (e) {
    console.error("[chat_sequences.stopEnrollment]", e);
    return null;
  }
}
