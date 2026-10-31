import { adminClient } from "@/lib/supabase/admin";
import { assertUuid } from "@/lib/server/auth";
import { ApiError, badRequest, json, notConfigured, notFound, unauthorized } from "@/lib/server/http";
import { recordEvent } from "@/lib/events/record";
import { emitWebhook } from "@/lib/webhooks/emit";
import { detectScheme, verifySignature } from "./signature";
import { fromCustom, fromShopify, fromWooCommerce } from "./adapters";
import { attributeOrder } from "./attribution";

// Store ingest (server-only, service role): verify the store's HMAC signature over the raw body, map
// the platform payload to commerce events and apply each one idempotently (keyed by the store's own
// ids). Every behaviour is also recorded in tracked_events so automations, attribution and timelines
// see it, and order.placed goes out to webhook subscribers.

const MAX_BODY_BYTES = 2_000_000;
const DAY = 86_400_000;
const CART_MATCH_DAYS = 7;
const ALLOWED_SCHEMES = { custom: ["geiger"], shopify: ["shopify", "geiger"], woocommerce: ["woocommerce", "geiger"] };
const REVENUE_STATUSES = new Set(["pending", "paid", "fulfilled", "partially_refunded"]);
const DEFAULT_SETTINGS = { syncProducts: true, syncOrders: true, syncCustomers: true };

const money = (n) => Math.round((Number(n) || 0) * 100) / 100;
const fullName = (c) => [c?.firstName, c?.lastName].filter(Boolean).join(" ");

function fail(error, label) {
  throw new Error(`${label}: ${error?.message || error}`);
}

// Contacts ---------------------------------------------------------------------

// Finds the shopper by email (contacts store emails lowercased); creates them when allowed. Buyers who
// haven't opted in to marketing land as "pending" so campaigns skip them.
async function resolveContact(ctx, customer, { create }) {
  const email = customer?.email;
  if (!email) return null;
  const { db, projectId } = ctx;
  const { data: existing, error } = await db
    .from("contacts")
    .select("id, status, first_name, last_name, phone")
    .eq("project_id", projectId)
    .eq("email", email)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) fail(error, "contact lookup");
  if (existing) {
    const patch = {};
    if (!existing.first_name && customer.firstName) patch.first_name = customer.firstName;
    if (!existing.last_name && customer.lastName) patch.last_name = customer.lastName;
    if (!existing.phone && customer.phone) patch.phone = customer.phone;
    if (customer.acceptsMarketing === true && existing.status === "pending") patch.status = "subscribed";
    if (Object.keys(patch).length) await db.from("contacts").update(patch).eq("id", existing.id);
    return { id: existing.id, created: false };
  }
  if (!create) return null;
  const { data: created, error: insertError } = await db
    .from("contacts")
    .insert({
      project_id: projectId,
      email,
      first_name: customer.firstName || "",
      last_name: customer.lastName || "",
      phone: customer.phone || null,
      source: "commerce",
      status: customer.acceptsMarketing === true ? "subscribed" : "pending",
      metadata: { store_id: ctx.store.id, accepts_marketing: customer.acceptsMarketing },
    })
    .select("id")
    .single();
  if (insertError) {
    // Another webhook created the same shopper a moment ago.
    if (insertError.code === "23505") return resolveContact(ctx, customer, { create: false });
    fail(insertError, "contact insert");
  }
  await emitWebhook(db, projectId, "contact.created", { contact_id: created.id, email, source: "commerce", store_id: ctx.store.id });
  return { id: created.id, created: true };
}

// Line items --------------------------------------------------------------------

// Store line items -> stored items, linked to catalogue products by the store's product id.
async function mapItems(ctx, items) {
  const list = Array.isArray(items) ? items : [];
  const externalIds = [...new Set(list.map((i) => i.externalId).filter(Boolean))];
  const products = new Map();
  if (externalIds.length) {
    const { data } = await ctx.db
      .from("products")
      .select("id, external_id, image_url, url")
      .eq("store_id", ctx.store.id)
      .in("external_id", externalIds);
    for (const p of data || []) products.set(p.external_id, p);
  }
  return list.map((i) => {
    const p = i.externalId ? products.get(i.externalId) : null;
    return {
      product_id: p?.id ?? null,
      external_id: i.externalId,
      title: i.title,
      sku: i.sku || "",
      quantity: i.quantity,
      price: money(i.price),
      image_url: i.imageUrl || p?.image_url || null,
      url: i.url || p?.url || null,
    };
  });
}

