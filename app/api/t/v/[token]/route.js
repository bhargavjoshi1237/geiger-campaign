import { messageContext, webViewHtml } from "@/lib/campaigns/messages";
import { verifyToken } from "@/lib/server/tokens";
import { getWorkspaceSettings } from "@/lib/settings/server";
import { adminClient } from "@/lib/supabase/admin";

// "View in browser": re-renders the exact email one delivery received (same merge data and variant,
// links still tracked, no open pixel). The signed token names the delivery; nothing else is exposed.
export const runtime = "nodejs";

const HTML_HEADERS = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" };

function unavailable(status = 404) {
  return new Response(
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Email unavailable</title></head><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 16px;line-height:1.5"><h1 style="font-size:1.25rem">This email isn\'t available</h1><p>The link may be incomplete, or the campaign was removed.</p></body></html>',
    { status, headers: HTML_HEADERS },
  );
}

export async function GET(_request, { params }) {
  const { token } = await params;
  let payload = null;
  try {
    payload = verifyToken(token, "view");
  } catch {
    payload = null;
  }
  const db = adminClient();
  if (!payload?.d) return unavailable();
  if (!db) return unavailable(503);
  try {
    const { data: delivery } = await db
      .from("deliveries")
      .select("id, project_id, contact_id, campaign_id, variant, channel")
      .eq("id", payload.d)
      .maybeSingle();
    if (!delivery?.campaign_id || delivery.channel !== "email") return unavailable();
    const [{ data: campaign }, { data: contact }, settings] = await Promise.all([
      db.from("campaigns").select("*").eq("id", delivery.campaign_id).is("deleted_at", null).maybeSingle(),
      delivery.contact_id ? db.from("contacts").select("*").eq("id", delivery.contact_id).maybeSingle() : Promise.resolve({ data: null }),
      getWorkspaceSettings(db, delivery.project_id),
    ]);
    if (!campaign) return unavailable();
    const html = webViewHtml(messageContext(campaign, settings), contact || { id: null }, { deliveryId: delivery.id, variantKey: delivery.variant });
    return new Response(html, { status: 200, headers: HTML_HEADERS });
  } catch (error) {
    console.error("[api.t.view]", error);
    return unavailable(500);
  }
}
