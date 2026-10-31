import { adminClient } from "@/lib/supabase/admin";
import { handle, notConfigured } from "@/lib/server/http";
import { bump } from "@/lib/acquisition/server/loaders";
import { countOnce } from "@/lib/acquisition/server/throttle";
import { clientIp, isUuid, readPayload } from "@/lib/acquisition/server/request";

// POST /api/public/popups/:popupId/event { type: "impression" } — the embed script reports each time it
// shows an active popup. Conversions are counted by the form submit route (popupId in its body).
export const runtime = "nodejs";

export async function POST(request, { params }) {
  const { popupId } = await params;
  const { body } = await readPayload(request);
  return handle("acquisition.popup_event", async () => {
    const db = adminClient();
    if (!db) throw notConfigured("Popup tracking isn't available: the server database key isn't configured.");
    if (!isUuid(popupId) || body?.type !== "impression") return new Response(null, { status: 204 });
    const { data: popup } = await db.from("popups").select("id, status").eq("id", popupId).is("deleted_at", null).maybeSingle();
    if (popup?.status === "active" && countOnce("popup_impression", clientIp(request), popup.id)) {
      await bump(db, "popups", popup.id, "impressions");
    }
    return new Response(null, { status: 204 });
  });
}
