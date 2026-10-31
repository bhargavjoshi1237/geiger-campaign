// What each store platform sends and how it signs it (isomorphic, pure). The ingest route verifies and
// maps these; the Stores screen shows the same list as setup instructions, so the two never drift.

export const SHOPIFY_TOPICS = [
  "products/create",
  "products/update",
  "products/delete",
  "checkouts/create",
  "checkouts/update",
  "orders/create",
  "orders/updated",
  "orders/paid",
  "orders/fulfilled",
  "orders/cancelled",
  "refunds/create",
];

export const WOOCOMMERCE_TOPICS = ["product.created", "product.updated", "product.deleted", "order.created", "order.updated"];

// Geiger's own event types for custom storefronts (and extra events from any platform's backend).
export const CUSTOM_EVENT_TYPES = [
  { type: "product.upsert", description: "Create or update a catalogue product." },
  { type: "product.deleted", description: "Remove a product from the catalogue." },
  { type: "product.viewed", description: "A known shopper viewed a product page." },
  { type: "cart.updated", description: "A cart changed; idle carts are marked abandoned." },
  { type: "checkout.started", description: "A shopper reached checkout." },
  { type: "order.placed", description: "An order was placed; closes the cart and redeems coupons." },
  { type: "order.updated", description: "Order status changed (paid, fulfilled, cancelled)." },
  { type: "order.refunded", description: "Money was refunded on an order." },
];

export const PLATFORMS = {
  shopify: {
    key: "shopify",
    label: "Shopify",
    // Shopify generates the signing secret; the merchant pastes it into Geiger.
    secretSource: "store",
    signatureHeader: "X-Shopify-Hmac-Sha256",
    topics: SHOPIFY_TOPICS,
    setup: "In Shopify admin open Settings → Notifications → Webhooks, create a JSON webhook for each topic below pointing at the ingest URL, then paste the signing secret Shopify shows under the webhook list.",
  },
  woocommerce: {
    key: "woocommerce",
    label: "WooCommerce",
    secretSource: "geiger",
    signatureHeader: "X-WC-Webhook-Signature",
    topics: WOOCOMMERCE_TOPICS,
    setup: "In WordPress open WooCommerce → Settings → Advanced → Webhooks and add a webhook per topic below with the ingest URL as delivery URL and the signing secret as Secret. WooCommerce has no abandoned-checkout webhook, so send cart.updated events from your theme or backend.",
  },
  custom: {
    key: "custom",
    label: "Custom",
    secretSource: "geiger",
    signatureHeader: "X-Geiger-Signature",
    topics: CUSTOM_EVENT_TYPES.map((e) => e.type),
    setup: "POST JSON events from your backend to the ingest URL. Sign the raw body with HMAC-SHA256 using the signing secret and send it as X-Geiger-Signature: sha256=<hex>.",
  },
};

export const PLATFORM_KEYS = Object.keys(PLATFORMS);

export function platformInfo(key) {
  return PLATFORMS[key] || PLATFORMS.custom;
}

// The example body shown next to the custom setup instructions.
export const CUSTOM_EVENT_EXAMPLE = {
  type: "order.placed",
  data: {
    id: "1042",
    number: "#1042",
    customer: { email: "shopper@example.com", first_name: "Ana", last_name: "Lima", accepts_marketing: true },
    items: [{ product_id: "sku-881", title: "Ceramic dripper", quantity: 1, price: 32 }],
    subtotal: 32,
    discount: 0,
    total: 32,
    currency: "USD",
    coupon_code: null,
    cart_id: "cart_7f3a",
    placed_at: "2026-10-27T10:15:00Z",
  },
};
