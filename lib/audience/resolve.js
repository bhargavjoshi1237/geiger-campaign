// Server-side audience resolution (service-role db): turns a campaign/broadcast audience
// { listIds, segmentIds, excludeListIds, excludeSegmentIds } into the deduped, sendable contact rows
// for a channel — dropping unsubscribed/bounced/complained contacts, suppressions, contacts without an
// address for the channel, and (for every channel but email) contacts without an opt-in consent.
// OWNER: Audience. `all: true` targets every contact in the project.

import { addressFor, CONSENT_EXEMPT_CHANNELS, emailDomain, PHONE_CHANNELS, phoneKey, toContactModel } from "./contact_model.js";
import { conditionNeeds, matchesConditions } from "./segment_rules.js";
import { buildContextIndex } from "./evaluate.js";
import {
  chunk,
  fetchAll,
  liveListIds,
  loadContactsByIds,
  loadMemberships,
  loadProjectContacts,
  loadRuleContext,
  loadSegments,
} from "./server_data.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ids = (v) => [...new Set((Array.isArray(v) ? v : []).filter((x) => typeof x === "string" && UUID.test(x)))];

// Active (not deleted, not expired) suppressions grouped for O(1) lookups.
export async function loadSuppressionIndex(db, projectId, now = Date.now()) {
  const rows = await fetchAll(
    () => db.from("suppressions").select("id, kind, value, expires_at").eq("project_id", projectId).is("deleted_at", null).order("id"),
    { label: "audience.suppressions" },
  );
  const index = { email: new Set(), domain: new Set(), phone: new Set() };
  for (const s of rows) {
    if (s.expires_at && Date.parse(s.expires_at) <= now) continue;
    const value = String(s.value || "").trim().toLowerCase();
    if (!value) continue;
    if (s.kind === "phone") index.phone.add(phoneKey(value));
    else if (s.kind === "domain") index.domain.add(value.replace(/^@/, ""));
    else index.email.add(value);
  }
  return index;
}

// True when the address this channel would use is suppressed.
export function isSuppressed(index, channel, address) {
  if (!address) return false;
  if (channel === "email") return index.email.has(address) || index.domain.has(emailDomain(address));
  if (PHONE_CHANNELS.includes(channel)) return index.phone.has(phoneKey(address));
  return false;
}

// contactId -> latest consent status on one channel.
export async function loadLatestConsents(db, projectId, channel, contactIds = null) {
  const latest = new Map();
  const keep = (rows) => {
    for (const r of rows) {
      const at = Date.parse(r.captured_at) || 0;
      const prev = latest.get(r.contact_id);
      if (!prev || at >= prev.at) latest.set(r.contact_id, { status: r.status, at });
    }
  };
  const base = () =>
    db
      .from("contact_consents")
      .select("contact_id, status, captured_at")
      .eq("project_id", projectId)
      .eq("channel", channel)
      .is("deleted_at", null);
  if (contactIds && contactIds.length <= 1500) {
    for (const part of chunk(contactIds)) {
      const { data, error } = await base().in("contact_id", part);
      if (error) throw new Error(`[audience.consents] ${error.message}`);
      keep(data || []);
    }
  } else {
    keep(await fetchAll(() => base().order("id"), { label: "audience.consents" }));
  }
  return new Map([...latest].map(([id, v]) => [id, v.status]));
}

// Evaluates segments over `contacts` (raw rows), loading only the context their rules need.
export async function matchSegments(db, projectId, contacts, segments, now = Date.now()) {
  const matched = new Set();
  if (!segments.length || !contacts.length) return matched;
  const needs = conditionNeeds(segments.map((s) => s.conditions || []));
  const contextFor = buildContextIndex({ ...(await loadRuleContext(db, projectId, needs, now)), now });
  for (const row of contacts) {
    const model = toContactModel(row);
    const ctx = contextFor(row.id);
    if (segments.some((s) => matchesConditions(model, { match: s.match, conditions: s.conditions || [] }, ctx))) {
      matched.add(row.id);
    }
  }
  return matched;
}

