// Meta Lead Ads (server-only): handles a `leadgen` webhook change — fetches the lead from the Graph API,
// maps form answers to contact fields per the form mapping, upserts the contact + consent, records
// `lead_captured`, and routes it into the configured list/automation. Also syncs forms from pages
// (subscribing each page to the leadgen field) and backfills past leads.

import { graphRequest } from "@/lib/social/meta_graph";
import { recordEvent } from "@/lib/events/record";
import { emitWebhook } from "@/lib/webhooks/emit";
import { defaultLeadMapping } from "./catalog";
import { listConnectedAccounts, resolvePageToken } from "./accounts";
import { graphAll, graphErrorMessage } from "./meta_ads";

const LEAD_FIELDS = "id,created_time,ad_id,ad_name,adset_id,campaign_id,form_id,field_data,custom_disclaimer_responses,is_organic,platform";
const FORM_FIELDS = "id,name,status,locale,leads_count,questions{key,label,type,options},legal_content{custom_disclaimer{checkboxes{key,is_required,text}}}";
const YES = new Set(["yes", "true", "1", "y", "si", "sí", "oui", "ja", "sim", "agree", "i agree", "accept"]);

const bag = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
const first = (field) => (Array.isArray(field?.values) ? field.values[0] : field?.values) ?? "";

// field_data -> { email, phone, firstName, lastName, attributes } using the form's mapping.
export function mapLeadFields(lead, mapping = {}) {
  const out = { email: "", phone: "", firstName: "", lastName: "", attributes: {}, answers: {} };
  const effective = { ...defaultLeadMapping((lead.field_data || []).map((f) => ({ key: f.name }))), ...bag(mapping) };
  for (const field of lead.field_data || []) {
    const value = String(first(field) ?? "").trim();
    out.answers[field.name] = value;
    const target = effective[field.name];
    if (!value || !target || target === "ignore") continue;
    if (target === "email") out.email = value.toLowerCase();
    else if (target === "phone") out.phone = value.replace(/[^\d+]/g, "");
    else if (target === "firstName") out.firstName = value;
    else if (target === "lastName") out.lastName = value;
    else if (target === "fullName") {
      const [head, ...rest] = value.split(/\s+/);
      out.firstName ||= head || "";
      out.lastName ||= rest.join(" ");
    } else if (target.startsWith("attributes.")) out.attributes[target.slice("attributes.".length)] = value;
  }
  return out;
}

// Consent rows the lead proves: checked disclaimer boxes and yes-answers on questions mapped to a channel.
export function leadConsents(lead, form) {
  const checked = new Map((lead.custom_disclaimer_responses || []).map((r) => [String(r.checkbox_key), r.is_checked === true || r.is_checked === "1" || r.is_checked === 1]));
  const answers = new Map((lead.field_data || []).map((f) => [f.name, String(first(f) ?? "").trim().toLowerCase()]));
  const texts = new Map((form.consent_checkboxes || []).map((c) => [String(c.key), c.text || ""]));
  const out = [];
  for (const entry of form.consent_mapping || []) {
    if (!entry?.channel || !entry?.source) continue;
    const [kind, key] = String(entry.source).split(/:(.*)/s);
    const given = kind === "checkbox" ? checked.get(key) === true : YES.has(answers.get(key) || "");
    if (given) out.push({ channel: entry.channel, source: entry.source, key, text: kind === "checkbox" ? texts.get(key) || "" : key });
  }
  return out;
}

async function findContact(db, projectId, { email, phone }) {
  if (email) {
    const { data } = await db.from("contacts").select("*").eq("project_id", projectId).eq("email", email).is("deleted_at", null).limit(1).maybeSingle();
    if (data) return data;
  }
  if (phone) {
    const { data } = await db.from("contacts").select("*").eq("project_id", projectId).eq("phone", phone).is("deleted_at", null).limit(1).maybeSingle();
    if (data) return data;
  }
  return null;
}

