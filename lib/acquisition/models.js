// snake_case row <-> camelCase view model for every acquisition table. Pure, so the browser data layers
// (lib/supabase/<table>.js) and the server routes share one mapping. normalize* defaults every field and
// spreads the metadata bag first; *ToRow emits a column only when its key is present in the input.

import { slugify } from "./blocks";
import { publicFields } from "./fields";
import { publicQuestions } from "./surveys";
import { defaultDesign, defaultTargeting, defaultTrigger } from "./popups";

const bag = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
const list = (v) => (Array.isArray(v) ? v : []);
const num = (v) => Number(v ?? 0) || 0;

function mapKeys(input, map) {
  const row = {};
  for (const [key, col] of Object.entries(map)) if (key in input) row[col] = input[key] ?? null;
  return row;
}

// Forms ---------------------------------------------------------------------

export const FORM_SETTINGS_DEFAULTS = {
  listIds: [],
  tags: [],
  doubleOptIn: false,
  consentText: "",
  consentChannels: [],
  redirectUrl: "",
  successMessage: "Thanks — you're on the list.",
  submitLabel: "Subscribe",
  title: "",
  intro: "",
};

export function normalizeForm(row) {
  if (!row) return null;
  return {
    ...bag(row.metadata),
    id: row.id,
    projectId: row.project_id ?? null,
    name: row.name ?? "Untitled form",
    description: row.description ?? "",
    kind: row.kind ?? "embedded",
    status: row.status ?? "draft",
    fields: list(row.fields),
    settings: { ...FORM_SETTINGS_DEFAULTS, ...bag(row.settings) },
    submissionCount: num(row.submission_count),
    viewCount: num(row.view_count),
    lastSubmissionAt: row.last_submission_at ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function formToRow(input) {
  const row = mapKeys(input, { name: "name", description: "description", kind: "kind", status: "status", createdBy: "created_by" });
  if ("fields" in input) row.fields = list(input.fields);
  if ("settings" in input) row.settings = bag(input.settings);
  if ("metadata" in input) row.metadata = bag(input.metadata);
  return row;
}

export function normalizeSubmission(row) {
  if (!row) return null;
  return {
    ...bag(row.metadata),
    id: row.id,
    projectId: row.project_id ?? null,
    formId: row.form_id ?? null,
    contactId: row.contact_id ?? null,
    landingPageId: row.landing_page_id ?? null,
    popupId: row.popup_id ?? null,
    status: row.status ?? "received",
    data: bag(row.data),
    consent: bag(row.consent),
    sourceUrl: row.source_url ?? "",
    referrer: row.referrer ?? "",
    utm: bag(row.utm),
    ip: row.ip ?? "",
    userAgent: row.user_agent ?? "",
    confirmedAt: row.confirmed_at ?? null,
    createdAt: row.created_at ?? null,
  };
}

// Landing pages -------------------------------------------------------------

export function normalizeLandingPage(row) {
  if (!row) return null;
  return {
    ...bag(row.metadata),
    id: row.id,
    projectId: row.project_id ?? null,
    name: row.name ?? "Untitled page",
    slug: row.slug ?? "",
    template: row.template ?? "blank",
    blocks: list(row.blocks),
    seo: { title: "", description: "", imageUrl: "", noIndex: false, ...bag(row.seo) },
    status: row.status ?? "draft",
    formId: row.form_id ?? null,
    publishedAt: row.published_at ?? null,
    views: num(row.views),
    conversions: num(row.conversions),
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function landingPageToRow(input) {
  const row = mapKeys(input, { name: "name", template: "template", status: "status", publishedAt: "published_at", createdBy: "created_by" });
  if ("slug" in input) row.slug = slugify(input.slug);
  if ("formId" in input) row.form_id = input.formId || null;
  if ("blocks" in input) row.blocks = list(input.blocks);
  if ("seo" in input) row.seo = bag(input.seo);
  if ("metadata" in input) row.metadata = bag(input.metadata);
  return row;
}

// Popups --------------------------------------------------------------------

export function normalizePopup(row) {
  if (!row) return null;
  const design = { ...defaultDesign(bag(row.design).layout || "modal"), ...bag(row.design) };
  const targeting = { ...defaultTargeting(), ...bag(row.targeting) };
  return {
    ...bag(row.metadata),
    id: row.id,
    projectId: row.project_id ?? null,
    name: row.name ?? "Untitled popup",
    formId: row.form_id ?? null,
    status: row.status ?? "draft",
    trigger: { ...defaultTrigger(bag(row.trigger).type), ...bag(row.trigger) },
    targeting: {
      ...targeting,
      urls: { mode: "all", patterns: [], ...bag(targeting.urls) },
      devices: list(targeting.devices).length ? targeting.devices : ["desktop", "mobile"],
      frequency: { type: "days", days: 7, ...bag(targeting.frequency) },
    },
    design,
    impressions: num(row.impressions),
    conversions: num(row.conversions),
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function popupToRow(input) {
  const row = mapKeys(input, { name: "name", status: "status", createdBy: "created_by" });
  if ("formId" in input) row.form_id = input.formId || null;
  if ("trigger" in input) row.trigger = bag(input.trigger);
  if ("targeting" in input) row.targeting = bag(input.targeting);
  if ("design" in input) row.design = bag(input.design);
  if ("metadata" in input) row.metadata = bag(input.metadata);
  return row;
}

// Surveys -------------------------------------------------------------------

export const SURVEY_SETTINGS_DEFAULTS = {
  kind: "feedback",
  intro: "",
  thankYouMessage: "Thanks for taking the time.",
  submitLabel: "Submit",
};

export function normalizeSurvey(row) {
  if (!row) return null;
  return {
    ...bag(row.metadata),
    id: row.id,
    projectId: row.project_id ?? null,
    name: row.name ?? "Untitled survey",
    description: row.description ?? "",
    status: row.status ?? "draft",
    questions: list(row.questions),
    settings: { ...SURVEY_SETTINGS_DEFAULTS, ...bag(row.settings) },
    responseCount: num(row.response_count),
    lastResponseAt: row.last_response_at ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function surveyToRow(input) {
  const row = mapKeys(input, { name: "name", description: "description", status: "status", createdBy: "created_by" });
  if ("questions" in input) row.questions = list(input.questions);
  if ("settings" in input) row.settings = bag(input.settings);
  if ("metadata" in input) row.metadata = bag(input.metadata);
  return row;
}

export function normalizeSurveyResponse(row) {
  if (!row) return null;
  return {
    ...bag(row.metadata),
    id: row.id,
    projectId: row.project_id ?? null,
    surveyId: row.survey_id ?? null,
    contactId: row.contact_id ?? null,
    answers: bag(row.answers),
    sourceUrl: row.source_url ?? "",
    utm: bag(row.utm),
    createdAt: row.created_at ?? null,
  };
}

// Tracking links ------------------------------------------------------------

export function normalizeTrackingLink(row) {
  if (!row) return null;
  return {
    ...bag(row.metadata),
    id: row.id,
    projectId: row.project_id ?? null,
    name: row.name ?? "",
    slug: row.slug ?? "",
    destinationUrl: row.destination_url ?? "",
    utm: bag(row.utm),
    campaignId: row.campaign_id ?? null,
    clicks: num(row.clicks),
    lastClickedAt: row.last_clicked_at ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function trackingLinkToRow(input) {
  const row = mapKeys(input, { name: "name", createdBy: "created_by" });
  if ("slug" in input) row.slug = String(input.slug || "").trim();
  if ("destinationUrl" in input) row.destination_url = String(input.destinationUrl || "").trim();
  if ("utm" in input) row.utm = bag(input.utm);
  if ("campaignId" in input) row.campaign_id = input.campaignId || null;
  if ("metadata" in input) row.metadata = bag(input.metadata);
  return row;
}

// Public views (hosted pages, embed script, builder previews) ------------------

// What a renderer needs to draw and submit a form; nothing about lists, tags or routing.
export function publicFormView(form) {
  if (!form) return null;
  const s = form.settings || {};
  return {
    id: form.id,
    name: form.name,
    title: s.title || form.name,
    intro: s.intro || "",
    fields: publicFields(form.fields),
    submitLabel: s.submitLabel || "Subscribe",
    successMessage: s.successMessage || "Thanks — you're on the list.",
    consentText: s.consentText || "",
    redirectUrl: s.redirectUrl || "",
    doubleOptIn: Boolean(s.doubleOptIn),
  };
}

export function publicSurveyView(survey) {
  if (!survey) return null;
  return {
    id: survey.id,
    name: survey.name,
    description: survey.description || "",
    intro: survey.settings?.intro || "",
    thankYouMessage: survey.settings?.thankYouMessage || "Thanks for taking the time.",
    submitLabel: survey.settings?.submitLabel || "Submit",
    questions: publicQuestions(survey.questions),
  };
}
