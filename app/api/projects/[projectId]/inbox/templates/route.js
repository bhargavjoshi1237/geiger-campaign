import { listSendableTemplates } from "@/lib/inbox/server";
import { assertUuid, requireMember } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";

// Approved WhatsApp templates for the composer when the 24-hour window is closed (?connectionId= narrows it).
export const runtime = "nodejs";

export async function GET(request, { params }) {
  return handle("inbox.templates", async () => {
    const { projectId } = await params;
    const connectionId = new URL(request.url).searchParams.get("connectionId");
    if (connectionId) assertUuid(connectionId, "connection id");
    const { db } = await requireMember(projectId);
    return { templates: await listSendableTemplates({ db, projectId, connectionId }) };
  });
}
