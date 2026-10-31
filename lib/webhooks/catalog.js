// Outgoing webhook event catalog (pure, client-safe). Names are the fixed cross-area contract emitted
// through lib/webhooks/emit.js; `sample` is the `data` object a test delivery carries.

export const WEBHOOK_EVENTS = [
  {
    key: "contact.created",
    label: "Contact created",
    description: "A contact was added — by import, form, API or the tracking snippet.",
    sample: { contact: { id: "00000000-0000-4000-8000-000000000001", email: "jane@example.com", first_name: "Jane", last_name: "Doe", status: "subscribed", source: "api" } },
  },
  {
    key: "contact.unsubscribed",
    label: "Contact unsubscribed",
    description: "A contact opted out of marketing messages.",
    sample: { contact: { id: "00000000-0000-4000-8000-000000000001", email: "jane@example.com", status: "unsubscribed" }, channel: "email" },
  },
  {
    key: "form.submitted",
    label: "Form submitted",
    description: "Someone submitted a hosted form or popup.",
    sample: { form: { id: "00000000-0000-4000-8000-000000000002", name: "Newsletter signup" }, fields: { email: "jane@example.com" } },
  },
  {
    key: "campaign.sent",
    label: "Campaign sent",
    description: "A campaign finished sending to its audience.",
    sample: { campaign: { id: "00000000-0000-4000-8000-000000000003", name: "October newsletter", channel: "email" }, recipients: 1204 },
  },
  {
    key: "email.opened",
    label: "Email opened",
    description: "A recipient opened a tracked email.",
    sample: { delivery_id: "00000000-0000-4000-8000-000000000004", campaign_id: "00000000-0000-4000-8000-000000000003", contact: { email: "jane@example.com" } },
  },
  {
    key: "email.clicked",
    label: "Email clicked",
    description: "A recipient clicked a tracked link.",
    sample: { delivery_id: "00000000-0000-4000-8000-000000000004", url: "https://example.com/launch", contact: { email: "jane@example.com" } },
  },
  {
    key: "order.placed",
    label: "Order placed",
    description: "A connected store recorded a new order.",
    sample: { order: { id: "1043", total: 129, currency: "USD" }, contact: { email: "jane@example.com" } },
  },
  {
    key: "cart.abandoned",
    label: "Cart abandoned",
    description: "A shopper left items in their cart.",
    sample: { cart: { id: "c_88", total: 74.5, currency: "USD", items: 2 }, contact: { email: "jane@example.com" } },
  },
  {
    key: "deal.won",
    label: "Deal won",
    description: "A CRM deal moved to won.",
    sample: { deal: { id: "00000000-0000-4000-8000-000000000005", name: "Kestrel retainer", value: 24000, currency: "USD" } },
  },
  {
    key: "conversation.created",
    label: "Conversation created",
    description: "A new inbox conversation started on any channel.",
    sample: { conversation: { id: "00000000-0000-4000-8000-000000000006", channel: "whatsapp" }, contact: { email: "jane@example.com" } },
  },
  {
    key: "message.received",
    label: "Message received",
    description: "An inbound message arrived in the inbox.",
    sample: { conversation_id: "00000000-0000-4000-8000-000000000006", channel: "whatsapp", body: "Is the launch event still on?" },
  },
];

export const WEBHOOK_EVENT_KEYS = WEBHOOK_EVENTS.map((e) => e.key);

// "*" subscribes an endpoint to every event, including ones added later.
export const ALL_EVENTS = "*";

export function webhookEvent(key) {
  return WEBHOOK_EVENTS.find((e) => e.key === key) || null;
}

export function isSubscribed(events, event) {
  return Array.isArray(events) && (events.includes(ALL_EVENTS) || events.includes(event));
}

// The JSON envelope every delivery POSTs.
export function webhookEnvelope({ id, event, projectId, data, createdAt = new Date().toISOString() }) {
  return { id, type: event, created_at: createdAt, project_id: projectId, data: data ?? {} };
}
