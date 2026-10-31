// Pure segment evaluation over already-loaded rows (browser preview, server resolution, playground):
// groups memberships, events and deliveries per contact and runs matchesConditions over the contacts.

import { matchesConditions } from "./segment_rules.js";

const pick = (row, camel, snake) => row?.[camel] ?? row?.[snake];

// listMembers / events / deliveries: raw rows or view models. Only subscribed, live memberships count.
export function buildContextIndex({ listMembers = [], events = [], deliveries = [], now = Date.now() } = {}) {
  const lists = new Map();
  for (const m of listMembers) {
    if (pick(m, "deletedAt", "deleted_at")) continue;
    if ((m.status ?? "subscribed") !== "subscribed") continue;
    const contactId = pick(m, "contactId", "contact_id");
    if (!contactId) continue;
    if (!lists.has(contactId)) lists.set(contactId, new Set());
    lists.get(contactId).add(String(pick(m, "listId", "list_id")));
  }
  const group = (rows) => {
    const map = new Map();
    for (const row of rows) {
      const contactId = pick(row, "contactId", "contact_id");
      if (!contactId) continue;
      if (!map.has(contactId)) map.set(contactId, []);
      map.get(contactId).push(row);
    }
    return map;
  };
  const eventsBy = group(events);
  const deliveriesBy = group(deliveries);
  const empty = [];
  return (contactId) => ({
    now,
    listIds: lists.get(contactId) ?? new Set(),
    events: eventsBy.get(contactId) ?? empty,
    deliveries: deliveriesBy.get(contactId) ?? empty,
  });
}

// The contacts matching a { match, conditions } rule.
export function filterBySegment(contacts, rule, contextFor) {
  const ctxFor = contextFor || buildContextIndex();
  return (contacts || []).filter((c) => matchesConditions(c, rule, ctxFor(c.id)));
}
