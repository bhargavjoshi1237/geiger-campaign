import { adminClient } from "@/lib/supabase/admin";
import { handle, json, notConfigured, notFound } from "@/lib/server/http";
import { loadPublicForm } from "@/lib/acquisition/server/loaders";

// GET /api/public/forms/:formId — a live form's public definition + brand for the embed script.
export const runtime = "nodejs";

export async function GET(_request, { params }) {
  return handle("acquisition.form", async () => {
    const { formId } = await params;
    const db = adminClient();
    if (!db) throw notConfigured("Forms aren't available: the server database key isn't configured.");
    const result = await loadPublicForm(db, formId);
    if (!result.form) {
      throw notFound(result.status === "missing" ? "This form doesn't exist." : "This form isn't accepting submissions right now.");
    }
    return json({ form: result.view, brand: result.publicBrand }, 200, { "Cache-Control": "public, max-age=30, s-maxage=30" });
  });
}
