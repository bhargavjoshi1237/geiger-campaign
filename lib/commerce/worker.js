import { recordEvent } from "@/lib/events/record";
import { emitWebhook } from "@/lib/webhooks/emit";

// commerce worker job, run by app/api/internal/worker on every scheduler tick (server-only, service role).
// 1. Marks active carts abandoned once they've been idle longer than their store's threshold, recording
//    cart_abandoned (the abandoned-cart automation trigger) and emitting cart.abandoned.
// 2. Marks abandoned carts recovered when the same shopper ordered from the same store afterwards but
//    the order arrived without a cart reference.
// Bounded per tick; conditional updates (status still matches) keep both passes idempotent.
export const name = "commerce";

const DAY = 86_400_000;
const CARTS_PER_STORE = 200;
const RECOVERY_SCAN = 500;
const RECOVERY_WINDOW_DAYS = 7;
const PURCHASE_STATUSES = ["pending", "paid", "fulfilled", "partially_refunded"];

const compactItems = (items) =>
  (Array.isArray(items) ? items : []).slice(0, 10).map((i) => ({
    product_id: i.product_id ?? null,
    title: i.title ?? "Item",
    quantity: Number(i.quantity ?? 1),
    price: Number(i.price ?? 0),
    image_url: i.image_url ?? null,
    url: i.url ?? null,
  }));

async function abandonIdleCarts(db, now, timeLeft, summary) {
  const { data: stores, error } = await db
    .from("stores")
    .select("id, project_id, abandon_after_minutes")
    .is("deleted_at", null)
    .limit(1000);
  if (error) throw new Error(error.message);

  for (const store of stores || []) {
    if (!timeLeft()) return;
    const cutoff = new Date(now.getTime() - Number(store.abandon_after_minutes || 60) * 60_000).toISOString();
    // Empty carts (value 0) are never abandoned, so they can't crowd real ones out of the batch.
    const { data: due, error: dueError } = await db
      .from("carts")
      .select("id, project_id, store_id, contact_id, customer_email, items, value, currency, checkout_url, last_activity_at")
      .eq("store_id", store.id)
      .eq("status", "active")
      .is("deleted_at", null)
      .gt("value", 0)
      .lt("last_activity_at", cutoff)
      .order("last_activity_at", { ascending: true })
      .limit(CARTS_PER_STORE);
    if (dueError) {
      console.error("[worker.commerce] due carts", dueError.message);
      continue;
    }
    for (const cart of due || []) {
      if (!timeLeft()) return;
      const abandonedAt = now.toISOString();
      const { data: updated, error: updateError } = await db
        .from("carts")
        .update({ status: "abandoned", abandoned_at: abandonedAt })
        .eq("id", cart.id)
        .eq("status", "active")
        .select("id");
      if (updateError || !updated?.length) continue;
      summary.abandoned += 1;

      const items = compactItems(cart.items);
      await recordEvent(db, {
        projectId: cart.project_id,
        contactId: cart.contact_id,
        name: "cart_abandoned",
        source: "commerce",
        currency: cart.currency,
        url: cart.checkout_url,
        properties: {
          store_id: cart.store_id,
          cart_id: cart.id,
          value: Number(cart.value),
          items_count: items.reduce((sum, i) => sum + i.quantity, 0),
          product_ids: items.map((i) => i.product_id).filter(Boolean),
          items,
          checkout_url: cart.checkout_url,
          last_activity_at: cart.last_activity_at,
        },
      });
      await emitWebhook(db, cart.project_id, "cart.abandoned", {
        cart_id: cart.id,
        store_id: cart.store_id,
        contact_id: cart.contact_id,
        email: cart.customer_email,
        value: Number(cart.value),
        currency: cart.currency,
        checkout_url: cart.checkout_url,
        items,
        abandoned_at: abandonedAt,
      });
    }
  }
}

async function recoverOrderedCarts(db, now, timeLeft, summary) {
  const since = new Date(now.getTime() - RECOVERY_WINDOW_DAYS * DAY).toISOString();
  const { data: carts, error } = await db
    .from("carts")
    .select("id, project_id, store_id, contact_id, abandoned_at, value, currency")
    .eq("status", "abandoned")
    .is("deleted_at", null)
    .not("contact_id", "is", null)
    .gte("abandoned_at", since)
    .order("abandoned_at", { ascending: false })
    .limit(RECOVERY_SCAN);
  if (error) throw new Error(error.message);
  if (!carts?.length) return;

  const contactIds = [...new Set(carts.map((c) => c.contact_id))];
  const earliest = carts.reduce((min, c) => (c.abandoned_at < min ? c.abandoned_at : min), carts[0].abandoned_at);
  const { data: orders, error: orderError } = await db
    .from("orders")
    .select("id, contact_id, store_id, cart_id, placed_at, total, currency")
    .in("contact_id", contactIds)
    .in("status", PURCHASE_STATUSES)
    .is("deleted_at", null)
    .gte("placed_at", earliest)
    .order("placed_at", { ascending: true })
    .limit(2000);
  if (orderError) throw new Error(orderError.message);

  const used = new Set();
  for (const cart of carts) {
    if (!timeLeft()) return;
    const order = (orders || []).find(
      (o) =>
        !used.has(o.id) &&
        o.contact_id === cart.contact_id &&
        o.store_id === cart.store_id &&
        o.placed_at > cart.abandoned_at &&
        (!o.cart_id || o.cart_id === cart.id),
    );
    if (!order) continue;
    used.add(order.id);
    const { data: updated } = await db
      .from("carts")
      .update({ status: "recovered", recovered_at: order.placed_at, recovered_value: Number(order.total), order_id: order.id })
      .eq("id", cart.id)
      .eq("status", "abandoned")
      .select("id");
    if (!updated?.length) continue;
    if (!order.cart_id) await db.from("orders").update({ cart_id: cart.id }).eq("id", order.id);
    summary.recovered += 1;
    await recordEvent(db, {
      projectId: cart.project_id,
      contactId: cart.contact_id,
      name: "cart_recovered",
      source: "commerce",
      revenue: Number(order.total),
      currency: order.currency,
      occurredAt: order.placed_at,
      properties: { store_id: cart.store_id, cart_id: cart.id, order_id: order.id },
    });
  }
}

export async function run({ db, now = new Date(), deadline } = {}) {
  const summary = { abandoned: 0, recovered: 0 };
  if (!db) return { ...summary, skipped: "no database" };
  const timeLeft = () => !deadline || Date.now() < deadline - 2_000;
  await abandonIdleCarts(db, now, timeLeft, summary);
  if (timeLeft()) await recoverOrderedCarts(db, now, timeLeft, summary);
  return summary;
}