// Products ---------------------------------------------------------------------

async function upsertProduct(ctx, d) {
  if (ctx.settings.syncProducts === false) return { status: "skipped", reason: "Product sync is off for this store." };
  if (!d.externalId) return { status: "skipped", reason: "Product has no id." };
  const { data, error } = await ctx.db
    .from("products")
    .upsert(
      {
        project_id: ctx.projectId,
        store_id: ctx.store.id,
        external_id: d.externalId,
        title: d.title,
        handle: d.handle || "",
        sku: (d.sku || "").toUpperCase(),
        price: money(d.price),
        compare_at_price: d.compareAtPrice == null ? null : money(d.compareAtPrice),
        currency: d.currency || ctx.store.currency,
        image_url: d.imageUrl,
        url: d.url,
        inventory: d.inventory,
        categories: d.categories || [],
        status: d.status || "active",
        published_at: d.publishedAt,
        deleted_at: null,
      },
      { onConflict: "store_id,external_id" },
    )
    .select("id")
    .single();
  if (error) fail(error, "product upsert");
  return { status: "ok", id: data.id };
}

async function deleteProduct(ctx, d) {
  if (!d.externalId) return { status: "skipped", reason: "Product has no id." };
  const { error } = await ctx.db
    .from("products")
    .update({ deleted_at: new Date().toISOString() })
    .eq("store_id", ctx.store.id)
    .eq("external_id", d.externalId)
    .is("deleted_at", null);
  if (error) fail(error, "product delete");
  return { status: "ok" };
}

async function productViewed(ctx, event) {
  const d = event.data;
  const contact = await resolveContact(ctx, d.customer, { create: false });
  if (!contact && !d.anonymousId) return { status: "skipped", reason: "Needs a known customer email or anonymous_id." };
  if (event.id) {
    const { data: seen } = await ctx.db
      .from("tracked_events")
      .select("id")
      .eq("project_id", ctx.projectId)
      .eq("name", "product_viewed")
      .contains("properties", { event_id: event.id })
      .limit(1);
    if (seen?.length) return { status: "duplicate" };
  }
  let product = null;
  if (d.productExternalId) {
    const { data } = await ctx.db
      .from("products")
      .select("id, title, price, url")
      .eq("store_id", ctx.store.id)
      .eq("external_id", d.productExternalId)
      .maybeSingle();
    product = data;
  }
  await recordEvent(ctx.db, {
    projectId: ctx.projectId,
    contactId: contact?.id ?? null,
    anonymousId: d.anonymousId,
    name: "product_viewed",
    source: "commerce",
    url: d.url || product?.url || null,
    occurredAt: event.occurredAt,
    properties: {
      store_id: ctx.store.id,
      product_id: product?.id ?? null,
      external_id: d.productExternalId,
      title: product?.title ?? null,
      price: product?.price ?? null,
      event_id: event.id ?? null,
    },
  });
  return { status: "ok" };
}

// Carts ------------------------------------------------------------------------

async function upsertCart(ctx, event) {
  const d = event.data;
  if (!d.externalId) return { status: "skipped", reason: "Cart has no id." };
  // A completed checkout is closed by its order event.
  if (d.completed) return { status: "ignored" };
  const { db, store } = ctx;
  const { data: existing, error } = await db
    .from("carts")
    .select("*")
    .eq("store_id", store.id)
    .eq("external_id", d.externalId)
    .maybeSingle();
  if (error) fail(error, "cart lookup");
  if (existing && (existing.status === "converted" || existing.status === "recovered") && !existing.deleted_at) {
    return { status: "ignored", id: existing.id };
  }
  const contact = await resolveContact(ctx, d.customer, { create: ctx.settings.syncCustomers !== false });
  const items = await mapItems(ctx, d.items);
  const meta = existing?.metadata && typeof existing.metadata === "object" ? existing.metadata : {};
  const firstCheckout = d.isCheckout && !meta.checkout_started_at;
  const now = new Date().toISOString();
  const row = {
    contact_id: contact?.id ?? existing?.contact_id ?? null,
    customer_email: d.customer?.email || existing?.customer_email || null,
    customer_name: fullName(d.customer) || existing?.customer_name || "",
    items,
    value: money(d.value),
    currency: d.currency || store.currency,
    checkout_url: d.checkoutUrl || existing?.checkout_url || null,
    last_activity_at: event.occurredAt || now,
    // New activity reopens an abandoned cart; abandoned_at stays so a later order counts as recovered.
    status: "active",
    deleted_at: null,
    metadata: firstCheckout ? { ...meta, checkout_started_at: now } : meta,
  };

  let id = existing?.id;
  if (existing) {
    const { error: updateError } = await db.from("carts").update(row).eq("id", existing.id);
    if (updateError) fail(updateError, "cart update");
  } else {
    const { data: created, error: insertError } = await db
      .from("carts")
      .insert({ ...row, project_id: ctx.projectId, store_id: store.id, external_id: d.externalId })
      .select("id")
      .single();
    if (insertError) {
      if (insertError.code === "23505") return { status: "duplicate" };
      fail(insertError, "cart insert");
    }
    id = created.id;
  }

  if (firstCheckout) {
    await recordEvent(db, {
      projectId: ctx.projectId,
      contactId: row.contact_id,
      name: "checkout_started",
      source: "commerce",
      currency: row.currency,
      url: row.checkout_url,
      occurredAt: row.last_activity_at,
      properties: {
        store_id: store.id,
        cart_id: id,
        value: row.value,
        items_count: items.reduce((sum, i) => sum + i.quantity, 0),
        product_ids: items.map((i) => i.product_id).filter(Boolean),
        checkout_url: row.checkout_url,
      },
    });
  }
  return { status: "ok", id };
}

