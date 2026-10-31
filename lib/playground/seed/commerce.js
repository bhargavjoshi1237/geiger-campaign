// Commerce seed: Halcyon runs the storefronts of three clients — Atlas Coffee (Shopify), Kestrel Bikes
// (WooCommerce) and Northwind Outdoor (a custom shop) — plus Orbit Audio, connected yesterday and still
// waiting for its first webhook. Two months of orders, abandoned / recovered carts, coupons with a batch
// of single-use VIP codes, recommendation rules and the tracked events the ingest route records.
//
// Pass the delivery engine's seed so email-attributed orders are the ones its clicks produced:
//   commerceSeed({ trackedEvents: deliveries.tracked_events, deliveries: deliveries.deliveries })
// Without them, attributed orders are generated against the campaign send dates.

import { PROJECT_ID, between, daysAgo, daysFromNow, hoursAgo, minutesAgo, noise, pick, seedIds, weighted } from "./helpers.js";

// Commerce code block 1000-1099; tracked_events n=5000-5999.
const aid = seedIds({
  store: 1000,
  product: 1001,
  order: 1002,
  cart: 1003,
  coupon: 1004,
  coupon_code: 1005,
  recommendation_rule: 1006,
});

const DAY = 86_400_000;
const HOUR = 3_600_000;
const NOW = Date.now();
const iso = (ms) => new Date(Math.min(ms, NOW - 60_000)).toISOString();
const round2 = (n) => Math.round(n * 100) / 100;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const row = (kind, n, created, fields) => ({
  id: aid(kind, n),
  project_id: PROJECT_ID,
  metadata: {},
  created_by: null,
  created_at: daysAgo(created),
  updated_at: daysAgo(Math.max(0, created - 1)),
  deleted_at: null,
  ...fields,
});

// Stores ---------------------------------------------------------------------------

const STORES = [
  { n: 1, key: "atlas", name: "Atlas Coffee Roasters", platform: "shopify", domain: "shop.atlascoffee.example", abandon: 60, prefix: "#", base: 1040, created: 58, last: minutesAgo(6), lastType: "order_placed", hint: "x9Qa" },
  { n: 2, key: "kestrel", name: "Kestrel Bikes", platform: "woocommerce", domain: "shop.kestrelbikes.example", abandon: 120, prefix: "#", base: 5200, created: 52, last: minutesAgo(48), lastType: "product_upsert", hint: "7hTe" },
  { n: 3, key: "northwind", name: "Northwind Outdoor", platform: "custom", domain: "northwind-outdoor.example", abandon: 60, prefix: "NW-", base: 3300, created: 61, last: minutesAgo(19), lastType: "cart_updated", hint: "Lp2c" },
  { n: 4, key: "orbit", name: "Orbit Audio", platform: "shopify", domain: "orbitaudio.example", abandon: 60, prefix: "#", base: 1000, created: 1, last: null, lastType: null, hint: "" },
];
const STORE = Object.fromEntries(STORES.map((s) => [s.key, s]));

function storeRows() {
  return STORES.map((s) =>
    row("store", s.n, s.created, {
      name: s.name,
      platform: s.platform,
      domain: s.domain,
      currency: "USD",
      status: s.last ? "connected" : "pending",
      abandon_after_minutes: s.abandon,
      settings: { syncProducts: true, syncOrders: true, syncCustomers: true },
      secret_hint: s.hint,
      secret_rotated_at: s.hint ? daysAgo(s.created) : null,
      last_event_at: s.last,
      last_event_type: s.lastType,
      last_error: null,
      last_error_at: null,
    }),
  );
}

// Products -------------------------------------------------------------------------

