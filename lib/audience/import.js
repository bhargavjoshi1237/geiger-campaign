// Contact import (server, any campaign-schema client): normalises a parsed CSV chunk, de-duplicates by
// email (then phone) within the file and the project, creates or merges contacts, adds list memberships
// and appends consent-ledger rows with the import as proof. Side effects (event log, webhooks) are injected
// by the caller so this module stays free of server-only imports.

import { CONTACT_STATUSES, CONSENT_CHANNELS, isValidEmail, normalizeEmail, normalizePhone } from "./contact_model.js";
import { chunk } from "./server_data.js";

export const MAX_IMPORT_ROWS = 5000;
const WRITE_CHUNK = 500;
const CONSENT_KEYS = new Set(CONSENT_CHANNELS.map((c) => c.key));

const clean = (v) => String(v ?? "").trim();
const tagList = (v) => (Array.isArray(v) ? v : String(v ?? "").split(/[,;|]/)).map((t) => clean(t)).filter(Boolean);

function mergeTags(...lists) {
  const seen = new Map();
  for (const t of lists.flat()) if (t && !seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t);
  return [...seen.values()];
}

// One input row -> a normalised record, or { error } explaining why it was skipped.
function normalizeRow(input, index) {
  const email = normalizeEmail(input.email);
  const phone = normalizePhone(input.phone);
  if (email && !isValidEmail(email)) return { error: `Row ${index + 1}: "${clean(input.email)}" isn't a valid email.` };
  if (!email && !phone) return { error: `Row ${index + 1}: needs an email or a phone number.` };
  let firstName = clean(input.firstName);
  let lastName = clean(input.lastName);
  if (!firstName && !lastName && clean(input.fullName)) {
    const parts = clean(input.fullName).split(/\s+/);
    firstName = parts.shift() || "";
    lastName = parts.join(" ");
  }
  const status = CONTACT_STATUSES.includes(clean(input.status).toLowerCase()) ? clean(input.status).toLowerCase() : null;
  const attributes = {};
  for (const [k, v] of Object.entries(input.attributes || {})) {
    if (/^[a-z][a-z0-9_]*$/.test(k) && v !== undefined && v !== null && clean(v) !== "") attributes[k] = v;
  }
  return {
    row: index + 1,
    email: email || null,
    phone: phone || null,
    firstName,
    lastName,
    tags: tagList(input.tags),
    attributes,
    status,
    timezone: clean(input.timezone) || null,
    locale: clean(input.locale) || null,
  };
}

async function findExisting(db, projectId, column, values) {
  const found = new Map();
  for (const part of chunk([...new Set(values.filter(Boolean))])) {
    const { data, error } = await db
      .from("contacts")
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .in(column, part);
    if (error) throw new Error(`[import.lookup] ${error.message}`);
    for (const row of data || []) {
      const key = column === "email" ? normalizeEmail(row.email) : row.phone;
      if (key && !found.has(key)) found.set(key, row);
    }
  }
  return found;
}

