import { emitWebhook } from "@/lib/webhooks/emit";

// Server-side contact upsert for ingest and the developer API (admin db). Matches on email, then phone;
// merges attributes and tags instead of replacing them; emits contact.created / contact.unsubscribed.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STATUSES = new Set(["subscribed", "unsubscribed", "bounced", "complained", "pending"]);
const RESERVED_TRAITS = new Set(["email", "phone", "firstName", "first_name", "lastName", "last_name", "name", "subscribed", "tags", "status"]);

export function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return EMAIL.test(email) && email.length <= 320 ? email : null;
}

export function normalizePhone(value) {
  const phone = String(value || "").replace(/[\s().-]/g, "");
  return /^\+?[0-9]{7,15}$/.test(phone) ? phone : null;
}

// Free-form traits -> attribute bag: scalar values under safe keys, at most 50 of them.
export function traitsToAttributes(traits = {}) {
  const out = {};
  for (const [key, value] of Object.entries(traits || {})) {
    if (RESERVED_TRAITS.has(key) || !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(key)) continue;
    if (value === null || ["string", "number", "boolean"].includes(typeof value)) out[key] = typeof value === "string" ? value.slice(0, 1000) : value;
    if (Object.keys(out).length >= 50) break;
  }
  return out;
}

// The public API shape of a contact.
export function serializeContact(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email ?? null,
    phone: row.phone ?? null,
    first_name: row.first_name ?? "",
    last_name: row.last_name ?? "",
    status: row.status,
    source: row.source,
    tags: row.tags || [],
    attributes: row.attributes || {},
    lead_score: row.lead_score ?? 0,
    timezone: row.timezone ?? null,
    locale: row.locale ?? null,
    last_activity_at: row.last_activity_at ?? null,
    unsubscribed_at: row.unsubscribed_at ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function findContact(db, projectId, { email, phone }) {
  if (email) {
    const { data } = await db.from("contacts").select("*").eq("project_id", projectId).eq("email", email).is("deleted_at", null).maybeSingle();
    if (data) return data;
  }
  if (phone) {
    const { data } = await db.from("contacts").select("*").eq("project_id", projectId).eq("phone", phone).is("deleted_at", null).order("created_at").limit(1);
    if (data?.[0]) return data[0];
  }
  return null;
}

function splitName(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  return { first: parts[0] || "", last: parts.slice(1).join(" ") };
}

// input: { email, phone, firstName, lastName, name, attributes, tags, status, subscribed, source, defaultStatus, timezone, locale }
// -> { contact, created } or { error }
export async function upsertContact(db, projectId, input) {
  const email = normalizeEmail(input.email);
  const phone = normalizePhone(input.phone);
  if (!email && !phone) return { error: "An email address or phone number is required." };
  if (input.email && !email) return { error: "That email address isn't valid." };

  const named = input.name ? splitName(input.name) : { first: "", last: "" };
  const firstName = String(input.firstName ?? named.first ?? "").trim().slice(0, 200);
  const lastName = String(input.lastName ?? named.last ?? "").trim().slice(0, 200);
  const attributes = input.attributes && typeof input.attributes === "object" ? input.attributes : {};
  const tags = Array.isArray(input.tags) ? [...new Set(input.tags.map((t) => String(t).trim()).filter(Boolean))].slice(0, 100) : [];
  const explicitStatus = STATUSES.has(input.status) ? input.status : null;
  const now = new Date().toISOString();

  let existing = await findContact(db, projectId, { email, phone });
  let created = false;
  let row = existing;

  if (!existing) {
    const status = explicitStatus || (input.subscribed === true ? "subscribed" : input.subscribed === false ? "unsubscribed" : input.defaultStatus || "subscribed");
    const { data, error } = await db
      .from("contacts")
      .insert({
        project_id: projectId,
        email,
        phone,
        first_name: firstName,
        last_name: lastName,
        status,
        source: input.source || "api",
        tags,
        attributes,
        timezone: input.timezone || null,
        locale: input.locale || null,
        unsubscribed_at: status === "unsubscribed" ? now : null,
        last_activity_at: now,
      })
      .select("*")
      .single();
    if (error) {
      // Lost a race with a concurrent insert of the same email: fall through to the update path.
      if (error.code !== "23505") return { error: error.message };
      existing = await findContact(db, projectId, { email, phone });
      if (!existing) return { error: error.message };
    } else {
      row = data;
      created = true;
    }
  }

  let unsubscribed = false;
  if (existing) {
    const patch = {};
    if (firstName && firstName !== existing.first_name) patch.first_name = firstName;
    if (lastName && lastName !== existing.last_name) patch.last_name = lastName;
    if (email && !existing.email) patch.email = email;
    if (phone && !existing.phone) patch.phone = phone;
    if (Object.keys(attributes).length) patch.attributes = { ...(existing.attributes || {}), ...attributes };
    if (tags.length) patch.tags = [...new Set([...(existing.tags || []), ...tags])];
    if (input.timezone) patch.timezone = input.timezone;
    if (input.locale) patch.locale = input.locale;
    let nextStatus = explicitStatus;
    if (!nextStatus && input.subscribed === true && existing.status === "pending") nextStatus = "subscribed";
    if (!nextStatus && input.subscribed === false && existing.status === "subscribed") nextStatus = "unsubscribed";
    if (nextStatus && nextStatus !== existing.status) {
      patch.status = nextStatus;
      if (nextStatus === "unsubscribed") {
        patch.unsubscribed_at = now;
        unsubscribed = true;
      }
    }
    patch.last_activity_at = now;
    const { data, error } = await db.from("contacts").update(patch).eq("id", existing.id).select("*").single();
    if (error) return { error: error.message };
    row = data;
  }

  if (created) await emitWebhook(db, projectId, "contact.created", { contact: serializeContact(row) });
  if (unsubscribed) await emitWebhook(db, projectId, "contact.unsubscribed", { contact: serializeContact(row), channel: "email" });
  return { contact: row, created };
}
