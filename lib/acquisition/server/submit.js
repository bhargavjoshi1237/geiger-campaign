import { recordEvent } from "@/lib/events/record";
import { emitWebhook } from "@/lib/webhooks/emit";
import { ApiError, notFound } from "@/lib/server/http";
import { loadBrandKit } from "@/lib/content/brand_server";
import { contactFromValues, validateSubmission } from "../fields";
import { cleanUtm, parseUtm } from "../tracking";
import { bump, loadForm } from "./loaders";
import { submissionThrottled } from "./throttle";
import { cleanText, cleanUrl, isUuid } from "./request";
import { sendDoubleOptIn } from "./double_opt_in";

// Public form submission (service-role db): validate against the form's field config, stop bots and
// bursts, upsert the contact by email (or phone), subscribe it to the configured lists, apply tags,
// write one consent-ledger row per consented channel with proof, run double opt-in, then record the
// form_submitted event and the form.submitted webhook. Server-only; the route stays a thin wrapper.

const bag = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
const SUPPRESSED = new Set(["bounced", "complained"]);
const escapeLike = (v) => v.replace(/[\\%_]/g, (c) => `\\${c}`);

async function findContact(db, projectId, { email, phone }) {
  if (email) {
    const { data } = await db
      .from("contacts")
      .select("*")
      .eq("project_id", projectId)
      .ilike("email", escapeLike(email))
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();
    if (data) return data;
  }
  if (!email && phone) {
    const { data } = await db
      .from("contacts")
      .select("*")
      .eq("project_id", projectId)
      .eq("phone", phone)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();
    if (data) return data;
  }
  return null;
}

function nextStatus(current, { doubleOptIn, emailConsent }) {
  if (SUPPRESSED.has(current)) return current;
  if (current === "subscribed") return current;
  if (doubleOptIn) return "pending";
  if (current === "unsubscribed") return emailConsent ? "subscribed" : current;
  return "subscribed";
}

// { contact, created }: inserts a new contact or fills gaps on the existing one (never overwrites data).
async function upsertContact(db, form, person, { tags, doubleOptIn, emailConsent, acquisition }) {
  const projectId = form.projectId;
  let existing = await findContact(db, projectId, person);

  if (!existing) {
    const insert = {
      project_id: projectId,
      email: person.email || null,
      phone: person.phone || null,
      first_name: person.firstName || "",
      last_name: person.lastName || "",
      attributes: person.attributes,
      tags,
      status: doubleOptIn && person.email ? "pending" : "subscribed",
      source: "form",
      last_activity_at: new Date().toISOString(),
      metadata: { acquisition },
    };
    const { data, error } = await db.from("contacts").insert(insert).select("*").single();
    if (!error) return { contact: data, created: true };
    if (error.code !== "23505") throw new ApiError(500, "Couldn't save your details. Try again.", "contact_failed");
    existing = await findContact(db, projectId, person);
    if (!existing) throw new ApiError(500, "Couldn't save your details. Try again.", "contact_failed");
  }

  const meta = bag(existing.metadata);
  const status = nextStatus(existing.status, { doubleOptIn: doubleOptIn && Boolean(existing.email || person.email), emailConsent });
  const patch = {
    attributes: { ...bag(existing.attributes), ...person.attributes },
    tags: [...new Set([...(existing.tags || []), ...tags])],
    metadata: { ...meta, acquisition: meta.acquisition || acquisition, lastForm: { formId: form.id, at: acquisition.at } },
  };
  if (!existing.first_name && person.firstName) patch.first_name = person.firstName;
  if (!existing.last_name && person.lastName) patch.last_name = person.lastName;
  if (!existing.phone && person.phone) patch.phone = person.phone;
  if (!existing.email && person.email) patch.email = person.email;
  if (status !== existing.status) {
    patch.status = status;
    if (status === "subscribed") patch.unsubscribed_at = null;
  }
  const { data, error } = await db.from("contacts").update(patch).eq("id", existing.id).select("*").single();
  if (error) throw new ApiError(500, "Couldn't save your details. Try again.", "contact_failed");
  return { contact: data, created: false };
}

async function subscribeToLists(db, form, contactId, pending) {
  const ids = (form.settings.listIds || []).filter(isUuid);
  if (!ids.length) return [];
  const { data: lists } = await db
    .from("lists")
    .select("id")
    .eq("project_id", form.projectId)
    .in("id", ids)
    .is("deleted_at", null);
  const valid = (lists || []).map((l) => l.id);
  if (!valid.length) return [];
  const { data: current } = await db.from("list_members").select("list_id, status").eq("contact_id", contactId).in("list_id", valid);
  const subscribed = new Set((current || []).filter((m) => m.status === "subscribed").map((m) => m.list_id));
  const rows = valid.map((listId) => ({
    project_id: form.projectId,
    list_id: listId,
    contact_id: contactId,
    status: subscribed.has(listId) ? "subscribed" : pending ? "pending" : "subscribed",
    source: "form",
    deleted_at: null,
    metadata: { formId: form.id },
  }));
  const { error } = await db.from("list_members").upsert(rows, { onConflict: "list_id,contact_id" });
  if (error) console.error("[acquisition.submit.lists]", error.message);
  return valid;
}

async function attributedId(db, table, id, projectId) {
  if (!isUuid(id)) return null;
  const { data } = await db.from(table).select("id").eq("id", id).eq("project_id", projectId).is("deleted_at", null).maybeSingle();
  return data?.id || null;
}