// Creates or enriches the contact for a lead; never overwrites values the contact already has.
async function upsertLeadContact(db, projectId, form, fields, lead) {
  const tags = Array.isArray(form.tags) ? form.tags : [];
  const existing = await findContact(db, projectId, fields);
  if (existing) {
    const patch = {
      email: existing.email || fields.email || null,
      phone: existing.phone || fields.phone || null,
      first_name: existing.first_name || fields.firstName,
      last_name: existing.last_name || fields.lastName,
      tags: [...new Set([...(existing.tags || []), ...tags])],
      attributes: { ...fields.attributes, ...bag(existing.attributes) },
      metadata: { ...bag(existing.metadata), leadAds: { ...bag(bag(existing.metadata).leadAds), lastLeadId: lead.id, lastFormId: form.external_form_id } },
    };
    const { error } = await db.from("contacts").update(patch).eq("id", existing.id);
    if (error) console.error("[ads.leads.updateContact]", error.message);
    return { contactId: existing.id, created: false };
  }
  const row = {
    project_id: projectId,
    email: fields.email || null,
    phone: fields.phone || null,
    first_name: fields.firstName,
    last_name: fields.lastName,
    status: "subscribed",
    source: "lead_ads",
    tags,
    attributes: fields.attributes,
    metadata: { leadAds: { firstLeadId: lead.id, lastLeadId: lead.id, lastFormId: form.external_form_id } },
  };
  const { data, error } = await db.from("contacts").insert(row).select("id").single();
  if (error) {
    // A concurrent insert of the same email wins; use that row.
    const again = await findContact(db, projectId, fields);
    if (again) return { contactId: again.id, created: false };
    console.error("[ads.leads.createContact]", error.message);
    return { contactId: null, created: false };
  }
  return { contactId: data.id, created: true };
}

async function alreadyCaptured(db, projectId, leadgenId) {
  const { data } = await db
    .from("tracked_events")
    .select("id, contact_id")
    .eq("project_id", projectId)
    .eq("name", "lead_captured")
    .eq("properties->>leadgenId", String(leadgenId))
    .limit(1)
    .maybeSingle();
  return data || null;
}

// Lands one fetched lead: contact, lists, consents, tracked event, webhooks. Idempotent per leadgen id.
export async function processLead(db, { projectId, form, lead, pageId }) {
  const duplicate = await alreadyCaptured(db, projectId, lead.id);
  if (duplicate) return { handled: true, duplicate: true, contactId: duplicate.contact_id };
  const fields = mapLeadFields(lead, form.mapping);
  if (!fields.email && !fields.phone) return { handled: false, reason: "The lead has no email or phone mapped." };

  const { contactId, created } = await upsertLeadContact(db, projectId, form, fields, lead);
  if (!contactId) return { handled: false, reason: "Couldn't save the contact." };
  const capturedAt = lead.created_time ? new Date(lead.created_time).toISOString() : new Date().toISOString();

  const listIds = Array.isArray(form.list_ids) ? form.list_ids : [];
  if (listIds.length) {
    const { error } = await db.from("list_members").upsert(
      listIds.map((listId) => ({ project_id: projectId, list_id: listId, contact_id: contactId, status: "subscribed", source: "lead_ads", deleted_at: null })),
      { onConflict: "list_id,contact_id" },
    );
    if (error) console.error("[ads.leads.lists]", error.message);
  }

  const consents = leadConsents(lead, form);
  if (consents.length) {
    const { error } = await db.from("contact_consents").insert(
      consents.map((c) => ({
        project_id: projectId,
        contact_id: contactId,
        channel: c.channel,
        status: "opted_in",
        source: `Meta lead form: ${form.name}`,
        proof: { method: "meta_lead_form", form_id: form.external_form_id, lead_id: lead.id, page_id: pageId, consent_source: c.source, text: c.text, ad_id: lead.ad_id || null },
        captured_at: capturedAt,
      })),
    );
    if (error) console.error("[ads.leads.consents]", error.message);
  }

  const properties = {
    leadgenId: String(lead.id),
    formId: form.external_form_id,
    formName: form.name,
    pageId: pageId || form.fb_page_id || null,
    adId: lead.ad_id || null,
    adName: lead.ad_name || null,
    adsetId: lead.adset_id || null,
    campaignId: lead.campaign_id || null,
    platform: lead.platform || null,
    isOrganic: Boolean(lead.is_organic),
    newContact: created,
  };
  await recordEvent(db, { projectId, contactId, name: "lead_captured", properties, source: "social", occurredAt: capturedAt });
  await emitWebhook(db, projectId, "form.submitted", { source: "meta_lead_ads", contactId, ...properties, answers: fields.answers });
  if (created) await emitWebhook(db, projectId, "contact.created", { contactId, source: "lead_ads", email: fields.email || null, phone: fields.phone || null });

  await db
    .from("lead_forms")
    .update({ leads_count: (form.leads_count || 0) + 1, last_lead_at: capturedAt, last_error: null })
    .eq("id", form.id);
  form.leads_count = (form.leads_count || 0) + 1;
  return { handled: true, duplicate: false, contactId, created };
}