// [key, title, sku, price, compareAt, inventory, categories, status, publishedDaysAgo]
const CATALOGUE = {
  atlas: [
    ["yirgacheffe", "Ethiopia Yirgacheffe 250g", "AT-ETH-250", 18, null, 140, ["Coffee", "Single origin"], "active", 55],
    ["huila", "Colombia Huila 250g", "AT-COL-250", 17, null, 96, ["Coffee", "Single origin"], "active", 55],
    ["espresso", "House Espresso 1kg", "AT-ESP-1K", 42, null, 60, ["Coffee", "Espresso"], "active", 55],
    ["decaf", "Decaf Swiss Water 250g", "AT-DEC-250", 16, null, 0, ["Coffee", "Decaf"], "active", 50],
    ["dripper", "Ceramic Pour-Over Dripper", "AT-DRP-01", 32, null, 45, ["Equipment", "Brewing"], "active", 55],
    ["kettle", "Gooseneck Kettle", "AT-KTL-01", 69, 79, 22, ["Equipment", "Brewing"], "active", 40],
    ["subscription", "Roaster's Choice Subscription", "AT-SUB-M", 54, null, null, ["Coffee", "Subscription"], "active", 55],
    ["mug", "Atlas Enamel Mug", "AT-MUG-01", 14, null, 210, ["Merch"], "active", 9],
    ["nyeri", "Kenya Nyeri 250g", "AT-KEN-250", 19, null, 80, ["Coffee", "Single origin"], "active", 3],
  ],
  kestrel: [
    ["aero", "Kestrel Aero e-bike", "KB-AERO-M", 3290, null, 18, ["Bikes", "E-bikes"], "active", 10],
    ["city", "Kestrel City 2", "KB-CITY-2", 1490, null, 9, ["Bikes"], "active", 50],
    ["helmet", "Commuter Helmet", "KB-HLM-01", 89, null, 64, ["Accessories", "Safety"], "active", 50],
    ["pannier", "Pannier Bag 20L", "KB-PAN-20", 74, null, 31, ["Accessories", "Bags"], "active", 50],
    ["lights", "LED Light Set", "KB-LED-02", 39, null, 120, ["Accessories", "Safety"], "active", 50],
    ["lock", "Folding Frame Lock", "KB-LCK-01", 59, null, 0, ["Accessories", "Security"], "active", 50],
    ["repair", "Puncture Repair Kit", "KB-RPK-01", 15, null, 300, ["Maintenance"], "active", 50],
    ["jersey", "Kestrel Merino Jersey", "KB-JRS-M", 95, 110, 40, ["Apparel"], "draft", 6],
  ],
  northwind: [
    ["baselayer", "Merino Base Layer", "NW-BSL-01", 85, null, 120, ["Apparel", "Base layers"], "active", 60],
    ["runner", "Trail Runner GTX", "NW-TRN-GTX", 165, null, 0, ["Footwear"], "active", 60],
    ["bottle", "Insulated Bottle 1L", "NW-BTL-1L", 38, null, 410, ["Gear", "Hydration"], "active", 60],
    ["down", "Packable Down Jacket", "NW-DWN-01", 229, 260, 35, ["Apparel", "Outerwear"], "active", 20],
    ["weekender", "Canvas Weekender", "NW-WKD-01", 129, null, 22, ["Bags"], "active", 60],
    ["poles", "Carbon Trekking Poles", "NW-PLS-01", 119, null, 18, ["Gear"], "active", 60],
    ["shell", "Storm Rain Shell", "NW-SHL-01", 189, null, 44, ["Apparel", "Outerwear"], "active", 45],
    ["beanie", "Wool Beanie", "NW-BNE-01", 29, null, 150, ["Apparel", "Accessories"], "active", 60],
  ],
};

const PRODUCTS = [];
let productN = 0;
for (const [storeKey, items] of Object.entries(CATALOGUE)) {
  const store = STORE[storeKey];
  for (const [key, title, sku, price, compare, inventory, categories, status, published] of items) {
    productN += 1;
    const handle = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    PRODUCTS.push({
      key,
      storeKey,
      n: productN,
      id: aid("product", productN),
      externalId: String(store.base * 10 + productN),
      title,
      sku,
      price,
      compare,
      inventory,
      categories,
      status,
      published,
      url: `https://${store.domain}/products/${handle}`,
      handle,
    });
  }
}
const PRODUCT = Object.fromEntries(PRODUCTS.map((p) => [p.key, p]));

