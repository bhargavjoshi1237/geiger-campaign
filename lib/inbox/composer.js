// Composer state (isomorphic, pure): turns the platform messaging window into what the reply box may do
// and the copy the window indicator shows. Built on lib/inbox/window.js so the UI and the reply route
// enforce the same rule.
//   mode: free | human_tag | template | closed | comment

import { messagingWindow } from "./window";
import { formatDuration, HOUR, DAY, toMs } from "./format";

const CHANNEL_NAMES = { instagram: "Instagram", messenger: "Messenger", whatsapp: "WhatsApp" };

export function composerState(conversation, { now, contactName = "this contact" } = {}) {
  if (!conversation) return { mode: "closed", tone: "neutral", label: "", detail: "" };
  if (conversation.kind === "comment") {
    return { mode: "comment", tone: "neutral", label: "", detail: "Reply publicly under the comment, or send one private reply as a DM." };
  }
  const w = messagingWindow(conversation, { now, human: true });
  if (!w.windowed) return { mode: "free", tone: "neutral", label: "", detail: "", window: w };

  const channel = CHANNEL_NAMES[conversation.channel] || conversation.channel;
  const last = toMs(conversation.lastInboundAt ?? conversation.last_inbound_at);
  const neverWrote = Number.isNaN(last) || !last;

  if (w.open && !w.tag) {
    const left = toMs(w.expiresAt) - now;
    return {
      mode: "free",
      tone: left <= 2 * HOUR ? "warning" : "success",
      label: `Window closes in ${formatDuration(left)}`,
      detail: `${channel} allows free-form replies for 24 hours after ${contactName}'s last message.`,
      expiresAt: w.expiresAt,
      window: w,
    };
  }
  if (w.tag === "HUMAN_AGENT") {
    const left = toMs(w.expiresAt) - now;
    const days = Math.max(1, Math.ceil(left / DAY));
    return {
      mode: "human_tag",
      tone: "warning",
      label: `Human agent tag — ${days} ${days === 1 ? "day" : "days"} left`,
      detail: `The 24-hour window closed ${formatDuration(now - last - 24 * HOUR)} ago. Replies you type are sent under Meta's HUMAN_AGENT tag until ${new Date(w.expiresAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}. Automated messages can't use it.`,
      expiresAt: w.expiresAt,
      tag: w.tag,
      window: w,
    };
  }
  if (w.requiresTemplate) {
    return {
      mode: "template",
      tone: "danger",
      label: "Template required",
      detail: neverWrote
        ? `${contactName} hasn't messaged this number yet, so WhatsApp only allows an approved template.`
        : `The 24-hour window closed ${formatDuration(now - last - 24 * HOUR)} ago. WhatsApp only allows an approved template until ${contactName} replies.`,
      window: w,
    };
  }
  return {
    mode: "closed",
    tone: "danger",
    label: "Window closed",
    detail: neverWrote
      ? `${contactName} hasn't messaged you on ${channel}, and Meta doesn't allow businesses to start the conversation.`
      : `It's been more than 7 days since ${contactName}'s last message. ${channel} won't deliver a reply until they write again.`,
    window: w,
  };
}
