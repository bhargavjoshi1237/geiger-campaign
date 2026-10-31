import { adminClient } from "@/lib/supabase/admin";
import { assertOriginAllowed, loadWidget, publicWidgetConfig } from "@/lib/inbox/live_chat";
import { handle, notConfigured } from "@/lib/server/http";

// Widget boot: appearance, greeting and whether an agent is online right now (keyed by the public id).
export const runtime = "nodejs";

export async function GET(request, { params }) {
  return handle("chat.widget", async () => {
    const { widgetId } = await params;
    const admin = adminClient();
    if (!admin) throw notConfigured("Live chat isn't configured on this server.");
    const widget = await loadWidget(admin, widgetId);
    assertOriginAllowed(widget, request);
    return { widget: publicWidgetConfig(widget) };
  });
}
