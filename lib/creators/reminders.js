import { dispatch } from "@/lib/messaging/dispatch";
import { isEmailConfigured } from "@/lib/email/client";
import { buildCreatorEmail, creatorEmailContext, creatorMergeData, senderAddress } from "./email";
import { DELIVERABLE_LABELS } from "./labels";

// Deliverable due reminders (worker, service-role db): one email to the creator two days before a
// pending deliverable is due and one the day after it's overdue. Delivery idempotency keys make each
// reminder send at most once, so the sweep can rerun every tick.

const DAY = 86_400_000;
const OPEN_STATUSES = ["planned", "active", "in_review"];

const dueTime = (value) => {
  if (!value) return NaN;
  // A bare date is due at the end of that day (UTC).
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? Date.parse(`${value}T23:59:59Z`) : Date.parse(value);
};

const formatDue = (value) =>
  new Date(dueTime(value)).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });

// Which reminder (if any) a deliverable needs right now.
export function reminderPhase(deliverable, now = new Date()) {
  if (!deliverable?.due_at || (deliverable.status && deliverable.status !== "pending")) return null;
  const due = dueTime(deliverable.due_at);
  if (!Number.isFinite(due)) return null;
  const until = due - now.getTime();
  if (until > 0 && until <= 2 * DAY) return "due_soon";
  if (until <= 0 && until > -7 * DAY && -until >= DAY / 2) return "overdue";
  return null;
}

export async function sendDeliverableReminders(db, { now = new Date(), deadline = Infinity, limit = 100 } = {}) {
  // Without email configured a send would burn the reminder's idempotency key, so wait instead.
  if (!isEmailConfigured()) return { skipped: "email_not_configured" };
  const { data: collabs, error } = await db
    .from("collaborations")
    .select("id, project_id, creator_id, campaign_name, deliverables, status, send_reminders")
    .in("status", OPEN_STATUSES)
    .eq("send_reminders", true)
    .is("deleted_at", null)
    .limit(500);
  if (error) {
    console.error("[creators.reminders]", error.message);
    return { error: "load_failed" };
  }

  const pending = [];
  for (const c of collabs || []) {
    for (const d of Array.isArray(c.deliverables) ? c.deliverables : []) {
      const phase = reminderPhase(d, now);
      if (phase) pending.push({ collab: c, deliverable: d, phase, key: `creator-reminder:${c.id}:${d.id}:${phase}` });
    }
  }
  if (!pending.length) return { sent: 0, skipped: 0 };

  const { data: done } = await db.from("deliveries").select("idempotency_key").in("idempotency_key", pending.map((p) => p.key));
  const sentKeys = new Set((done || []).map((d) => d.idempotency_key));
  const todo = pending.filter((p) => !sentKeys.has(p.key)).slice(0, limit);
  if (!todo.length) return { sent: 0, skipped: pending.length };

  const { data: creatorRows } = await db
    .from("creators")
    .select("id, name, email, handles, contact_id, metadata")
    .in("id", [...new Set(todo.map((p) => p.collab.creator_id))]);
  const creators = new Map((creatorRows || []).map((c) => [c.id, c]));
  const contexts = new Map();
  const summary = { sent: 0, failed: 0, skipped: pending.length - todo.length };

  for (const item of todo) {
    if (Date.now() > deadline) break;
    const { collab, deliverable, phase, key } = item;
    const creator = creators.get(collab.creator_id);
    if (!creator?.email) {
      summary.skipped += 1;
      continue;
    }
    if (!contexts.has(collab.project_id)) contexts.set(collab.project_id, await creatorEmailContext(db, collab.project_id));
    const ctx = contexts.get(collab.project_id);
    const kind = DELIVERABLE_LABELS[deliverable.kind] || "deliverable";
    const campaign = collab.campaign_name || "our collaboration";
    const due = formatDue(deliverable.due_at);
    const email = buildCreatorEmail({
      subject: phase === "due_soon" ? `Reminder: your ${kind} for ${campaign} is due ${due}` : `Your ${kind} for ${campaign} is overdue`,
      body:
        phase === "due_soon"
          ? `Hi {{first_name|there}},\n\nA quick reminder that your ${kind} for ${campaign} is due on ${due}.\n\nWhen it's live, reply with the link so we can track it. If you need more time, just let us know.\n\nThanks,\n${ctx.brandName || "The team"}`
          : `Hi {{first_name|there}},\n\nYour ${kind} for ${campaign} was due on ${due} and we haven't seen it yet.\n\nIf it's already live, reply with the link. If something's holding it up, tell us and we'll work out a new date.\n\nThanks,\n${ctx.brandName || "The team"}`,
      mergeData: creatorMergeData(creator, { brand_name: ctx.brandName }),
      brand: ctx.settings?.branding || {},
    });
    const result = await dispatch({
      db,
      projectId: collab.project_id,
      channel: "email",
      to: creator.email,
      contactId: creator.contact_id || null,
      source: { type: "creator_reminder", id: collab.id },
      idempotencyKey: key,
      message: { ...email, from: senderAddress({}, ctx.settings), label: "campaign.creator_reminder" },
      metadata: { creatorId: creator.id, collaborationId: collab.id, deliverableId: deliverable.id, phase },
    });
    if (result.status === "not_sent") {
      // Email isn't configured; nothing else will send this tick either.
      summary.failed += 1;
      summary.reason = result.error;
      break;
    }
    if (["queued", "sent", "delivered"].includes(result.status)) summary.sent += 1;
    else summary.failed += 1;
  }
  return summary;
}
