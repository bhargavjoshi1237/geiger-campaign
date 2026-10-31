import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { trackBioClick } from "@/lib/social/bio_server";

// GET /bio/:slug/go/:linkId — counts the link-in-bio click, records link_clicked, redirects to the link.
export const runtime = "nodejs";

export async function GET(request, { params }) {
  const { slug, linkId } = await params;
  const db = adminClient();
  if (!db) return new NextResponse("Link-in-bio pages aren't available on this deployment.", { status: 503 });
  try {
    const destination = await trackBioClick(db, { slug, linkId, request });
    if (!destination) return new NextResponse("This link doesn't exist or has been removed.", { status: 404 });
    return NextResponse.redirect(destination, { status: 302, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer-when-downgrade" } });
  } catch (error) {
    console.error("[bio.redirect]", error);
    return new NextResponse("Something went wrong.", { status: 500 });
  }
}