function productRows() {
  return PRODUCTS.map((p) =>
    row("product", p.n, Math.max(p.published, 1), {
      store_id: aid("store", STORE[p.storeKey].n),
      external_id: p.externalId,
      title: p.title,
      handle: p.handle,
      sku: p.sku,
      price: p.price,
      compare_at_price: p.compare,
      currency: "USD",
      image_url: null,
      url: p.url,
      inventory: p.inventory,
      categories: p.categories,
      status: p.status,
      published_at: p.status === "active" ? daysAgo(p.published) : null,
    }),
  );
}

const lineItem = (p, quantity) => ({
  product_id: p.id,
  external_id: p.externalId,
  title: p.title,
  sku: p.sku,
  quantity,
  price: p.price,
  image_url: null,
  url: p.url,
});

// Orders ---------------------------------------------------------------------------

// What shoppers buy together, per store: [[productKeys], weight older than a week, weight this week].
const BASKETS = {
  atlas: [
    [["yirgacheffe"], 4, 2],
    [["yirgacheffe", "dripper"], 3, 2],
    [["dripper", "kettle"], 2, 1],
    [["espresso"], 3, 2],
    [["huila", "mug"], 1, 4],
    [["subscription"], 2, 2],
    [["huila"], 2, 1],
    [["mug"], 0, 3],
    [["nyeri"], 0, 3],
  ],
  kestrel: [
    [["helmet", "lights"], 2, 5],
    [["aero"], 0, 2],
    [["city", "helmet"], 1, 0],
    [["pannier", "lock"], 2, 0],
    [["repair"], 3, 2],
    [["lights"], 2, 2],
  ],
  northwind: [
    [["baselayer", "beanie"], 4, 2],
    [["bottle"], 4, 3],
    [["down"], 1, 4],
    [["shell", "baselayer"], 2, 1],
    [["runner"], 2, 0],
    [["weekender"], 1, 1],
    [["poles", "bottle"], 2, 1],
  ],
};

// Campaign n=1..8 were sent daysAgo(4 + (8 - n) * 6); which store each one sells for.
const CAMPAIGN_STORE = { 1: "atlas", 2: "kestrel", 3: "northwind", 4: "northwind", 5: "northwind", 6: "atlas", 7: "kestrel", 8: "northwind" };
const campaignSentDaysAgo = (n) => 4 + (8 - n) * 6;
const campaignNumber = (id) => Number(Object.keys(CAMPAIGN_STORE).find((n) => aid("campaign", Number(n)) === id)) || null;

const COUPON_RATE = { WELCOME10: 0.1, VIP: 0.15 };

function priceOrder(items, couponCode, seed) {
  const subtotal = round2(items.reduce((s, i) => s + i.price * i.quantity, 0));
  let discount = 0;
  if (couponCode === "WELCOME10") discount = round2(subtotal * COUPON_RATE.WELCOME10);
  if (couponCode?.startsWith("VIP-")) discount = round2(subtotal * COUPON_RATE.VIP);
  const freeShipping = couponCode === "FREESHIP" || subtotal >= 75;
  const shipping = freeShipping ? 0 : weighted(seed, [[6.95, 3], [9.95, 1]]);
  return { subtotal, discount, shipping, total: round2(subtotal - discount + shipping) };
}

// Line items from a store's catalogue whose total lands on `revenue` (shipping absorbs the rest).
function basketForRevenue(storeKey, revenue, seed) {
  const pool = PRODUCTS.filter((p) => p.storeKey === storeKey && p.status === "active" && p.price <= revenue).sort((a, b) => b.price - a.price);
  if (!pool.length) {
    const cheapest = PRODUCTS.filter((p) => p.storeKey === storeKey).sort((a, b) => a.price - b.price)[0];
    return { items: [lineItem(cheapest, 1)], subtotal: cheapest.price, discount: round2(cheapest.price - revenue), shipping: 0, total: round2(revenue) };
  }
  const items = [];
  let left = revenue;
  let k = 0;
  while (items.length < 4) {
    const fits = pool.filter((p) => p.price <= left && !items.some((i) => i.product_id === p.id));
    if (!fits.length || left < 12) break;
    const p = items.length === 0 ? pick(fits, seed) : fits[0];
    const qty = Math.max(1, Math.min(3, Math.floor(left / p.price / (items.length === 0 ? 1.4 : 1))));
    items.push(lineItem(p, qty));
    left = round2(left - p.price * qty);
    k += 1;
  }
  if (!items.length) items.push(lineItem(pool[pool.length - 1], 1));
  const subtotal = round2(items.reduce((s, i) => s + i.price * i.quantity, 0));
  const shipping = round2(Math.max(0, revenue - subtotal));
  return { items, subtotal, discount: round2(Math.max(0, subtotal - revenue)), shipping, total: round2(revenue), k };
}

