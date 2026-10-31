// Store payload -> normalized commerce events (isomorphic, pure). Shopify and WooCommerce webhooks and
// Geiger's custom event format all map onto the same small vocabulary the ingest processor handles:
//   { id, type, occurredAt, data }  with type one of
//   product_upsert | product_deleted | product_viewed | cart_updated | checkout_started |
//   order_placed | order_updated | order_refunded | ignored

const MAX_BATCH = 100;

const str = (v) => (v == null ? "" : String(v).trim());
const idOf = (v) => (v == null || v === "" ? null : String(v));
const money = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};
const iso = (v, assumeUtc = false) => {
  if (!v) return null;
  const s = String(v);
  const t = Date.parse(assumeUtc && !/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? `${s}Z` : s);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
};
const truthy = (v) => (v === true || v === "true" || v === 1 ? true : v === false || v === "false" || v === 0 ? false : null);

function customer({ email, firstName, lastName, phone, acceptsMarketing }) {
  return {
    email: str(email).toLowerCase() || null,
    firstName: str(firstName),
    lastName: str(lastName),
    phone: str(phone) || null,
    acceptsMarketing: acceptsMarketing ?? null,
  };
}

const cartValue = (items) => money(items.reduce((sum, i) => sum + i.price * i.quantity, 0));

// Shopify ---------------------------------------------------------------------

function shopifyCustomer(p) {
  const c = p.customer || {};
  const state = c.email_marketing_consent?.state;
  const consent = state === "subscribed" ? true : state ? false : truthy(p.buyer_accepts_marketing ?? c.accepts_marketing);
  return customer({
    email: c.email || p.email || p.contact_email,
    firstName: c.first_name || p.billing_address?.first_name,
    lastName: c.last_name || p.billing_address?.last_name,
    phone: c.phone || p.phone,
    acceptsMarketing: consent,
  });
}

function shopifyItems(lines) {
  return (Array.isArray(lines) ? lines : []).map((l) => ({
    externalId: idOf(l.product_id),
    title: str(l.title || l.name) || "Item",
    sku: str(l.sku),
    quantity: Math.max(1, Number(l.quantity) || 1),
    price: money(l.price),
    imageUrl: str(l.image_url || l.image?.src) || null,
    url: null,
  }));
}

function shopifyOrderStatus(o) {
  if (o.cancelled_at) return "cancelled";
  const fs = o.financial_status;
  if (fs === "voided") return "cancelled";
  if (fs === "refunded") return "refunded";
  if (fs === "partially_refunded") return "partially_refunded";
  if (o.fulfillment_status === "fulfilled") return "fulfilled";
  if (fs === "paid" || fs === "partially_paid") return "paid";
  return "pending";
}

function shopifyRefundTotal(refund) {
  const tx = (refund?.transactions || []).filter((t) => t.kind === "refund" && (t.status ?? "success") === "success");
  if (tx.length) return money(tx.reduce((sum, t) => sum + Number(t.amount || 0), 0));
  return money((refund?.refund_line_items || []).reduce((sum, l) => sum + Number(l.subtotal || 0), 0));
}

function shopifyProduct(p, store) {
  const variants = Array.isArray(p.variants) ? p.variants : [];
  const cheapest = [...variants].sort((a, b) => Number(a.price) - Number(b.price))[0] || {};
  const tracked = variants.some((v) => v.inventory_management);
  const tags = typeof p.tags === "string" ? p.tags.split(",") : Array.isArray(p.tags) ? p.tags : [];
  return {
    externalId: idOf(p.id),
    title: str(p.title) || "Untitled product",
    handle: str(p.handle),
    sku: str(cheapest.sku),
    price: money(cheapest.price),
    compareAtPrice: cheapest.compare_at_price ? money(cheapest.compare_at_price) : null,
    currency: store.currency,
    imageUrl: str(p.image?.src || p.images?.[0]?.src) || null,
    url: store.domain && p.handle ? `https://${store.domain}/products/${p.handle}` : null,
    inventory: tracked ? variants.reduce((sum, v) => sum + Math.max(0, Number(v.inventory_quantity) || 0), 0) : null,
    categories: [p.product_type, ...tags].map(str).filter(Boolean),
    status: ["active", "draft", "archived"].includes(p.status) ? p.status : "active",
    publishedAt: iso(p.published_at),
  };
}

