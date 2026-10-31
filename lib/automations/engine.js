// The automation engine (isomorphic, deps-injected): enrolls contacts, walks each enrollment through its
// graph step by step, and runs the scheduler tick (event triggers from tracked_events, date/inactivity scans,
// due enrollments, stats). Works on supabase-js and the playground memory client; idempotent by design —
// trigger_key + the running-enrollment unique index + dispatch idempotency keys.

import { getNode, graphNodes, nextNodeId, triggerFromGraph, triggerNodeOf } from "./graph.js";
import { normalizeSettings } from "./model.js";
import { isScheduledTrigger, matchesEventTrigger } from "./triggers.js";
import { computeAutomationStats, statsColumn } from "./stats.js";
import { localDate, localMinutes, parseTime, safeTimeZone, shiftDate } from "./schedule.js";
import { createCache, executeNode, goalConversion, goalDefinition, goalMet, settingsFor } from "./executors.js";

export { createCache };

const RUNNING = ["active", "waiting"];
const EVENT_BATCH = 500;
const DUE_BATCH = 200;
const SCAN_BATCH = 500;
const SCAN_EVERY_MS = 55 * 60_000;
const EVENT_SETTLE_MS = 2_000;
const CLAIM_MS = 10 * 60_000;

const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
const iso = (d) => new Date(d).toISOString();
const past = (deadline) => Boolean(deadline) && Date.now() > deadline;

// Engine view of an automation from a raw row or a normalized model.
export function asEngineAutomation(a) {
  if (!a) return null;
  const graph = a.graph && Array.isArray(a.graph.nodes) ? a.graph : { nodes: [], edges: [] };
  return {
    id: a.id,
    projectId: a.project_id ?? a.projectId,
    kind: a.kind || "workflow",
    name: a.name || "Untitled automation",
    status: a.status || "draft",
    graph,
    trigger: triggerFromGraph(graph) || obj(a.trigger),
    settings: normalizeSettings(a.settings),
    publishedAt: a.published_at ?? a.publishedAt ?? null,
    deletedAt: a.deleted_at ?? a.deletedAt ?? null,
  };
}

const AUTOMATION_COLUMNS = "id, project_id, kind, name, status, trigger, graph, settings, published_at, deleted_at";

export async function insertStepLog(db, { automation, enrollment, node, action, status = "ok", detail = {}, now = new Date() }) {
  const row = {
    project_id: automation.projectId,
    automation_id: automation.id,
    enrollment_id: enrollment.id,
    contact_id: enrollment.contact_id,
    node_id: node?.id || enrollment.current_node_id || "unknown",
    node_type: node?.type || "",
    action: String(action || "").slice(0, 80),
    status,
    detail: obj(detail),
    created_at: iso(now),
  };
  const { error } = await db.from("automation_step_logs").insert(row);
  if (error) console.error("[automations.log]", error.message);
  return { nodeId: row.node_id, nodeType: row.node_type, action: row.action, status, detail: row.detail, createdAt: row.created_at };
}

const isUniqueViolation = (error) => error?.code === "23505" || /duplicate key|unique/i.test(error?.message || "");

