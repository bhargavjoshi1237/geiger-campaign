// Server-side report sources (service-role db, worker only): the same windows the screens load through
// lib/supabase/report_sources.js, paged past PostgREST's row cap and mapped with lib/reporting/rows.js.

import { DEFAULT_CONVERSION_EVENTS } from "./attribution";
import {
  DELIVERY_COLUMNS,
  EVENT_COLUMNS,
  campaignFromRow,
  contactFromRow,
  deliveryFromRow,
  eventFromRow,
  listFromRow,
  memberFromRow,
  segmentFromRow,
} from "./rows";

const PAGE = 1000;
const MAX_ROWS = 30000;

async function pageThrough(build, map) {
  const rows = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    for (const row of data || []) rows.push(map(row));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

// Everything a report definition can read for one project since `since` (ISO).
export async function loadServerSources(db, projectId, { since, needsContacts = true, needsSegments = false } = {}) {
  const scoped = (table, columns, order) =>
    db.from(table).select(columns).eq("project_id", projectId).is("deleted_at", null).order(order, { ascending: false });

  const [campaigns, deliveries, events, contacts, lists, listMembers, segments] = await Promise.all([
    pageThrough(() => scoped("campaigns", "id, name, channel, type, status, subject, metrics, scheduled_at, sent_at, created_at", "created_at"), campaignFromRow),
    pageThrough(() => scoped("deliveries", DELIVERY_COLUMNS, "created_at").gte("created_at", since), deliveryFromRow),
    pageThrough(
      () =>
        scoped("tracked_events", EVENT_COLUMNS, "occurred_at")
          .gte("occurred_at", since)
          .or(`revenue.not.is.null,delivery_id.not.is.null,campaign_id.not.is.null,name.in.(${DEFAULT_CONVERSION_EVENTS.join(",")})`),
      eventFromRow,
    ),
    needsContacts
      ? pageThrough(() => scoped("contacts", "id, email, status, source, tags, attributes, created_at, unsubscribed_at", "created_at"), contactFromRow)
      : Promise.resolve([]),
    pageThrough(() => scoped("lists", "id, name, created_at", "created_at"), listFromRow),
    pageThrough(
      () => db.from("list_members").select("id, list_id, contact_id, status, created_at, updated_at, deleted_at").eq("project_id", projectId).order("created_at", { ascending: false }),
      memberFromRow,
    ),
    needsSegments ? pageThrough(() => scoped("segments", "id, name, match, conditions, contact_count", "created_at"), segmentFromRow) : Promise.resolve([]),
  ]);

  return { campaigns, deliveries, events, contacts, lists, listMembers, segments };
}
