import { loadBrandKit } from "@/lib/content/brand_server";
import { publicBrand } from "@/lib/content/brand";
import { blockFormIds, slugify } from "../blocks";
import { normalizeForm, normalizeLandingPage, normalizePopup, normalizeSurvey, publicFormView } from "../models";
import { isUuid } from "./request";

export { publicFormView, publicSurveyView } from "../models";

// Public reads for hosted pages and the embed script (service-role db, so callers decide what is public):
// only live forms, published pages, live surveys and active popups ever leave through here. Server-only.

export async function bump(db, table, id, column, by = 1) {
  const { error } = await db.rpc("acquisition_bump", { p_table: table, p_id: id, p_column: column, p_by: by });
  if (error) console.error(`[acquisition.bump.${table}.${column}]`, error.message);
  return !error;
}

export async function loadForm(db, formId) {
  if (!isUuid(formId)) return null;
  const { data, error } = await db.from("forms").select("*").eq("id", formId).is("deleted_at", null).maybeSingle();
  if (error) console.error("[acquisition.loadForm]", error.message);
  return normalizeForm(data);
}

// { form, brand } for a live form, or { form: null, status } explaining why not.
export async function loadPublicForm(db, formId) {
  const form = await loadForm(db, formId);
  if (!form) return { form: null, status: "missing" };
  const brand = await loadBrandKit(db, form.projectId);
  if (form.status !== "live") return { form: null, status: form.status, brand, name: form.name };
  return { form, view: publicFormView(form), brand, publicBrand: publicBrand(brand) };
}

// A published landing page by slug plus the live forms its blocks render.
export async function loadPublishedPage(db, slug) {
  const clean = slugify(slug);
  if (!clean) return null;
  const { data, error } = await db
    .from("landing_pages")
    .select("*")
    .eq("slug", clean)
    .eq("status", "published")
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  if (error) console.error("[acquisition.loadPublishedPage]", error.message);
  const page = normalizeLandingPage(data);
  if (!page) return null;
  const ids = blockFormIds(page.blocks, page.formId);
  const forms = {};
  if (ids.length) {
    const { data: rows } = await db
      .from("forms")
      .select("*")
      .in("id", ids)
      .eq("project_id", page.projectId)
      .is("deleted_at", null);
    for (const row of rows || []) {
      const form = normalizeForm(row);
      if (form.status === "live") forms[form.id] = publicFormView(form);
    }
  }
  const brand = await loadBrandKit(db, page.projectId);
  return { page, forms, brand };
}

export async function loadSurvey(db, surveyId) {
  if (!isUuid(surveyId)) return null;
  const { data, error } = await db.from("surveys").select("*").eq("id", surveyId).is("deleted_at", null).maybeSingle();
  if (error) console.error("[acquisition.loadSurvey]", error.message);
  return normalizeSurvey(data);
}

export async function loadPublicPopup(db, popupId) {
  if (!isUuid(popupId)) return null;
  const { data, error } = await db.from("popups").select("*").eq("id", popupId).is("deleted_at", null).maybeSingle();
  if (error) console.error("[acquisition.loadPublicPopup]", error.message);
  const popup = normalizePopup(data);
  if (!popup || popup.status !== "active" || !popup.formId) return null;
  const form = await loadForm(db, popup.formId);
  if (!form || form.status !== "live" || form.projectId !== popup.projectId) return null;
  const brand = await loadBrandKit(db, popup.projectId);
  return {
    popup: { id: popup.id, trigger: popup.trigger, targeting: popup.targeting, design: popup.design },
    form: publicFormView(form),
    brand: publicBrand(brand),
  };
}
