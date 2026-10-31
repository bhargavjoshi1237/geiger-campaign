import { STRATEGY_INFO, recommendProducts } from "./recommendations";

// Server-side recommendations: load just the rows a rule needs (paged past PostgREST's row cap), then
// rank them with the pure lib/commerce/recommendations.js. Used by the preview route and by any server
// code rendering a product block (db may be user-scoped or the service role).

const DAY = 86_400_000;
const PAGE = 1000;
const MAX_ORDERS = 10_000;

async function fetchAll(build, max) {
  const rows = [];
  for (let from = 0; from < max; from += PAGE) {
    const { data, error } = await build().range(from, Math.min(from + PAGE, max) - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

export async function loadRecommendationData(db, projectId, rule, { contactId = null, now = new Date() } = {}) {
  const strategy = STRATEGY_INFO[rule?.strategy] ? rule.strategy : "bestsellers";
  const days = Math.min(365, Math.max(1, Math.trunc(Number(rule?.filters?.days) || STRATEGY_INFO[strategy].defaultDays)));
  const since = new Date(now.getTime() - (strategy === "trending" ? 2 : 1) * days * DAY).toISOString();

  const products = await fetchAll(() => {
    let q = db
      .from("products")
      .select("id, store_id, external_id, title, price, compare_at_price, currency, image_url, url, inventory, categories, status, published_at, created_at")
      .eq("project_id", projectId)
      .eq("status", "active")
      .is("deleted_at", null)
      .order("id");
    if (rule?.storeId) q = q.eq("store_id", rule.storeId);
    return q;
  }, 20_000);

  const orders = await fetchAll(
    () =>
      db
        .from("orders")
        .select("id, store_id, contact_id, items, status, placed_at, created_at")
        .eq("project_id", projectId)
        .is("deleted_at", null)
        .gte("placed_at", since)
        .order("placed_at", { ascending: false }),
    MAX_ORDERS,
  );

  let events = [];
  if (contactId) {
    // The shopper's own history (any age) drives exclusions and also-bought seeds.
    const { data: own } = await db
      .from("orders")
      .select("id, store_id, contact_id, items, status, placed_at, created_at")
      .eq("project_id", projectId)
      .eq("contact_id", contactId)
      .is("deleted_at", null)
      .order("placed_at", { ascending: false })
      .limit(200);
    const known = new Set(orders.map((o) => o.id));
    for (const o of own || []) if (!known.has(o.id)) orders.push(o);

    const { data: views } = await db
      .from("tracked_events")
      .select("id, name, contact_id, properties, occurred_at")
      .eq("project_id", projectId)
      .eq("contact_id", contactId)
      .eq("name", "product_viewed")
      .order("occurred_at", { ascending: false })
      .limit(200);
    events = views || [];
  }
  return { products, orders, events };
}

// rule: { strategy, filters, limit, storeId }; context: { contactId, productIds, now }.
export async function recommendForRule(db, projectId, rule, context = {}) {
  const now = context.now ? new Date(context.now) : new Date();
  const data = await loadRecommendationData(db, projectId, rule, { contactId: context.contactId, now });
  return recommendProducts(rule, data, { ...context, now: now.toISOString() });
}