// Starts one contact's run. -> { enrollment, duplicate?, reason?, logs }
export async function enrollContact(db, { automation, contactId, triggerKey = null, context = {}, now = new Date(), ignoreReentry = false }) {
  const a = asEngineAutomation(automation);
  const trigger = triggerNodeOf(a?.graph);
  if (!a || !trigger) return { enrollment: null, reason: "no_trigger", logs: [] };
  if (!contactId) return { enrollment: null, reason: "no_contact", logs: [] };

  const { data: contact } = await db.from("contacts").select("id, deleted_at").eq("id", contactId).eq("project_id", a.projectId).maybeSingle();
  if (!contact || contact.deleted_at) return { enrollment: null, reason: "contact_missing", logs: [] };

  const { data: prior, error: priorError } = await db
    .from("automation_enrollments")
    .select("id, status, trigger_key, context")
    .eq("automation_id", a.id)
    .eq("contact_id", contactId)
    .is("deleted_at", null)
    .order("entered_at", { ascending: false })
    .limit(50);
  if (priorError) {
    console.error("[automations.enroll]", priorError.message);
    return { enrollment: null, reason: "lookup_failed", logs: [] };
  }
  const rows = prior || [];
  if (rows.some((r) => RUNNING.includes(r.status))) return { enrollment: null, duplicate: true, reason: "running", logs: [] };
  if (triggerKey && rows.some((r) => r.trigger_key === triggerKey)) return { enrollment: null, duplicate: true, reason: "trigger_seen", logs: [] };
  if (!ignoreReentry && !a.settings.reentry && rows.some((r) => !obj(r.context).test)) return { enrollment: null, reason: "no_reentry", logs: [] };

  const payload = {
    project_id: a.projectId,
    automation_id: a.id,
    contact_id: contactId,
    status: "active",
    current_node_id: trigger.id,
    next_run_at: iso(now),
    trigger_key: triggerKey,
    context: obj(context),
    entered_at: iso(now),
  };
  const { data: enrollment, error } = await db.from("automation_enrollments").insert(payload).select("*").single();
  if (error || !enrollment) {
    if (isUniqueViolation(error)) return { enrollment: null, duplicate: true, reason: "running", logs: [] };
    console.error("[automations.enroll]", error?.message);
    return { enrollment: null, reason: "insert_failed", logs: [] };
  }
  const log = await insertStepLog(db, {
    automation: a,
    enrollment,
    node: trigger,
    action: obj(context).test ? "enrolled.test" : "enrolled",
    detail: { triggerKey, event: obj(context.trigger).event || undefined },
    now,
  });
  return { enrollment, logs: [log] };
}

// Ends a run (completed / exited / failed) without running further steps.
export async function stopEnrollment(db, enrollment, { automation, status = "exited", reason = "removed", now = new Date(), log = true, logAction = "exit" } = {}) {
  const { data, error } = await db
    .from("automation_enrollments")
    .update({ status, exit_reason: reason, completed_at: iso(now), next_run_at: null })
    .eq("id", enrollment.id)
    .in("status", RUNNING)
    .select("id, status")
    .maybeSingle();
  if (error) {
    console.error("[automations.stop]", error.message);
    return null;
  }
  if (data && log && automation) {
    const a = asEngineAutomation(automation);
    await insertStepLog(db, { automation: a, enrollment, node: getNode(a.graph, enrollment.current_node_id), action: logAction, detail: { reason }, now });
  }
  return data;
}

// Before a step: a met goal either finishes the run (exitOnGoal) or jumps the contact to that goal node.
async function checkGoals(ctx, state) {
  const context = state.context;
  if (context.convertedAt) return null;
  const visited = new Set(context.visited || []);
  const goals = graphNodes(ctx.automation.graph).filter((n) => n.type === "goal" && n.id !== state.current_node_id && !visited.has(n.id));
  for (const node of goals) {
    const def = await goalDefinition(ctx, node);
    const event = def ? await goalMet(ctx, def) : null;
    if (event) return { node, def, event };
  }
  return null;
}

async function loadContactRow(db, projectId, contactId) {
  const { data } = await db.from("contacts").select("*").eq("id", contactId).eq("project_id", projectId).maybeSingle();
  return data && !data.deleted_at ? data : null;
}

