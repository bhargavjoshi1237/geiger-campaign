import { adminClient } from "@/lib/supabase/admin";
import { dispatch } from "@/lib/messaging/dispatch";
import { loadConnection } from "@/lib/messaging/connections";
import { recordEvent } from "@/lib/events/record";
import { graphRequest, sendGraphMessage } from "@/lib/social/meta_graph";
import { draftFromTemplate, missingTemplateVariables, renderTemplatePreview, templateParameters } from "@/lib/channels/whatsapp_templates";
import { ApiError, badRequest, notFound } from "@/lib/server/http";
import { messagingWindow } from "./window";
import { openCountsByAssignee, pickAssignee, selectRule, selectSlaPolicy } from "./routing";
import { slaDeadlines } from "./sla";
import { formatDuration } from "./format";

// Inbox server logic (route handlers only): replies through dispatch with the messaging window enforced,
// Meta comment actions, routing (round robin / least busy + SLA deadlines) and bulk thread updates.
// `db` is the caller's RLS-scoped campaign client; server-only writes (counters, events) use the admin client.

const DAY = 86_400_000;
const STATUSES = new Set(["open", "pending", "snoozed", "resolved"]);
const PRIORITIES = new Set(["low", "normal", "high", "urgent"]);
const conflict = (message, code) => new ApiError(409, message, code);
const notConnectedError = (label) => new ApiError(503, `${label} isn't connected. Reconnect the account in Channels.`, "not_connected");
const CHANNEL_LABEL = { instagram: "Instagram", messenger: "Messenger", whatsapp: "WhatsApp", sms: "SMS", email: "Email", chat: "Live chat", telegram: "Telegram", tiktok: "TikTok", rcs: "RCS" };
const bag = (v) => (v && typeof v === "object" ? v : {});
const agentFirstName = (user) => String(user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split("@")[0] || "Support").split(/\s+/)[0];
const contactLabel = (contact) => [contact?.first_name, contact?.last_name].filter(Boolean).join(" ") || contact?.email || contact?.phone || "the contact";