// Returns { ok: true, … } or { ok: false, status, error, fieldErrors }; throws ApiError for hard failures.
export async function submitForm(db, { formId, body, ip, userAgent }) {
  const form = await loadForm(db, formId);
  if (!form) throw notFound("This form doesn't exist.");
  if (form.status !== "live") return { ok: false, status: 409, error: "This form isn't accepting submissions right now." };

  const settings = form.settings;
  // Honeypot: humans never see this field, bots fill it. Answer as if it worked and store nothing.
  if (cleanText(body?._gc_hp)) return { ok: true, message: settings.successMessage, redirectUrl: settings.redirectUrl || "" };
  if (await submissionThrottled(db, { ip, formId: form.id })) {
    return { ok: false, status: 429, error: "Too many submissions from your network. Try again in a few minutes." };
  }

  const sourceUrl = cleanUrl(body?._gc_url) || cleanUrl(body?.sourceUrl);
  const referrer = cleanUrl(body?._gc_ref) || cleanUrl(body?.referrer);
  const pageUtm = cleanUtm({ ...parseUtm(sourceUrl || ""), ...bag(body?.utm) });
  const input = body?.fields && typeof body.fields === "object" ? body.fields : body || {};
  const { values, consent: explicitConsent, utm, errors } = validateSubmission(form.fields, input, { pageUtm });
  if (Object.keys(errors).length) return { ok: false, status: 422, error: "Check the highlighted fields.", fieldErrors: errors };

  const person = contactFromValues(form.fields, values);
  if (!person.email && !person.phone) return { ok: false, status: 422, error: "An email address or phone number is required." };

  // Submitting records consent for the form's declared channels; explicit consent checkboxes win.
  const consent = {};
  if (settings.consentText) for (const ch of settings.consentChannels || []) consent[ch] = true;
  Object.assign(consent, explicitConsent);

  const now = new Date().toISOString();
  const landingPageId = await attributedId(db, "landing_pages", body?.landingPageId, form.projectId);
  const popupId = await attributedId(db, "popups", body?.popupId, form.projectId);
  const doubleOptIn = Boolean(settings.doubleOptIn);
  const acquisition = { formId: form.id, landingPageId, popupId, utm, sourceUrl, at: now };
  const tags = (settings.tags || []).map((t) => String(t).trim()).filter(Boolean);

  const { contact, created } = await upsertContact(db, form, person, { tags, doubleOptIn, emailConsent: Boolean(consent.email), acquisition });
  const needsConfirmation = doubleOptIn && contact.status === "pending" && Boolean(contact.email);

  const { data: submission, error: subError } = await db
    .from("form_submissions")
    .insert({
      project_id: form.projectId,
      form_id: form.id,
      contact_id: contact.id,
      landing_page_id: landingPageId,
      popup_id: popupId,
      status: needsConfirmation ? "pending_confirmation" : "received",
      data: values,
      consent,
      source_url: sourceUrl,
      referrer,
      utm,
      ip,
      user_agent: userAgent,
    })
    .select("id")
    .single();
  if (subError) throw new ApiError(500, "Couldn't save your submission. Try again.", "submission_failed");

  const listIds = await subscribeToLists(db, form, contact.id, needsConfirmation);

  const consentRows = Object.entries(consent)
    .filter(([, given]) => given)
    .map(([channel]) => ({
      project_id: form.projectId,
      contact_id: contact.id,
      channel,
      status: channel === "email" && needsConfirmation ? "pending" : "opted_in",
      source: "form",
      proof: {
        method: channel in explicitConsent ? "checkbox" : "form_submit",
        formId: form.id,
        formName: form.name,
        consentText:
          form.fields.find((f) => f.type === "consent" && f.channel === channel)?.label || settings.consentText || "",
        sourceUrl,
        submissionId: submission.id,
        capturedAt: now,
      },
      ip,
      user_agent: userAgent,
      captured_at: now,
    }));
  if (consentRows.length) {
    const { error } = await db.from("contact_consents").insert(consentRows);
    if (error) console.error("[acquisition.submit.consents]", error.message);
  }

  await bump(db, "forms", form.id, "submission_count");
  await db.from("forms").update({ last_submission_at: now }).eq("id", form.id);
  if (landingPageId) await bump(db, "landing_pages", landingPageId, "conversions");
  if (popupId) await bump(db, "popups", popupId, "conversions");

  let confirmation = null;
  if (needsConfirmation) {
    const brand = await loadBrandKit(db, form.projectId);
    confirmation = await sendDoubleOptIn(db, { form, contact, submissionId: submission.id, brand });
    if (confirmation?.status !== "sent" && confirmation?.status !== "delivered") {
      console.error("[acquisition.submit.doi]", confirmation?.error || confirmation?.status);
    }
  }

  await recordEvent(db, {
    projectId: form.projectId,
    contactId: contact.id,
    name: "form_submitted",
    properties: { formId: form.id, formName: form.name, submissionId: submission.id, landingPageId, popupId, listIds, created },
    source: "form",
    url: sourceUrl,
    referrer,
    utm,
  });

  const contactView = {
    id: contact.id,
    email: contact.email,
    phone: contact.phone,
    firstName: contact.first_name,
    lastName: contact.last_name,
    status: contact.status,
  };
  if (created) await emitWebhook(db, form.projectId, "contact.created", { contact: contactView, source: "form", formId: form.id });
  await emitWebhook(db, form.projectId, "form.submitted", {
    formId: form.id,
    formName: form.name,
    submissionId: submission.id,
    contact: contactView,
    data: values,
    consent,
    utm,
    sourceUrl,
    landingPageId,
    popupId,
    submittedAt: now,
  });

  return {
    ok: true,
    contactId: contact.id,
    message: needsConfirmation ? "Almost done — check your inbox to confirm your subscription." : settings.successMessage,
    redirectUrl: settings.redirectUrl || "",
    confirmationRequired: needsConfirmation,
  };
}