// Walks one enrollment until it waits, ends, hits maxSteps or the deadline.
// -> { status, currentNodeId, nextRunAt, logs }
export async function advanceEnrollment(db, enrollmentRow, { automation, now = new Date(), deadline = null, deps = {}, maxSteps = 30, skipWaits, cache = createCache() } = {}) {
  const a = asEngineAutomation(automation);
  const logs = [];
  const state = {
    status: enrollmentRow.status,
    current_node_id: enrollmentRow.current_node_id,
    next_run_at: enrollmentRow.next_run_at,
    context: { ...obj(enrollmentRow.context) },
    completed_at: enrollmentRow.completed_at ?? null,
    exit_reason: enrollmentRow.exit_reason ?? null,
  };
  const enrollment = { ...enrollmentRow };
  const test = Boolean(state.context.test);
  const skip = skipWaits ?? Boolean(state.context.skipWaits);

  const persist = async () => {
    const { error } = await db
      .from("automation_enrollments")
      .update({
        status: state.status,
        current_node_id: state.current_node_id,
        next_run_at: state.next_run_at,
        context: state.context,
        completed_at: state.completed_at,
        exit_reason: state.exit_reason,
      })
      .eq("id", enrollment.id);
    if (error) console.error("[automations.persist]", error.message);
  };
  const log = async (node, action, status, detail) => logs.push(await insertStepLog(db, { automation: a, enrollment, node, action, status, detail, now }));
  const finish = async (status, reason) => {
    state.status = status;
    state.exit_reason = reason;
    state.completed_at = iso(now);
    state.next_run_at = null;
    delete state.context.waiting;
    delete state.context.deferred;
    await persist();
  };
  const result = () => ({ status: state.status, currentNodeId: state.current_node_id, nextRunAt: state.next_run_at, logs });

  if (!RUNNING.includes(state.status)) return result();
  let contact = await loadContactRow(db, a.projectId, enrollment.contact_id);
  if (!contact) {
    await finish("exited", "contact_deleted");
    await log(getNode(a.graph, state.current_node_id), "exit", "ok", { reason: "contact_deleted" });
    return result();
  }

  for (let steps = 0; steps < maxSteps; steps += 1) {
    if (past(deadline)) {
      state.next_run_at = iso(now);
      await persist();
      return result();
    }
    let node = getNode(a.graph, state.current_node_id);
    if (!node) {
      await finish("completed", "completed");
      return result();
    }
    const ctx = { db, deps, automation: a, enrollment: { ...enrollment, context: state.context }, contact, node, now, skipWaits: skip, test, cache };

    if (node.type !== "trigger") {
      const hit = await checkGoals(ctx, state);
      if (hit) {
        Object.assign(state.context, goalConversion(ctx, hit.node, hit.def, hit.event));
        if (a.settings.exitOnGoal) {
          await log(hit.node, "goal.reached", "ok", { event: hit.def.event, eventId: hit.event.id, exited: true });
          await finish("completed", "goal_reached");
          return result();
        }
        await log(hit.node, "goal.jumped", "ok", { from: node.id, event: hit.def.event, eventId: hit.event.id });
        state.current_node_id = hit.node.id;
        node = hit.node;
        ctx.node = node;
        ctx.enrollment = { ...enrollment, context: state.context };
      }
    }

    let outcome;
    try {
      outcome = await executeNode(ctx);
    } catch (error) {
      console.error(`[automations.step.${node.type}]`, error);
      outcome = { type: "fail", action: `${node.type}.error`, status: "failed", detail: { error: error?.message || "The step failed." } };
    }
    if (outcome.context) Object.assign(state.context, outcome.context);
    if (outcome.contact) contact = outcome.contact;
    if (!outcome.silent) await log(node, outcome.action, outcome.status, outcome.detail);

    if (outcome.type === "next") {
      delete state.context.waiting;
      delete state.context.deferred;
      state.context.visited = [...new Set([...(state.context.visited || []), node.id])].slice(-200);
      const target = nextNodeId(a.graph, node.id, outcome.handle);
      if (!target) {
        await finish("completed", "completed");
        return result();
      }
      state.current_node_id = target;
      state.status = "active";
      state.next_run_at = iso(now);
      await persist();
      continue;
    }
    if (outcome.type === "wait") {
      state.status = "waiting";
      state.context.waiting = outcome.waiting;
      state.next_run_at = iso(outcome.until);
      await persist();
      return result();
    }
    if (outcome.type === "defer") {
      state.status = "waiting";
      state.context.deferred = { nodeId: node.id, until: iso(outcome.until), reason: outcome.action };
      state.next_run_at = iso(outcome.until);
      await persist();
      return result();
    }
    if (outcome.type === "end") {
      await finish(outcome.enrollmentStatus || "completed", outcome.reason || "completed");
      return result();
    }
    state.context.lastError = outcome.detail?.error || "The step failed.";
    await finish("failed", "error");
    return result();
  }
  state.next_run_at = iso(now);
  await persist();
  return result();
}

