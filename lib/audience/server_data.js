// Paged loaders over a campaign-schema client (service-role, user-scoped or the playground's in-memory one)
// for the server audience code. Plain filters only, so every client shape runs them. Throw on query errors —
// callers sit inside a route's handle() or a worker's try/catch.

export const PAGE_SIZE = 1000;
export const ID_CHUNK = 150;
const DAY = 86_400_000;

export function chunk(list, size = ID_CHUNK) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

// Pages through build() (a fresh, ordered query per call) until a short page or `max` rows.
export async function fetchAll(build, { max = 250_000, label = "audience.fetch" } = {}) {
  const rows = [];
  for (let from = 0; from < max; from += PAGE_SIZE) {
    const { data, error } = await build().range(from, Math.min(from + PAGE_SIZE, max) - 1);
    if (error) throw new Error(`[${label}] ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

export function loadProjectContacts(db, projectId, { columns = "*", max } = {}) {
  return fetchAll(
    () => db.from("contacts").select(columns).eq("project_id", projectId).is("deleted_at", null).order("id"),
    { max, label: "audience.contacts" },
  );
}

export async function loadContactsByIds(db, projectId, ids, { columns = "*" } = {}) {
  const out = [];
  for (const part of chunk([...new Set(ids)])) {
    const { data, error } = await db
      .from("contacts")
      .select(columns)
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .in("id", part);
    if (error) throw new Error(`[audience.contactsByIds] ${error.message}`);
    out.push(...(data || []));
  }
  return out;
}

// Live lists among `listIds` (deleted lists never contribute members).
export async function liveListIds(db, projectId, listIds) {
  if (!listIds?.length) return [];
  const { data, error } = await db
    .from("lists")
    .select("id")
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .in("id", listIds);
  if (error) throw new Error(`[audience.lists] ${error.message}`);
  return (data || []).map((r) => r.id);
}

// Subscribed memberships, optionally narrowed to some lists.
export function loadMemberships(db, projectId, { listIds = null } = {}) {
  return fetchAll(
    () => {
      let q = db
        .from("list_members")
        .select("id, list_id, contact_id, status")
        .eq("project_id", projectId)
        .eq("status", "subscribed")
        .is("deleted_at", null);
      if (listIds) q = q.in("list_id", listIds);
      return q.order("id");
    },
    { label: "audience.list_members" },
  );
}

export async function loadSegments(db, projectId, ids) {
  if (!ids?.length) return [];
  const { data, error } = await db
    .from("segments")
    .select("id, name, match, conditions")
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .in("id", ids);
  if (error) throw new Error(`[audience.segments] ${error.message}`);
  return data || [];
}

const sinceIso = (needs, now) => (needs.allTime || !needs.sinceDays ? null : new Date(now - needs.sinceDays * DAY).toISOString());

// Tracked events with one of `names` (contact_id, name, occurred_at), inside the needed window.
export function loadEvents(db, projectId, names, { since = null } = {}) {
  const list = [...names].filter(Boolean);
  if (!list.length) return Promise.resolve([]);
  return fetchAll(
    () => {
      let q = db
        .from("tracked_events")
        .select("id, contact_id, name, occurred_at")
        .eq("project_id", projectId)
        .is("deleted_at", null)
        .in("name", list);
      if (since) q = q.gte("occurred_at", since);
      return q.order("id");
    },
    { label: "audience.events" },
  );
}

// Deliveries for engagement rules (opens, clicks, receipts), inside the needed window.
export function loadDeliveries(db, projectId, { since = null } = {}) {
  return fetchAll(
    () => {
      let q = db
        .from("deliveries")
        .select("id, contact_id, channel, status, sent_at, opened_at, clicked_at, created_at")
        .eq("project_id", projectId)
        .is("deleted_at", null)
        .not("contact_id", "is", null);
      if (since) q = q.gte("created_at", since);
      return q.order("id");
    },
    { label: "audience.deliveries" },
  );
}

// Everything conditionNeeds() asked for, as raw rows ready for buildContextIndex().
export async function loadRuleContext(db, projectId, needs, now = Date.now()) {
  const since = sinceIso(needs, now);
  const [listMembers, events, deliveries] = await Promise.all([
    needs.lists ? loadMemberships(db, projectId) : [],
    needs.eventNames?.size ? loadEvents(db, projectId, needs.eventNames, { since }) : [],
    needs.deliveries ? loadDeliveries(db, projectId, { since }) : [],
  ]);
  return { listMembers, events, deliveries };
}