// The lead_forms row for a form id, created on first sight with default mapping so no lead is dropped.
async function formRow(db, projectId, { formId, pageId }) {
  const { data: existing } = await db
    .from("lead_forms")
    .select("*")
    .eq("project_id", projectId)
    .eq("external_form_id", String(formId))
    .maybeSingle();
  if (existing && !existing.deleted_at) return existing;
  if (existing?.deleted_at) return null;
  const { data } = await db
    .from("lead_forms")
    .insert({ project_id: projectId, external_form_id: String(formId), fb_page_id: pageId ? String(pageId) : "", name: `Form ${formId}`, metadata: { autoCreated: true } })
    .select("*")
    .single();
  return data || null;
}

export async function handleLeadgenEvent(db, { projectId, connection, leadgenId, formId, adId, pageId, createdTime }) {
  if (!db || !projectId || !leadgenId) return { handled: false, contactId: null };
  try {
    const duplicate = await alreadyCaptured(db, projectId, leadgenId);
    if (duplicate) return { handled: true, contactId: duplicate.contact_id };
    const token = await resolvePageToken(db, projectId, pageId, connection);
    if (!token) {
      console.error("[ads.leads] no page token for", pageId);
      return { handled: false, contactId: null };
    }
    const res = await graphRequest(String(leadgenId), { token, query: { fields: LEAD_FIELDS } });
    if (!res.ok) {
      console.error("[ads.leads.fetch]", graphErrorMessage(res));
      return { handled: false, contactId: null };
    }
    const lead = { ad_id: adId || null, created_time: createdTime ? new Date(Number(createdTime) * 1000 || createdTime).toISOString() : null, ...res.data };
    const form = await formRow(db, projectId, { formId: lead.form_id || formId, pageId });
    if (!form || form.status === "paused") return { handled: false, contactId: null };
    const result = await processLead(db, { projectId, form, lead, pageId });
    return { handled: Boolean(result.handled), contactId: result.contactId || null };
  } catch (e) {
    console.error("[ads.leads.handle]", e);
    return { handled: false, contactId: null };
  }
}

// Adds the leadgen field to the app's page subscription without dropping fields other features subscribed.
async function subscribePageToLeadgen(pageId, pageToken) {
  const current = await graphRequest(`${pageId}/subscribed_apps`, { token: pageToken });
  const mine = (current.data?.data || []).find((app) => String(app.id) === String(process.env.META_APP_ID));
  const fields = new Set([...(mine?.subscribed_fields || []), "leadgen"]);
  const res = await graphRequest(`${pageId}/subscribed_apps`, {
    token: pageToken,
    method: "POST",
    query: { subscribed_fields: [...fields].join(",") },
  });
  return res.ok;
}

const formQuestions = (form) =>
  (form.questions || []).map((q) => ({ key: q.key, label: q.label || q.key, type: q.type || "CUSTOM", options: (q.options || []).map((o) => o.value ?? o.key ?? o) }));