// Live rollup for one automation, cached on automations.stats. Falls back to row math without the SQL function.
export async function refreshAutomationStats(db, automationId, now = new Date()) {
  let rollup = null;
  try {
    const { data, error } = await db.rpc("automation_stats", { p_automation: automationId });
    if (!error && data && data.totals) rollup = data;
  } catch {
    rollup = null;
  }
  if (!rollup) rollup = await computeStatsFromRows(db, automationId);
  const { error } = await db.from("automations").update({ stats: statsColumn(rollup, now) }).eq("id", automationId);
  if (error) console.error("[automations.stats]", error.message);
  return rollup;
}

export async function computeStatsFromRows(db, automationId) {
  const [{ data: enrollments }, { data: logs }] = await Promise.all([
    db.from("automation_enrollments").select("status, current_node_id, context, deleted_at").eq("automation_id", automationId).limit(20000),
    db.from("automation_step_logs").select("node_id, status, enrollment_id, deleted_at").eq("automation_id", automationId).limit(50000),
  ]);
  return computeAutomationStats(enrollments || [], logs || []);
}

async function loadCursor(db, projectId, automations, now) {
  const { data } = await db.from("automation_cursors").select("*").eq("project_id", projectId).maybeSingle();
  if (data) return data;
  const published = automations.map((a) => Date.parse(a.publishedAt || "")).filter(Number.isFinite);
  const start = published.length ? new Date(Math.min(...published)) : now;
  const row = { project_id: projectId, last_event_at: iso(start), last_event_ids: [], last_scan_at: null };
  const { data: created, error } = await db.from("automation_cursors").upsert(row, { onConflict: "project_id" }).select("*").maybeSingle();
  if (error) console.error("[automations.cursor]", error.message);
  return created || row;
}

async function saveCursor(db, projectId, patch) {
  const { error } = await db.from("automation_cursors").update(patch).eq("project_id", projectId);
  if (error) console.error("[automations.cursor.save]", error.message);
}

// automation id -> Set of event names its goal nodes watch (inline goals and saved ones).
async function goalEventsByAutomation(db, projectId, automations) {
  const out = new Map();
  const savedIds = new Set();
  for (const a of automations) {
    for (const n of graphNodes(a.graph)) {
      if (n.type !== "goal") continue;
      const c = obj(n.data?.config);
      if (c.source === "saved" && c.goalId) savedIds.add(c.goalId);
    }
  }
  const saved = new Map();
  if (savedIds.size) {
    const { data } = await db.from("automation_goals").select("id, event_name").eq("project_id", projectId).is("deleted_at", null).in("id", [...savedIds]);
    for (const g of data || []) saved.set(g.id, g.event_name);
  }
  for (const a of automations) {
    const names = new Set();
    for (const n of graphNodes(a.graph)) {
      if (n.type !== "goal") continue;
      const c = obj(n.data?.config);
      const name = c.source === "saved" ? saved.get(c.goalId) : c.event;
      if (name) names.add(name);
    }
    if (names.size) out.set(a.id, names);
  }
  return out;
}

