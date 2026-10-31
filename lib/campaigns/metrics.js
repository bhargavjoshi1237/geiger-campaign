// Campaign metrics (isomorphic): the pure rollup from delivery + tracked-event rows (snake_case, exactly
// what the tables return) and the db helpers that cache it on campaign.campaigns.metrics. The rollup
// is also how the playground derives seeded campaign metrics, so keep it free of server imports.

// Events that count as a conversion when attributed to a campaign (tracked_events.campaign_id).
export const CONVERSION_EVENTS = Object.freeze([
  "order_completed",
  "order_placed",
  "purchase",
  "checkout_completed",
  "conversion",
  "deal_won",
]);

const NOT_SENT = new Set(["queued", "failed", "not_sent"]);
const ratio = (part, whole) => (whole ? Math.round((part / whole) * 10_000) / 10_000 : 0);

export function isConversionEvent(row) {
  return CONVERSION_EVENTS.includes(row?.name) || row?.properties?.conversion === true;
}

// deliveryRows: campaign.deliveries rows for one campaign; eventRows: its campaign.tracked_events rows.
export function rollupCampaignMetrics(deliveryRows = [], eventRows = []) {
  const deliveries = deliveryRows.filter((d) => d && d.source_type !== "test" && !d.deleted_at);
  let sent = 0;
  let failed = 0;
  let bounces = 0;
  let complaints = 0;
  let opens = 0;
  let uniqueOpens = 0;
  let clicks = 0;
  let uniqueClicks = 0;
  let unsubscribes = 0;
  let cost = 0;

  for (const d of deliveries) {
    const status = d.status || "queued";
    if (status === "failed" || status === "not_sent") failed += 1;
    if (!NOT_SENT.has(status)) sent += 1;
    if (status === "bounced" || d.bounced_at) bounces += 1;
    if (status === "complained") complaints += 1;
    if (d.unsubscribed_at || status === "unsubscribed") unsubscribes += 1;
    opens += Number(d.open_count) || (d.opened_at ? 1 : 0);
    if (d.opened_at) uniqueOpens += 1;
    clicks += Number(d.click_count) || (d.clicked_at ? 1 : 0);
    if (d.clicked_at) uniqueClicks += 1;
    cost += Number(d.cost) || 0;
  }

  const conversionsRows = eventRows.filter((e) => e && !e.deleted_at && isConversionEvent(e));
  const revenue = conversionsRows.reduce((sum, e) => sum + (Number(e.revenue) || 0), 0);
  const currency = conversionsRows.find((e) => e.currency)?.currency || "USD";
  const delivered = Math.max(0, sent - bounces);

  return {
    recipients: deliveries.length,
    sent,
    delivered,
    failed,
    opens,
    uniqueOpens,
    clicks,
    uniqueClicks,
    bounces,
    complaints,
    unsubscribes,
    conversions: conversionsRows.length,
    revenue: Math.round(revenue * 100) / 100,
    currency,
    cost: Math.round(cost * 100_000) / 100_000,
    openRate: ratio(uniqueOpens, delivered),
    clickRate: ratio(uniqueClicks, delivered),
    clickToOpenRate: ratio(uniqueClicks, uniqueOpens),
    bounceRate: ratio(bounces, sent),
    unsubscribeRate: ratio(unsubscribes, delivered),
    conversionRate: ratio(conversionsRows.length, delivered),
  };
}

// Pages through a query factory (Supabase caps a response at 1,000 rows).
export async function selectAll(build, { pageSize = 1000, max = 100_000 } = {}) {
  const rows = [];
  for (let from = 0; from < max; from += pageSize) {
    const { data, error } = await build().range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

const DELIVERY_COLUMNS =
  "id, contact_id, status, source_type, variant, open_count, click_count, opened_at, clicked_at, bounced_at, unsubscribed_at, sent_at, cost, deleted_at";
const EVENT_COLUMNS = "id, name, contact_id, delivery_id, revenue, currency, properties, occurred_at, deleted_at";

export async function loadCampaignRows(db, projectId, campaignId) {
  const deliveries = await selectAll(() =>
    db.from("deliveries").select(DELIVERY_COLUMNS).eq("project_id", projectId).eq("campaign_id", campaignId).order("created_at"),
  );
  const events = await selectAll(() =>
    db
      .from("tracked_events")
      .select(`${EVENT_COLUMNS}, url`)
      .eq("project_id", projectId)
      .eq("campaign_id", campaignId)
      .order("occurred_at"),
  );
  return { deliveries, events };
}

// Recomputes and caches a campaign's metrics (service-role db). Returns the metrics, or null on failure.
export async function refreshCampaignMetrics(db, projectId, campaignId) {
  if (!db || !projectId || !campaignId) return null;
  try {
    const { deliveries, events } = await loadCampaignRows(db, projectId, campaignId);
    const metrics = { ...rollupCampaignMetrics(deliveries, events), updatedAt: new Date().toISOString() };
    const { error } = await db.from("campaigns").update({ metrics }).eq("id", campaignId).eq("project_id", projectId);
    if (error) {
      console.error("[campaigns.metrics.refresh]", error.message);
      return null;
    }
    return metrics;
  } catch (e) {
    console.error("[campaigns.metrics.refresh]", e);
    return null;
  }
}

// Last-click attribution for a conversion that arrives without a campaign: the contact's most recent
// clicked campaign delivery inside the window. Returns { campaignId, deliveryId } or null.
export async function attributeConversion(db, projectId, { contactId = null, deliveryId = null, windowDays = 5 } = {}) {
  if (!db || !projectId || (!contactId && !deliveryId)) return null;
  try {
    let query = db
      .from("deliveries")
      .select("id, campaign_id, clicked_at")
      .eq("project_id", projectId)
      .not("campaign_id", "is", null);
    query = deliveryId
      ? query.eq("id", deliveryId)
      : query
          .eq("contact_id", contactId)
          .gte("clicked_at", new Date(Date.now() - windowDays * 86_400_000).toISOString())
          .order("clicked_at", { ascending: false });
    const { data, error } = await query.limit(1).maybeSingle();
    if (error || !data) return null;
    return { campaignId: data.campaign_id, deliveryId: data.id };
  } catch (e) {
    console.error("[campaigns.metrics.attribute]", e);
    return null;
  }
}
