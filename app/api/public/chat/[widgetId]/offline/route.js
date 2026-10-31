import { adminClient } from "@/lib/supabase/admin";
import { assertOriginAllowed, captureOfflineMessage, loadWidget } from "@/lib/inbox/live_chat";
import { handle, notConfigured, readJson } from "@/lib/server/http";

// Outside business hours the widget collects an email + message; it lands in the inbox as an open chat.
export const runtime = "nodejs";

export async function POST(request, { params }) {
  return handle("chat.offline", async () => {
    const { widgetId } = await params;
    const admin = adminClient();
    if (!admin) throw notConfigured("Live chat isn't configured on this server.");
    const widget = await loadWidget(admin, widgetId);
    assertOriginAllowed(widget, request);
    return captureOfflineMessage(admin, widget, request, await readJson(request));
  });
}
