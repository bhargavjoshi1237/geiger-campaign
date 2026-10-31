import { normalizeBrandKit, resolveBrand } from "./brand";

// Server-side brand kit read (service-role or user-scoped campaign db) for hosted pages, system email and
// any renderer that needs the project's logo, colours and footer. Always returns a complete brand view.

export async function loadBrandKit(db, projectId) {
  if (!db || !projectId) return resolveBrand(null);
  const [{ data: kit, error }, project] = await Promise.all([
    db.from("brand_kits").select("*").eq("project_id", projectId).is("deleted_at", null).maybeSingle(),
    db
      .schema("public")
      .from("projects")
      .select("name")
      .eq("id", projectId)
      .maybeSingle()
      .then((r) => r.data)
      .catch(() => null),
  ]);
  if (error) console.error("[content.loadBrandKit]", error.message);
  return resolveBrand(normalizeBrandKit(kit), { fallbackName: project?.name || "" });
}