// rows: [{ email, phone, firstName, lastName, fullName, tags, status, timezone, locale, attributes }]
// options: { tags, listIds, updateExisting, status, consent: { channels, source, note }, fileName, userId, ip, userAgent }
export async function importContacts(db, projectId, rows = [], options = {}, { onCreated } = {}) {
  const result = { received: rows.length, created: 0, updated: 0, skipped: 0, invalid: 0, errors: [], memberships: 0, consents: 0 };
  const extraTags = tagList(options.tags);
  const defaultStatus = CONTACT_STATUSES.includes(options.status) ? options.status : "subscribed";
  const consentChannels = (options.consent?.channels || []).filter((c) => CONSENT_KEYS.has(c));
  const source = clean(options.source) || "import";

  // Normalise and merge duplicates inside the chunk (email wins, then phone).
  const byKey = new Map();
  rows.slice(0, MAX_IMPORT_ROWS).forEach((input, i) => {
    const rec = normalizeRow(input || {}, Number(input?.__row) > 0 ? Number(input.__row) - 1 : i);
    if (rec.error) {
      result.invalid += 1;
      if (result.errors.length < 50) result.errors.push(rec.error);
      return;
    }
    const key = rec.email ? `e:${rec.email}` : `p:${rec.phone}`;
    const prev = byKey.get(key);
    if (prev) {
      result.skipped += 1;
      byKey.set(key, {
        ...prev,
        ...Object.fromEntries(Object.entries(rec).filter(([, v]) => v !== null && v !== "" && !(Array.isArray(v) && !v.length))),
        tags: mergeTags(prev.tags, rec.tags),
        attributes: { ...prev.attributes, ...rec.attributes },
      });
    } else {
      byKey.set(key, rec);
    }
  });
  const records = [...byKey.values()];
  if (!records.length) return result;

  const existingByEmail = await findExisting(db, projectId, "email", records.map((r) => r.email));
  const existingByPhone = await findExisting(db, projectId, "phone", records.filter((r) => !r.email).map((r) => r.phone));

  const inserts = [];
  const updates = [];
  for (const rec of records) {
    const existing = rec.email ? existingByEmail.get(rec.email) : existingByPhone.get(rec.phone);
    if (!existing) {
      inserts.push({
        id: globalThis.crypto.randomUUID(),
        project_id: projectId,
        email: rec.email,
        phone: rec.phone,
        first_name: rec.firstName,
        last_name: rec.lastName,
        status: rec.status && rec.status !== "subscribed" ? rec.status : defaultStatus,
        source,
        tags: mergeTags(rec.tags, extraTags),
        attributes: rec.attributes,
        timezone: rec.timezone,
        locale: rec.locale,
        unsubscribed_at: rec.status === "unsubscribed" ? new Date().toISOString() : null,
        created_by: options.userId || null,
        metadata: options.fileName ? { importedFrom: options.fileName } : {},
      });
      continue;
    }
    if (!options.updateExisting) {
      result.skipped += 1;
      continue;
    }
    // Merge: fill in what the file has, never resubscribe someone who opted out.
    const nextStatus = rec.status === "unsubscribed" ? "unsubscribed" : existing.status;
    updates.push({
      id: existing.id,
      project_id: projectId,
      email: existing.email ?? rec.email,
      phone: rec.phone || existing.phone,
      first_name: rec.firstName || existing.first_name || "",
      last_name: rec.lastName || existing.last_name || "",
      status: nextStatus,
      source: existing.source || source,
      tags: mergeTags(existing.tags || [], rec.tags, extraTags),
      attributes: { ...(existing.attributes || {}), ...rec.attributes },
      timezone: rec.timezone || existing.timezone,
      locale: rec.locale || existing.locale,
      unsubscribed_at: nextStatus === "unsubscribed" ? existing.unsubscribed_at || new Date().toISOString() : existing.unsubscribed_at,
      created_by: existing.created_by,
      metadata: existing.metadata || {},
    });
  }

  const touched = [];
  const createdRows = [];
  for (const part of chunk(inserts, WRITE_CHUNK)) {
    const { data, error } = await db.from("contacts").insert(part).select("*");
    if (error) throw new Error(`[import.insert] ${error.message}`);
    result.created += (data || []).length;
    touched.push(...(data || []));
    createdRows.push(...(data || []));
  }
  for (const part of chunk(updates, WRITE_CHUNK)) {
    const { data, error } = await db.from("contacts").upsert(part, { onConflict: "id" }).select("id, status");
    if (error) throw new Error(`[import.update] ${error.message}`);
    result.updated += (data || []).length;
    touched.push(...(data || []));
  }

  const listIds = (options.listIds || []).filter(Boolean);
  if (listIds.length && touched.length) {
    const { data: lists, error } = await db.from("lists").select("id").eq("project_id", projectId).is("deleted_at", null).in("id", listIds);
    if (error) throw new Error(`[import.lists] ${error.message}`);
    const members = [];
    for (const list of lists || []) {
      for (const c of touched) {
        members.push({
          project_id: projectId,
          list_id: list.id,
          contact_id: c.id,
          status: c.status === "subscribed" ? "subscribed" : c.status === "pending" ? "pending" : "unsubscribed",
          source: "import",
          deleted_at: null,
          created_by: options.userId || null,
        });
      }
    }
    for (const part of chunk(members, WRITE_CHUNK)) {
      const { error: memberError } = await db.from("list_members").upsert(part, { onConflict: "list_id,contact_id" });
      if (memberError) throw new Error(`[import.members] ${memberError.message}`);
      result.memberships += part.length;
    }
  }

  // Consent ledger rows: only for people still reachable (never re-opt-in an unsubscribed contact).
  if (consentChannels.length) {
    const capturedAt = new Date().toISOString();
    const consentRows = [];
    for (const c of touched) {
      if (c.status !== "subscribed" && c.status !== "pending") continue;
      for (const channel of consentChannels) {
        consentRows.push({
          project_id: projectId,
          contact_id: c.id,
          channel,
          status: "opted_in",
          source: clean(options.consent?.source) || (options.fileName ? `Import: ${options.fileName}` : "Import"),
          proof: {
            method: "import",
            file_name: options.fileName || null,
            attested_by: options.userId || null,
            note: clean(options.consent?.note) || null,
          },
          ip: options.ip || null,
          user_agent: options.userAgent || null,
          captured_at: capturedAt,
          created_by: options.userId || null,
        });
      }
    }
    for (const part of chunk(consentRows, WRITE_CHUNK)) {
      const { error } = await db.from("contact_consents").insert(part);
      if (error) throw new Error(`[import.consents] ${error.message}`);
      result.consents += part.length;
    }
  }

  if (onCreated && createdRows.length) await onCreated(createdRows);
  return result;
}
