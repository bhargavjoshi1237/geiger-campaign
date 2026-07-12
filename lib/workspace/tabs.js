import {
  projectNav,
  settingsNav,
} from "@/components/internal/sidebar/projects/sidebar_data";

// Workspace tab <-> URL slug mapping. The active tab lives in the path
// (/project/<id>/<slug>), so it must be a small, lowercase, no-caps token with
// no spaces or punctuation. e.g. "All Campaigns" -> "allcampaigns",
// "Tags & Fields" -> "tagsfields". Reverse lookup resolves a path slug back to
// its exact sidebar title (the registry keys on titles).

export function tabToSlug(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

// slug -> exact title, built once from every nav destination (top-level, subs,
// and the settings sub-nav).
const SLUG_TO_TAB = (() => {
  const map = new Map();
  const add = (title) => {
    if (!title) return;
    const slug = tabToSlug(title);
    if (!map.has(slug)) map.set(slug, title);
  };
  for (const item of projectNav) {
    add(item.title);
    for (const sub of item.subItems || []) add(sub.title);
  }
  for (const item of settingsNav) add(item.title);
  return map;
})();

export function slugToTab(slug) {
  if (!slug) return null;
  return SLUG_TO_TAB.get(String(slug).toLowerCase()) || null;
}
