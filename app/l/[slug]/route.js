import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { resolveShortLink } from "@/lib/acquisition/server/links";

// GET /l/:slug — tracked short link: count the click, record link_clicked, redirect to the UTM-tagged URL.
export const runtime = "nodejs";

export async function GET(request, { params }) {
  const { slug } = await params;
  const db = adminClient();
  if (!db) return new NextResponse("Short links aren't available on this deployment.", { status: 503 });
  try {
    const destination = await resolveShortLink(db, slug, request);
    if (!destination) return new NextResponse("This link doesn't exist or has been removed.", { status: 404 });
    return NextResponse.redirect(destination, { status: 302, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer-when-downgrade" } });
  } catch (error) {
    console.error("[l.redirect]", error);
    return new NextResponse("Something went wrong.", { status: 500 });
  }
}
