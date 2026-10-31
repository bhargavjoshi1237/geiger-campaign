import { isOptIn, isOptOut } from "./rules";
import { latestConsent, recordChatEvent } from "./store";
import { sendBotMessage } from "./send";

// Opt-out / opt-in keywords (server-only). STOP and friends write an opted_out row to the consent ledger,
// stop every flow, sequence and queued reply for that person on that channel, and send one confirmation.
// START (or /start on Telegram) opts a person who stopped back in.

export const OPT_OUT_CONFIRMATION = "You're unsubscribed from automated messages here. Reply START to opt back in.";
export const OPT_IN_CONFIRMATION = "You're subscribed again. Reply STOP at any time to opt out.";

async function writeConsent(ctx, status, keyword) {
  if (!ctx.contact?.id) return;
  const { error } = await ctx.db.from("contact_consents").insert({
    project_id: ctx.projectId,
    contact_id: ctx.contact.id,
    channel: ctx.channel,
    status,
    source: `Keyword reply: ${String(keyword).trim().toUpperCase()}`,
    proof: {
      method: "keyword",
      keyword: String(keyword).trim(),
      message_id: ctx.event?.externalMessageId || null,
      conversation_id: ctx.conversation?.id || null,
    },
    captured_at: new Date().toISOString(),
  });
  if (error) console.error("[chat.optout.consent]", error.message);
}

async function stopAutomation(ctx) {
  const contactId = ctx.contact?.id;
  const now = new Date().toISOString();
  if (ctx.conversation?.id) {
    await ctx.db
      .from("dm_flow_sessions")
      .update({ status: "cancelled", completed_at: now, waiting_for: "none" })
      .eq("conversation_id", ctx.conversation.id)
      .in("status", ["active", "waiting"]);
  }
  if (!contactId) return;
  await ctx.db
    .from("dm_flow_sessions")
    .update({ status: "cancelled", completed_at: now, waiting_for: "none" })
    .eq("contact_id", contactId)
    .eq("channel", ctx.channel)
    .in("status", ["active", "waiting"]);
  await ctx.db
    .from("chat_sequence_enrollments")
    .update({ status: "stopped", stop_reason: "opted_out", next_run_at: null })
    .eq("contact_id", contactId)
    .eq("channel", ctx.channel)
    .eq("status", "active");
  await ctx.db
    .from("chat_outbox")
    .update({ status: "cancelled", reason: "opted_out" })
    .eq("contact_id", contactId)
    .eq("channel", ctx.channel)
    .eq("status", "queued");
}

// -> { handled, action: "opt_out" | "opt_in" | null }
export async function handleOptKeywords(ctx) {
  const text = ctx.event?.text || "";
  if (isOptOut(text)) {
    await writeConsent(ctx, "opted_out", text);
    await stopAutomation(ctx);
    await sendBotMessage(ctx, { text: OPT_OUT_CONFIRMATION }, { force: true, kind: "opt_out" });
    await recordChatEvent(ctx, "social.opt_out", { keyword: text.trim().toLowerCase(), conversationId: ctx.conversation?.id || null });
    return { handled: true, action: "opt_out" };
  }
  if (isOptIn(text) && (await latestConsent(ctx.db, ctx.contact?.id, ctx.channel)) === "opted_out") {
    await writeConsent(ctx, "opted_in", text.replace(/^\//, ""));
    await sendBotMessage(ctx, { text: OPT_IN_CONFIRMATION }, { force: true, kind: "opt_in" });
    await recordChatEvent(ctx, "social.opt_in", { keyword: text.trim().toLowerCase(), conversationId: ctx.conversation?.id || null });
    return { handled: true, action: "opt_in" };
  }
  return { handled: false, action: null };
}
