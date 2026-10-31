// Server-side readers that ground the AI tools in workspace data (user-scoped db, so RLS applies). Rows are
// mapped to the same camelCase shapes the browser data layer produces, so the pure scorers in lib/ai run
// identically on both sides. Every reader degrades to empty on error — a missing optional table (custom
// fields, brand kits) must never fail a generation.

const DAY = 24 * 60 * 60 * 1000;
const PAGE = 1000;

export const daysAgoIso = (days, now = new Date()) => new Date(now.getTime() - days * DAY).toISOString();

export function toDelivery(r) {
  return {
    id: r.id,
    channel: r.channel ?? "email",
    status: r.status ?? "queued",
    contactId: r.contact_id ?? null,
    sourceType: r.source_type ?? "campaign",
    campaignId: r.campaign_id ?? null,
    subject: r.subject ?? "",
    cost: Number(r.cost ?? 0),
    openCount: Number(r.open_count ?? 0),
    clickCount: Number(r.click_count ?? 0),
    sentAt: r.sent_at ?? null,
    openedAt: r.opened_at ?? null,
    clickedAt: r.clicked_at ?? null,
    bouncedAt: r.bounced_at ?? null,
    unsubscribedAt: r.unsubscribed_at ?? null,
    createdAt: r.created_at ?? null,
  };
}

export function toEvent(r) {
  return {
    id: r.id,
    contactId: r.contact_id ?? null,
    campaignId: r.campaign_id ?? null,
    name: r.name ?? "",
    revenue: r.revenue == null ? null : Number(r.revenue),
    occurredAt: r.occurred_at ?? r.created_at ?? null,
  };
}

export function toCampaign(r) {
  return { id: r.id, name: r.name ?? "Untitled campaign", channel: r.channel ?? "email", status: r.status ?? "draft", subject: r.subject ?? "", sentAt: r.sent_at ?? null };
}

async function paged(label, build, max) {
  const rows = [];
  try {
    for (let from = 0; from < max; from += PAGE) {
      const { data, error } = await build().range(from, Math.min(from + PAGE, max) - 1);
      if (error) {
        console.error(`[ai.context.${label}]`, error.message);
        break;
      }
      rows.push(...(data || []));
      if (!data || data.length < PAGE) break;
    }
  } catch (e) {
    console.error(`[ai.context.${label}]`, e);
  }
  return rows;
}

const DELIVERY_COLUMNS =
  "id, channel, status, contact_id, source_type, campaign_id, subject, cost, open_count, click_count, sent_at, opened_at, clicked_at, bounced_at, unsubscribed_at, created_at";

export async function loadDeliveries(db, projectId, { sinceDays = 90, max = 20000 } = {}) {
  const since = daysAgoIso(sinceDays);
  const rows = await paged(
    "deliveries",
    () => db.from("deliveries").select(DELIVERY_COLUMNS).eq("project_id", projectId).is("deleted_at", null).gte("created_at", since).order("created_at", { ascending: false }),
    max,
  );
  return rows.map(toDelivery);
}

export async function loadEvents(db, projectId, { sinceDays = 90, max = 20000 } = {}) {
  const since = daysAgoIso(sinceDays);
  const rows = await paged(
    "events",
    () =>
      db
        .from("tracked_events")
        .select("id, contact_id, campaign_id, name, revenue, occurred_at, created_at")
        .eq("project_id", projectId)
        .is("deleted_at", null)
        .gte("occurred_at", since)
        .order("occurred_at", { ascending: false }),
    max,
  );
  return rows.map(toEvent);
}

export async function loadCampaigns(db, projectId) {
  const rows = await paged(
    "campaigns",
    () => db.from("campaigns").select("id, name, channel, status, subject, sent_at").eq("project_id", projectId).is("deleted_at", null).order("created_at", { ascending: false }),
    2000,
  );
  return rows.map(toCampaign);
}

async function one(label, query) {
  try {
    const { data, error } = await query;
    if (error) {
      console.error(`[ai.context.${label}]`, error.message);
      return null;
    }
    return data ?? null;
  } catch (e) {
    console.error(`[ai.context.${label}]`, e);
    return null;
  }
}