// New tracked events -> enrollments in matching event-triggered automations, and wake-ups for event waits.
async function matchEvents(db, projectId, automations, cursor, run) {
  const { now, deadline, summary, touched } = run;
  const ids = Array.isArray(cursor.last_event_ids) ? cursor.last_event_ids : [];
  const lastSeenId = ids[ids.length - 1] || null;
  const since = cursor.last_event_at || iso(now);
  const columns = "id, project_id, contact_id, name, properties, source, url, campaign_id, revenue, occurred_at, created_at";
  const base = () => db.from("tracked_events").select(columns).eq("project_id", projectId).is("deleted_at", null);
  const events = [];
  // Keyset paging on (created_at, id): first the rest of the cursor's instant, then everything after it.
  if (lastSeenId) {
    const { data, error } = await base().eq("created_at", since).gt("id", lastSeenId).order("id", { ascending: true }).limit(EVENT_BATCH);
    if (error) {
      console.error("[automations.events]", error.message);
      return;
    }
    events.push(...(data || []));
  }
  if (events.length < EVENT_BATCH) {
    const { data, error } = await (lastSeenId ? base().gt("created_at", since) : base().gte("created_at", since))
      .lte("created_at", iso(now.getTime() - EVENT_SETTLE_MS))
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(EVENT_BATCH - events.length);
    if (error) {
      console.error("[automations.events]", error.message);
      return;
    }
    events.push(...(data || []));
  }
  const triggers = automations.filter((a) => a.trigger?.type === "event" && a.trigger.event);
  const goalEvents = await goalEventsByAutomation(db, projectId, automations);
  let lastAt = cursor.last_event_at;
  let lastId = lastSeenId;
  let processed = 0;
  for (const event of events) {
    if (past(deadline)) break;
    if (event.contact_id) {
      for (const a of triggers) {
        if (a.publishedAt && Date.parse(event.created_at) < Date.parse(a.publishedAt)) continue;
        if (!matchesEventTrigger(a.trigger, event)) continue;
        const res = await enrollContact(db, {
          automation: a,
          contactId: event.contact_id,
          triggerKey: `event:${event.id}`,
          context: { trigger: { event: event.name, eventId: event.id, properties: obj(event.properties) } },
          now,
        });
        if (res.enrollment) {
          summary.enrolled += 1;
          touched.add(a.id);
        }
      }
      const { error: wakeError } = await db
        .from("automation_enrollments")
        .update({ next_run_at: iso(now) })
        .eq("project_id", projectId)
        .eq("contact_id", event.contact_id)
        .eq("status", "waiting")
        .eq("context->waiting->>event", event.name);
      if (wakeError) console.error("[automations.wake]", wakeError.message);
      // A goal event re-checks the contact's runs right away instead of when their current wait ends.
      const goalHits = automations.filter((a) => goalEvents.get(a.id)?.has(event.name)).map((a) => a.id);
      if (goalHits.length) {
        const { error: goalError } = await db
          .from("automation_enrollments")
          .update({ next_run_at: iso(now) })
          .in("automation_id", goalHits)
          .eq("contact_id", event.contact_id)
          .in("status", RUNNING);
        if (goalError) console.error("[automations.wakeGoal]", goalError.message);
      }
    }
    processed += 1;
    lastAt = event.created_at;
    lastId = event.id;
  }
  summary.events += processed;
  if (processed) await saveCursor(db, projectId, { last_event_at: lastAt, last_event_ids: [lastId] });
}

async function existingTriggerKeys(db, automationId, prefix) {
  const { data } = await db
    .from("automation_enrollments")
    .select("contact_id, trigger_key")
    .eq("automation_id", automationId)
    .like("trigger_key", `${prefix}%`)
    .limit(20000);
  return new Set((data || []).map((r) => `${r.contact_id}|${r.trigger_key}`));
}

