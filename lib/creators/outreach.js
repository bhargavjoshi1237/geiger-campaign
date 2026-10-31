import { dispatch } from "@/lib/messaging/dispatch";
import { isEmailConfigured } from "@/lib/email/client";
import { publicUrl } from "@/lib/server/urls";
import { isSigningConfigured, signToken, verifyToken } from "@/lib/server/tokens";
import { ApiError, badRequest, notConfigured, notFound } from "@/lib/server/http";
import { buildCreatorEmail, creatorEmailContext, creatorMergeData, senderAddress } from "./email";

// Creator outreach sequences (server-only, service-role or user db): start enrols the sequence's
// creators and sends what's due, the worker sends later steps as their waits elapse, and every send
// first checks for a reply (an inbound Inbox message from the creator's contact) or an opt-out.

const DAY = 86_400_000;
const SENT_STATUSES = new Set(["queued", "sent", "delivered", "opened", "clicked", "read", "replied"]);
const OPTED_OUT_CONTACT = new Set(["unsubscribed", "complained"]);

const stepsOf = (seq) => (Array.isArray(seq?.steps) ? seq.steps : []);
const delayMs = (step) => Math.max(0, Number(step?.delayDays) || 0) * DAY;

async function log(db, seq, recipient, entry) {
  const { error } = await db.from("creator_outreach_steps_log").insert({
    project_id: seq.project_id,
    outreach_id: seq.id,
    recipient_id: recipient?.id ?? null,
    creator_id: recipient?.creator_id ?? null,
    step_index: recipient?.next_step ?? 0,
    occurred_at: new Date().toISOString(),
    ...entry,
  });
  if (error) console.error("[creators.outreach.log]", error.message);
}