export async function loadLists(db, projectId) {
  const rows = await one("lists", db.from("lists").select("id, name, description").eq("project_id", projectId).is("deleted_at", null).order("name"));
  return (rows || []).map((l) => ({ id: l.id, name: l.name || "Untitled list", description: l.description || "" }));
}

// Audience's custom fields (campaign.custom_fields) — optional; [] when the table isn't there.
export async function loadCustomFields(db, projectId) {
  const rows = await one("custom_fields", db.from("custom_fields").select("*").eq("project_id", projectId).is("deleted_at", null));
  return (rows || []).map((f) => ({ key: f.key, label: f.label || f.key, type: f.type || "text", options: f.options ?? undefined })).filter((f) => f.key);
}

// Audience's tag names (campaign.tags) — optional.
export async function loadTags(db, projectId) {
  const rows = await one("tags", db.from("tags").select("name").eq("project_id", projectId).is("deleted_at", null).limit(500));
  return (rows || []).map((t) => t.name).filter(Boolean);
}

// Distinct tracked event names seen in the last 90 days, most frequent first.
export async function loadEventNames(db, projectId) {
  const rows = await one(
    "event_names",
    db.from("tracked_events").select("name").eq("project_id", projectId).is("deleted_at", null).gte("occurred_at", daysAgoIso(90)).limit(5000),
  );
  const counts = new Map();
  for (const r of rows || []) if (r.name) counts.set(r.name, (counts.get(r.name) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
}

export async function countRows(db, table, apply) {
  try {
    const { count, error } = await apply(db.from(table).select("id", { count: "exact", head: true }));
    if (error) {
      console.error(`[ai.context.count.${table}]`, error.message);
      return null;
    }
    return count ?? 0;
  } catch (e) {
    console.error(`[ai.context.count.${table}]`, e);
    return null;
  }
}

// { kind: "all" | "list" | "segment", id } -> facts about the audience the brief targets.
export async function loadAudience(db, projectId, audience = {}) {
  const kind = audience.kind || "all";
  if (kind === "list" && audience.id) {
    const list = await one("list", db.from("lists").select("id, name, description").eq("project_id", projectId).eq("id", audience.id).is("deleted_at", null).maybeSingle());
    if (!list) return null;
    const size = await countRows(db, "list_members", (q) => q.eq("list_id", list.id).eq("status", "subscribed").is("deleted_at", null));
    return { kind, id: list.id, name: list.name, description: list.description || "", size, conditions: [] };
  }
  if (kind === "segment" && audience.id) {
    const seg = await one(
      "segment",
      db.from("segments").select("id, name, description, match, conditions, contact_count").eq("project_id", projectId).eq("id", audience.id).is("deleted_at", null).maybeSingle(),
    );
    if (!seg) return null;
    return {
      kind,
      id: seg.id,
      name: seg.name,
      description: seg.description || "",
      size: seg.contact_count ?? null,
      match: seg.match || "all",
      conditions: Array.isArray(seg.conditions) ? seg.conditions : [],
    };
  }
  const size = await countRows(db, "contacts", (q) => q.eq("project_id", projectId).eq("status", "subscribed").is("deleted_at", null));
  return { kind: "all", id: null, name: "All subscribed contacts", description: "", size, conditions: [] };
}

export function describeAudience(a) {
  if (!a) return "Audience unknown.";
  const parts = [`${a.kind === "all" ? "Audience" : a.kind === "list" ? "List" : "Segment"}: ${a.name}`];
  if (a.size != null) parts.push(`${a.size} subscribed contacts`);
  if (a.description) parts.push(`Description: ${a.description}`);
  if (a.conditions?.length) {
    parts.push(`Rules (${a.match === "any" ? "any" : "all"} of): ${a.conditions.map((c) => `${c.field} ${c.operator} ${JSON.stringify(c.value)}`).join("; ")}`);
  }
  return parts.join(". ");
}