function orderStatus(i, daysBack) {
  if (daysBack < 1.5) return weighted(i * 31, [["paid", 4], ["pending", 1]]);
  return weighted(i * 31, [["fulfilled", 22], ["paid", 3], ["refunded", 1], ["partially_refunded", 1], ["cancelled", 1]]);
}

function buildOrders(trackedEvents, deliveries) {
  const orders = [];
  const seq = { atlas: 0, kestrel: 0, northwind: 0 };
  const clickedAt = new Map((deliveries || []).map((d) => [d.id, d.clicked_at]));

  const push = (o) => {
    const n = orders.length + 1;
    seq[o.storeKey] += 1;
    const store = STORE[o.storeKey];
    orders.push({ ...o, n, id: aid("order", n), number: o.number || `${store.prefix}${store.base + seq[o.storeKey]}`, externalId: String(store.base * 100 + seq[o.storeKey]) });
  };

  // Email-attributed orders: from the delivery engine's clicks when given, else against send dates.
  const external = (trackedEvents || []).filter((e) => e.name === "order_completed" && e.campaign_id && e.contact_id);
  if (external.length) {
    external.forEach((e, k) => {
      const storeKey = CAMPAIGN_STORE[campaignNumber(e.campaign_id)] || "northwind";
      const basket = basketForRevenue(storeKey, Number(e.revenue) || 60, k * 7 + 3);
      push({
        storeKey,
        contactN: null,
        contactId: e.contact_id,
        placedAt: Date.parse(e.occurred_at),
        ...basket,
        couponCode: null,
        campaignId: e.campaign_id,
        deliveryId: e.delivery_id || null,
        clickedAt: clickedAt.get(e.delivery_id) || iso(Date.parse(e.occurred_at) - 40 * 60_000),
        number: e.properties?.order_number || null,
        externalEvent: true,
      });
    });
  } else {
    for (let k = 1; k <= 22; k += 1) {
      const campaignN = ((k - 1) % 8) + 1;
      const sent = campaignSentDaysAgo(campaignN);
      const daysBack = Math.max(0.05, sent - noise(k * 41) * 3);
      const storeKey = CAMPAIGN_STORE[campaignN];
      const basketDef = weighted(k * 43, BASKETS[storeKey].map((b) => [b, daysBack < 7 ? b[2] : b[1]]));
      const items = basketDef[0].map((key) => lineItem(PRODUCT[key], PRODUCT[key].price < 40 ? between(k * 47, 1, 2) : 1));
      push({
        storeKey,
        contactN: between(k * 53, 1, 48),
        placedAt: NOW - daysBack * DAY,
        items,
        ...priceOrder(items, null, k * 59),
        couponCode: null,
        campaignId: aid("campaign", campaignN),
        deliveryId: null,
        clickedAt: iso(NOW - (daysBack + noise(k * 61) * 0.5) * DAY),
      });
    }
  }

  // Everything else: organic orders over the last 60 days.
  for (let i = 1; i <= 64; i += 1) {
    const storeKey = weighted(i * 7, [["atlas", 5], ["kestrel", 2], ["northwind", 4]]);
    const daysBack = noise(i * 13) * 58 + 0.04;
    const basketDef = weighted(i * 17, BASKETS[storeKey].map((b) => [b, daysBack < 7 ? b[2] : b[1]]));
    if (basketDef[0].includes("aero") && daysBack > 10) continue;
    const items = basketDef[0].map((key) => lineItem(PRODUCT[key], PRODUCT[key].price < 40 ? between(i * 19, 1, 2) : 1));
    const couponRoll = noise(i * 23);
    const couponCode = couponRoll < 0.12 ? "WELCOME10" : couponRoll < 0.2 ? "FREESHIP" : null;
    push({
      storeKey,
      contactN: between(i * 29, 1, 48),
      placedAt: NOW - daysBack * DAY,
      items,
      ...priceOrder(items, couponCode, i * 37),
      couponCode,
      campaignId: null,
      deliveryId: null,
      clickedAt: null,
    });
  }

  // Single-use VIP codes redeemed in the last three weeks.
  for (let v = 1; v <= 8; v += 1) {
    const storeKey = pick(["atlas", "northwind", "kestrel"], v * 71);
    const daysBack = noise(v * 73) * 20 + 0.2;
    const basketDef = weighted(v * 79, BASKETS[storeKey].map((b) => [b, b[1] + b[2]]));
    if (basketDef[0].includes("aero")) continue;
    const items = basketDef[0].map((key) => lineItem(PRODUCT[key], 1));
    const code = vipCode(v);
    push({ storeKey, contactN: between(v * 83, 1, 48), placedAt: NOW - daysBack * DAY, items, ...priceOrder(items, code, v * 89), couponCode: code, campaignId: null, deliveryId: null, clickedAt: null, vip: v });
  }

  return orders
    .map((o) => {
      const daysBack = (NOW - o.placedAt) / DAY;
      const status = orderStatus(o.n, daysBack);
      return {
        ...o,
        contactId: o.contactId || aid("contact", o.contactN),
        status,
        refunded: status === "refunded" ? o.total : status === "partially_refunded" ? round2(o.total * 0.3) : 0,
      };
    })
    .sort((a, b) => b.placedAt - a.placedAt);
}

