import { recordEvent } from "@/lib/events/record";
import { loadBrandKit } from "@/lib/content/brand_server";

// Link-in-bio public reads and click tracking (server-only, service-role db). Only published pages and active
// links ever leave through here; a click is counted atomically (campaign.bio_link_click) and recorded as a
// link_clicked tracked event, deduplicated per visitor IP for a short window.

const DEDUPE_MS = 30_000;
const recent = new Map();

export function cleanSlug(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 60);
}

export function safeDestination(url) {
  const value = String(url || "").trim();
  return /^(https?:\/\/|mailto:|tel:)/i.test(value) ? value : null;
}

export async function loadPublishedBioPage(db, slug) {
  const clean = cleanSlug(slug);
  if (!db || !clean) return null;
  const { data: page, error } = await db
    .from("bio_pages")
    .select("*")
    .eq("slug", clean)
    .eq("status", "published")
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  if (error) console.error("[bio.load]", error.message);
  if (!page) return null;
  const [{ data: links }, brand] = await Promise.all([
    db.from("bio_links").select("*").eq("page_id", page.id).eq("active", true).is("deleted_at", null).order("position", { ascending: true }),
    loadBrandKit(db, page.project_id),
  ]);
  return { page, links: (links || []).filter((l) => safeDestination(l.url)), brand };
}

function firstVisit(key) {
  const now = Date.now();
  if (recent.size > 5000) for (const [k, at] of recent) if (now - at > DEDUPE_MS) recent.delete(k);
  const last = recent.get(key);
  recent.set(key, now);
  return !last || now - last > DEDUPE_MS;
}

function clientIp(request) {
  return (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";
}

// Resolves where /bio/<slug>/go/<linkId> sends the visitor, counting the click once per visitor window.
export async function trackBioClick(db, { slug, linkId, request }) {
  const clean = cleanSlug(slug);
  if (!db || !clean || !/^[0-9a-f-]{36}$/i.test(String(linkId || ""))) return null;
  const { data: page } = await db
    .from("bio_pages")
    .select("id, project_id, slug")
    .eq("slug", clean)
    .eq("status", "published")
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  if (!page) return null;
  const { data: link } = await db
    .from("bio_links")
    .select("id, url, label")
    .eq("id", linkId)
    .eq("page_id", page.id)
    .eq("active", true)
    .is("deleted_at", null)
    .maybeSingle();
  const destination = safeDestination(link?.url);
  if (!destination) return null;

  if (firstVisit(`${clientIp(request)}:${link.id}`)) {
    const { error } = await db.rpc("bio_link_click", { p_link_id: link.id });
    if (error) console.error("[bio.click]", error.message);
    const referrer = request.headers.get("referer");
    await recordEvent(db, {
      projectId: page.project_id,
      name: "link_clicked",
      source: "web",
      url: destination,
      referrer: referrer ? referrer.slice(0, 500) : null,
      properties: { source: "link_in_bio", pageId: page.id, slug: page.slug, linkId: link.id, label: link.label, destination },
    });
  }
  return destination;
}
