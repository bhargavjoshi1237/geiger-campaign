"use client";

import { isSupabaseConfigured, schemaClient } from "@/supabase/components/campaign-client";
import { normalizeConversation, normalizeMessage } from "@/lib/supabase/conversations";

// Read-only view over the inbox for the Comments browser: comment threads (campaign.conversations, kind
// 'comment') and their messages in one bulk read, normalized by the conversations data layer. Writes
// (hide / delete / reply) go through the moderation actions route. Pure: null / [] on failure.

const CHANNELS = ["instagram", "messenger", "telegram", "tiktok"];

// Returns { conversations, messages } for the most recent comment threads.
export async function listCommentThreads(projectId, { limit = 300 } = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const sb = schemaClient();
    const { data: threads, error } = await sb
      .from("conversations")
      .select("*")
      .eq("project_id", projectId)
      .eq("kind", "comment")
      .in("channel", CHANNELS)
      .is("deleted_at", null)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(limit);
    if (error) {
      console.error("[social_comments.threads]", error.message);
      return null;
    }
    const conversations = (threads || []).map(normalizeConversation);
    if (!conversations.length) return { conversations, messages: [] };

    const messages = [];
    const ids = conversations.map((c) => c.id);
    for (let i = 0; i < ids.length; i += 100) {
      const { data, error: msgError } = await sb
        .from("conversation_messages")
        .select("*")
        .eq("project_id", projectId)
        .in("conversation_id", ids.slice(i, i + 100))
        .is("deleted_at", null)
        .order("sent_at", { ascending: true })
        .limit(5000);
      if (msgError) {
        console.error("[social_comments.messages]", msgError.message);
        return null;
      }
      messages.push(...(data || []).map(normalizeMessage));
    }
    return { conversations, messages };
  } catch (e) {
    console.error("[social_comments.threads]", e);
    return null;
  }
}