// The cart an order closes: the one the store names, else the shopper's latest open cart this week.
async function findCart(ctx, cartExternalId, contactId, placedAt) {
  const { db, store } = ctx;
  if (cartExternalId) {
    const { data } = await db
      .from("carts")
      .select("id, status, abandoned_at, value")
      .eq("store_id", store.id)
      .eq("external_id", cartExternalId)
      .is("deleted_at", null)
      .maybeSingle();
    if (data) return data.status === "active" || data.status === "abandoned" ? data : null;
  }
  if (!contactId) return null;
  const since = new Date((Date.parse(placedAt) || Date.now()) - CART_MATCH_DAYS * DAY).toISOString();
  const { data } = await db
    .from("carts")
    .select("id, status, abandoned_at, value")
    .eq("store_id", store.id)
    .eq("contact_id", contactId)
    .in("status", ["active", "abandoned"])
    .is("deleted_at", null)
    .gte("last_activity_at", since)
    .order("last_activity_at", { ascending: false })
    .limit(1);
  return data?.[0] ?? null;
}

// Orders -----------------------------------------------------------------------

async function updateExistingOrder(ctx, existing, d) {
  const meta = existing.metadata && typeof existing.metadata === "object" ? existing.metadata : {};
  const refundIds = [...new Set([...(meta.refund_ids || []), ...(d.refundIds || [])])];
  const patch = { status: d.status, metadata: { ...meta, refund_ids: refundIds } };
  if (money(d.refundedAmount) > Number(existing.refunded_amount || 0)) patch.refunded_amount = money(d.refundedAmount);
  const { error } = await ctx.db.from("orders").update(patch).eq("id", existing.id);
  if (error) fail(error, "order update");
  if (d.status === "cancelled" && existing.status !== "cancelled") {
    await recordEvent(ctx.db, {
      projectId: ctx.projectId,
      contactId: existing.contact_id,
      name: "order_cancelled",
      source: "commerce",
      campaignId: existing.attributed_campaign_id,
      currency: existing.currency,
      properties: { store_id: ctx.store.id, order_id: existing.id, total: Number(existing.total) },
    });
  }
  return { status: "updated", id: existing.id };
}