export function fromShopify(topic, payload, store, webhookId = null) {
  const p = payload || {};
  const at = iso(p.updated_at || p.created_at) || new Date().toISOString();
  const base = { id: webhookId, occurredAt: at };
  switch (topic) {
    case "products/create":
    case "products/update":
      return [{ ...base, type: "product_upsert", data: shopifyProduct(p, store) }];
    case "products/delete":
      return [{ ...base, type: "product_deleted", data: { externalId: idOf(p.id) } }];
    case "checkouts/create":
    case "checkouts/update": {
      const items = shopifyItems(p.line_items);
      return [{
        ...base,
        type: topic === "checkouts/create" ? "checkout_started" : "cart_updated",
        data: {
          externalId: idOf(p.id),
          customer: shopifyCustomer(p),
          items,
          value: p.total_price != null ? money(p.total_price) : cartValue(items),
          currency: p.currency || p.presentment_currency || store.currency,
          checkoutUrl: str(p.abandoned_checkout_url) || null,
          completed: Boolean(p.completed_at),
          isCheckout: true,
        },
      }];
    }
    case "orders/create":
    case "orders/updated":
    case "orders/paid":
    case "orders/fulfilled":
    case "orders/cancelled": {
      const refunded = money((p.refunds || []).reduce((sum, r) => sum + shopifyRefundTotal(r), 0));
      return [{
        ...base,
        occurredAt: iso(p.processed_at || p.created_at) || at,
        type: topic === "orders/create" ? "order_placed" : "order_updated",
        data: {
          externalId: idOf(p.id),
          number: str(p.name) || (p.order_number ? `#${p.order_number}` : ""),
          customer: shopifyCustomer(p),
          items: shopifyItems(p.line_items),
          subtotal: money(p.subtotal_price),
          discount: money(p.total_discounts),
          shipping: money(p.total_shipping_price_set?.shop_money?.amount),
          tax: money(p.total_tax),
          total: money(p.total_price),
          currency: p.currency || store.currency,
          couponCodes: (p.discount_codes || []).map((d) => str(d.code)).filter(Boolean),
          placedAt: iso(p.processed_at || p.created_at) || at,
          status: shopifyOrderStatus(p),
          cartExternalId: idOf(p.checkout_id),
          refundedAmount: refunded,
          refundIds: (p.refunds || []).map((r) => idOf(r.id)).filter(Boolean),
        },
      }];
    }
    case "refunds/create":
      return [{
        ...base,
        occurredAt: iso(p.created_at) || at,
        type: "order_refunded",
        data: { orderExternalId: idOf(p.order_id), refundId: idOf(p.id), amount: shopifyRefundTotal(p), refundedAt: iso(p.created_at) || at },
      }];
    default:
      return [{ ...base, type: "ignored", data: { topic } }];
  }
}

// WooCommerce -------------------------------------------------------------------

const WOO_STATUS = {
  pending: "pending",
  "on-hold": "pending",
  processing: "paid",
  completed: "fulfilled",
  cancelled: "cancelled",
  failed: "cancelled",
  refunded: "refunded",
};