// The recipients plus why everyone else was dropped — what estimate/preview screens show.
export async function resolveAudienceDetailed(db, projectId, audience = {}, { channel = "email", now = Date.now() } = {}) {
  const excluded = { unsubscribed: 0, suppressed: 0, noAddress: 0, noConsent: 0, excludedByRule: 0, duplicate: 0 };
  if (!db || !projectId) return { recipients: [], excluded, candidates: 0 };

  const [listIds, excludeListIds] = await Promise.all([
    liveListIds(db, projectId, ids(audience.listIds)),
    liveListIds(db, projectId, ids(audience.excludeListIds)),
  ]);
  const [segments, excludeSegments] = await Promise.all([
    loadSegments(db, projectId, ids(audience.segmentIds)),
    loadSegments(db, projectId, ids(audience.excludeSegmentIds)),
  ]);
  const everyone = audience.all === true;
  if (!everyone && !listIds.length && !segments.length) return { recipients: [], excluded, candidates: 0 };

  // Candidates: list members plus segment matches (segments need the whole project to evaluate).
  const memberIds = listIds.length ? new Set((await loadMemberships(db, projectId, { listIds })).map((m) => m.contact_id)) : new Set();
  let pool;
  if (everyone || segments.length) {
    pool = await loadProjectContacts(db, projectId);
  } else {
    pool = await loadContactsByIds(db, projectId, [...memberIds]);
  }
  const segmentHits = await matchSegments(db, projectId, pool, segments, now);
  const candidates = pool.filter((c) => everyone || memberIds.has(c.id) || segmentHits.has(c.id));

  // Exclusions.
  const excludeMembers = excludeListIds.length
    ? new Set((await loadMemberships(db, projectId, { listIds: excludeListIds })).map((m) => m.contact_id))
    : new Set();
  const excludeHits = await matchSegments(db, projectId, candidates, excludeSegments, now);
  const kept = candidates.filter((c) => {
    if (excludeMembers.has(c.id) || excludeHits.has(c.id)) {
      excluded.excludedByRule += 1;
      return false;
    }
    return true;
  });

  const suppressions = await loadSuppressionIndex(db, projectId, now);
  const subscribed = kept.filter((c) => {
    if (c.status === "subscribed") return true;
    excluded.unsubscribed += 1;
    return false;
  });
  const consents = await loadLatestConsents(db, projectId, channel, subscribed.map((c) => c.id));
  const needsOptIn = !CONSENT_EXEMPT_CHANNELS.includes(channel);

  const seen = new Set();
  const recipients = [];
  for (const row of subscribed) {
    const address = addressFor(row, channel);
    if (!address) {
      excluded.noAddress += 1;
      continue;
    }
    if (isSuppressed(suppressions, channel, address)) {
      excluded.suppressed += 1;
      continue;
    }
    const consent = consents.get(row.id);
    if (consent === "opted_out" || (needsOptIn && consent !== "opted_in")) {
      excluded.noConsent += 1;
      continue;
    }
    const key = channel === "email" ? address : PHONE_CHANNELS.includes(channel) ? phoneKey(address) : address;
    if (seen.has(key)) {
      excluded.duplicate += 1;
      continue;
    }
    seen.add(key);
    recipients.push({ ...row, address });
  }
  return { recipients, excluded, candidates: candidates.length };
}

export async function resolveAudience(db, projectId, audience = {}, { channel = "email" } = {}) {
  const { recipients } = await resolveAudienceDetailed(db, projectId, audience, { channel });
  return recipients;
}

// Exact segment size over the whole project (any status) — written to segments.contact_count.
export async function countSegment(db, projectId, segment, now = Date.now()) {
  const contacts = await loadProjectContacts(db, projectId);
  const hits = await matchSegments(db, projectId, contacts, [segment], now);
  return { count: hits.size, total: contacts.length, sampleIds: contacts.filter((c) => hits.has(c.id)).slice(0, 10).map((c) => c.id) };
}
