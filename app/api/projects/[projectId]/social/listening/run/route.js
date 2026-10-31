import { assertUuid, requirePermission } from "@/lib/server/auth";
import { handle, notConfigured, notFound, readJson } from "@/lib/server/http";
import { adminClient } from "@/lib/supabase/admin";
import { runListeningQuery } from "@/lib/social/listening_run";

// Runs one listening query now against the platform APIs: { queryId } -> { mentions, errors }.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request, { params }) {
  return handle("social.listening.run", async () => {
    const { projectId } = await params;
    const { db } = await requirePermission(projectId, "campaign.social.edit");
    const { queryId } = await readJson(request);
    assertUuid(queryId, "query id");
    const { data: query } = await db.from("listening_queries").select("*").eq("id", queryId).eq("project_id", projectId).is("deleted_at", null).maybeSingle();
    if (!query) throw notFound("Listening query not found.");
    const admin = adminClient();
    if (!admin) throw notConfigured("SUPABASE_SERVICE_ROLE_KEY isn't configured.");
    return runListeningQuery(admin, { query });
  });
}