function wooProduct(p, store) {
  const price = money(p.price);
  const regular = money(p.regular_price);
  return {
    externalId: idOf(p.id),
    title: str(p.name) || "Untitled product",
    handle: str(p.slug),
    sku: str(p.sku),
    price,
    compareAtPrice: regular > price ? regular : null,
    currency: store.currency,
    imageUrl: str(p.images?.[0]?.src) || null,
    url: str(p.permalink) || null,
    inventory: p.manage_stock ? Math.max(0, Number(p.stock_quantity) || 0) : p.stock_status === "outofstock" ? 0 : null,
    categories: (p.categories || []).map((c) => str(c.name)).filter(Boolean),
    status: p.status === "publish" ? "active" : p.status === "trash" ? "archived" : "draft",
    publishedAt: iso(p.date_created_gmt, true),
  };
}

export function fromWooCommerce(topic, payload, store, deliveryId = null) {
  const p = payload || {};
  const at = iso(p.date_modified_gmt || p.date_created_gmt, true) || new Date().toISOString();
  const base = { id: deliveryId, occurredAt: at };
  switch (topic) {
    case "product.created":
    case "product.updated":
    case "product.restored":
      return [{ ...base, type: "product_upsert", data: wooProduct(p, store) }];
    case "product.deleted":
      return [{ ...base, type: "product_deleted", data: { externalId: idOf(p.id) } }];
    case "order.created":
    case "order.updated":
    case "order.restored": {
      const items = (p.line_items || []).map((l) => ({
        externalId: idOf(l.product_id),
        title: str(l.name) || "Item",
        sku: str(l.sku),
        quantity: Math.max(1, Number(l.quantity) || 1),
        price: money(l.price ?? Number(l.total) / Math.max(1, Number(l.quantity) || 1)),
        imageUrl: str(l.image?.src) || null,
        url: null,
      }));
      const total = money(p.total);
      const refunded = money((p.refunds || []).reduce((sum, r) => sum + Math.abs(Number(r.total) || 0), 0));
      let status = WOO_STATUS[p.status] || "pending";
      if (refunded > 0 && refunded < total && status !== "cancelled") status = "partially_refunded";
      const b = p.billing || {};
      return [{
        ...base,
        occurredAt: iso(p.date_created_gmt, true) || at,
        type: topic === "order.created" ? "order_placed" : "order_updated",
        data: {
          externalId: idOf(p.id),
          number: `#${p.number || p.id}`,
          customer: customer({ email: b.email, firstName: b.first_name, lastName: b.last_name, phone: b.phone, acceptsMarketing: null }),
          items,
          subtotal: money(items.reduce((sum, i) => sum + i.price * i.quantity, 0)),
          discount: money(p.discount_total),
          shipping: money(p.shipping_total),
          tax: money(p.total_tax),
          total,
          currency: p.currency || store.currency,
          couponCodes: (p.coupon_lines || []).map((c) => str(c.code).toUpperCase()).filter(Boolean),
          placedAt: iso(p.date_created_gmt, true) || at,
          status,
          cartExternalId: null,
          refundedAmount: refunded,
          refundIds: (p.refunds || []).map((r) => idOf(r.id)).filter(Boolean),
        },
      }];
    }
    default:
      return [{ ...base, type: "ignored", data: { topic } }];
  }
}

// Geiger custom format ------------------------------------------------------------

function customCustomer(d) {
  const c = d.customer || {};
  return customer({
    email: c.email || d.email,
    firstName: c.first_name || c.firstName,
    lastName: c.last_name || c.lastName,
    phone: c.phone || d.phone,
    acceptsMarketing: truthy(c.accepts_marketing ?? c.acceptsMarketing ?? d.accepts_marketing),
  });
}

function customItems(items) {
  return (Array.isArray(items) ? items : []).map((i) => ({
    externalId: idOf(i.product_id ?? i.productId ?? i.id),
    title: str(i.title || i.name) || "Item",
    sku: str(i.sku),
    quantity: Math.max(1, Number(i.quantity) || 1),
    price: money(i.price),
    imageUrl: str(i.image_url || i.imageUrl) || null,
    url: str(i.url) || null,
  }));
}

const CUSTOM_STATUSES = new Set(["pending", "paid", "fulfilled", "partially_refunded", "refunded", "cancelled"]);

