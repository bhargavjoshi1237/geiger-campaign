// Row mappers for reporting (pure, no "use client"): lists, list members and segments for every caller,
// plus server-side mirrors of the core normalizers (lib/supabase/*) so the report worker can build the
// same camelCase view models without importing client modules. Keep the field names in sync with them.

const bag = (v) => (v && typeof v === "object" ? v : {});

export function listFromRow(row) {
  return { id: row.id, name: row.name ?? "Untitled list", createdAt: row.created_at ?? null };
}

export function memberFromRow(row) {
  return {
    id: row.id,
    listId: row.list_id,
    contactId: row.contact_id,
    status: row.status ?? "subscribed",
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
    deletedAt: row.deleted_at ?? null,
  };
}

export function segmentFromRow(row) {
  return {
    id: row.id,
    name: row.name ?? "Untitled segment",
    match: row.match === "any" ? "any" : "all",
    conditions: Array.isArray(row.conditions) ? row.conditions : [],
    contactCount: Number(row.contact_count ?? 0),
  };
}

export function deliveryFromRow(row) {
  return {
    ...bag(row.metadata),
    id: row.id,
    channel: row.channel ?? "email",
    status: row.status ?? "queued",
    contactId: row.contact_id ?? null,
    to: row.to_address ?? "",
    sourceType: row.source_type ?? "campaign",
    campaignId: row.campaign_id ?? null,
    variant: row.variant ?? null,
    openCount: Number(row.open_count ?? 0),
    clickCount: Number(row.click_count ?? 0),
    sentAt: row.sent_at ?? null,
    deliveredAt: row.delivered_at ?? null,
    openedAt: row.opened_at ?? null,
    clickedAt: row.clicked_at ?? null,
    bouncedAt: row.bounced_at ?? null,
    unsubscribedAt: row.unsubscribed_at ?? null,
    createdAt: row.created_at ?? null,
  };
}

export function eventFromRow(row) {
  return {
    id: row.id,
    contactId: row.contact_id ?? null,
    anonymousId: row.anonymous_id ?? null,
    name: row.name ?? "",
    properties: bag(row.properties),
    source: row.source ?? "web",
    deliveryId: row.delivery_id ?? null,
    campaignId: row.campaign_id ?? null,
    revenue: row.revenue == null ? null : Number(row.revenue),
    currency: row.currency ?? null,
    url: row.url ?? "",
    referrer: row.referrer ?? "",
    utm: bag(row.utm),
    occurredAt: row.occurred_at ?? row.created_at ?? null,
  };
}

export function campaignFromRow(row) {
  return {
    id: row.id,
    name: row.name ?? "Untitled campaign",
    channel: row.channel ?? "email",
    type: row.type ?? "regular",
    status: row.status ?? "draft",
    subject: row.subject ?? "",
    metrics: bag(row.metrics),
    scheduledAt: row.scheduled_at ?? null,
    sentAt: row.sent_at ?? null,
    createdAt: row.created_at ?? null,
  };
}

export function contactFromRow(row) {
  return {
    id: row.id,
    email: row.email ?? "",
    status: row.status ?? "subscribed",
    source: row.source ?? "manual",
    tags: Array.isArray(row.tags) ? row.tags : [],
    attributes: bag(row.attributes),
    createdAt: row.created_at ?? null,
    unsubscribedAt: row.unsubscribed_at ?? null,
  };
}

// Columns the report loaders select (metadata/html are skipped to keep pages small).
export const DELIVERY_COLUMNS =
  "id, project_id, channel, status, contact_id, to_address, source_type, source_id, campaign_id, variant, open_count, click_count, sent_at, delivered_at, opened_at, clicked_at, bounced_at, unsubscribed_at, created_at";
export const EVENT_COLUMNS =
  "id, project_id, contact_id, anonymous_id, name, properties, source, delivery_id, campaign_id, revenue, currency, url, referrer, utm, occurred_at, created_at";
