import { requirePermission } from "@/lib/server/auth";
import { badRequest, handle, readJson } from "@/lib/server/http";
import { adminClient } from "@/lib/supabase/admin";
import { emitWebhook } from "@/lib/webhooks/emit";
import { importContacts, MAX_IMPORT_ROWS } from "@/lib/audience/import";
import { toContactModel } from "@/lib/audience/contact_model";

// Imports one chunk of a CSV the browser already parsed and mapped: dedupes by email within the project,
// creates or merges contacts, adds list memberships and records consent with the import as proof.
export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request, { params }) {
  const { projectId } = await params;
  return handle("audience.import", async () => {
    const { db, user } = await requirePermission(projectId, "campaign.contact.import");
    const body = await readJson(request);
    const rows = Array.isArray(body?.rows) ? body.rows : null;
    if (!rows) throw badRequest("Send the parsed rows as `rows`.");
    if (rows.length > MAX_IMPORT_ROWS) throw badRequest(`Send at most ${MAX_IMPORT_ROWS} rows per request.`);
    const options = body.options && typeof body.options === "object" ? body.options : {};
    if (options.consent?.channels?.length && options.consent.attested !== true) {
      throw badRequest("Confirm these contacts gave consent before recording it.");
    }

    const forwarded = request.headers.get("x-forwarded-for") || "";
    const hooksDb = adminClient() ?? db;
    return importContacts(
      db,
      projectId,
      rows,
      {
        ...options,
        userId: user.id,
        ip: forwarded.split(",")[0].trim() || request.headers.get("x-real-ip") || null,
        userAgent: request.headers.get("user-agent") || null,
      },
      {
        onCreated: async (created) => {
          for (const row of created) {
            await emitWebhook(hooksDb, projectId, "contact.created", { contact: toContactModel(row), source: "import" });
          }
        },
      },
    );
  });
}
