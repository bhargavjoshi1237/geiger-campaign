import { adminClient } from "@/lib/supabase/admin";
import { assertOriginAllowed, loadWidget, startSession } from "@/lib/inbox/live_chat";
import { handle, notConfigured, readJson } from "@/lib/server/http";

// Starts a visitor session (a `chat` conversation) on the first message; returns the session token.
export const runtime = "nodejs";

export async function POST(request, { params }) {
  return handle("chat.session", async () => {
    const { widgetId } = await params;
    const admin = adminClient();
    if (!admin) throw notConfigured("Live chat isn't configured on this server.");
    const widget = await loadWidget(admin, widgetId);
    assertOriginAllowed(widget, request);
    return startSession(admin, widget, request, await readJson(request));
  });
}