// Pulls every lead form from the pages of the project's connected ad accounts and upserts lead_forms,
// keeping each form's saved mapping (new questions get default targets).
export async function syncLeadForms(db, projectId, { accountId = null } = {}) {
  const accounts = (await listConnectedAccounts(db, projectId)).filter((a) => !accountId || a.id === accountId);
  const summary = { forms: 0, pages: 0, subscribed: 0, errors: [] };
  const seenPages = new Set();
  for (const account of accounts) {
    for (const page of account.pages || []) {
      if (seenPages.has(page.id)) continue;
      seenPages.add(page.id);
      const token = await resolvePageToken(db, projectId, page.id, null);
      if (!token) {
        summary.errors.push(`${page.name || page.id}: no page token`);
        continue;
      }
      summary.pages += 1;
      const res = await graphAll(`${page.id}/leadgen_forms`, { token, query: { fields: FORM_FIELDS }, max: 500 });
      if (!res.ok) {
        summary.errors.push(`${page.name || page.id}: ${res.error}`);
        continue;
      }
      if (process.env.META_APP_ID && (await subscribePageToLeadgen(page.id, token))) summary.subscribed += 1;
      const ids = res.rows.map((f) => String(f.id));
      const { data: existingRows } = ids.length
        ? await db.from("lead_forms").select("*").eq("project_id", projectId).in("external_form_id", ids)
        : { data: [] };
      const existing = new Map((existingRows || []).map((r) => [r.external_form_id, r]));
      const rows = res.rows.map((f) => {
        const prev = existing.get(String(f.id));
        const questions = formQuestions(f);
        return {
          project_id: projectId,
          ad_account_id: prev?.ad_account_id || account.id,
          external_form_id: String(f.id),
          fb_page_id: String(page.id),
          page_name: page.name || "",
          name: f.name || `Form ${f.id}`,
          form_status: f.status || "ACTIVE",
          locale: f.locale || "",
          questions,
          consent_checkboxes: (f.legal_content?.custom_disclaimer?.checkboxes || []).map((c) => ({ key: String(c.key), text: c.text || "", required: Boolean(c.is_required) })),
          mapping: { ...defaultLeadMapping(questions), ...bag(prev?.mapping) },
          last_synced_at: new Date().toISOString(),
          ...(prev ? {} : { status: "active" }),
        };
      });
      if (rows.length) {
        const { error } = await db.from("lead_forms").upsert(rows, { onConflict: "project_id,external_form_id" });
        if (error) summary.errors.push(`${page.name || page.id}: ${error.message}`);
        else summary.forms += rows.length;
      }
    }
  }
  return summary;
}

// Re-reads leads Meta still holds (90 days) for one form and lands the ones Campaign hasn't seen.
export async function backfillLeads(db, projectId, form, { days = 90, max = 2000 } = {}) {
  const pageId = form.fb_page_id;
  const token = await resolvePageToken(db, projectId, pageId, null);
  if (!token) return { ok: false, error: "No page token for this form's page — reconnect the ad account." };
  const since = Math.floor((Date.now() - Math.min(90, Math.max(1, days)) * 86_400_000) / 1000);
  const res = await graphAll(`${form.external_form_id}/leads`, {
    token,
    query: { fields: LEAD_FIELDS, filtering: JSON.stringify([{ field: "time_created", operator: "GREATER_THAN", value: since }]) },
    max,
  });
  if (!res.ok) return { ok: false, error: graphErrorMessage(res, "Couldn't read the form's leads.") };
  const summary = { ok: true, fetched: res.rows.length, created: 0, updated: 0, duplicates: 0, failed: 0 };
  for (const lead of res.rows) {
    const result = await processLead(db, { projectId, form, lead, pageId });
    if (result.duplicate) summary.duplicates += 1;
    else if (!result.handled) summary.failed += 1;
    else if (result.created) summary.created += 1;
    else summary.updated += 1;
  }
  await db.from("lead_forms").update({ last_backfill_at: new Date().toISOString() }).eq("id", form.id);
  return summary;
}
