// Product recommendations (isomorphic, pure): a rule + raw DB rows in, ranked products out. The same
// functions run in the preview route, at email render time on the server and over the playground's
// in-memory tables. `rule` is the camelCase view model ({ strategy, filters, limit, storeId });
// products, orders and tracked events are raw snake_case rows, exactly as Supabase returns them.

const DAY = 86_400_000;
const PURCHASE_STATUSES = new Set(["pending", "paid", "fulfilled", "partially_refunded"]);

export const STRATEGY_INFO = {
  bestsellers: { label: "Best sellers", needs: null, defaultDays: 30, description: "Most units sold in the window." },
  trending: { label: "Trending", needs: null, defaultDays: 7, description: "Biggest rise in units sold against the window before it." },
  also_bought: { label: "Also bought", needs: "product", defaultDays: 90, description: "Bought in the same orders as the product a shopper viewed, carted or bought." },
  recently_viewed: { label: "Recently viewed", needs: "contact", defaultDays: 14, description: "The products this shopper looked at most recently." },
  new_arrivals: { label: "New arrivals", needs: null, defaultDays: 30, description: "Newest active products in the catalogue." },
  category: { label: "Category", needs: "category", defaultDays: 30, description: "Best sellers within the chosen categories." },
};

export const STRATEGY_KEYS = Object.keys(STRATEGY_INFO);

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const time = (v) => {
  const t = Date.parse(v);
  return Number.isNaN(t) ? 0 : t;
};
const lower = (s) => String(s || "").trim().toLowerCase();