export async function startOutreach(db, { projectId, outreachId, now = new Date() }) {
  const { data: seq, error } = await db
    .from("creator_outreach")
    .select("*")
    .eq("project_id", projectId)
    .eq("id", outreachId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new ApiError(500, "Couldn't load the sequence.");
  if (!seq) throw notFound("Sequence not found.");

  const steps = stepsOf(seq);
  if (!steps.length) throw badRequest("Add at least one step before starting.");
  const incomplete = steps.findIndex((s) => !String(s?.subject || "").trim() || !String(s?.body || "").trim());
  if (incomplete !== -1) throw badRequest(`Step ${incomplete + 1} needs a subject and a message.`);
  const creatorIds = Array.isArray(seq.creator_ids) ? seq.creator_ids : [];
  if (!creatorIds.length) throw badRequest("Add creators to the sequence before starting.");
  if (!isEmailConfigured()) {
    throw notConfigured("Email delivery isn't configured (GEIGER_EMAIL_API_KEY), so outreach can't send yet.");
  }

  const [{ data: creators }, { data: existing }] = await Promise.all([
    db.from("creators").select("id, email, status, metadata").eq("project_id", projectId).in("id", creatorIds).is("deleted_at", null),
    db.from("creator_outreach_recipients").select("creator_id").eq("outreach_id", outreachId),
  ]);
  const enrolled = new Set((existing || []).map((r) => r.creator_id));
  const firstDue = new Date(now.getTime() + delayMs(steps[0])).toISOString();
  const skipped = { noEmail: 0, optedOut: 0, declined: 0 };
  const fresh = [];
  for (const c of creators || []) {
    if (enrolled.has(c.id)) continue;
    if (!c.email) skipped.noEmail += 1;
    else if (c.metadata?.outreachOptOut) skipped.optedOut += 1;
    else if (c.status === "declined") skipped.declined += 1;
    else fresh.push({ project_id: projectId, outreach_id: outreachId, creator_id: c.id, status: "active", next_step: 0, next_due_at: firstDue });
  }
  if (fresh.length) {
    const { error: insertError } = await db.from("creator_outreach_recipients").insert(fresh);
    if (insertError) throw new ApiError(500, "Couldn't enrol the creators.");
  }
  if (!enrolled.size && !fresh.length) throw badRequest("None of these creators can be emailed (missing email, opted out or declined).");

  const { error: updateError } = await db
    .from("creator_outreach")
    .update({ status: "active", started_at: seq.started_at || now.toISOString(), completed_at: null, metadata: { ...(seq.metadata || {}), pausedReason: null } })
    .eq("id", outreachId);
  if (updateError) throw new ApiError(500, "Couldn't start the sequence.");

  const processed = await processOutreach(db, { now, outreachIds: [outreachId], deadline: Date.now() + 20_000, limit: 25 });
  const { data: fresher } = await db.from("creator_outreach").select("*").eq("id", outreachId).maybeSingle();
  return { outreach: fresher, enrolled: fresh.length, skipped, processed };
}

export async function stopOutreach(db, { projectId, outreachId }) {
  const { data, error } = await db
    .from("creator_outreach")
    .update({ status: "paused" })
    .eq("project_id", projectId)
    .eq("id", outreachId)
    .is("deleted_at", null)
    .select("*")
    .maybeSingle();
  if (error) throw new ApiError(500, "Couldn't pause the sequence.");
  if (!data) throw notFound("Sequence not found.");
  return { outreach: data };
}

// Replies, opt-outs and bounces that end a recipient's sequence before the next send.
async function detectStops(db, seq, due, creators) {
  const stops = new Map();
  const contactIds = [...new Set(due.map((r) => creators.get(r.creator_id)?.contact_id).filter(Boolean))];

  const [contactsRes, conversationsRes] = await Promise.all([
    contactIds.length ? db.from("contacts").select("id, status").in("id", contactIds) : { data: [] },
    contactIds.length && seq.stop_on_reply !== false
      ? db.from("conversations").select("id, contact_id").eq("project_id", seq.project_id).in("contact_id", contactIds).is("deleted_at", null)
      : { data: [] },
  ]);
  const contactStatus = new Map((contactsRes.data || []).map((c) => [c.id, c.status]));

  const lastInbound = new Map();
  const conversations = conversationsRes.data || [];
  if (conversations.length) {
    const since = new Date(Math.min(...due.map((r) => Date.parse(r.created_at) || Date.now()))).toISOString();
    const contactOf = new Map(conversations.map((c) => [c.id, c.contact_id]));
    const { data: messages } = await db
      .from("conversation_messages")
      .select("conversation_id, sent_at")
      .in("conversation_id", [...contactOf.keys()])
      .eq("direction", "inbound")
      .gte("sent_at", since)
      .order("sent_at", { ascending: false })
      .limit(1000);
    for (const m of messages || []) {
      const contactId = contactOf.get(m.conversation_id);
      if (contactId && !lastInbound.has(contactId)) lastInbound.set(contactId, m.sent_at);
    }
  }

  for (const r of due) {
    const creator = creators.get(r.creator_id);
    if (!creator) {
      stops.set(r.id, { status: "stopped", reason: "creator_removed" });
      continue;
    }
    if (creator.metadata?.outreachOptOut) {
      stops.set(r.id, { status: "opted_out", reason: "opt_out_link" });
      continue;
    }
    if (creator.status === "declined") {
      stops.set(r.id, { status: "stopped", reason: "declined" });
      continue;
    }
    const status = contactStatus.get(creator.contact_id);
    if (OPTED_OUT_CONTACT.has(status)) {
      stops.set(r.id, { status: "opted_out", reason: `contact_${status}` });
      continue;
    }
    if (status === "bounced") {
      stops.set(r.id, { status: "failed", reason: "bounced" });
      continue;
    }
    const inboundAt = lastInbound.get(creator.contact_id);
    if (inboundAt && r.last_sent_at && Date.parse(inboundAt) >= Date.parse(r.last_sent_at)) {
      stops.set(r.id, { status: "replied", reason: "reply", at: inboundAt });
    }
  }
  return stops;
}

async function endRecipient(db, seq, r, { status, reason, at }) {
  const patch = { status, stopped_reason: reason, next_due_at: null };
  if (status === "replied") patch.replied_at = at || new Date().toISOString();
  await db.from("creator_outreach_recipients").update(patch).eq("id", r.id);
  const event = status === "replied" ? "replied" : status === "opted_out" ? "opted_out" : status === "completed" ? "completed" : "stopped";
  await log(db, seq, r, { event, error: status === "failed" ? reason : null });
}

async function sendStep(db, { seq, recipient, creator, step, ctx }) {
  const mergeData = creatorMergeData(creator, {
    brand_name: ctx.brandName,
    sender_name: seq.sender?.fromName || ctx.settings?.sending?.fromName || ctx.brandName,
  });
  const optOutUrl = isSigningConfigured()
    ? publicUrl(`/api/projects/${seq.project_id}/creators/outreach/opt-out`, {
        t: signToken({ k: "creator_optout", r: recipient.id }, { ttlDays: 365 }),
      })
    : null;
  const footer = optOutUrl
    ? `Not interested? Opt out of these emails: ${optOutUrl}`
    : "Not interested? Reply and let us know — we won't follow up.";
  const email = buildCreatorEmail({ subject: step.subject, body: step.body, mergeData, brand: ctx.settings?.branding || {}, footer });

  return dispatch({
    db,
    projectId: seq.project_id,
    channel: "email",
    to: creator.email,
    contactId: creator.contact_id || null,
    source: { type: "creator_outreach", id: seq.id },
    idempotencyKey: `creator-outreach:${recipient.id}:${recipient.next_step}`,
    message: {
      ...email,
      from: senderAddress(seq.sender || {}, ctx.settings),
      replyTo: seq.sender?.replyTo || ctx.settings?.sending?.replyTo || undefined,
      label: "campaign.creator_outreach",
    },
    metadata: { creatorId: creator.id, outreachId: seq.id, step: recipient.next_step },
  });
}

async function processSequence(db, seq, { now, deadline, limit, contexts }) {
  const out = { sent: 0, failed: 0, replied: 0, optedOut: 0, completed: 0 };
  const steps = stepsOf(seq);
  const { data: due } = await db
    .from("creator_outreach_recipients")
    .select("*")
    .eq("outreach_id", seq.id)
    .eq("status", "active")
    .is("deleted_at", null)
    .lte("next_due_at", now.toISOString())
    .order("next_due_at", { ascending: true })
    .limit(limit);

  if (due?.length) {
    const { data: creatorRows } = await db
      .from("creators")
      .select("id, name, email, handles, status, contact_id, metadata")
      .in("id", [...new Set(due.map((r) => r.creator_id))])
      .is("deleted_at", null);
    const creators = new Map((creatorRows || []).map((c) => [c.id, c]));
    const stops = await detectStops(db, seq, due, creators);
    if (!contexts.has(seq.project_id)) contexts.set(seq.project_id, await creatorEmailContext(db, seq.project_id));
    const ctx = contexts.get(seq.project_id);

    for (const r of due) {
      if (Date.now() > deadline) break;
      const stop = stops.get(r.id);
      if (stop) {
        await endRecipient(db, seq, r, stop);
        if (stop.status === "replied") out.replied += 1;
        else if (stop.status === "opted_out") out.optedOut += 1;
        else if (stop.status === "failed") out.failed += 1;
        continue;
      }
      const creator = creators.get(r.creator_id);
      const step = steps[r.next_step];
      if (!step) {
        await endRecipient(db, seq, r, { status: "completed", reason: null });
        out.completed += 1;
        continue;
      }
      if (!creator.email) {
        await endRecipient(db, seq, r, { status: "failed", reason: "no_email" });
        out.failed += 1;
        continue;
      }

      const result = await sendStep(db, { seq, recipient: r, creator, step, ctx });
      if (result.status === "not_sent") {
        // Delivery isn't configured: pause rather than burn through every recipient.
        await log(db, seq, r, { event: "not_sent", delivery_id: result.deliveryId || null, subject: step.subject, error: result.error });
        await db
          .from("creator_outreach")
          .update({ status: "paused", metadata: { ...(seq.metadata || {}), pausedReason: result.error || "Email couldn't be sent." } })
          .eq("id", seq.id);
        out.failed += 1;
        break;
      }
      if (!SENT_STATUSES.has(result.status)) {
        await log(db, seq, r, { event: "failed", delivery_id: result.deliveryId || null, subject: step.subject, error: result.error });
        await db.from("creator_outreach_recipients").update({ status: "failed", stopped_reason: String(result.error || "send_failed").slice(0, 200), next_due_at: null }).eq("id", r.id);
        out.failed += 1;
        continue;
      }

      const sentAt = new Date();
      const next = steps[r.next_step + 1];
      await log(db, seq, r, { event: "sent", delivery_id: result.deliveryId || null, subject: step.subject });
      await db
        .from("creator_outreach_recipients")
        .update({
          next_step: r.next_step + 1,
          last_sent_at: sentAt.toISOString(),
          next_due_at: next ? new Date(sentAt.getTime() + delayMs(next)).toISOString() : null,
          status: next ? "active" : "completed",
        })
        .eq("id", r.id);
      if (creator.status === "prospect") {
        await db.from("creators").update({ status: "contacted" }).eq("id", creator.id).eq("status", "prospect");
        creator.status = "contacted";
      }
      out.sent += 1;
      if (!next) out.completed += 1;
    }
  }

  if (due?.length) {
    await refreshOutreachStats(db, seq, { now });
  } else {
    const { count } = await db
      .from("creator_outreach_recipients")
      .select("id", { count: "exact", head: true })
      .eq("outreach_id", seq.id)
      .eq("status", "active")
      .is("deleted_at", null);
    if (!count) await refreshOutreachStats(db, seq, { now });
  }
  return out;
}

// Sends every due step across active sequences (bounded); used by the worker and by start.
export async function processOutreach(db, { now = new Date(), deadline = Infinity, outreachIds = null, limit = 100 } = {}) {
  // Active sequences simply wait until email is configured; sending now would burn each step's key.
  if (!isEmailConfigured()) return { skipped: "email_not_configured" };
  let query = db.from("creator_outreach").select("*").eq("status", "active").is("deleted_at", null).order("started_at", { ascending: true }).limit(50);
  if (outreachIds) query = query.in("id", outreachIds);
  const { data: sequences, error } = await query;
  if (error) {
    console.error("[creators.outreach.process]", error.message);
    return { error: "load_failed" };
  }
  const summary = { sequences: 0, sent: 0, failed: 0, replied: 0, optedOut: 0, completed: 0 };
  const contexts = new Map();
  for (const seq of sequences || []) {
    if (Date.now() > deadline) break;
    try {
      const out = await processSequence(db, seq, { now, deadline, limit, contexts });
      summary.sequences += 1;
      for (const key of Object.keys(out)) summary[key] += out[key];
    } catch (e) {
      console.error("[creators.outreach.sequence]", seq.id, e);
    }
  }
  return summary;
}

// Recomputes a sequence's rollups; an active sequence with nobody left to email is completed.
export async function refreshOutreachStats(db, seq, { now = new Date() } = {}) {
  const [{ data: recipients }, { count: sent }] = await Promise.all([
    db.from("creator_outreach_recipients").select("status").eq("outreach_id", seq.id).is("deleted_at", null),
    db.from("creator_outreach_steps_log").select("id", { count: "exact", head: true }).eq("outreach_id", seq.id).eq("event", "sent"),
  ]);
  const rows = recipients || [];
  const countOf = (status) => rows.filter((r) => r.status === status).length;
  const stats = {
    enrolled: rows.length,
    active: countOf("active"),
    sent: sent || 0,
    failed: countOf("failed"),
    replied: countOf("replied"),
    optedOut: countOf("opted_out"),
    completed: countOf("completed"),
  };
  const patch = { stats };
  if (seq.status === "active" && rows.length && !stats.active) {
    patch.status = "completed";
    patch.completed_at = now.toISOString();
  }
  await db.from("creator_outreach").update(patch).eq("id", seq.id);
  return stats;
}

// --- Opt-out link (public, signed token) ---------------------------------------------------------

export async function loadOptOut(db, projectId, token) {
  const payload = verifyToken(token, "creator_optout");
  if (!payload?.r) return null;
  const { data: recipient } = await db
    .from("creator_outreach_recipients")
    .select("id, project_id, outreach_id, creator_id, status, next_step")
    .eq("id", payload.r)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!recipient) return null;
  const { data: creator } = await db.from("creators").select("id, name, contact_id, metadata").eq("id", recipient.creator_id).maybeSingle();
  const { brandName } = await creatorEmailContext(db, projectId);
  return { recipient, creator, brandName, already: Boolean(creator?.metadata?.outreachOptOut) };
}