async function upsertOrder(ctx, event) {
  const d = event.data;
  if (ctx.settings.syncOrders === false) return { status: "skipped", reason: "Order sync is off for this store." };
  if (!d.externalId) return { status: "skipped", reason: "Order has no id." };
  const { db, store, projectId } = ctx;

  const { data: existing, error } = await db
    .from("orders")
    .select("id, status, total, currency, refunded_amount, metadata, contact_id, attributed_campaign_id")
    .eq("store_id", store.id)
    .eq("external_id", d.externalId)
    .maybeSingle();
  if (error) fail(error, "order lookup");
  if (existing) return updateExistingOrder(ctx, existing, d);

  const contact = await resolveContact(ctx, d.customer, { create: ctx.settings.syncCustomers !== false });
  const contactId = contact?.id ?? null;
  const items = await mapItems(ctx, d.items);
  const attribution = await attributeOrder(db, { projectId, contactId, placedAt: d.placedAt });
  const cart = await findCart(ctx, d.cartExternalId, contactId, d.placedAt);
  const campaignId = attribution.matched ? attribution.campaign_id : null;
  const total = money(d.total);

  const { data: order, error: insertError } = await db
    .from("orders")
    .insert({
      project_id: projectId,
      store_id: store.id,
      contact_id: contactId,
      cart_id: cart?.id ?? null,
      external_id: d.externalId,
      number: d.number || `#${d.externalId}`,
      customer_email: d.customer?.email || null,
      customer_name: fullName(d.customer),
      subtotal: money(d.subtotal),
      discount: money(d.discount),
      shipping: money(d.shipping),
      tax: money(d.tax),
      total,
      refunded_amount: money(d.refundedAmount),
      currency: d.currency || store.currency,
      items,
      status: d.status,
      coupon_code: d.couponCodes?.[0] || null,
      placed_at: d.placedAt,
      attributed_campaign_id: campaignId,
      attribution,
      metadata: { coupon_codes: d.couponCodes || [], refund_ids: d.refundIds || [], accepts_marketing: d.customer?.acceptsMarketing ?? null },
    })
    .select("id")
    .single();
  if (insertError) {
    if (insertError.code === "23505") return { status: "duplicate" };
    fail(insertError, "order insert");
  }

  let recovered = false;
  if (cart) {
    recovered = Boolean(cart.abandoned_at);
    await db
      .from("carts")
      .update({
        status: recovered ? "recovered" : "converted",
        order_id: order.id,
        ...(recovered ? { recovered_at: d.placedAt, recovered_value: total } : {}),
      })
      .eq("id", cart.id)
      .in("status", ["active", "abandoned"]);
  }

  for (const code of d.couponCodes || []) {
    const { error: redeemError } = await db.rpc("commerce_redeem_coupon", {
      p_project: projectId,
      p_code: code,
      p_contact: contactId,
      p_order: order.id,
    });
    if (redeemError) console.error("[commerce.ingest] coupon redeem", redeemError.message);
  }

  if (REVENUE_STATUSES.has(d.status)) {
    await recordEvent(db, {
      projectId,
      contactId,
      name: "order_completed",
      source: "commerce",
      campaignId,
      deliveryId: attribution.matched ? attribution.delivery_id : null,
      revenue: total,
      currency: d.currency || store.currency,
      occurredAt: d.placedAt,
      properties: {
        store_id: store.id,
        order_id: order.id,
        external_id: d.externalId,
        number: d.number,
        items_count: items.reduce((sum, i) => sum + i.quantity, 0),
        product_ids: items.map((i) => i.product_id).filter(Boolean),
        coupon_code: d.couponCodes?.[0] || null,
        cart_id: cart?.id ?? null,
        recovered,
        attribution_model: attribution.model,
      },
    });
  }
  if (recovered) {
    await recordEvent(db, {
      projectId,
      contactId,
      name: "cart_recovered",
      source: "commerce",
      revenue: total,
      currency: d.currency || store.currency,
      occurredAt: d.placedAt,
      properties: { store_id: store.id, cart_id: cart.id, order_id: order.id },
    });
  }

  await emitWebhook(db, projectId, "order.placed", {
    order_id: order.id,
    store_id: store.id,
    number: d.number,
    status: d.status,
    total,
    currency: d.currency || store.currency,
    contact_id: contactId,
    email: d.customer?.email || null,
    campaign_id: campaignId,
    coupon_codes: d.couponCodes || [],
    recovered_cart_id: recovered ? cart.id : null,
    items: items.map((i) => ({ product_id: i.product_id, external_id: i.external_id, title: i.title, quantity: i.quantity, price: i.price })),
    placed_at: d.placedAt,
  });

  return { status: "created", id: order.id, recovered, campaignId };
}