function ago(ms) {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

function productIndex(products) {
  const byId = new Map();
  const byExternal = new Map();
  for (const p of products) {
    if (!p || p.deleted_at) continue;
    byId.set(p.id, p);
    if (p.external_id) byExternal.set(`${p.store_id}:${p.external_id}`, p);
  }
  const resolve = (productId, externalId, storeId) => {
    if (productId && byId.has(productId)) return byId.get(productId);
    if (externalId) return byExternal.get(`${storeId}:${externalId}`) || null;
    return null;
  };
  return { byId, resolve };
}

// Distinct catalogue products in one order.
function orderProductIds(order, index) {
  const ids = new Set();
  for (const item of Array.isArray(order.items) ? order.items : []) {
    const p = index.resolve(item?.product_id, item?.external_id, order.store_id);
    if (p) ids.add(p.id);
  }
  return [...ids];
}

function unitsByProduct(orders, index, from, to) {
  const stats = new Map();
  for (const order of orders) {
    const t = time(order.placed_at || order.created_at);
    if (t < from || t >= to) continue;
    for (const item of Array.isArray(order.items) ? order.items : []) {
      const p = index.resolve(item?.product_id, item?.external_id, order.store_id);
      if (!p) continue;
      const qty = Math.max(0, Number(item.quantity ?? 1)) || 0;
      const entry = stats.get(p.id) || { units: 0, revenue: 0, orders: 0 };
      entry.units += qty;
      entry.revenue += qty * Number(item.price ?? p.price ?? 0);
      entry.orders += 1;
      stats.set(p.id, entry);
    }
  }
  return stats;
}

function makeEligible(rule, exclude) {
  const f = rule?.filters || {};
  const cats = (Array.isArray(f.categories) ? f.categories : []).map(lower).filter(Boolean);
  const min = f.minPrice === "" || f.minPrice == null ? null : Number(f.minPrice);
  const max = f.maxPrice === "" || f.maxPrice == null ? null : Number(f.maxPrice);
  return (p) =>
    Boolean(p) &&
    !p.deleted_at &&
    (p.status ?? "active") === "active" &&
    (!rule?.storeId || p.store_id === rule.storeId) &&
    (min == null || Number(p.price) >= min) &&
    (max == null || Number(p.price) <= max) &&
    (!f.inStockOnly || p.inventory == null || Number(p.inventory) > 0) &&
    (!cats.length || (p.categories || []).some((c) => cats.includes(lower(c)))) &&
    !exclude.has(p.id);
}

function toItem({ product: p, score, reason, fallback = false }) {
  return {
    productId: p.id,
    title: p.title || "Untitled product",
    price: Number(p.price ?? 0),
    compareAtPrice: p.compare_at_price == null ? null : Number(p.compare_at_price),
    currency: p.currency || "USD",
    imageUrl: p.image_url || "",
    url: p.url || "",
    storeId: p.store_id ?? null,
    categories: Array.isArray(p.categories) ? p.categories : [],
    inventory: p.inventory == null ? null : Number(p.inventory),
    score: Math.round(Number(score || 0) * 1000) / 1000,
    reason,
    fallback,
  };
}

function bestsellers(ctx, eligible) {
  const stats = unitsByProduct(ctx.orders, ctx.index, ctx.now - ctx.days * DAY, ctx.now + 1);
  return [...stats.entries()]
    .map(([id, s]) => ({ product: ctx.index.byId.get(id), score: s.units, revenue: s.revenue, reason: `${s.units} sold in the last ${ctx.days} days` }))
    .filter((r) => eligible(r.product))
    .sort((a, b) => b.score - a.score || b.revenue - a.revenue || String(a.product.title).localeCompare(String(b.product.title)));
}

function trending(ctx, eligible) {
  const span = ctx.days * DAY;
  const recent = unitsByProduct(ctx.orders, ctx.index, ctx.now - span, ctx.now + 1);
  const prior = unitsByProduct(ctx.orders, ctx.index, ctx.now - 2 * span, ctx.now - span);
  const rows = [];
  for (const [id, r] of recent) {
    const before = prior.get(id)?.units || 0;
    // Two units is the least signal worth calling a trend.
    if (r.units < 2 || r.units <= before) continue;
    const growth = (r.units - before) / Math.max(before, 1);
    const reason = before === 0
      ? `${r.units} sold, none in the ${ctx.days} days before`
      : `Up ${Math.round(((r.units - before) / before) * 100)}% on the previous ${ctx.days} days`;
    rows.push({ product: ctx.index.byId.get(id), score: growth, units: r.units, reason });
  }
  return rows.filter((r) => eligible(r.product)).sort((a, b) => b.score - a.score || b.units - a.units);
}

function alsoBought(ctx, eligible, seeds) {
  const from = ctx.now - ctx.days * DAY;
  const co = new Map();
  let seedOrders = 0;
  for (const order of ctx.orders) {
    if (time(order.placed_at || order.created_at) < from) continue;
    const ids = orderProductIds(order, ctx.index);
    if (!ids.some((id) => seeds.has(id))) continue;
    seedOrders += 1;
    for (const id of ids) if (!seeds.has(id)) co.set(id, (co.get(id) || 0) + 1);
  }
  return [...co.entries()]
    .map(([id, count]) => ({
      product: ctx.index.byId.get(id),
      score: count / seedOrders,
      count,
      reason: `In ${count} of ${seedOrders} orders with this product`,
    }))
    .filter((r) => eligible(r.product))
    .sort((a, b) => b.score - a.score || b.count - a.count);
}

function recentlyViewed(ctx, eligible, contactId) {
  const from = ctx.now - ctx.days * DAY;
  const views = ctx.events
    .filter((e) => e.name === "product_viewed" && e.contact_id === contactId && time(e.occurred_at) >= from)
    .sort((a, b) => time(b.occurred_at) - time(a.occurred_at));
  const seen = new Set();
  const rows = [];
  for (const e of views) {
    const props = e.properties || {};
    const p = ctx.index.resolve(props.product_id, props.external_id, props.store_id);
    if (!p || seen.has(p.id)) continue;
    seen.add(p.id);
    rows.push({ product: p, score: 1 / (rows.length + 1), reason: `Viewed ${ago(ctx.now - time(e.occurred_at))}` });
  }
  return rows.filter((r) => eligible(r.product));
}

function newArrivals(ctx, eligible) {
  const from = ctx.now - ctx.days * DAY;
  return ctx.products
    .filter(eligible)
    .map((p) => ({ product: p, t: time(p.published_at || p.created_at) }))
    .filter((r) => r.t >= from)
    .sort((a, b) => b.t - a.t)
    .map((r) => ({ product: r.product, score: r.t / DAY, reason: `Added ${ago(ctx.now - r.t)}` }));
}

function category(ctx, eligible) {
  const stats = unitsByProduct(ctx.orders, ctx.index, ctx.now - ctx.days * DAY, ctx.now + 1);
  return ctx.products
    .filter(eligible)
    .map((p) => {
      const units = stats.get(p.id)?.units || 0;
      return {
        product: p,
        score: units,
        t: time(p.published_at || p.created_at),
        reason: units ? `${units} sold in the last ${ctx.days} days` : `In ${(p.categories || [])[0] || "this category"}, no recent sales`,
      };
    })
    .sort((a, b) => b.score - a.score || b.t - a.t);
}

// Seeds for "also bought" when no product was given: the shopper's latest order, else their latest view.
function seedsForContact(ctx, contactId) {
  const latest = ctx.orders
    .filter((o) => o.contact_id === contactId)
    .sort((a, b) => time(b.placed_at) - time(a.placed_at))[0];
  if (latest) return orderProductIds(latest, ctx.index);
  const view = ctx.events
    .filter((e) => e.name === "product_viewed" && e.contact_id === contactId)
    .sort((a, b) => time(b.occurred_at) - time(a.occurred_at))[0];
  const p = view ? ctx.index.resolve(view.properties?.product_id, view.properties?.external_id, view.properties?.store_id) : null;
  return p ? [p.id] : [];
}

/**
 * recommendProducts(rule, { products, orders, events }, { contactId, productIds, now })
 *   -> { items: [{ productId, title, price, …, reason, fallback }], needs: "product"|"contact"|"category"|null, basis }
 * `needs` says what the strategy is missing; the slots are then filled with best sellers (marked fallback)
 * unless rule.filters.fallback === false.
 */
export function recommendProducts(rule, data = {}, context = {}) {
  const strategy = STRATEGY_INFO[rule?.strategy] ? rule.strategy : "bestsellers";
  const filters = rule?.filters || {};
  const days = clamp(Math.trunc(Number(filters.days) || STRATEGY_INFO[strategy].defaultDays), 1, 365);
  const limit = clamp(Math.trunc(Number(rule?.limit) || 4), 1, 12);
  const now = context.now ? time(context.now) : Date.now();
  const products = (data.products || []).filter((p) => p && !p.deleted_at);
  const orders = (data.orders || []).filter((o) => o && !o.deleted_at && PURCHASE_STATUSES.has(o.status ?? "paid"));
  const events = data.events || [];
  const index = productIndex(products);
  const ctx = { now, days, products, orders, events, index };
  const contactId = context.contactId || null;

  const exclude = new Set();
  if (filters.excludePurchased && contactId) {
    for (const order of orders) if (order.contact_id === contactId) for (const id of orderProductIds(order, index)) exclude.add(id);
  }
  let seeds = new Set((context.productIds || []).filter((id) => index.byId.has(id)));
  if (strategy === "also_bought" && !seeds.size && contactId) seeds = new Set(seedsForContact(ctx, contactId));
  for (const id of seeds) exclude.add(id);

  const eligible = makeEligible(rule, exclude);
  let needs = null;
  let ranked = [];
  const hasCategories = Array.isArray(filters.categories) && filters.categories.some((c) => String(c).trim());

  if (strategy === "bestsellers") ranked = bestsellers(ctx, eligible);
  else if (strategy === "trending") ranked = trending(ctx, eligible);
  else if (strategy === "also_bought") {
    if (seeds.size) ranked = alsoBought(ctx, eligible, seeds);
    else needs = "product";
  } else if (strategy === "recently_viewed") {
    if (contactId) ranked = recentlyViewed(ctx, eligible, contactId);
    else needs = "contact";
  } else if (strategy === "new_arrivals") ranked = newArrivals(ctx, eligible);
  else if (strategy === "category") {
    if (hasCategories) ranked = category(ctx, eligible);
    else needs = "category";
  }

  const picked = ranked.slice(0, limit);
  if (picked.length < limit && filters.fallback !== false && strategy !== "bestsellers") {
    const chosen = new Set(picked.map((r) => r.product.id));
    const pad = bestsellers(ctx, (p) => eligible(p) && !chosen.has(p.id));
    for (const r of pad) {
      if (picked.length >= limit) break;
      picked.push({ ...r, reason: `Fallback: ${r.reason}`, fallback: true });
    }
  }

  return {
    items: picked.map(toItem),
    needs,
    basis: {
      strategy,
      days,
      limit,
      orders: orders.filter((o) => time(o.placed_at || o.created_at) >= now - (strategy === "trending" ? 2 : 1) * days * DAY).length,
      products: products.length,
    },
  };
}
