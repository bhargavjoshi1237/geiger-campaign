// Slack incoming-webhook notifications (server-only). The webhook URL is a credential, so it lives in
// campaign.integration_secrets; the integration row keeps { channel, events }. Messages are queued as
// webhook_deliveries with integration_id and delivered by lib/webhooks/deliver.js like any endpoint.

import { webhookEvent } from "@/lib/webhooks/catalog";

const SLACK_HOOK = /^https:\/\/hooks\.slack\.com\/(services|workflows|triggers)\/[A-Za-z0-9/_-]+$/;

export function slackUrlError(url) {
  return SLACK_HOOK.test(String(url || "").trim()) ? null : "Paste the incoming webhook URL Slack gave you — it starts with https://hooks.slack.com/.";
}

const first = (...values) => values.find((v) => v !== undefined && v !== null && v !== "");

function money(amount, currency) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "";
  try {
    return n.toLocaleString("en-US", { style: "currency", currency: currency || "USD" });
  } catch {
    return n.toFixed(2);
  }
}

// One readable line per event; unknown shapes fall back to their first few scalar fields.
export function slackSummary(event, data = {}) {
  const contact = data.contact || {};
  const who = first(contact.email, data.email, [contact.first_name, contact.last_name].filter(Boolean).join(" "), contact.phone, "someone");
  switch (event) {
    case "contact.created":
      return `New contact: *${who}*${contact.source ? ` (via ${contact.source})` : ""}`;
    case "contact.unsubscribed":
      return `*${who}* unsubscribed${data.channel ? ` from ${data.channel}` : ""}`;
    case "form.submitted":
      return `*${first(data.form?.name, "A form")}* was submitted by ${first(data.fields?.email, who)}`;
    case "campaign.sent":
      return `Campaign *${first(data.campaign?.name, data.name, "Untitled")}* sent${data.recipients != null ? ` to ${Number(data.recipients).toLocaleString("en-US")} recipients` : ""}`;
    case "email.opened":
      return `*${who}* opened an email`;
    case "email.clicked":
      return `*${who}* clicked ${first(data.url, "a link")}`;
    case "order.placed":
      return `Order *${first(data.order?.number, data.order?.id, "")}* placed by ${who}${data.order?.total != null ? ` · ${money(data.order.total, data.order.currency)}` : ""}`;
    case "cart.abandoned":
      return `*${who}* abandoned a cart${data.cart?.total != null ? ` worth ${money(data.cart.total, data.cart.currency)}` : ""}`;
    case "deal.won":
      return `Deal won: *${first(data.deal?.name, "Untitled deal")}*${data.deal?.value != null ? ` · ${money(data.deal.value, data.deal.currency)}` : ""}`;
    case "conversation.created":
      return `New ${first(data.conversation?.channel, data.channel, "")} conversation with ${who}`;
    case "message.received":
      return `New message${data.channel ? ` on ${data.channel}` : ""}: “${String(first(data.body, "")).slice(0, 140)}”`;
    default: {
      const pairs = Object.entries(data)
        .filter(([, v]) => ["string", "number", "boolean"].includes(typeof v))
        .slice(0, 4)
        .map(([k, v]) => `${k}: ${v}`);
      return `${event}${pairs.length ? ` — ${pairs.join(", ")}` : ""}`;
    }
  }
}

export function slackMessage(event, data, { test = false } = {}) {
  const label = webhookEvent(event)?.label || event;
  const text = test ? "Test message from Geiger Campaign — this channel is connected." : slackSummary(event, data);
  return {
    text,
    blocks: [
      { type: "section", text: { type: "mrkdwn", text } },
      { type: "context", elements: [{ type: "mrkdwn", text: `Geiger Campaign · ${test ? "Connection test" : label}` }] },
    ],
  };
}