function fromCustomEvent(event, store) {
  const type = str(event?.type).toLowerCase().replace(/\./g, "_");
  const d = event?.data && typeof event.data === "object" ? event.data : {};
  const occurredAt = iso(event?.occurred_at || event?.occurredAt) || new Date().toISOString();
  const base = { id: idOf(event?.id), occurredAt };
  switch (type) {
    case "product_upsert":
      return {
        ...base,
        type,
        data: {
          externalId: idOf(d.id ?? d.external_id),
          title: str(d.title) || "Untitled product",
          handle: str(d.handle),
          sku: str(d.sku),
          price: money(d.price),
          compareAtPrice: d.compare_at_price == null ? null : money(d.compare_at_price),
          currency: str(d.currency).toUpperCase() || store.currency,
          imageUrl: str(d.image_url) || null,
          url: str(d.url) || null,
          inventory: d.inventory == null ? null : Math.max(0, Math.trunc(Number(d.inventory) || 0)),
          categories: (Array.isArray(d.categories) ? d.categories : []).map(str).filter(Boolean),
          status: ["active", "draft", "archived"].includes(d.status) ? d.status : "active",
          publishedAt: iso(d.published_at) || null,
        },
      };
    case "product_deleted":
      return { ...base, type, data: { externalId: idOf(d.id ?? d.external_id) } };
    case "product_viewed":
      return {
        ...base,
        type,
        data: {
          customer: customCustomer(d),
          anonymousId: str(d.anonymous_id) || null,
          productExternalId: idOf(d.product_id ?? d.product?.id),
          url: str(d.url) || null,
        },
      };
    case "cart_updated":
    case "checkout_started": {
      const items = customItems(d.items);
      return {
        ...base,
        type,
        data: {
          externalId: idOf(d.id ?? d.cart_id),
          customer: customCustomer(d),
          items,
          value: d.value == null ? cartValue(items) : money(d.value),
          currency: str(d.currency).toUpperCase() || store.currency,
          checkoutUrl: str(d.checkout_url) || null,
          completed: d.status === "completed",
          isCheckout: type === "checkout_started",
        },
      };
    }
    case "order_placed":
    case "order_updated": {
      const items = customItems(d.items);
      const subtotal = d.subtotal == null ? cartValue(items) : money(d.subtotal);
      const codes = [d.coupon_code, ...(Array.isArray(d.coupon_codes) ? d.coupon_codes : [])].map((c) => str(c).toUpperCase()).filter(Boolean);
      return {
        ...base,
        type,
        data: {
          externalId: idOf(d.id ?? d.order_id),
          number: str(d.number) || (d.id ? `#${d.id}` : ""),
          customer: customCustomer(d),
          items,
          subtotal,
          discount: money(d.discount),
          shipping: money(d.shipping),
          tax: money(d.tax),
          total: d.total == null ? subtotal : money(d.total),
          currency: str(d.currency).toUpperCase() || store.currency,
          couponCodes: [...new Set(codes)],
          placedAt: iso(d.placed_at) || occurredAt,
          status: CUSTOM_STATUSES.has(d.status) ? d.status : "paid",
          cartExternalId: idOf(d.cart_id),
          refundedAmount: money(d.refunded_amount),
          refundIds: [],
        },
      };
    }
    case "order_refunded":
      return {
        ...base,
        type,
        data: { orderExternalId: idOf(d.order_id ?? d.id), refundId: idOf(d.refund_id), amount: money(d.amount), refundedAt: iso(d.refunded_at) || occurredAt },
      };
    default:
      return { ...base, type: "ignored", data: { type: event?.type ?? null } };
  }
}

export function fromCustom(body, store) {
  const list = Array.isArray(body?.events) ? body.events : body ? [body] : [];
  return list.slice(0, MAX_BATCH).map((event) => fromCustomEvent(event, store));
}

export const MAX_EVENTS_PER_REQUEST = MAX_BATCH;
