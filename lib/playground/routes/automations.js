// Playground stand-ins for the automation routes, answered from the in-memory seed. Publish and pause run
// the real validator; a test enrollment runs the real engine over the in-memory tables with sandbox
// senders that write delivery rows (provider "playground") instead of reaching any provider.

import { createMemoryClient } from "../memory_client.js";
import { getPlaygroundDb, PLAYGROUND_USER } from "../db.js";
import { playgroundRpc } from "../rpc.js";
import { json } from "../intercept_fetch.js";
import { triggerFromGraph } from "../../automations/graph.js";
import { normalizeAutomation } from "../../automations/model.js";
import { validateAutomation } from "../../automations/validation.js";
import { computeAutomationStats } from "../../automations/stats.js";
import { advanceEnrollment, enrollContact, refreshAutomationStats, stopEnrollment } from "../../automations/engine.js";
import { getWorkspaceSettings } from "../../settings/server.js";

const now = () => new Date().toISOString();
const live = (rows) => rows.filter((r) => r.deleted_at == null);
const RUNNING = ["active", "waiting"];

function statsFromTables(db, automationId) {
  return computeAutomationStats(
    db.table("automation_enrollments").filter((e) => e.automation_id === automationId),
    db.table("automation_step_logs").filter((l) => l.automation_id === automationId),
  );
}

let client = null;

// A campaign-schema memory client over the same tables the screens read, plus the stats RPC.
function campaignDb() {
  client ??= createMemoryClient({
    getDb: getPlaygroundDb,
    user: PLAYGROUND_USER,
    rpc: {
      ...playgroundRpc,
      automation_stats: ({ db, args }) => statsFromTables(db, args.p_automation),
    },
    defaults: (_table, row) => ({ metadata: {}, deleted_at: null, ...row }),
  });
  return client.schema("campaign");
}

function findAutomation(projectId, automationId) {
  return live(getPlaygroundDb().table("automations")).find((a) => a.id === automationId && a.project_id === projectId) || null;
}

const SENT_STATUS = "sent";

// Same contract as lib/messaging/dispatch: idempotent log row first, then the "provider" (here: none).
async function sandboxDispatch({ db, projectId, channel, to, contactId = null, connectionId = null, source = {}, idempotencyKey = null, message, metadata = {} }) {
  if (idempotencyKey) {
    const { data: existing } = await db.from("deliveries").select("id, status").eq("idempotency_key", idempotencyKey).maybeSingle();
    if (existing) return { status: existing.status, deliveryId: existing.id, duplicate: true };
  }
  const { data: row } = await db
    .from("deliveries")
    .insert({
      project_id: projectId,
      channel,
      status: "queued",
      contact_id: contactId,
      to_address: String(to),
      source_type: source?.type || "automation",
      source_id: source?.id || null,
      connection_id: connectionId,
      idempotency_key: idempotencyKey,
      open_count: 0,
      click_count: 0,
      cost: 0,
      currency: "USD",
      metadata: { ...metadata, playground: true },
    })
    .select("id")
    .single();
  const built = typeof message === "function" ? await message({ deliveryId: row.id }) : message;
  await db
    .from("deliveries")
    .update({ status: SENT_STATUS, provider: "playground", subject: built?.subject ?? built?.title ?? null, sent_at: now() })
    .eq("id", row.id);
  return { status: SENT_STATUS, deliveryId: row.id };
}

const sandboxDeps = {
  dispatch: sandboxDispatch,
  sendSystemEmail: async () => ({ ok: true }),
  emitWebhook: async (db, projectId, event) =>
    live(getPlaygroundDb().table("webhook_endpoints")).filter(
      (e) => e.project_id === projectId && e.status === "active" && (!Array.isArray(e.events) || !e.events.length || e.events.includes(event) || e.events.includes("*")),
    ).length,
  postWebhook: async () => ({ ok: true, status: "playground" }),
  getSettings: getWorkspaceSettings,
  emailLinks: () => ({ unsubscribe: "#unsubscribe", preferences: "#preferences" }),
};

