"use client";

import { normalizeBusinessHours } from "@/lib/inbox/sla";
import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";

// Data layer for campaign.chat_widgets — website live-chat widgets. The public_id goes into the install
// snippet and keys the public chat API; visitor sessions become `chat` conversations written by the
// server. Pure: console.error and null / false / [], never toast.

const TABLE = "chat_widgets";
const list = (v) => (Array.isArray(v) ? v : []);
const bag = (v) => (v && typeof v === "object" ? v : {});

export const DEFAULT_APPEARANCE = { position: "bottom-right", color: "#E8613C", title: "Chat with us", launcherLabel: "Chat" };

// Unguessable-enough public key for the snippet ("cw_" + 20 hex chars).
export function newWidgetPublicId() {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return `cw_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export function normalizeChatWidget(row) {
  if (!row) return null;
  const offline = bag(row.offline);
  return {
    ...bag(row.metadata),
    id: row.id,
    projectId: row.project_id ?? null,
    publicId: row.public_id ?? "",
    name: row.name ?? "Website chat",
    status: row.status ?? "active",
    appearance: { ...DEFAULT_APPEARANCE, ...bag(row.appearance) },
    greeting: row.greeting ?? "",
    requireEmail: Boolean(row.require_email),
    offline: { mode: offline.mode || "email_capture", message: offline.message || "" },
    businessHours: normalizeBusinessHours(row.business_hours),
    allowedDomains: list(row.allowed_domains),
    assignmentRuleId: row.assignment_rule_id ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function chatWidgetToRow(input) {
  const row = {};
  if ("publicId" in input) row.public_id = input.publicId;
  if ("name" in input) row.name = String(input.name || "").trim() || "Website chat";
  if ("status" in input) row.status = input.status === "paused" ? "paused" : "active";
  if ("appearance" in input) row.appearance = { ...DEFAULT_APPEARANCE, ...bag(input.appearance) };
  if ("greeting" in input) row.greeting = String(input.greeting || "");
  if ("requireEmail" in input) row.require_email = Boolean(input.requireEmail);
  if ("offline" in input) {
    const o = bag(input.offline);
    row.offline = { mode: ["email_capture", "message", "hide"].includes(o.mode) ? o.mode : "email_capture", message: String(o.message || "") };
  }
  if ("businessHours" in input) row.business_hours = normalizeBusinessHours(input.businessHours);
  if ("allowedDomains" in input) {
    row.allowed_domains = list(input.allowedDomains)
      .map((d) => String(d || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, ""))
      .filter(Boolean);
  }
  if ("assignmentRuleId" in input) row.assignment_rule_id = input.assignmentRuleId || null;
  if ("createdBy" in input) row.created_by = input.createdBy ?? null;
  if ("metadata" in input) row.metadata = bag(input.metadata);
  return row;
}

export async function listChatWidgets(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    if (error) {
      console.error("[chat_widgets.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeChatWidget);
  } catch (e) {
    console.error("[chat_widgets.list]", e);
    return null;
  }
}

export async function createChatWidget(projectId, input) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const payload = { ...chatWidgetToRow({ publicId: newWidgetPublicId(), ...input }), project_id: projectId };
    if (input.id) payload.id = input.id;
    const { data, error } = await schemaClient().from(TABLE).insert(payload).select("*").single();
    if (error) {
      console.error("[chat_widgets.create]", error.message);
      return null;
    }
    return normalizeChatWidget(data);
  } catch (e) {
    console.error("[chat_widgets.create]", e);
    return null;
  }
}

export async function updateChatWidget(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .update(chatWidgetToRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[chat_widgets.update]", error.message);
      return null;
    }
    return normalizeChatWidget(data);
  } catch (e) {
    console.error("[chat_widgets.update]", e);
    return null;
  }
}

export async function softDeleteChatWidget(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient().from(TABLE).update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      console.error("[chat_widgets.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[chat_widgets.delete]", e);
    return false;
  }
}