async function refundOrder(ctx, event) {
  const d = event.data;
  if (!d.orderExternalId) return { status: "skipped", reason: "Refund has no order id." };
  const { data: order, error } = await ctx.db
    .from("orders")
    .select("id, total, refunded_amount, status, metadata, contact_id, currency, attributed_campaign_id")
    .eq("store_id", ctx.store.id)
    .eq("external_id", d.orderExternalId)
    .maybeSingle();
  if (error) fail(error, "refund lookup");
  if (!order) return { status: "skipped", reason: "Unknown order." };
  const meta = order.metadata && typeof order.metadata === "object" ? order.metadata : {};
  const refundIds = meta.refund_ids || [];
  if (d.refundId && refundIds.includes(d.refundId)) return { status: "duplicate", id: order.id };
  const refunded = money(Number(order.refunded_amount || 0) + money(d.amount));
  const status = refunded >= Number(order.total) - 0.005 ? "refunded" : "partially_refunded";
  const { error: updateError } = await ctx.db
    .from("orders")
    .update({ refunded_amount: refunded, status, metadata: { ...meta, refund_ids: d.refundId ? [...refundIds, d.refundId] : refundIds } })
    .eq("id", order.id);
  if (updateError) fail(updateError, "refund update");
  await recordEvent(ctx.db, {
    projectId: ctx.projectId,
    contactId: order.contact_id,
    name: "order_refunded",
    source: "commerce",
    campaignId: order.attributed_campaign_id,
    currency: order.currency,
    occurredAt: d.refundedAt,
    properties: { store_id: ctx.store.id, order_id: order.id, amount: money(d.amount), refunded_total: refunded },
  });
  return { status: "ok", id: order.id };
}

export async function processCommerceEvent(ctx, event) {
  switch (event.type) {
    case "product_upsert":
      return upsertProduct(ctx, event.data);
    case "product_deleted":
      return deleteProduct(ctx, event.data);
    case "product_viewed":
      return productViewed(ctx, event);
    case "cart_updated":
    case "checkout_started":
      return upsertCart(ctx, event);
    case "order_placed":
    case "order_updated":
      return upsertOrder(ctx, event);
    case "order_refunded":
      return refundOrder(ctx, event);
    default:
      return { status: "ignored" };
  }
}

// POST /api/public/commerce/<storeId>/events
export async function ingestCommerceRequest(request, storeId) {
  assertUuid(storeId, "store id");
  const db = adminClient();
  if (!db) throw notConfigured("Commerce ingest isn't configured on this deployment.");

  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) throw new ApiError(413, "Payload too large.", "payload_too_large");

  const { data: store } = await db.from("stores").select("*").eq("id", storeId).is("deleted_at", null).maybeSingle();
  if (!store) throw notFound("Unknown store.");
  const { data: secretRow } = await db.from("store_secrets").select("secret").eq("store_id", storeId).maybeSingle();
  if (!secretRow?.secret) throw unauthorized("This store has no signing secret yet.");

  const headers = request.headers;
  const scheme = detectScheme(headers);
  const allowed = ALLOWED_SCHEMES[store.platform] || ALLOWED_SCHEMES.custom;
  if (!scheme || !allowed.includes(scheme) || !verifySignature(scheme, headers, raw, secretRow.secret)) {
    throw unauthorized("Invalid signature.");
  }
  // WooCommerce pings a new webhook with a form body before sending JSON deliveries.
  if (scheme === "woocommerce" && /^webhook_id=\d+$/.test(raw.trim())) return { ok: true, ping: true };

  let body;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    throw badRequest("The body must be JSON.");
  }

  const events =
    scheme === "shopify"
      ? fromShopify(headers.get("x-shopify-topic"), body, store, headers.get("x-shopify-webhook-id"))
      : scheme === "woocommerce"
        ? fromWooCommerce(headers.get("x-wc-webhook-topic"), body, store, headers.get("x-wc-webhook-delivery-id"))
        : fromCustom(body, store);
  if (!events.length) throw badRequest("No events in the body.");

  const ctx = { db, store, projectId: store.project_id, settings: { ...DEFAULT_SETTINGS, ...(store.settings || {}) } };
  const results = [];
  for (const event of events) {
    try {
      results.push({ type: event.type, ...(await processCommerceEvent(ctx, event)) });
    } catch (error) {
      console.error(`[commerce.ingest.${event.type}]`, error);
      results.push({ type: event.type, status: "failed", error: "Couldn't apply this event." });
    }
  }

  const failed = results.filter((r) => r.status === "failed").length;
  const now = new Date().toISOString();
  await db
    .from("stores")
    .update({
      status: failed === results.length ? "error" : "connected",
      last_event_at: now,
      last_event_type: events[events.length - 1].type,
      ...(failed ? { last_error: `${failed} of ${results.length} events couldn't be applied.`, last_error_at: now } : { last_error: null }),
    })
    .eq("id", store.id);

  // A non-2xx makes Shopify and WooCommerce retry the delivery later.
  return json({ ok: failed === 0, processed: results.length - failed, failed, results }, failed && failed === results.length ? 500 : 200);
}