export async function loadConversation(db, projectId, conversationId) {
  const { data, error } = await db
    .from("conversations")
    .select("*")
    .eq("project_id", projectId)
    .eq("id", conversationId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new ApiError(500, "Couldn't load the conversation.", "load_failed");
  if (!data) throw notFound("Conversation not found.");
  return data;
}

async function loadContact(admin, projectId, contactId) {
  if (!contactId) return null;
  const { data } = await admin.from("contacts").select("*").eq("project_id", projectId).eq("id", contactId).maybeSingle();
  return data || null;
}

async function latestConsent(admin, projectId, contactId, channel) {
  if (!contactId) return null;
  const { data } = await admin
    .from("contact_consents")
    .select("status, captured_at")
    .eq("project_id", projectId)
    .eq("contact_id", contactId)
    .eq("channel", channel)
    .is("deleted_at", null)
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.status || null;
}

// Where a reply goes on the conversation's channel.
function recipientAddress(conversation, contact) {
  const identities = bag(bag(contact?.metadata).identities);
  switch (conversation.channel) {
    case "email":
      return contact?.email || bag(conversation.metadata).from || null;
    case "sms":
    case "whatsapp":
    case "rcs":
      return contact?.phone || conversation.external_thread_id || null;
    default:
      return identities[conversation.channel] || conversation.external_thread_id || null;
  }
}

function sanitizeAttachments(list) {
  return (Array.isArray(list) ? list : [])
    .filter((a) => a && /^https:\/\//i.test(String(a.url || "")))
    .slice(0, 10)
    .map((a) => ({
      url: String(a.url),
      name: String(a.name || "attachment").slice(0, 200),
      type: String(a.type || "application/octet-stream").slice(0, 120),
      size: Number(a.size) || 0,
    }));
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function emailHtml(body, attachments) {
  const paragraphs = escapeHtml(body).split(/\n{2,}/).map((p) => `<p style="margin:0 0 12px">${p.replace(/\n/g, "<br>")}</p>`).join("");
  const files = attachments.map((a) => `<p style="margin:0 0 6px"><a href="${escapeHtml(a.url)}">${escapeHtml(a.name)}</a></p>`).join("");
  return `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1a1a1a">${paragraphs}${files}</div>`;
}

async function loadApprovedTemplate(db, projectId, templateId, conversation) {
  const { data: template } = await db
    .from("message_templates")
    .select("*")
    .eq("project_id", projectId)
    .eq("id", templateId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!template) throw badRequest("That template doesn't exist.");
  if (template.status !== "approved") throw conflict(`"${template.name}" isn't approved by Meta yet (status: ${template.status}).`, "template_not_approved");
  if (template.connection_id && conversation.connection_id && template.connection_id !== conversation.connection_id) {
    throw badRequest(`"${template.name}" belongs to a different WhatsApp number.`);
  }
  return template;
}

// Recipient-visible text of a template send, for the thread.
export function templatePreviewText(template, variables = {}) {
  const draft = draftFromTemplate(template);
  const preview = renderTemplatePreview({ ...draft, headerSamples: variables.header || [], bodySamples: variables.body || [] });
  return [preview.header, preview.body, preview.footer].filter(Boolean).join("\n\n");
}

async function sendLiveChat({ db, projectId, conversation, user, body, attachments, clientMessageId }) {
  const now = new Date().toISOString();
  const row = {
    ...(clientMessageId ? { id: clientMessageId } : {}),
    project_id: projectId,
    conversation_id: conversation.id,
    direction: "outbound",
    sender_type: "agent",
    sender_id: user.id,
    body,
    attachments,
    status: "sent",
    sent_at: now,
    metadata: { senderName: agentFirstName(user) },
  };
  const { data, error } = await db.from("conversation_messages").insert(row).select("*").single();
  if (error) throw new ApiError(500, "Couldn't post the reply.", "insert_failed");
  return { message: data, delivery: { status: "sent", deliveryId: null, error: null } };
}

// POST …/inbox/conversations/:id/reply — input { body, attachments, templateId, templateVariables, savedReplyId, clientMessageId }.
export async function sendReply({ db, projectId, conversationId, user, input }) {
  const admin = adminClient();
  if (!admin) throw new ApiError(503, "Server database access isn't configured.", "not_configured");
  const conversation = await loadConversation(db, projectId, conversationId);
  if (conversation.kind === "comment") throw badRequest("Comments are answered with a public or private reply.");

  const body = String(input?.body || "").trim().slice(0, 4096);
  const attachments = sanitizeAttachments(input?.attachments);
  const templateId = input?.templateId || null;
  const variables = bag(input?.templateVariables);
  const clientMessageId = /^[0-9a-f-]{36}$/i.test(String(input?.clientMessageId || "")) ? input.clientMessageId : null;
  if (!body && !attachments.length && !templateId) throw badRequest("Write a reply first.");

  const channel = conversation.channel;
  const label = CHANNEL_LABEL[channel] || channel;
  const contact = await loadContact(admin, projectId, conversation.contact_id);
  const name = contactLabel(contact);
  const now = Date.now();
  const window = messagingWindow(conversation, { now, human: true });

  let result;
  let sentBody = body;
  let messageMeta = {};

  if (channel === "chat") {
    result = await sendLiveChat({ db, projectId, conversation, user, body, attachments, clientMessageId });
  } else {
    let message;
    if (channel === "whatsapp") {
      if (!window.open && !templateId) {
        throw conflict(`The 24-hour window with ${name} is closed. WhatsApp only allows an approved template until they reply.`, "template_required");
      }
      if (templateId) {
        const template = await loadApprovedTemplate(db, projectId, templateId, conversation);
        if (missingTemplateVariables(template, variables).length) throw badRequest("Fill in every template variable.");
        sentBody = templatePreviewText(template, variables);
        messageMeta = { template: { id: template.id, name: template.name, language: template.language, category: template.category } };
        message = {
          type: "template",
          text: sentBody,
          body: sentBody,
          template: { id: template.id, name: template.name, language: template.language, category: template.category, components: templateParameters(template, variables) },
        };
      } else {
        message = { type: "text", text: body, body, attachments };
      }
    } else if (channel === "instagram" || channel === "messenger") {
      if (!window.open) {
        const last = conversation.last_inbound_at ? `${formatDuration(now - new Date(conversation.last_inbound_at).getTime())} ago` : "never";
        throw conflict(`${name} last messaged you ${last}. ${label} only allows replies within 7 days of their last message — wait for them to write again.`, "window_closed");
      }
      message = { type: "text", text: body, body, attachments, messagingType: window.tag ? "MESSAGE_TAG" : "RESPONSE", tag: window.tag };
      if (window.tag) messageMeta = { tag: window.tag };
    } else if (channel === "email") {
      const subject = `Re: ${conversation.title || "your message"}`.slice(0, 200);
      message = { subject, html: emailHtml(body, attachments), text: body, label: "campaign.inbox_reply" };
    } else {
      if (channel === "sms" || channel === "rcs") {
        const consent = await latestConsent(admin, projectId, conversation.contact_id, channel);
        if (consent === "opted_out") throw conflict(`${name} opted out of ${label} (STOP). They have to opt back in before you can text them.`, "opted_out");
      }
      message = { type: "text", text: body, body, attachments };
    }

    const to = recipientAddress(conversation, contact);
    if (!to) throw badRequest(`There's no ${label} address for ${name}.`);

    const delivery = await dispatch({
      db: admin,
      projectId,
      channel,
      to,
      contactId: conversation.contact_id,
      connectionId: conversation.connection_id,
      source: { type: "inbox", id: conversation.id },
      idempotencyKey: clientMessageId ? `inbox:${conversation.id}:${clientMessageId}` : null,
      message,
      metadata: { conversationId: conversation.id, agentId: user.id, ...(window.tag ? { tag: window.tag } : {}) },
    });

    const status = delivery.status === "sent" || delivery.status === "delivered" ? delivery.status : delivery.status === "queued" ? "queued" : "failed";
    const row = {
      ...(clientMessageId ? { id: clientMessageId } : {}),
      project_id: projectId,
      conversation_id: conversation.id,
      direction: "outbound",
      sender_type: "agent",
      sender_id: user.id,
      body: sentBody,
      attachments,
      external_id: delivery.providerId || null,
      status,
      delivery_id: delivery.deliveryId || null,
      error: status === "failed" ? String(delivery.error || "The message wasn't sent.").slice(0, 500) : null,
      sent_at: new Date().toISOString(),
      metadata: messageMeta,
    };
    let inserted = await db.from("conversation_messages").insert(row).select("*").single();
    if (inserted.error && clientMessageId) {
      inserted = await db.from("conversation_messages").select("*").eq("id", clientMessageId).maybeSingle();
    }
    if (!inserted.data) throw new ApiError(500, "The reply was dispatched but couldn't be saved to the thread.", "insert_failed");
    result = { message: inserted.data, delivery: { status: delivery.status, deliveryId: delivery.deliveryId, error: delivery.error || null } };
  }

  const sent = result.message.status !== "failed";
  const nowIso = new Date().toISOString();
  const patch = {
    last_message_at: nowIso,
    unread_count: 0,
    handled_by: "human",
    ...(conversation.assignee_id ? {} : { assignee_id: user.id }),
    ...(conversation.status === "resolved" || conversation.status === "snoozed" ? { status: "open", snoozed_until: null, resolved_at: null } : {}),
    ...(sent && !conversation.first_response_at ? { first_response_at: nowIso, sla_due_at: conversation.resolution_due_at || null } : {}),
    metadata: { ...bag(conversation.metadata), preview: sentBody.slice(0, 160), previewDirection: "outbound" },
  };
  const { data: updated } = await db.from("conversations").update(patch).eq("id", conversation.id).select("*").maybeSingle();

  if (input?.savedReplyId && /^[0-9a-f-]{36}$/i.test(String(input.savedReplyId))) {
    const { data: reply } = await admin.from("saved_replies").select("id, usage_count").eq("project_id", projectId).eq("id", input.savedReplyId).maybeSingle();
    if (reply) await admin.from("saved_replies").update({ usage_count: (reply.usage_count || 0) + 1, last_used_at: nowIso }).eq("id", reply.id);
  }

  if (sent) {
    await recordEvent(admin, {
      projectId,
      contactId: conversation.contact_id,
      name: "inbox.reply_sent",
      properties: { channel, conversationId: conversation.id, ...(messageMeta.template ? { template: messageMeta.template.name } : {}), ...(window.tag ? { tag: window.tag } : {}) },
      source: "system",
      deliveryId: result.delivery.deliveryId,
    });
  }

  return { ...result, conversation: updated || conversation };
}

// Page/IG token and node id for Graph calls on a comment's connection.
async function graphAccess(admin, projectId, conversation) {
  const { connection, secrets } = await loadConnection(admin, projectId, conversation.channel, conversation.connection_id);
  const s = bag(secrets);
  const token = s.pageAccessToken || s.page_access_token || s.accessToken || s.access_token || null;
  const label = CHANNEL_LABEL[conversation.channel] || conversation.channel;
  if (!connection || connection.status === "disconnected" || !token) throw notConnectedError(label);
  const config = bag(connection.config);
  return { connection, token, pageId: config.pageId || config.page_id || connection.external_id };
}

async function insertMessage(db, row) {
  const { data, error } = await db.from("conversation_messages").insert({ sent_at: new Date().toISOString(), metadata: {}, ...row }).select("*").single();
  if (error) throw new ApiError(500, "Couldn't save the message.", "insert_failed");
  return data;
}

// POST …/inbox/conversations/:id/comment — input { action: reply | private_reply | hide | unhide | delete, body, commentId }.
export async function commentAction({ db, projectId, conversationId, user, input }) {
  const admin = adminClient();
  if (!admin) throw new ApiError(503, "Server database access isn't configured.", "not_configured");
  const conversation = await loadConversation(db, projectId, conversationId);
  if (conversation.kind !== "comment") throw badRequest("This conversation isn't a comment thread.");
  const action = String(input?.action || "");
  if (!["reply", "private_reply", "hide", "unhide", "delete"].includes(action)) throw badRequest("Unknown comment action.");
  const meta = bag(conversation.metadata);
  const context = bag(meta.context);
  const target = String(input?.commentId || context.commentId || conversation.external_thread_id || "");
  if (!target) throw badRequest("This thread has no comment id to act on.");
  const isInstagram = conversation.channel === "instagram";
  const body = String(input?.body || "").trim().slice(0, 2000);
  if ((action === "reply" || action === "private_reply") && !body) throw badRequest("Write a reply first.");

  const { data: commentRow } = await db
    .from("conversation_messages")
    .select("*")
    .eq("conversation_id", conversation.id)
    .eq("external_id", target)
    .maybeSingle();

  if (action === "private_reply") {
    const sentTo = bag(meta.privateReplies);
    if (sentTo[target]) throw conflict("A private reply was already sent for this comment — Meta allows one per comment.", "private_reply_used");
    const commentedAt = new Date(commentRow?.sent_at || conversation.last_inbound_at || conversation.created_at).getTime();
    if (Date.now() - commentedAt > 7 * DAY) throw conflict("Private replies are only allowed within 7 days of the comment.", "private_reply_expired");
  }

  const { token, pageId } = await graphAccess(admin, projectId, conversation);
  const nowIso = new Date().toISOString();
  let message = null;
  let metaPatch = {};

  if (action === "reply") {
    const res = isInstagram
      ? await graphRequest(`${target}/replies`, { token, method: "POST", query: { message: body } })
      : await graphRequest(`${target}/comments`, { token, method: "POST", body: { message: body } });
    if (!res.ok) throw new ApiError(502, `Meta rejected the reply: ${res.error}`, "graph_failed");
    message = await insertMessage(db, {
      project_id: projectId, conversation_id: conversation.id, direction: "outbound", sender_type: "agent", sender_id: user.id,
      body, external_id: res.data?.id || null, status: "sent", metadata: { kind: "public_reply", parentCommentId: target },
    });
  } else if (action === "private_reply") {
    const res = await sendGraphMessage({ nodeId: pageId, token, recipient: { comment_id: target }, message: { text: body } });
    if (!res.ok) throw new ApiError(502, `Meta rejected the private reply: ${res.error}`, "graph_failed");
    message = await insertMessage(db, {
      project_id: projectId, conversation_id: conversation.id, direction: "outbound", sender_type: "agent", sender_id: user.id,
      body, external_id: res.data?.message_id || null, status: "sent", metadata: { kind: "private_reply", parentCommentId: target },
    });
    metaPatch = { privateReplies: { ...bag(meta.privateReplies), [target]: nowIso } };
  } else if (action === "hide" || action === "unhide") {
    const hide = action === "hide";
    const res = await graphRequest(target, { token, method: "POST", query: isInstagram ? { hide } : { is_hidden: hide } });
    if (!res.ok) throw new ApiError(502, `Meta rejected the change: ${res.error}`, "graph_failed");
    if (commentRow) await db.from("conversation_messages").update({ metadata: { ...bag(commentRow.metadata), hidden: hide } }).eq("id", commentRow.id);
    if (target === (context.commentId || conversation.external_thread_id)) metaPatch = { hidden: hide };
  } else if (action === "delete") {
    const res = await graphRequest(target, { token, method: "DELETE" });
    if (!res.ok) throw new ApiError(502, `Meta rejected the delete: ${res.error}`, "graph_failed");
    if (commentRow) await db.from("conversation_messages").update({ metadata: { ...bag(commentRow.metadata), deletedAt: nowIso } }).eq("id", commentRow.id);
    if (target === (context.commentId || conversation.external_thread_id)) metaPatch = { deletedAt: nowIso };
  }

  const replied = action === "reply" || action === "private_reply";
  const patch = {
    unread_count: 0,
    ...(conversation.assignee_id ? {} : { assignee_id: user.id }),
    ...(replied ? { last_message_at: nowIso, metadata: { ...meta, ...metaPatch, preview: body.slice(0, 160), previewDirection: "outbound" } } : { metadata: { ...meta, ...metaPatch } }),
    ...(replied && !conversation.first_response_at ? { first_response_at: nowIso, sla_due_at: conversation.resolution_due_at || null } : {}),
    ...(action === "delete" && metaPatch.deletedAt ? { status: "resolved", resolved_at: nowIso, sla_due_at: null } : {}),
  };
  const { data: updated } = await db.from("conversations").update(patch).eq("id", conversation.id).select("*").maybeSingle();

  await recordEvent(admin, {
    projectId,
    contactId: conversation.contact_id,
    name: `inbox.comment_${action}`,
    properties: { channel: conversation.channel, conversationId: conversation.id, commentId: target, postId: context.postId || null },
    source: "social",
  });

  return { message, conversation: updated || conversation };
}

// Active project members (user ids) — assignment targets.
async function memberIds(admin, projectId) {
  const { data } = await admin
    .from("role_grants")
    .select("user_id")
    .eq("project_id", projectId)
    .eq("status", "active")
    .is("deleted_at", null);
  return new Set((data || []).map((g) => g.user_id));
}

async function firstInboundBodies(admin, ids) {
  if (!ids.length) return new Map();
  const { data } = await admin
    .from("conversation_messages")
    .select("conversation_id, body, sent_at")
    .in("conversation_id", ids)
    .eq("direction", "inbound")
    .order("sent_at", { ascending: true })
    .limit(ids.length * 5);
  const out = new Map();
  for (const m of data || []) if (!out.has(m.conversation_id)) out.set(m.conversation_id, m.body || "");
  return out;
}

// Runs the routing rules + SLA policy over conversations: assigns unassigned ones (unless `force`), stamps
// missing SLA deadlines and advances each rule's round-robin pointer. Admin db; callers authorize first.
export async function routeConversations(admin, projectId, conversationIds, { force = false } = {}) {
  const ids = [...new Set(conversationIds)].slice(0, 500);
  if (!ids.length) return { assigned: [], skipped: [] };
  const [{ data: rows }, { data: rules }, { data: policies }, { data: open }] = await Promise.all([
    admin.from("conversations").select("*").eq("project_id", projectId).in("id", ids).is("deleted_at", null),
    admin.from("assignment_rules").select("*").eq("project_id", projectId).eq("active", true).is("deleted_at", null),
    admin.from("sla_policies").select("*").eq("project_id", projectId).eq("active", true).is("deleted_at", null),
    admin.from("conversations").select("assignee_id, status").eq("project_id", projectId).in("status", ["open", "pending"]).not("assignee_id", "is", null).is("deleted_at", null),
  ]);
  const members = await memberIds(admin, projectId);
  const counts = openCountsByAssignee(open || []);
  const firstBodies = await firstInboundBodies(admin, ids);
  const ruleState = new Map((rules || []).map((r) => [r.id, { ...r, members: (r.members || []).filter((m) => members.has(m)) }]));
  // A live-chat widget can pin its chats to one rule.
  const widgetIds = [...new Set((rows || []).map((r) => bag(r.metadata).widgetId).filter(Boolean))];
  const { data: widgets } = widgetIds.length
    ? await admin.from("chat_widgets").select("id, assignment_rule_id").in("id", widgetIds)
    : { data: [] };
  const widgetRule = new Map((widgets || []).map((w) => [w.id, w.assignment_rule_id]));
  const assigned = [];
  const skipped = [];

  for (const row of rows || []) {
    const patch = {};
    if (!row.sla_policy_id && !row.first_response_at && row.status !== "resolved") {
      const policy = selectSlaPolicy(policies || [], row);
      if (policy) {
        const deadlines = slaDeadlines(policy, row.last_inbound_at || row.created_at);
        patch.sla_policy_id = policy.id;
        patch.sla_due_at = deadlines.slaDueAt;
        patch.resolution_due_at = deadlines.resolutionDueAt;
      }
    }
    if (row.assignee_id && !force) {
      if (Object.keys(patch).length) await admin.from("conversations").update(patch).eq("id", row.id);
      skipped.push({ id: row.id, reason: "Already assigned." });
      continue;
    }
    const pinned = ruleState.get(widgetRule.get(bag(row.metadata).widgetId));
    const rule = pinned || selectRule([...ruleState.values()], row, { firstMessage: firstBodies.get(row.id) });
    const pick = rule ? pickAssignee(rule, { openCounts: counts }) : { assigneeId: null, reason: "No routing rule matches." };
    if (pick.assigneeId) {
      patch.assignee_id = pick.assigneeId;
      counts[pick.assigneeId] = (counts[pick.assigneeId] || 0) + 1;
      const state = ruleState.get(rule.id);
      state.next_index = pick.nextIndex;
      state.assigned_count = (state.assigned_count || 0) + 1;
      state.last_assigned_at = new Date().toISOString();
      state.dirty = true;
      assigned.push({ id: row.id, assigneeId: pick.assigneeId, ruleId: rule.id, ruleName: rule.name });
    } else {
      skipped.push({ id: row.id, reason: pick.reason });
    }
    if (Object.keys(patch).length) await admin.from("conversations").update(patch).eq("id", row.id);
    if (pick.assigneeId) {
      await admin.from("conversation_messages").insert({
        project_id: projectId, conversation_id: row.id, direction: "note", sender_type: "system", body: `Routed by “${rule.name}”`,
        status: "sent", sent_at: new Date().toISOString(), metadata: { event: "assigned", assigneeId: pick.assigneeId, ruleId: rule.id },
      });
    }
  }

  for (const state of ruleState.values()) {
    if (!state.dirty) continue;
    await admin.from("assignment_rules").update({ next_index: state.next_index, assigned_count: state.assigned_count, last_assigned_at: state.last_assigned_at }).eq("id", state.id);
  }
  return { assigned, skipped };
}

// One conversation, for ingest paths (inbound webhooks, live chat) to call after creating a thread.
export async function autoRouteConversation(admin, { projectId, conversationId }) {
  try {
    return await routeConversations(admin, projectId, [conversationId]);
  } catch (error) {
    console.error("[inbox.autoRoute]", error);
    return { assigned: [], skipped: [{ id: conversationId, reason: "Routing failed." }] };
  }
}

const idList = (value) => [...new Set((Array.isArray(value) ? value : []).filter((id) => /^[0-9a-f-]{36}$/i.test(String(id))))].slice(0, 200);

// POST …/inbox/assign — input { conversationIds, mode: manual | auto, assigneeId, force }.
export async function assignConversations({ db, projectId, user, input }) {
  const admin = adminClient();
  if (!admin) throw new ApiError(503, "Server database access isn't configured.", "not_configured");
  const ids = idList(input?.conversationIds);
  if (!ids.length) throw badRequest("Pick at least one conversation.");

  if (input?.mode === "auto") return { mode: "auto", ...(await routeConversations(admin, projectId, ids, { force: Boolean(input.force) })) };

  const assigneeId = input?.assigneeId || null;
  if (assigneeId) {
    const members = await memberIds(admin, projectId);
    if (!members.has(assigneeId)) throw badRequest("That teammate isn't a member of this project.");
  }
  const { data, error } = await db
    .from("conversations")
    .update({ assignee_id: assigneeId })
    .eq("project_id", projectId)
    .in("id", ids)
    .is("deleted_at", null)
    .select("id");
  if (error) throw new ApiError(500, "Couldn't update the assignment.", "update_failed");
  const nowIso = new Date().toISOString();
  if (data?.length) {
    await db.from("conversation_messages").insert(
      data.map((row) => ({
        project_id: projectId, conversation_id: row.id, direction: "note", sender_type: "system", sender_id: user.id,
        body: assigneeId ? "Assigned" : "Unassigned", status: "sent", sent_at: nowIso, metadata: { event: assigneeId ? "assigned" : "unassigned", assigneeId },
      })),
    );
  }
  return { mode: "manual", assigned: (data || []).map((row) => ({ id: row.id, assigneeId })), skipped: [] };
}

// POST …/inbox/bulk — input { conversationIds, action, value }.
export async function bulkUpdate({ db, projectId, user, input }) {
  const ids = idList(input?.conversationIds);
  if (!ids.length) throw badRequest("Pick at least one conversation.");
  const action = String(input?.action || "");
  const value = input?.value;
  const nowIso = new Date().toISOString();

  if (action === "assign" || action === "unassign") {
    return assignConversations({ db, projectId, user, input: { conversationIds: ids, mode: "manual", assigneeId: action === "assign" ? value : null } });
  }
  if (action === "tag" || action === "untag") {
    const tag = String(value || "").trim().toLowerCase().slice(0, 40);
    if (!tag) throw badRequest("Name the tag.");
    const { data: rows } = await db.from("conversations").select("id, tags").eq("project_id", projectId).in("id", ids).is("deleted_at", null);
    let updated = 0;
    for (const row of rows || []) {
      const tags = new Set(row.tags || []);
      if (action === "tag") tags.add(tag);
      else tags.delete(tag);
      const { error } = await db.from("conversations").update({ tags: [...tags] }).eq("id", row.id);
      if (!error) updated += 1;
    }
    return { updated };
  }

  let patch;
  switch (action) {
    case "resolve":
      patch = { status: "resolved", resolved_at: nowIso, sla_due_at: null, snoozed_until: null, unread_count: 0 };
      break;
    case "reopen":
      patch = { status: "open", resolved_at: null, snoozed_until: null };
      break;
    case "snooze": {
      const until = new Date(value);
      if (Number.isNaN(until.getTime()) || until.getTime() <= Date.now()) throw badRequest("Snooze until a time in the future.");
      patch = { status: "snoozed", snoozed_until: until.toISOString() };
      break;
    }
    case "priority":
      if (!PRIORITIES.has(value)) throw badRequest("Unknown priority.");
      patch = { priority: value };
      break;
    case "status":
      if (!STATUSES.has(value)) throw badRequest("Unknown status.");
      patch = { status: value, ...(value === "resolved" ? { resolved_at: nowIso, sla_due_at: null } : {}) };
      break;
    case "mark_read":
      patch = { unread_count: 0 };
      break;
    case "mark_unread":
      patch = { unread_count: 1 };
      break;
    case "handled_by":
      if (value !== "bot" && value !== "human") throw badRequest("Ownership is bot or human.");
      patch = { handled_by: value };
      break;
    default:
      throw badRequest("Unknown bulk action.");
  }
  const { data, error } = await db.from("conversations").update(patch).eq("project_id", projectId).in("id", ids).is("deleted_at", null).select("id");
  if (error) throw new ApiError(500, "Couldn't update the conversations.", "update_failed");
  return { updated: (data || []).length };
}

// GET …/inbox/templates — approved WhatsApp templates the composer may send outside the window.
export async function listSendableTemplates({ db, projectId, connectionId }) {
  let query = db
    .from("message_templates")
    .select("*")
    .eq("project_id", projectId)
    .eq("channel", "whatsapp")
    .eq("status", "approved")
    .is("deleted_at", null)
    .order("name", { ascending: true });
  if (connectionId) query = query.or(`connection_id.eq.${connectionId},connection_id.is.null`);
  const { data, error } = await query;
  if (error) throw new ApiError(500, "Couldn't load templates.", "load_failed");
  return (data || []).map((t) => ({
    id: t.id,
    name: t.name,
    language: t.language,
    category: t.category,
    connectionId: t.connection_id,
    components: Array.isArray(t.components) ? t.components : [],
  }));
}
