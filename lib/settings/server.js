import {
  ADVANCED_DEFAULTS,
  BILLING_DEFAULTS,
  BRANDING_DEFAULTS,
  GENERAL_DEFAULTS,
  SENDING_DEFAULTS,
  TRACKING_DEFAULTS,
  mergeSettings,
  normalizeBranding,
} from "./defaults";

// Workspace settings for server code: general, branding (campaign.brand_kits: logo, colours, voice, footer
// text and physical address used by email rendering and AI copy), sending defaults (from name/email,
// reply-to, quiet hours, weekly frequency cap), tracking toggles, advanced and billing. Defaults fill
// every missing value; a missing table or row (brand_kits ships in another migration) degrades to them.

export const DEFAULT_SETTINGS = {
  general: GENERAL_DEFAULTS,
  branding: { ...BRANDING_DEFAULTS, companyName: "" },
  sending: SENDING_DEFAULTS,
  tracking: TRACKING_DEFAULTS,
  advanced: ADVANCED_DEFAULTS,
  billing: BILLING_DEFAULTS,
};

async function safe(label, query) {
  try {
    const { data, error } = await query;
    if (error) {
      console.error(`[settings.${label}]`, error.message);
      return null;
    }
    return data ?? null;
  } catch (e) {
    console.error(`[settings.${label}]`, e);
    return null;
  }
}

// db: a campaign-schema client (adminClient() or the user-scoped route client).
export async function getWorkspaceSettings(db, projectId) {
  if (!db || !projectId) {
    return { ...mergeSettings(null), branding: { ...normalizeBranding(null), companyName: "" } };
  }
  const [row, brand, project] = await Promise.all([
    safe("settings", db.from("workspace_settings").select("*").eq("project_id", projectId).maybeSingle()),
    safe(
      "brand_kit",
      db
        .from("brand_kits")
        .select("*")
        .eq("project_id", projectId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ),
    typeof db.schema === "function"
      ? safe("project", db.schema("public").from("projects").select("name").eq("id", projectId).maybeSingle())
      : null,
  ]);

  const merged = mergeSettings(row);
  if (!merged.general.name && project?.name) merged.general.name = project.name;
  return { ...merged, branding: { ...normalizeBranding(brand), companyName: merged.general.name } };
}