// Hourly scan for date-attribute anniversaries and inactivity.
async function scanScheduled(db, projectId, automations, cursor, run) {
  const { now, deadline, summary, touched, deps, cache } = run;
  const scheduled = automations.filter((a) => isScheduledTrigger(a.trigger));
  if (!scheduled.length) return;
  if (cursor.last_scan_at && now.getTime() - Date.parse(cursor.last_scan_at) < SCAN_EVERY_MS) return;
  const settings = await settingsFor({ db, deps, cache, automation: { projectId } });
  const tz = safeTimeZone(settings.general?.timezone);

  for (const a of scheduled) {
    if (past(deadline)) return;
    const t = a.trigger;
    let candidates = [];
    let keyFor;
    if (t.type === "date") {
      const field = String(t.field || "").trim();
      if (!/^[\w.-]+$/.test(field)) continue;
      const at = parseTime(t.time);
      if (at && localMinutes(now, tz) < at.hour * 60 + at.minute) continue;
      const target = shiftDate(localDate(now, tz), -(Number(t.offsetDays) || 0));
      const recurring = t.recurring !== false;
      const pattern = recurring ? `%-${target.slice(5)}%` : `${target}%`;
      const { data, error } = await db
        .from("contacts")
        .select("id")
        .eq("project_id", projectId)
        .is("deleted_at", null)
        .like(`attributes->>${field}`, pattern)
        .limit(SCAN_BATCH);
      if (error) console.error("[automations.scan.date]", error.message);
      candidates = data || [];
      const key = recurring ? `date:${field}:${target.slice(0, 4)}` : `date:${field}:${target}`;
      keyFor = () => key;
    } else {
      const days = Math.max(1, Number(t.days) || 0);
      const cutoff = iso(now.getTime() - days * 86_400_000);
      const base = () => db.from("contacts").select("id, last_activity_at, created_at").eq("project_id", projectId).is("deleted_at", null).eq("status", "subscribed");
      const [stale, never] = await Promise.all([
        base().lt("last_activity_at", cutoff).limit(SCAN_BATCH),
        base().is("last_activity_at", null).lt("created_at", cutoff).limit(SCAN_BATCH),
      ]);
      if (stale.error) console.error("[automations.scan.inactive]", stale.error.message);
      candidates = [...(stale.data || []), ...(never.data || [])].slice(0, SCAN_BATCH);
      keyFor = (c) => `inactive:${c.last_activity_at || c.created_at}`;
    }
    if (!candidates.length) continue;
    const known = await existingTriggerKeys(db, a.id, t.type === "date" ? "date:" : "inactive:");
    for (const c of candidates) {
      if (past(deadline)) return;
      summary.scanned += 1;
      const triggerKey = keyFor(c);
      if (known.has(`${c.id}|${triggerKey}`)) continue;
      const res = await enrollContact(db, { automation: a, contactId: c.id, triggerKey, context: { trigger: { type: t.type, key: triggerKey } }, now });
      if (res.enrollment) {
        summary.enrolled += 1;
        touched.add(a.id);
      }
    }
  }
  await saveCursor(db, projectId, { last_scan_at: iso(now) });
}

// Enrollments of archived or deleted automations end with "automation_stopped".
async function stopOrphans(db, run) {
  const [{ data: archived }, { data: deleted }] = await Promise.all([
    db.from("automations").select("id").eq("status", "archived").order("updated_at", { ascending: false }).limit(200),
    db.from("automations").select("id").not("deleted_at", "is", null).order("updated_at", { ascending: false }).limit(200),
  ]);
  const ids = [...new Set([...(archived || []), ...(deleted || [])].map((r) => r.id))];
  if (!ids.length) return;
  const { data, error } = await db
    .from("automation_enrollments")
    .update({ status: "exited", exit_reason: "automation_stopped", completed_at: iso(run.now), next_run_at: null })
    .in("automation_id", ids)
    .in("status", RUNNING)
    .select("id");
  if (error) console.error("[automations.stopOrphans]", error.message);
  run.summary.stopped += (data || []).length;
}

