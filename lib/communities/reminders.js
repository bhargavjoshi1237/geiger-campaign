import { dispatch } from "@/lib/messaging/dispatch";
import { publicUrl } from "@/lib/server/urls";
import { PLATFORMS, channelWorkspacePath, openInAppUrl } from "./platforms";

// Manual-assist reminders (server-only, service-role db): WhatsApp Channels and Instagram broadcast
// channels have no public write API, so when a planned post is due the assignee gets an in-app notice
// (public.flow_notifications, the suite bell) and an email through dispatch with the copy and links.

const escapeHtml = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function excerpt(text, max = 220) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function reminderEmail({ channel, post, plannerUrl, appUrl, platform }) {
  const when = post.scheduled_at ? new Date(post.scheduled_at).toUTCString().replace(" GMT", " UTC") : "now";
  const media = (Array.isArray(post.media) ? post.media : [])
    .map((m) => `<li><a href="${escapeHtml(m.url)}" style="color:#2563eb">${escapeHtml(m.name || m.url)}</a></li>`)
    .join("");
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f9fafb;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827">
<table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px">
<tr><td style="padding:24px">
<p style="margin:0 0 4px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.04em">${escapeHtml(platform.label)}</p>
<h1 style="margin:0 0 8px;font-size:18px;font-weight:600">Time to post in ${escapeHtml(channel.name)}</h1>
<p style="margin:0 0 16px;font-size:14px;color:#4b5563">Scheduled for ${escapeHtml(when)}. ${escapeHtml(platform.postHint || "")}</p>
<div style="white-space:pre-wrap;font-size:14px;line-height:1.5;padding:16px;border:1px solid #e5e7eb;border-radius:8px;background:#f9fafb">${escapeHtml(post.body || "(no text)")}</div>
${media ? `<p style="margin:16px 0 4px;font-size:13px;font-weight:600">Media to attach</p><ul style="margin:0;padding-left:18px;font-size:13px">${media}</ul>` : ""}
<p style="margin:20px 0 0"><a href="${escapeHtml(plannerUrl)}" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#111827;color:#ffffff;text-decoration:none;font-size:14px;font-weight:500">Open the post in Geiger Campaign</a></p>
${appUrl ? `<p style="margin:12px 0 0;font-size:13px"><a href="${escapeHtml(appUrl)}" style="color:#2563eb">Open ${escapeHtml(platform.appLabel)}</a></p>` : ""}
<p style="margin:20px 0 0;font-size:12px;color:#6b7280">${escapeHtml(platform.appLabel)} doesn't offer an API for channel posts, so Geiger reminds you instead of posting it. Mark it as posted in Geiger once it's live.</p>
</td></tr></table></body></html>`;
  return { subject: `Reminder: post in ${channel.name}`, html };
}

// Returns { assigneeId, inApp, email, error } and never throws.
export async function sendPostReminder(db, { post, channel, now = new Date() }) {
  const assigneeId = post.assignee_id || channel.settings?.assigneeId || post.created_by || null;
  const platform = PLATFORMS[channel.platform] || PLATFORMS.whatsapp_channel;
  const result = { assigneeId, inApp: false, email: "skipped", error: null };
  if (!assigneeId) return { ...result, error: "No assignee to remind." };

  const plannerUrl = publicUrl(channelWorkspacePath(channel.project_id, channel.platform, channel.id, "planner"));
  const appUrl = openInAppUrl({ platform: channel.platform, inviteUrl: channel.invite_url, handle: channel.handle });

  try {
    const { error } = await db.schema("public").from("flow_notifications").insert({
      user_id: assigneeId,
      title: `Time to post in ${channel.name}`,
      description: `${platform.label} post scheduled for now. Copy it from Geiger and post it in ${platform.appLabel}.`,
      type: "update",
      icon: "CalendarClock",
      time: now.toISOString(),
      read: false,
      extra: { type: "comment", text: excerpt(post.body) || "(media only)" },
      bg_color: "bg-amber-500/10",
      icon_color: "text-amber-600 dark:text-amber-400",
    });
    if (error) console.error("[communities.reminder.notice]", error.message);
    result.inApp = !error;
  } catch (error) {
    console.error("[communities.reminder.notice]", error);
  }

  let email = null;
  try {
    const { data } = await db.auth.admin.getUserById(assigneeId);
    email = data?.user?.email || null;
  } catch (error) {
    console.error("[communities.reminder.user]", error?.message);
  }
  if (email) {
    const sent = await dispatch({
      db,
      projectId: channel.project_id,
      channel: "email",
      to: email,
      source: { type: "community", id: post.id },
      idempotencyKey: `community-reminder:${post.id}:${post.scheduled_at || ""}`,
      metadata: { kind: "community_reminder", channelId: channel.id },
      message: { ...reminderEmail({ channel, post, plannerUrl, appUrl, platform }), label: "campaign.community_reminder" },
    });
    result.email = sent.status;
    if (sent.error && sent.status !== "sent") result.error = sent.error;
  }
  return result;
}