function vipCode(n) {
  let body = "";
  for (let i = 0; i < 8; i += 1) body += CODE_ALPHABET[Math.floor(noise(n * 97 + i * 13) * 32) % 32];
  return `VIP-${body}`;
}

// Carts ----------------------------------------------------------------------------

function buildCarts(orders) {
  const carts = [];
  const push = (c) => carts.push({ ...c, n: carts.length + 1, id: aid("cart", carts.length + 1) });
  const token = (n) => Array.from({ length: 16 }, (_, i) => Math.floor(noise(n * 101 + i) * 16).toString(16)).join("");

  // Recovered: a cart went idle, then the same shopper ordered it.
  const recoveredFrom = orders.filter((o) => o.status !== "cancelled" && (NOW - o.placedAt) / DAY < 26).filter((_, k) => k % 6 === 2).slice(0, 7);
  for (const o of recoveredFrom) {
    const store = STORE[o.storeKey];
    const lastActivity = o.placedAt - between(o.n * 7, 3, 20) * HOUR;
    const abandonedAt = lastActivity + store.abandon * 60_000;
    const reminded = noise(o.n * 11) < 0.6;
    push({ order: o, storeKey: o.storeKey, contactId: o.contactId, items: o.items, value: o.subtotal, status: "recovered", lastActivity, abandonedAt, recoveredAt: o.placedAt, reminders: reminded ? 1 : 0, remindedAt: reminded ? abandonedAt + HOUR : null, checkout: `https://${store.domain}/checkout/recover/${token(o.n)}` });
  }

  // Still abandoned, the freshest first.
  for (let k = 1; k <= 13; k += 1) {
    const storeKey = weighted(k * 103, [["atlas", 4], ["kestrel", 3], ["northwind", 4]]);
    const store = STORE[storeKey];
    const basketDef = weighted(k * 107, BASKETS[storeKey].map((b) => [b, b[1] + b[2]]));
    const items = basketDef[0].map((key) => lineItem(PRODUCT[key], PRODUCT[key].price < 40 ? between(k * 109, 1, 2) : 1));
    const value = round2(items.reduce((s, i) => s + i.price * i.quantity, 0));
    const lastActivity = NOW - (noise(k * 113) * 6 * DAY + 2 * HOUR);
    const abandonedAt = lastActivity + store.abandon * 60_000;
    const anonymous = k === 4 || k === 11;
    const reminded = !anonymous && noise(k * 127) < 0.45;
    push({ storeKey, contactId: anonymous ? null : aid("contact", between(k * 131, 1, 48)), items, value, status: "abandoned", lastActivity, abandonedAt, recoveredAt: null, reminders: reminded ? 1 : 0, remindedAt: reminded ? abandonedAt + 2 * HOUR : null, checkout: `https://${store.domain}/checkout/recover/${token(k + 500)}` });
  }

  // In progress right now.
  for (let k = 1; k <= 3; k += 1) {
    const storeKey = ["atlas", "northwind", "kestrel"][k - 1];
    const basketDef = BASKETS[storeKey][k];
    const items = basketDef[0].map((key) => lineItem(PRODUCT[key], 1));
    push({ storeKey, contactId: aid("contact", between(k * 137, 1, 48)), items, value: round2(items.reduce((s, i) => s + i.price, 0)), status: "active", lastActivity: NOW - between(k * 139, 4, 40) * 60_000, abandonedAt: null, recoveredAt: null, reminders: 0, remindedAt: null, checkout: `https://${STORE[storeKey].domain}/checkout/recover/${token(k + 900)}` });
  }
  return carts;
}