// Claims and advances due enrollments of live automations (plus test runs on any status).
async function processDue(db, activeById, run) {
  const { now, deadline, deps, summary, touched, cache } = run;
  const due = [];
  const activeIds = [...activeById.keys()];
  for (let i = 0; i < activeIds.length && due.length < DUE_BATCH; i += 100) {
    const { data, error } = await db
      .from("automation_enrollments")
      .select("*")
      .in("automation_id", activeIds.slice(i, i + 100))
      .in("status", RUNNING)
      .is("deleted_at", null)
      .lte("next_run_at", iso(now))
      .order("next_run_at", { ascending: true })
      .limit(DUE_BATCH - due.length);
    if (error) console.error("[automations.due]", error.message);
    due.push(...(data || []));
  }
  const { data: tests } = await db
    .from("automation_enrollments")
    .select("*")
    .eq("context->>test", "true")
    .in("status", RUNNING)
    .is("deleted_at", null)
    .lte("next_run_at", iso(now))
    .order("next_run_at", { ascending: true })
    .limit(50);
  const byId = new Map(due.map((e) => [e.id, e]));
  for (const e of tests || []) if (!byId.has(e.id)) byId.set(e.id, e);

  const missing = [...new Set([...byId.values()].map((e) => e.automation_id).filter((id) => !activeById.has(id)))];
  const automations = new Map(activeById);
  if (missing.length) {
    const { data } = await db.from("automations").select(AUTOMATION_COLUMNS).in("id", missing);
    for (const row of data || []) automations.set(row.id, asEngineAutomation(row));
  }

  for (const e of byId.values()) {
    if (past(deadline)) return;
    const a = automations.get(e.automation_id);
    if (!a || a.deletedAt || a.status === "archived") continue;
    if (a.status !== "active" && !obj(e.context).test) continue;
    const claimUntil = iso(now.getTime() + CLAIM_MS);
    const { data: claimed } = await db
      .from("automation_enrollments")
      .update({ next_run_at: claimUntil })
      .eq("id", e.id)
      .eq("next_run_at", e.next_run_at)
      .in("status", RUNNING)
      .select("id");
    if (!claimed?.length) continue;
    const res = await advanceEnrollment(db, { ...e, next_run_at: claimUntil }, { automation: a, now, deadline, deps, cache });
    summary.advanced += 1;
    if (res.status === "completed") summary.completed += 1;
    if (res.status === "failed") summary.failed += 1;
    touched.add(a.id);
  }
}

// One scheduler tick over every project. -> { projects, events, enrolled, advanced, completed, failed, scanned, stopped }
export async function runTick(db, { now = new Date(), deadline = null, deps = {} } = {}) {
  const summary = { projects: 0, events: 0, enrolled: 0, advanced: 0, completed: 0, failed: 0, scanned: 0, stopped: 0 };
  const touched = new Set();
  const cache = createCache();
  const run = { now, deadline, deps, summary, touched, cache };

  const { data: rows, error } = await db.from("automations").select(AUTOMATION_COLUMNS).eq("status", "active").is("deleted_at", null).limit(2000);
  if (error) {
    console.error("[automations.tick]", error.message);
    return { ...summary, error: "load_failed" };
  }
  const active = (rows || []).map(asEngineAutomation);
  const activeById = new Map(active.map((a) => [a.id, a]));
  const byProject = new Map();
  for (const a of active) {
    if (!byProject.has(a.projectId)) byProject.set(a.projectId, []);
    byProject.get(a.projectId).push(a);
  }

  for (const [projectId, list] of byProject) {
    if (past(deadline)) break;
    summary.projects += 1;
    const cursor = await loadCursor(db, projectId, list, now);
    await matchEvents(db, projectId, list, cursor, run);
    if (!past(deadline)) await scanScheduled(db, projectId, list, cursor, run);
  }

  if (!past(deadline)) await processDue(db, activeById, run);
  if (!past(deadline)) await stopOrphans(db, run);
  for (const id of touched) {
    if (past(deadline)) break;
    await refreshAutomationStats(db, id, now);
  }
  return summary;
}
