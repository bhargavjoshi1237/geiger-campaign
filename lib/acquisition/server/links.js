import { recordEvent } from "@/lib/events/record";
import { normalizeTrackingLink } from "../models";
import { buildTrackedUrl, normalizeLinkSlug } from "../tracking";
import { contactFromRequest } from "./contact_token";
import { bump } from "./loaders";
import { countOnce } from "./throttle";
import { clientIp, cleanUrl } from "./request";

// /l/<slug>: resolve the short link to its UTM-tagged destination, count the click and record
// link_clicked (with the contact when the request carries a contact token). Server-only.

export async function resolveShortLink(db, slug, request) {
  const clean = normalizeLinkSlug(slug);
  if (!clean) return null;
  const { data, error } = await db.from("tracking_links").select("*").eq("slug", clean).is("deleted_at", null).maybeSingle();
  if (error) console.error("[acquisition.link]", error.message);
  const link = normalizeTrackingLink(data);
  if (!link?.destinationUrl) return null;
  const destination = buildTrackedUrl(link.destinationUrl, link.utm);

  if (countOnce("click", clientIp(request), link.id)) {
    let contactId = contactFromRequest(request);
    if (contactId) {
      const { data: contact } = await db.from("contacts").select("id").eq("id", contactId).eq("project_id", link.projectId).maybeSingle();
      contactId = contact?.id || null;
    }
    await bump(db, "tracking_links", link.id, "clicks");
    await db.from("tracking_links").update({ last_clicked_at: new Date().toISOString() }).eq("id", link.id);
    await recordEvent(db, {
      projectId: link.projectId,
      contactId,
      name: "link_clicked",
      properties: { linkId: link.id, slug: link.slug, destination: link.destinationUrl },
      source: "web",
      campaignId: link.campaignId,
      url: destination,
      referrer: cleanUrl(request.headers.get("referer")),
      utm: link.utm,
    });
  }
  return destination;
}