// Coupons --------------------------------------------------------------------------

const COUPONS = [
  { n: 1, code: "WELCOME10", kind: "percent", value: 10, min: 0, limit: null, perCustomer: 1, starts: null, expires: null, unique: false, status: "active", store: null, created: 60 },
  { n: 2, code: "FREESHIP", kind: "free_shipping", value: 0, min: 50, limit: null, perCustomer: null, starts: null, expires: daysFromNow(45), unique: false, status: "active", store: null, created: 55 },
  { n: 3, code: "SUMMER20", kind: "percent", value: 20, min: 0, limit: 500, perCustomer: 1, starts: daysAgo(120), expires: daysAgo(20), unique: false, status: "active", store: null, created: 125 },
  { n: 4, code: "AEROLAUNCH", kind: "fixed", value: 150, min: 1000, limit: 100, perCustomer: 1, starts: daysFromNow(3), expires: daysFromNow(17), unique: false, status: "active", store: "kestrel", created: 4 },
  { n: 5, code: "VIP", kind: "percent", value: 15, min: 0, limit: 40, perCustomer: 1, starts: daysAgo(24), expires: daysFromNow(36), unique: true, status: "active", store: null, created: 24 },
  { n: 6, code: "COFFEECLUB", kind: "percent", value: 15, min: 30, limit: null, perCustomer: null, starts: null, expires: null, unique: false, status: "paused", store: "atlas", created: 33 },
];

// Recommendation rules ---------------------------------------------------------------

const RULES = [
  { n: 1, name: "Best sellers this month", strategy: "bestsellers", days: 30, placement: "campaign_email", limit: 4, status: "active", store: null, categories: [], created: 40 },
  { n: 2, name: "Trending this week", strategy: "trending", days: 7, placement: "campaign_email", limit: 3, status: "active", store: null, categories: [], created: 32 },
  { n: 3, name: "Frequently bought together", strategy: "also_bought", days: 90, placement: "post_purchase", limit: 3, status: "active", store: null, categories: [], created: 28 },
  { n: 4, name: "Back where you left off", strategy: "recently_viewed", days: 14, placement: "cart_email", limit: 3, status: "active", store: null, categories: [], created: 21 },
  { n: 5, name: "New arrivals", strategy: "new_arrivals", days: 30, placement: "campaign_email", limit: 4, status: "paused", store: null, categories: [], created: 14 },
  { n: 6, name: "Coffee picks", strategy: "category", days: 30, placement: "browse_email", limit: 4, status: "active", store: "atlas", categories: ["Coffee"], created: 9 },
];

// Seed -----------------------------------------------------------------------------

