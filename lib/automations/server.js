import { adminClient } from "@/lib/supabase/admin";
import { assertUuid, requireMember, requirePermission } from "@/lib/server/auth";
import { ApiError, badRequest, json, notConfigured, notFound } from "@/lib/server/http";
import { graphNodes, triggerFromGraph } from "./graph.js";
import { normalizeAutomation } from "./model.js";
import { validateAutomation } from "./validation.js";
import { computeAutomationStats } from "./stats.js";
import { advanceEnrollment, enrollContact, refreshAutomationStats, stopEnrollment } from "./engine.js";
import { serverDeps } from "./server_deps.js";

// Route logic for the automation endpoints (server-only). Every function authorizes first, reads through
// the caller's RLS-scoped client, then writes server-owned state (status, enrollments, logs) on the service role.

const ENROLL_REASONS = {
  no_trigger: "This automation has no trigger yet.",
  no_contact: "Pick a contact to enroll.",
  contact_missing: "That contact doesn't exist in this project.",
  lookup_failed: "Couldn't check the contact's existing enrollments.",
  insert_failed: "Couldn't start the test run.",
};

function requireAdmin() {
  const admin = adminClient();
  if (!admin) throw notConfigured("SUPABASE_SERVICE_ROLE_KEY isn't configured.");
  return admin;
}

async function loadAutomationRow(db, projectId, automationId) {
  assertUuid(automationId, "automation id");
  const { data, error } = await db.from("automations").select("*").eq("id", automationId).eq("project_id", projectId).is("deleted_at", null).maybeSingle();
  if (error) throw new ApiError(500, "Couldn't load the automation.", "load_failed");
  if (!data) throw notFound("Automation not found.");
  return data;
}

// Which of the ids a graph references still exist, as Sets for validateAutomation.
async function referenceSets(db, projectId, graph) {
  const nodes = graphNodes(graph);
  const pickIds = (fn) => [...new Set(nodes.map(fn).filter((v) => typeof v === "string" && v))];
  const configOf = (n) => n.data?.config || {};
  const wanted = {
    campaignIds: ["campaigns", pickIds((n) => (n.type === "send_email" && configOf(n).source === "campaign" ? configOf(n).campaignId : null))],
    listIds: ["lists", pickIds((n) => (n.type === "list" ? configOf(n).listId : null))],
    conditionSetIds: ["automation_conditions", pickIds((n) => (n.type === "condition" && configOf(n).source === "saved" ? configOf(n).conditionSetId : null))],
    goalIds: ["automation_goals", pickIds((n) => (n.type === "goal" && configOf(n).source === "saved" ? configOf(n).goalId : null))],
  };
  const refs = {};
  await Promise.all(
    Object.entries(wanted).map(async ([key, [table, ids]]) => {
      if (!ids.length) {
        refs[key] = new Set();
        return;
      }
      const { data } = await db.from(table).select("id").eq("project_id", projectId).is("deleted_at", null).in("id", ids);
      refs[key] = new Set((data || []).map((r) => r.id));
    }),
  );
  return refs;
}

export async function publishAutomation(projectId, automationId) {
  const { db } = await requirePermission(projectId, "campaign.automation.publish");
  const row = await loadAutomationRow(db, projectId, automationId);
  if (row.status === "archived") throw new ApiError(409, "Restore this automation before publishing it.", "archived");
  const automation = normalizeAutomation(row);
  const result = validateAutomation(automation, await referenceSets(db, projectId, automation.graph));
  if (result.errors) {
    const errors = result.issues.filter((i) => i.severity === "error");
    return json({ error: `Fix ${errors.length} ${errors.length === 1 ? "issue" : "issues"} before publishing.`, code: "invalid_automation", errors }, 422);
  }
  const publishedAt = new Date().toISOString();
  const { data, error } = await requireAdmin()
    .from("automations")
    .update({ status: "active", published_at: publishedAt, trigger: triggerFromGraph(automation.graph) || {} })
    .eq("id", automationId)
    .eq("project_id", projectId)
    .select("id, status, published_at")
    .single();
  if (error || !data) throw new ApiError(500, "Couldn't publish the automation.", "publish_failed");
  return { id: data.id, status: data.status, publishedAt: data.published_at };
}

