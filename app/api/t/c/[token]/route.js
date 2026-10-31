import { after } from "next/server";
import { recordClick } from "@/lib/campaigns/tracking_hits";
import { isHttpUrl } from "@/lib/email/tracking";
import { verifyToken } from "@/lib/server/tokens";
import { adminClient } from "@/lib/supabase/admin";

// Click redirect: only a validly signed token redirects (never an open redirect). The click is
// recorded after the response; the destination gets gc_d=<delivery id> so on-site conversions can be
// attributed back to the campaign. HEAD (link scanners) redirects without recording.
export const runtime = "nodejs";

function safeVerify(token) {
  try {
    return verifyToken(token, "click");
  } catch {
    return null;
  }
}

function invalid() {
  return new Response(
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Link unavailable</title></head><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 16px;line-height:1.5"><h1 style="font-size:1.25rem">This link isn\'t valid</h1><p>It may have been copied incompletely. Open it again from the original email.</p></body></html>',
    { status: 404, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );
}

function destinationFor(payload) {
  const url = new URL(payload.u);
  if (payload.d && !url.searchParams.has("gc_d")) url.searchParams.set("gc_d", payload.d);
  return url.toString();
}

function redirect(location) {
  return new Response(null, { status: 302, headers: { Location: location, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer-when-downgrade" } });
}

export async function GET(request, { params }) {
  const { token } = await params;
  const payload = safeVerify(token);
  if (!payload || !isHttpUrl(payload.u)) return invalid();
  const db = adminClient();
  if (payload.d && db) {
    const userAgent = request.headers.get("user-agent") || "";
    after(() => recordClick(db, payload.d, { url: payload.u, userAgent }));
  }
  return redirect(destinationFor(payload));
}

export async function HEAD(_request, { params }) {
  const { token } = await params;
  const payload = safeVerify(token);
  if (!payload || !isHttpUrl(payload.u)) return new Response(null, { status: 404 });
  return redirect(destinationFor(payload));
}
