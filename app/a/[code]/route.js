import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { ATTRIBUTION_COOKIE, affiliateDestination, findLinkByCode, recordAffiliateClick } from "@/lib/creators/attribution";
import { notFoundPage } from "@/lib/creators/public_page";

// Affiliate redirect: /a/<code> counts the click, records an `affiliate_click` event, sets the
// first-party attribution cookie (last click wins, for the link's window) and sends the visitor to the
// destination with UTM + gc_ref so the storefront can carry the code onto `order_completed`.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  const { code } = await params;
  const db = adminClient();
  if (!db) return notFoundPage("This link isn't available right now.");

  const link = await findLinkByCode(db, decodeURIComponent(code || ""));
  if (!link || link.status !== "active") return notFoundPage("This link is no longer active.");
  const destination = affiliateDestination(link);
  if (!destination) return notFoundPage("This link doesn't have a valid destination.");

  const { clickId } = await recordAffiliateClick(db, { link, request, destination });
  const response = NextResponse.redirect(destination, 302);
  response.cookies.set(ATTRIBUTION_COOKIE, `${link.code}.${clickId}`, {
    path: "/",
    maxAge: Math.max(1, Number(link.attribution_window_days) || 30) * 86_400,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    httpOnly: false,
  });
  response.headers.set("cache-control", "no-store");
  response.headers.set("referrer-policy", "no-referrer-when-downgrade");
  return response;
}
