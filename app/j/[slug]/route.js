import { after, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { recordJoinClick, resolveJoinLink } from "@/lib/communities/links";

// Join-link short URL: /j/<slug> -> the channel's invite / follow URL. The click (with UTM) is recorded
// after the redirect is sent, so people never wait on analytics.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  const { slug } = await params;
  const admin = adminClient();
  const link = await resolveJoinLink(admin, slug);
  if (!link) {
    const missing = request.nextUrl.clone();
    missing.pathname = `/j/${encodeURIComponent(String(slug || "").toLowerCase())}/unavailable`;
    missing.search = "";
    return NextResponse.redirect(missing, 302);
  }
  const context = {
    url: request.url,
    referrer: request.headers.get("referer"),
    userAgent: request.headers.get("user-agent"),
  };
  after(() => recordJoinClick(admin, link, context).catch((error) => console.error("[j.click]", error)));
  return NextResponse.redirect(link.platform_url, { status: 302, headers: { "Cache-Control": "no-store" } });
}
