// One timeline over CRM activities, message deliveries and tracked events (all normalized view models).

import { formatMoney, humanizeEvent } from "./format.js";

const CHANNEL_LABEL = {
  email: "Email",
  sms: "SMS",
  whatsapp: "WhatsApp",
  push: "Push",
  in_app: "In-app message",
  instagram: "Instagram DM",
  messenger: "Messenger",
  telegram: "Telegram",
  tiktok: "TikTok",
  rcs: "RCS",
};

const DELIVERY_STATUS = {
  queued: "queued",
  sent: "sent",
  delivered: "delivered",
  opened: "opened",
  clicked: "clicked",
  read: "read",
  replied: "replied to",
  bounced: "bounced",
  complained: "marked as spam",
  failed: "failed",
  not_sent: "not sent",
  unsubscribed: "unsubscribed from",
};

export const channelLabel = (channel) => CHANNEL_LABEL[channel] || "Message";

function fromActivity(a) {
  return {
    key: `crm:${a.id}`,
    source: "crm",
    type: a.kind,
    at: a.occurredAt,
    actorId: a.actorId,
    contactId: a.contactId,
    relatedType: a.relatedType,
    relatedId: a.relatedId,
    title: a.subject,
    detail: a.body,
    record: a,
  };
}

function fromDelivery(d) {
  const label = channelLabel(d.channel);
  const verb = DELIVERY_STATUS[d.status] || d.status;
  return {
    key: `delivery:${d.id}`,
    source: "delivery",
    type: "message",
    at: d.clickedAt || d.openedAt || d.deliveredAt || d.sentAt || d.createdAt,
    actorId: null,
    contactId: d.contactId,
    relatedType: null,
    relatedId: null,
    title: `${label} ${verb}`,
    detail: [d.subject, d.to ? `to ${d.to}` : ""].filter(Boolean).join(" · ") || d.error || "",
    record: d,
  };
}

function fromEvent(e) {
  const parts = [];
  if (e.revenue != null) parts.push(formatMoney(e.revenue, e.currency || "USD"));
  if (e.url) parts.push(e.url);
  if (!parts.length && e.source) parts.push(`Source: ${e.source}`);
  return {
    key: `event:${e.id}`,
    source: "event",
    type: "event",
    at: e.occurredAt,
    actorId: null,
    contactId: e.contactId,
    relatedType: e.properties?.dealId ? "deal" : null,
    relatedId: e.properties?.dealId || null,
    title: humanizeEvent(e.name),
    detail: parts.join(" · "),
    record: e,
  };
}

// deal_won events duplicate the deal's own "Marked won" history entry, so they stay out of the feed.
export function timelineItems({ activities = [], deliveries = [], events = [] }) {
  const items = [
    ...activities.map(fromActivity),
    ...deliveries.map(fromDelivery),
    ...events.filter((e) => e.name !== "deal_won").map(fromEvent),
  ];
  return items
    .filter((i) => i.at)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}
