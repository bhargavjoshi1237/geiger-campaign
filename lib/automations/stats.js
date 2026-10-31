// Automation rollup computed from raw rows (isomorphic, pure) — the same shape campaign.automation_stats()
// returns: { totals, current: { nodeId: n }, processed: { nodeId: { ok, failed, skipped } } }. The engine falls
// back to it where the SQL function is unavailable (the playground's in-memory database).

const obj = (v) => (v && typeof v === "object" ? v : {});

export function computeAutomationStats(enrollmentRows = [], logRows = []) {
  const totals = { enrolled: 0, active: 0, waiting: 0, completed: 0, exited: 0, failed: 0, converted: 0 };
  const current = {};
  for (const e of enrollmentRows) {
    if (e.deleted_at) continue;
    const ctx = obj(e.context);
    if ((e.status === "active" || e.status === "waiting") && e.current_node_id) {
      current[e.current_node_id] = (current[e.current_node_id] || 0) + 1;
    }
    if (ctx.test) continue;
    totals.enrolled += 1;
    if (e.status in totals) totals[e.status] += 1;
    if (ctx.convertedAt) totals.converted += 1;
  }

  const sets = {};
  for (const l of logRows) {
    if (l.deleted_at || !l.node_id) continue;
    const bucket = (sets[l.node_id] ||= { ok: new Set(), failed: new Set(), skipped: new Set() });
    if (bucket[l.status]) bucket[l.status].add(l.enrollment_id);
  }
  const processed = {};
  for (const [nodeId, b] of Object.entries(sets)) processed[nodeId] = { ok: b.ok.size, failed: b.failed.size, skipped: b.skipped.size };

  return { totals, current, processed };
}

// The `automations.stats` column value for a rollup.
export function statsColumn(rollup, now = new Date()) {
  return { ...obj(rollup?.totals), updatedAt: now.toISOString() };
}
