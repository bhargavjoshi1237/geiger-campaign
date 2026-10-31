"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";
import { normalizeMessage } from "@/lib/supabase/conversations";

// Read-only data layer for a channel screen's recent activity: the latest inbound/outbound messages across the
// given conversations (campaign.conversation_messages, notes excluded). Pure: null / [] on failure.

export async function listRecentMessages(projectId, conversationIds, { limit = 100 } = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  if (!conversationIds?.length) return [];
  try {
    const { data, error } = await schemaClient()
      .from("conversation_messages")
      .select("*")
      .eq("project_id", projectId)
      .in("conversation_id", conversationIds.slice(0, 500))
      .neq("direction", "note")
      .is("deleted_at", null)
      .order("sent_at", { ascending: false })
      .limit(limit);
    if (error) {
      console.error("[social.activity.messages]", error.message);
      return null;
    }
    return (data || []).map(normalizeMessage);
  } catch (e) {
    console.error("[social.activity.messages]", e);
    return null;
  }
}
