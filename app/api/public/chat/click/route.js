import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { recordEvent } from "@/lib/events/record";
import { verifyToken } from "@/lib/server/tokens";

// DM link-button click redirect: the chat engine signs each button URL, so a click here is recorded as
// social.dm_click (a conversion in the automation funnel) before the visitor continues to the page.
export const runtime = "nodejs";

export async function GET(request) {
  const token = new URL(request.url).searchParams.get("t");
  let payload = null;
  try {
    payload = verifyToken(token, "chat_click");
  } catch {
    payload = null;
  }
  if (!payload || !/^https?:\/\//i.test(String(payload.u || ""))) {
    return new NextResponse("This link has expired.", { status: 400, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  const db = adminClient();
  if (db && payload.p) {
    await recordEvent(db, {
      projectId: payload.p,
      contactId: payload.c || null,
      name: "social.dm_click",
      source: "social",
      properties: { automationId: payload.a || null, flowId: payload.f || null, channel: payload.ch || null, url: payload.u },
      url: payload.u,
      referrer: request.headers.get("referer"),
    });
  }
  return NextResponse.redirect(payload.u, 302);
}
