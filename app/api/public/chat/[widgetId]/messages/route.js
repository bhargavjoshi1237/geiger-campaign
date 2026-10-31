import { adminClient } from "@/lib/supabase/admin";
import { assertOriginAllowed, loadWidget, pollVisitorMessages, postVisitorMessage } from "@/lib/inbox/live_chat";
import { handle, notConfigured, readJson } from "@/lib/server/http";

// Visitor side of a chat: POST sends a message, GET polls for replies since `after`.
export const runtime = "nodejs";

async function widgetFor(request, params) {
  const { widgetId } = await params;
  const admin = adminClient();
  if (!admin) throw notConfigured("Live chat isn't configured on this server.");
  const widget = await loadWidget(admin, widgetId);
  assertOriginAllowed(widget, request);
  return { admin, widget };
}

export async function GET(request, { params }) {
  return handle("chat.poll", async () => {
    const { admin, widget } = await widgetFor(request, params);
    const query = new URL(request.url).searchParams;
    return pollVisitorMessages(admin, widget, {
      sessionToken: query.get("sessionToken"),
      after: query.get("after"),
      visible: query.get("visible") === "1",
    });
  });
}

export async function POST(request, { params }) {
  return handle("chat.message", async () => {
    const { admin, widget } = await widgetFor(request, params);
    return postVisitorMessage(admin, widget, await readJson(request));
  });
}
