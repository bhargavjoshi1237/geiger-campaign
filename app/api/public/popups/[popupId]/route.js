import { adminClient } from "@/lib/supabase/admin";
import { handle, json, notConfigured, notFound } from "@/lib/server/http";
import { loadPublicPopup } from "@/lib/acquisition/server/loaders";

// GET /api/public/popups/:popupId — an active popup's trigger, targeting, design and form for the embed.
export const runtime = "nodejs";

export async function GET(_request, { params }) {
  return handle("acquisition.popup", async () => {
    const { popupId } = await params;
    const db = adminClient();
    if (!db) throw notConfigured("Popups aren't available: the server database key isn't configured.");
    const bundle = await loadPublicPopup(db, popupId);
    if (!bundle) throw notFound("This popup isn't active.");
    return json(bundle, 200, { "Cache-Control": "public, max-age=60, s-maxage=60" });
  });
}
