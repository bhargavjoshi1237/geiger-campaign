import { requirePermission, assertUuid } from "@/lib/server/auth";
import { ApiError, handle, notConfigured, notFound } from "@/lib/server/http";
import { adminClient } from "@/lib/supabase/admin";
import { listConnectionMedia } from "@/lib/chat/posts";

// Posts (or ads) from a connected Instagram / Facebook account for the comment-to-DM picker, fetched live
// from the Graph API. ?connectionId=<uuid>&kind=posts|ads
export const runtime = "nodejs";

export async function GET(request, { params }) {
  return handle("chat.posts", async () => {
    const { projectId } = await params;
    const { db } = await requirePermission(projectId, "campaign.chat.edit");
    const url = new URL(request.url);
    const connectionId = assertUuid(url.searchParams.get("connectionId"), "connection id");
    const kind = url.searchParams.get("kind") === "ads" ? "ads" : "posts";

    const { data: connection, error } = await db
      .from("channel_connections")
      .select("*")
      .eq("id", connectionId)
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw new ApiError(500, "Couldn't load the connection.");
    if (!connection) throw notFound("That connection doesn't exist.");
    if (!["instagram", "messenger"].includes(connection.channel)) return { connected: false, items: [], error: "Only Instagram and Facebook posts can trigger comment automations." };

    const admin = adminClient();
    if (!admin) throw notConfigured("SUPABASE_SERVICE_ROLE_KEY isn't configured, so connection tokens can't be read.");
    const { data: secretRow } = await admin.from("channel_secrets").select("secrets").eq("connection_id", connection.id).maybeSingle();
    return listConnectionMedia({ connection, secrets: secretRow?.secrets || {}, kind });
  });
}
