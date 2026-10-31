import { adminClient } from "@/lib/supabase/admin";
import { recordEvent } from "@/lib/events/record";
import { bump } from "@/lib/acquisition/server/loaders";
import { countOnce } from "@/lib/acquisition/server/throttle";
import { contactFromRequest } from "@/lib/acquisition/server/contact_token";
import { cleanUrl, clientIp, readPayload } from "@/lib/acquisition/server/request";
import { parseUtm } from "@/lib/acquisition/tracking";
import { slugify } from "@/lib/acquisition/blocks";

// POST /p/:slug/view — one view of a published landing page (sent once per browser session by the page),
// counted on the page and recorded as page_viewed with the visit's UTM for source tracking.
export const runtime = "nodejs";

export async function POST(request, { params }) {
  const { slug } = await params;
  try {
    const db = adminClient();
    if (!db) return new Response(null, { status: 204 });
    const { data: page } = await db
      .from("landing_pages")
      .select("id, project_id, name")
      .eq("slug", slugify(slug))
      .eq("status", "published")
      .is("deleted_at", null)
      .maybeSingle();
    if (page && countOnce("page_view", clientIp(request), page.id)) {
      const { body } = await readPayload(request);
      const url = cleanUrl(body?.url);
      let contactId = contactFromRequest(request);
      if (contactId) {
        const { data: contact } = await db.from("contacts").select("id").eq("id", contactId).eq("project_id", page.project_id).maybeSingle();
        contactId = contact?.id || null;
      }
      await bump(db, "landing_pages", page.id, "views");
      await recordEvent(db, {
        projectId: page.project_id,
        contactId,
        name: "page_viewed",
        properties: { landingPageId: page.id, pageName: page.name },
        source: "web",
        url,
        referrer: cleanUrl(body?.referrer),
        utm: parseUtm(url || ""),
      });
    }
  } catch (error) {
    console.error("[p.view]", error);
  }
  return new Response(null, { status: 204 });
}