export async function pauseAutomation(projectId, automationId) {
  const { db } = await requirePermission(projectId, "campaign.automation.publish");
  const row = await loadAutomationRow(db, projectId, automationId);
  if (row.status !== "active") throw new ApiError(409, "Only a live automation can be paused.", "not_active");
  const { data, error } = await requireAdmin()
    .from("automations")
    .update({ status: "paused" })
    .eq("id", automationId)
    .eq("project_id", projectId)
    .select("id, status")
    .single();
  if (error || !data) throw new ApiError(500, "Couldn't pause the automation.", "pause_failed");
  return { id: data.id, status: data.status };
}

// Enrolls one contact right now (any status, re-entry ignored) and runs it as far as it goes.
export async function testEnroll(projectId, automationId, body = {}) {
  const { db } = await requirePermission(projectId, "campaign.automation.edit");
  const row = await loadAutomationRow(db, projectId, automationId);
  const contactId = assertUuid(body?.contactId, "contact id");
  const skipWaits = body?.skipWaits !== false;
  const { data: contact } = await db.from("contacts").select("id").eq("id", contactId).eq("project_id", projectId).is("deleted_at", null).maybeSingle();
  if (!contact) throw notFound("That contact doesn't exist in this project.");

  const admin = requireAdmin();
  const now = new Date();
  const res = await enrollContact(admin, {
    automation: row,
    contactId,
    triggerKey: `test:${crypto.randomUUID()}`,
    context: { test: true, skipWaits },
    now,
    ignoreReentry: true,
  });
  if (res.duplicate) throw new ApiError(409, "This contact is already running through this automation.", "already_enrolled");
  if (!res.enrollment) throw badRequest(ENROLL_REASONS[res.reason] || "Couldn't enroll the contact.");

  const out = await advanceEnrollment(admin, res.enrollment, {
    automation: row,
    now: new Date(),
    deadline: Date.now() + 20_000,
    deps: serverDeps(),
    maxSteps: 50,
    skipWaits,
  });
  await refreshAutomationStats(admin, automationId);
  return { enrollmentId: res.enrollment.id, status: out.status, currentNodeId: out.currentNodeId, nextRunAt: out.nextRunAt, steps: [...res.logs, ...out.logs] };
}

export async function automationStats(projectId, automationId) {
  const { db } = await requireMember(projectId);
  await loadAutomationRow(db, projectId, automationId);
  const { data, error } = await db.rpc("automation_stats", { p_automation: automationId });
  if (!error && data?.totals) return data;
  const [{ data: enrollments }, { data: logs }] = await Promise.all([
    db.from("automation_enrollments").select("status, current_node_id, context, deleted_at").eq("automation_id", automationId).limit(20000),
    db.from("automation_step_logs").select("node_id, status, enrollment_id, deleted_at").eq("automation_id", automationId).limit(50000),
  ]);
  return computeAutomationStats(enrollments || [], logs || []);
}

export async function exitEnrollment(projectId, automationId, enrollmentId) {
  const { db } = await requirePermission(projectId, "campaign.automation.edit");
  const row = await loadAutomationRow(db, projectId, automationId);
  assertUuid(enrollmentId, "enrollment id");
  const { data: enrollment } = await db
    .from("automation_enrollments")
    .select("*")
    .eq("id", enrollmentId)
    .eq("automation_id", automationId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!enrollment) throw notFound("Enrollment not found.");
  const admin = requireAdmin();
  const stopped = await stopEnrollment(admin, enrollment, { automation: row, status: "exited", reason: "removed" });
  if (!stopped) throw new ApiError(409, "This contact has already left the automation.", "not_running");
  await refreshAutomationStats(admin, automationId);
  return { id: stopped.id, status: stopped.status };
}
