import { handle, json } from "@/lib/server/http";
import { resolveSdkContact, resolveSdkProject } from "@/lib/channels/sdk";
import { requireAdminDb } from "@/lib/channels/route_context";

export const runtime = "nodejs";

// In-app SDK: the signed-in user's live messages (unread + read, not expired).
//   GET /api/public/in-app/messages?key=gcp_…&user=<email|contact id>&hash=<HMAC-SHA256 hex>
export async function GET(request) {
  return handle("public.in_app.list", async () => {
    const db = requireAdminDb();
    const url = new URL(request.url);
    const { projectId } = await resolveSdkProject(db, request);
    const { contact } = await resolveSdkContact(db, projectId, { user: url.searchParams.get("user"), hash: url.searchParams.get("hash") });

    const now = new Date().toISOString();
    const { data } = await db
      .from("in_app_messages")
      .select("id, format, title, body, cta, status, created_at, expires_at, read_at")
      .eq("project_id", projectId)
      .eq("contact_id", contact.id)
      .is("deleted_at", null)
      .in("status", ["unread", "read"])
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .order("created_at", { ascending: false })
      .limit(50);
    const messages = (data || []).map((m) => ({
      id: m.id,
      format: m.format,
      title: m.title,
      body: m.body,
      cta: m.cta && m.cta.url ? m.cta : null,
      read: m.status === "read",
      createdAt: m.created_at,
      expiresAt: m.expires_at,
    }));
    return json({ messages, unread: messages.filter((m) => !m.read).length }, 200, { "Cache-Control": "no-store" });
  });
}
