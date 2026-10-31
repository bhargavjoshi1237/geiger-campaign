import { badRequest, handle, readJson } from "@/lib/server/http";
import { dispatch } from "@/lib/messaging/dispatch";
import { authorizeChannels } from "@/lib/channels/route_context";

export const runtime = "nodejs";

const MAX_RECIPIENTS = 500;

// Queues an in-app message for selected contacts — one delivery + one inbox row each, via dispatch.
export async function POST(request, { params }) {
  return handle("channels.in_app.compose", async () => {
    const { projectId } = await params;
    const { user, admin } = await authorizeChannels(projectId);
    const body = await readJson(request);
    const ids = Array.from(new Set(Array.isArray(body.contactIds) ? body.contactIds.map(String) : []));
    const title = String(body.title || "").trim();
    if (!ids.length) throw badRequest("Pick at least one contact.");
    if (ids.length > MAX_RECIPIENTS) throw badRequest(`Send to at most ${MAX_RECIPIENTS} contacts at once.`);
    if (!title) throw badRequest("Give the message a title.");

    const { data: contacts } = await admin
      .from("contacts")
      .select("id")
      .eq("project_id", projectId)
      .in("id", ids)
      .is("deleted_at", null);
    const message = {
      title,
      body: String(body.body || ""),
      cta: body.cta || {},
      format: body.format,
      expiresInDays: body.expiresInDays,
    };

    let sent = 0;
    const failures = [];
    for (const contact of contacts || []) {
      const result = await dispatch({
        db: admin,
        projectId,
        channel: "in_app",
        to: contact.id,
        contactId: contact.id,
        source: { type: "manual", id: null },
        message,
        metadata: { sentBy: user.id },
      });
      if (result.status === "sent") sent += 1;
      else failures.push({ contactId: contact.id, error: result.error });
    }
    return { sent, failed: failures.length, skipped: ids.length - (contacts?.length || 0), error: failures[0]?.error || null };
  });
}