// Stops every outreach to this creator in the project and records the email opt-out on their contact.
export async function applyOptOut(db, projectId, token, { now = new Date(), ip = null, userAgent = null } = {}) {
  const found = await loadOptOut(db, projectId, token);
  if (!found) return null;
  const { recipient, creator } = found;
  const at = now.toISOString();
  if (creator && !found.already) {
    await db.from("creators").update({ metadata: { ...(creator.metadata || {}), outreachOptOut: true, outreachOptOutAt: at } }).eq("id", creator.id);
  }
  const { data: active } = await db
    .from("creator_outreach_recipients")
    .update({ status: "opted_out", stopped_reason: "opt_out_link", next_due_at: null })
    .eq("project_id", projectId)
    .eq("creator_id", recipient.creator_id)
    .eq("status", "active")
    .select("id, outreach_id, creator_id, next_step");
  const seqIds = new Set([recipient.outreach_id, ...(active || []).map((r) => r.outreach_id)]);
  if (!found.already) {
    await log(db, { id: recipient.outreach_id, project_id: projectId }, recipient, { event: "opted_out", metadata: { via: "link" } });
  }
  if (creator?.contact_id && !found.already) {
    const { error } = await db.from("contact_consents").insert({
      project_id: projectId,
      contact_id: creator.contact_id,
      channel: "email",
      status: "opted_out",
      source: "creator_outreach",
      proof: { recipientId: recipient.id, at },
      ip,
      user_agent: userAgent,
      captured_at: at,
    });
    if (error) console.error("[creators.outreach.optOut.consent]", error.message);
  }
  const { data: sequences } = await db.from("creator_outreach").select("*").in("id", [...seqIds]);
  for (const seq of sequences || []) await refreshOutreachStats(db, seq, { now });
  return { ...found, already: found.already };
}
