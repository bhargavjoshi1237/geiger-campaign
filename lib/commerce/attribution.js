// Simple revenue attribution (server-side query + pure picker): an order belongs to the campaign whose
// email the shopper last clicked within the window before ordering (last click, 5 days). Reports and
// the Orders screen read the result stored on orders.attributed_campaign_id / orders.attribution.

export const ATTRIBUTION_MODEL = "last_click";
export const ATTRIBUTION_WINDOW_DAYS = 5;

const DAY = 86_400_000;

// deliveries: raw rows with clicked_at; returns the attribution record (matched or not).
export function pickLastClick(deliveries, placedAt, windowDays = ATTRIBUTION_WINDOW_DAYS) {
  const placed = Date.parse(placedAt) || Date.now();
  const from = placed - windowDays * DAY;
  const best = (deliveries || [])
    .filter((d) => d?.clicked_at && d.channel === "email")
    .map((d) => ({ d, t: Date.parse(d.clicked_at) }))
    .filter(({ t }) => t >= from && t <= placed)
    .sort((a, b) => b.t - a.t)[0]?.d;
  if (!best) return { model: ATTRIBUTION_MODEL, window_days: windowDays, matched: false };
  return {
    model: ATTRIBUTION_MODEL,
    window_days: windowDays,
    matched: true,
    delivery_id: best.id,
    campaign_id: best.campaign_id ?? null,
    source_type: best.source_type ?? null,
    source_id: best.source_id ?? null,
    clicked_at: best.clicked_at,
  };
}

export async function attributeOrder(db, { projectId, contactId, placedAt, windowDays = ATTRIBUTION_WINDOW_DAYS }) {
  if (!db || !projectId || !contactId) return { model: ATTRIBUTION_MODEL, window_days: windowDays, matched: false };
  const placed = Date.parse(placedAt) || Date.now();
  const { data, error } = await db
    .from("deliveries")
    .select("id, channel, campaign_id, source_type, source_id, clicked_at")
    .eq("project_id", projectId)
    .eq("contact_id", contactId)
    .eq("channel", "email")
    .gte("clicked_at", new Date(placed - windowDays * DAY).toISOString())
    .lte("clicked_at", new Date(placed).toISOString())
    .order("clicked_at", { ascending: false })
    .limit(5);
  if (error) {
    console.error("[commerce.attribution]", error.message);
    return { model: ATTRIBUTION_MODEL, window_days: windowDays, matched: false };
  }
  return pickLastClick(data, new Date(placed).toISOString(), windowDays);
}
