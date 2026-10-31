import { adminClient } from "@/lib/supabase/admin";
import { handle, notConfigured } from "@/lib/server/http";
import { bump, loadForm } from "@/lib/acquisition/server/loaders";
import { countOnce } from "@/lib/acquisition/server/throttle";
import { clientIp } from "@/lib/acquisition/server/request";

// POST /api/public/forms/:formId/view — one view of a live form (hosted page, landing page, embed).
export const runtime = "nodejs";

export async function POST(request, { params }) {
  return handle("acquisition.form_view", async () => {
    const { formId } = await params;
    const db = adminClient();
    if (!db) throw notConfigured("Form views aren't available: the server database key isn't configured.");
    const form = await loadForm(db, formId);
    if (form?.status === "live" && countOnce("form_view", clientIp(request), form.id)) {
      await bump(db, "forms", form.id, "view_count");
    }
    return new Response(null, { status: 204 });
  });
}
