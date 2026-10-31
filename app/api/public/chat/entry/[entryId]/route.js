import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { recordEvent } from "@/lib/events/record";

// Entry-point redirect: QR codes and tracked ref links point here, so scans and clicks are counted before the
// visitor lands on the ig.me / m.me / t.me / wa.me deep link. ?via=qr counts a scan, anything else a click.
export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_HOSTS = new Set(["ig.me", "m.me", "t.me", "wa.me", "www.instagram.com", "instagram.com", "www.messenger.com", "api.whatsapp.com"]);

function notActive(status = 404) {
  return new NextResponse("This link isn't active any more.", { status, headers: { "content-type": "text/plain; charset=utf-8" } });
}

export async function GET(request, { params }) {
  const { entryId } = await params;
  if (!UUID.test(String(entryId || ""))) return notActive();
  const db = adminClient();
  if (!db) return notActive(503);

  const { data: entry } = await db.from("entry_points").select("*").eq("id", entryId).is("deleted_at", null).maybeSingle();
  if (!entry || entry.status !== "active") return notActive();

  let target;
  try {
    target = new URL(entry.url);
  } catch {
    return notActive();
  }
  if (target.protocol !== "https:" || !ALLOWED_HOSTS.has(target.hostname)) return notActive();

  const via = new URL(request.url).searchParams.get("via") === "qr" ? "qr" : "link";
  await db.rpc("chat_bump_entry", { p_id: entry.id, p_field: via === "qr" ? "scans" : "clicks" });
  await recordEvent(db, {
    projectId: entry.project_id,
    name: "social.entry_scan",
    source: "social",
    properties: { entryPointId: entry.id, via, channel: entry.channel, ref: entry.ref, kind: entry.kind },
    referrer: request.headers.get("referer"),
  });
  return NextResponse.redirect(target.toString(), 302);
}
