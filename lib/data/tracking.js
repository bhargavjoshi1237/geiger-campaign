import { normalizeEmail, normalizePhone, traitsToAttributes, upsertContact } from "./contacts";

// Event ingest (server-only, admin db) shared by POST /api/public/track (snippet, public key) and
// POST /api/v1/events (secret key). identify() upserts the contact and links the anonymous id, back-filling
// that visitor's earlier events; track() and page() land in campaign.tracked_events in one insert.

export const MAX_TRACK_BATCH = 50;
export const MAX_API_BATCH = 100;
const MAX_PROPERTIES_BYTES = 16_000;
const UTM_KEYS = ["source", "medium", "campaign", "term", "content"];

const str = (v, max = 2000) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const objectOr = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

function cleanName(value) {
  const name = String(value || "").replace(/[\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim();
  return name ? name.slice(0, 120) : null;
}

function cleanUrl(value) {
  const s = str(value, 2000);
  if (!s) return null;
  try {
    const u = new URL(s);
    return /^https?:$/.test(u.protocol) ? u.toString() : null;
  } catch {
    return null;
  }
}

function utmFrom(explicit, url) {
  const out = {};
  const given = objectOr(explicit);
  for (const key of UTM_KEYS) {
    const v = str(given[key] ?? given[`utm_${key}`], 200);
    if (v) out[key] = v;
  }
  if (Object.keys(out).length || !url) return out;
  try {
    const params = new URL(url).searchParams;
    for (const key of UTM_KEYS) {
      const v = str(params.get(`utm_${key}`), 200);
      if (v) out[key] = v;
    }
  } catch {
    // no query to read
  }
  return out;
}

function occurredAt(value, maxAgeDays) {
  const t = value ? Date.parse(value) : NaN;
  const now = Date.now();
  if (!Number.isFinite(t) || t > now + 5 * 60_000 || t < now - maxAgeDays * 86_400_000) return new Date(now).toISOString();
  return new Date(t).toISOString();
}

// Raw event (camelCase or snake_case keys) -> normalized event, or { error }.
function normalizeEvent(raw, { maxAgeDays }) {
  const e = objectOr(raw);
  const type = ["identify", "track", "page"].includes(e.type) ? e.type : e.event || e.name ? "track" : null;
  if (!type) return { error: "Each event needs a type (identify, track or page) or a name." };

  const traits = objectOr(e.traits);
  const properties = objectOr(e.properties);
  if (JSON.stringify(properties).length > MAX_PROPERTIES_BYTES) return { error: "properties is larger than 16 KB." };

  const url = cleanUrl(e.url ?? e.context?.page?.url ?? properties.url);
  const base = {
    type,
    anonymousId: str(e.anonymousId ?? e.anonymous_id, 200),
    contactId: str(e.contactId ?? e.contact_id, 64),
    email: normalizeEmail(e.email ?? traits.email),
    phone: normalizePhone(e.phone ?? traits.phone),
    occurredAt: occurredAt(e.timestamp ?? e.occurredAt ?? e.occurred_at, maxAgeDays),
    messageId: str(e.messageId ?? e.message_id, 120),
  };

  if (type === "identify") {
    if (!base.email && !base.phone) return { error: "identify needs an email or phone in traits." };
    return { ...base, traits };
  }

  const name = type === "page" ? "page_viewed" : cleanName(e.event ?? e.name);
  if (!name) return { error: "track needs an event name." };
  const revenue = Number(e.revenue ?? properties.revenue);
  const currency = str(e.currency ?? properties.currency, 3)?.toUpperCase() || null;
  const pageProps = type === "page" ? { title: str(e.title ?? properties.title, 500), path: str(e.path ?? properties.path, 1000) } : {};
  return {
    ...base,
    name,
    properties: { ...properties, ...Object.fromEntries(Object.entries(pageProps).filter(([, v]) => v)) },
    revenue: Number.isFinite(revenue) && (e.revenue != null || properties.revenue != null) ? revenue : null,
    currency: currency && /^[A-Z]{3}$/.test(currency) ? currency : null,
    url,
    referrer: cleanUrl(e.referrer ?? e.context?.page?.referrer),
    utm: utmFrom(e.utm, url),
  };
}

async function blockedNames(db, projectId) {
  const { data } = await db.from("event_definitions").select("name").eq("project_id", projectId).eq("status", "blocked").is("deleted_at", null);
  return new Set((data || []).map((d) => d.name));
}

async function linkAnonymous(db, projectId, anonymousId, contactId) {
  const now = new Date().toISOString();
  await db.from("tracking_identities").upsert({ project_id: projectId, anonymous_id: anonymousId, contact_id: contactId, last_seen_at: now }, { onConflict: "project_id,anonymous_id" });
  await db.from("tracked_events").update({ contact_id: contactId }).eq("project_id", projectId).eq("anonymous_id", anonymousId).is("contact_id", null);
}

// Contact ids for the batch's hints: anonymous ids via tracking_identities, emails / phones / ids via contacts.
async function resolveContacts(db, projectId, events, known) {
  const anon = [...new Set(events.filter((e) => e.anonymousId && !known.has(`a:${e.anonymousId}`)).map((e) => e.anonymousId))];
  const emails = [...new Set(events.filter((e) => !e.contactId && e.email).map((e) => e.email))];
  const phones = [...new Set(events.filter((e) => !e.contactId && !e.email && e.phone).map((e) => e.phone))];
  const ids = [...new Set(events.filter((e) => e.contactId).map((e) => e.contactId))].filter((id) => /^[0-9a-f-]{36}$/i.test(id));

  const [byAnon, byEmail, byPhone, byId] = await Promise.all([
    anon.length ? db.from("tracking_identities").select("anonymous_id, contact_id").eq("project_id", projectId).in("anonymous_id", anon) : { data: [] },
    emails.length ? db.from("contacts").select("id, email").eq("project_id", projectId).in("email", emails).is("deleted_at", null) : { data: [] },
    phones.length ? db.from("contacts").select("id, phone").eq("project_id", projectId).in("phone", phones).is("deleted_at", null) : { data: [] },
    ids.length ? db.from("contacts").select("id").eq("project_id", projectId).in("id", ids).is("deleted_at", null) : { data: [] },
  ]);
  for (const r of byAnon.data || []) known.set(`a:${r.anonymous_id}`, r.contact_id);
  for (const r of byEmail.data || []) known.set(`e:${r.email}`, r.id);
  for (const r of byPhone.data || []) known.set(`p:${r.phone}`, r.id);
  for (const r of byId.data || []) known.set(`i:${r.id}`, r.id);
  if (anon.length) await db.from("tracking_identities").update({ last_seen_at: new Date().toISOString() }).eq("project_id", projectId).in("anonymous_id", anon);
}

const contactFor = (e, known) =>
  (e.contactId && known.get(`i:${e.contactId}`)) ||
  (e.email && known.get(`e:${e.email}`)) ||
  (e.phone && known.get(`p:${e.phone}`)) ||
  (e.anonymousId && known.get(`a:${e.anonymousId}`)) ||
  null;

// -> { accepted, identified, contactsCreated, rejected: [{ index, error }] }
export async function ingestBatch(db, { projectId, source = "web", events = [], userAgent = null, library = null, maxAgeDays = 30, newContactStatus = "pending" }) {
  const rejected = [];
  const normalized = [];
  events.forEach((raw, index) => {
    const event = normalizeEvent(raw, { maxAgeDays });
    if (event.error) rejected.push({ index, error: event.error });
    else normalized.push({ ...event, index });
  });

  const known = new Map();
  let identified = 0;
  let contactsCreated = 0;

  // Identify calls run first, in order, so later events in the same batch attribute to the contact.
  for (const e of normalized.filter((x) => x.type === "identify")) {
    const traits = e.traits || {};
    const result = await upsertContact(db, projectId, {
      email: e.email,
      phone: e.phone,
      firstName: str(traits.firstName ?? traits.first_name, 200) ?? undefined,
      lastName: str(traits.lastName ?? traits.last_name, 200) ?? undefined,
      name: str(traits.name, 400) ?? undefined,
      attributes: traitsToAttributes(traits),
      tags: Array.isArray(traits.tags) ? traits.tags : [],
      subscribed: typeof traits.subscribed === "boolean" ? traits.subscribed : undefined,
      source,
      defaultStatus: newContactStatus,
    });
    if (result.error) {
      rejected.push({ index: e.index, error: result.error });
      continue;
    }
    identified += 1;
    if (result.created) contactsCreated += 1;
    const contactId = result.contact.id;
    if (e.email) known.set(`e:${e.email}`, contactId);
    if (e.phone) known.set(`p:${e.phone}`, contactId);
    if (e.anonymousId) {
      known.set(`a:${e.anonymousId}`, contactId);
      await linkAnonymous(db, projectId, e.anonymousId, contactId);
    }
  }

  const blocked = await blockedNames(db, projectId);
  const trackable = normalized.filter((e) => e.type !== "identify");
  for (const e of trackable) if (blocked.has(e.name)) rejected.push({ index: e.index, error: `${e.name} is blocked in Event Tracking.` });
  const toInsert = trackable.filter((e) => !blocked.has(e.name));
  if (toInsert.length) await resolveContacts(db, projectId, toInsert, known);

  const metadata = { ...(userAgent ? { user_agent: String(userAgent).slice(0, 300) } : {}), ...(library ? { library: String(library).slice(0, 60) } : {}) };
  const rows = toInsert.map((e) => ({
    project_id: projectId,
    contact_id: contactFor(e, known),
    anonymous_id: e.anonymousId,
    name: e.name,
    properties: e.properties,
    source,
    revenue: e.revenue,
    currency: e.currency,
    url: e.url,
    referrer: e.referrer,
    utm: e.utm,
    occurred_at: e.occurredAt,
    metadata: e.messageId ? { ...metadata, message_id: e.messageId } : metadata,
  }));

  if (rows.length) {
    const { error } = await db.from("tracked_events").insert(rows);
    if (error) {
      console.error("[tracking.insert]", error.message);
      for (const e of toInsert) rejected.push({ index: e.index, error: "Couldn't store the event." });
      return { accepted: 0, identified, contactsCreated, rejected };
    }
    const touched = [...new Set(rows.map((r) => r.contact_id).filter(Boolean))];
    if (touched.length) await db.from("contacts").update({ last_activity_at: new Date().toISOString() }).in("id", touched);
  }

  return { accepted: rows.length + identified, identified, contactsCreated, rejected: rejected.sort((a, b) => a.index - b.index) };
}

// Request body -> array of raw events: { batch: [...] }, { events: [...] }, [...] or one event.
export function eventsFromBody(body) {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.batch)) return body.batch;
  if (Array.isArray(body?.events)) return body.events;
  return body && typeof body === "object" ? [body] : [];
}