export function commerceSeed({ trackedEvents = null, deliveries = null } = {}) {
  const orders = buildOrders(trackedEvents, deliveries);
  const carts = buildCarts(orders);
  const cartByOrder = new Map(carts.filter((c) => c.order).map((c) => [c.order.id, c]));
  const events = [];
  const event = (n, fields) =>
    events.push({
      id: aid("tracked_event", n),
      project_id: PROJECT_ID,
      anonymous_id: null,
      source: "commerce",
      delivery_id: null,
      campaign_id: null,
      revenue: null,
      currency: null,
      url: null,
      referrer: null,
      utm: {},
      metadata: {},
      created_by: null,
      deleted_at: null,
      ...fields,
      created_at: fields.occurred_at,
      updated_at: fields.occurred_at,
    });

  const orderRows = orders.map((o, k) => {
    const cart = cartByOrder.get(o.id);
    const attribution = o.campaignId
      ? { model: "last_click", window_days: 5, matched: true, delivery_id: o.deliveryId, campaign_id: o.campaignId, source_type: "campaign", source_id: o.campaignId, clicked_at: o.clickedAt }
      : { model: "last_click", window_days: 5, matched: false };
    const placed = iso(o.placedAt);
    if (!o.externalEvent && ["pending", "paid", "fulfilled", "partially_refunded", "refunded"].includes(o.status)) {
      event(5000 + k, {
        contact_id: o.contactId,
        name: "order_completed",
        campaign_id: o.campaignId,
        revenue: o.total,
        currency: "USD",
        occurred_at: placed,
        properties: {
          store_id: aid("store", STORE[o.storeKey].n),
          order_id: o.id,
          number: o.number,
          items_count: o.items.reduce((s, i) => s + i.quantity, 0),
          product_ids: o.items.map((i) => i.product_id),
          coupon_code: o.couponCode,
          cart_id: cart?.id ?? null,
          recovered: Boolean(cart),
          attribution_model: "last_click",
        },
      });
    }
    if (o.refunded) {
      event(5500 + k, {
        contact_id: o.contactId,
        name: "order_refunded",
        campaign_id: o.campaignId,
        currency: "USD",
        occurred_at: iso(o.placedAt + 3 * DAY),
        properties: { store_id: aid("store", STORE[o.storeKey].n), order_id: o.id, amount: o.refunded, refunded_total: o.refunded },
      });
    }
    return {
      id: o.id,
      project_id: PROJECT_ID,
      store_id: aid("store", STORE[o.storeKey].n),
      contact_id: o.contactId,
      cart_id: cart?.id ?? null,
      external_id: o.externalId,
      number: o.number,
      customer_email: null,
      customer_name: "",
      subtotal: o.subtotal,
      discount: o.discount,
      shipping: o.shipping,
      tax: 0,
      total: o.total,
      refunded_amount: o.refunded,
      currency: "USD",
      items: o.items,
      status: o.status,
      coupon_code: o.couponCode,
      placed_at: placed,
      attributed_campaign_id: o.campaignId,
      attribution,
      metadata: { coupon_codes: o.couponCode ? [o.couponCode] : [], refund_ids: [] },
      created_by: null,
      created_at: placed,
      updated_at: placed,
      deleted_at: null,
    };
  });

  const cartRows = carts.map((c, k) => {
    const store = STORE[c.storeKey];
    const storeId = aid("store", store.n);
    const props = { store_id: storeId, cart_id: c.id, value: c.value, items_count: c.items.reduce((s, i) => s + i.quantity, 0), product_ids: c.items.map((i) => i.product_id), checkout_url: c.checkout };
    if (c.contactId) event(5200 + k, { contact_id: c.contactId, name: "checkout_started", currency: "USD", url: c.checkout, occurred_at: iso(c.lastActivity - 10 * 60_000), properties: props });
    if (c.abandonedAt) event(5250 + k, { contact_id: c.contactId, name: "cart_abandoned", currency: "USD", url: c.checkout, occurred_at: iso(c.abandonedAt), properties: { ...props, items: c.items.map(({ product_id, title, quantity, price, url }) => ({ product_id, title, quantity, price, url })) } });
    if (c.status === "recovered") event(5300 + k, { contact_id: c.contactId, name: "cart_recovered", revenue: c.order.total, currency: "USD", occurred_at: iso(c.recoveredAt), properties: { store_id: storeId, cart_id: c.id, order_id: c.order.id } });
    return {
      id: c.id,
      project_id: PROJECT_ID,
      store_id: storeId,
      contact_id: c.contactId,
      external_id: String(store.base * 1000 + c.n),
      customer_email: null,
      customer_name: "",
      items: c.items,
      value: c.value,
      currency: "USD",
      status: c.status,
      checkout_url: c.checkout,
      last_activity_at: iso(c.lastActivity),
      abandoned_at: c.abandonedAt ? iso(c.abandonedAt) : null,
      recovered_at: c.recoveredAt ? iso(c.recoveredAt) : null,
      recovered_value: c.status === "recovered" ? c.order.total : null,
      order_id: c.order?.id ?? null,
      reminders_sent: c.reminders,
      last_reminded_at: c.remindedAt ? iso(c.remindedAt) : null,
      metadata: { checkout_started_at: iso(c.lastActivity - 10 * 60_000) },
      created_by: null,
      created_at: iso(c.lastActivity - 30 * 60_000),
      updated_at: iso(c.recoveredAt || c.abandonedAt || c.lastActivity),
      deleted_at: null,
    };
  });

  // Browsing: known shoppers viewing products over the last two weeks (contacts 1-8 browse the most).
  for (let v = 1; v <= 140; v += 1) {
    const contactN = v <= 60 ? ((v - 1) % 8) + 1 : between(v * 149, 1, 48);
    const p = weighted(v * 151, PRODUCTS.filter((x) => x.status === "active").map((x) => [x, x.key === "aero" || x.key === "down" || x.key === "nyeri" ? 4 : 1]));
    const at = NOW - noise(v * 157) * 14 * DAY - 5 * 60_000;
    event(5400 + v, {
      contact_id: aid("contact", contactN),
      name: "product_viewed",
      url: p.url,
      occurred_at: iso(at),
      properties: { store_id: aid("store", STORE[p.storeKey].n), product_id: p.id, external_id: p.externalId, title: p.title, price: p.price, event_id: null },
    });
  }

  const usedCount = (code) => orders.filter((o) => o.couponCode === code || (code === "VIP" && o.couponCode?.startsWith("VIP-"))).length;
  const vipOrders = orders.filter((o) => o.vip);

  const couponRows = COUPONS.map((c) =>
    row("coupon", c.n, c.created, {
      store_id: c.store ? aid("store", STORE[c.store].n) : null,
      code: c.code,
      kind: c.kind,
      value: c.value,
      min_subtotal: c.min,
      usage_limit: c.limit,
      per_customer_limit: c.perCustomer,
      used_count: c.code === "SUMMER20" ? 212 : usedCount(c.code),
      starts_at: c.starts,
      expires_at: c.expires,
      unique_codes: c.unique,
      status: c.status,
    }),
  );

  const batch = daysAgo(24);
  const codeRows = Array.from({ length: 40 }, (_, k) => {
    const n = k + 1;
    const redeemed = vipOrders.find((o) => o.vip === n);
    return row("coupon_code", n, 24, {
      coupon_id: aid("coupon", 5),
      code: vipCode(n),
      batch,
      contact_id: redeemed?.contactId ?? null,
      order_id: redeemed?.id ?? null,
      redeemed_at: redeemed ? iso(redeemed.placedAt) : null,
    });
  });

  const ruleRows = RULES.map((r) =>
    row("recommendation_rule", r.n, r.created, {
      store_id: r.store ? aid("store", STORE[r.store].n) : null,
      name: r.name,
      strategy: r.strategy,
      filters: { days: r.days, categories: r.categories, minPrice: null, maxPrice: null, inStockOnly: true, excludePurchased: true, fallback: true },
      item_limit: r.limit,
      placement: r.placement,
      status: r.status,
    }),
  );

  return {
    stores: storeRows(),
    products: productRows(),
    orders: orderRows,
    carts: cartRows,
    coupons: couponRows,
    coupon_codes: codeRows,
    recommendation_rules: ruleRows,
    tracked_events: events,
  };
}

// Recent activity on the connected stores, for quick sanity checks in tests.
export const COMMERCE_SEED_INFO = { stores: STORES.length, products: PRODUCTS.length, lastEventAt: hoursAgo(0) };