function referenceSets(projectId) {
  const db = getPlaygroundDb();
  const ids = (table) => new Set(live(db.table(table)).filter((r) => r.project_id === projectId).map((r) => r.id));
  return { campaignIds: ids("campaigns"), listIds: ids("lists"), conditionSetIds: ids("automation_conditions"), goalIds: ids("automation_goals") };
}

function publish({ params }) {
  const row = findAutomation(params.projectId, params.automationId);
  if (!row) return json({ error: "Automation not found." }, 404);
  if (row.status === "archived") return json({ error: "Restore this automation before publishing it.", code: "archived" }, 409);
  const automation = normalizeAutomation(row);
  const result = validateAutomation(automation, referenceSets(params.projectId));
  if (result.errors) {
    const errors = result.issues.filter((i) => i.severity === "error");
    return json({ error: `Fix ${errors.length} ${errors.length === 1 ? "issue" : "issues"} before publishing.`, code: "invalid_automation", errors }, 422);
  }
  Object.assign(row, { status: "active", published_at: now(), trigger: triggerFromGraph(automation.graph) || {}, updated_at: now() });
  return { id: row.id, status: row.status, publishedAt: row.published_at };
}

function pause({ params }) {
  const row = findAutomation(params.projectId, params.automationId);
  if (!row) return json({ error: "Automation not found." }, 404);
  if (row.status !== "active") return json({ error: "Only a live automation can be paused.", code: "not_active" }, 409);
  Object.assign(row, { status: "paused", updated_at: now() });
  return { id: row.id, status: row.status };
}

async function testEnroll({ params, body }) {
  const row = findAutomation(params.projectId, params.automationId);
  if (!row) return json({ error: "Automation not found." }, 404);
  const contactId = body?.contactId;
  const contact = live(getPlaygroundDb().table("contacts")).find((c) => c.id === contactId && c.project_id === params.projectId);
  if (!contact) return json({ error: "That contact doesn't exist in this project." }, 404);
  const skipWaits = body?.skipWaits !== false;
  const db = campaignDb();
  const res = await enrollContact(db, {
    automation: row,
    contactId,
    triggerKey: `test:${globalThis.crypto.randomUUID()}`,
    context: { test: true, skipWaits },
    ignoreReentry: true,
  });
  if (res.duplicate) return json({ error: "This contact is already running through this automation.", code: "already_enrolled" }, 409);
  if (!res.enrollment) return json({ error: "Couldn't enroll the contact." }, 400);
  const out = await advanceEnrollment(db, res.enrollment, { automation: row, deadline: Date.now() + 20_000, deps: sandboxDeps, maxSteps: 50, skipWaits });
  await refreshAutomationStats(db, row.id);
  return { enrollmentId: res.enrollment.id, status: out.status, currentNodeId: out.currentNodeId, nextRunAt: out.nextRunAt, steps: [...res.logs, ...out.logs] };
}

function stats({ params }) {
  if (!findAutomation(params.projectId, params.automationId)) return json({ error: "Automation not found." }, 404);
  return statsFromTables(getPlaygroundDb(), params.automationId);
}

async function exit({ params }) {
  const row = findAutomation(params.projectId, params.automationId);
  if (!row) return json({ error: "Automation not found." }, 404);
  const enrollment = live(getPlaygroundDb().table("automation_enrollments")).find(
    (e) => e.id === params.enrollmentId && e.automation_id === row.id && e.project_id === params.projectId,
  );
  if (!enrollment) return json({ error: "Enrollment not found." }, 404);
  if (!RUNNING.includes(enrollment.status)) return json({ error: "This contact has already left the automation.", code: "not_running" }, 409);
  const db = campaignDb();
  const stopped = await stopEnrollment(db, enrollment, { automation: row, status: "exited", reason: "removed" });
  await refreshAutomationStats(db, row.id);
  return { id: stopped?.id || enrollment.id, status: stopped?.status || "exited" };
}

const BASE = "/api/projects/:projectId/automations/:automationId";

export const automationsRoutes = [
  ["POST", `${BASE}/publish`, publish],
  ["POST", `${BASE}/pause`, pause],
  ["POST", `${BASE}/test-enroll`, testEnroll],
  ["GET", `${BASE}/stats`, stats],
  ["POST", `${BASE}/enrollments/:enrollmentId/exit`, exit],
];
