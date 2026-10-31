import { after } from "next/server";
import { recordOpen } from "@/lib/campaigns/tracking_hits";
import { verifyToken } from "@/lib/server/tokens";
import { adminClient } from "@/lib/supabase/admin";

// Open-tracking pixel: always answers with a 1x1 GIF (an invalid token reveals nothing) and records
// the open after the response, so mail clients never wait on the database.
export const runtime = "nodejs";

const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
const HEADERS = {
  "Content-Type": "image/gif",
  "Content-Length": String(PIXEL.length),
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
};

function safeVerify(token) {
  try {
    return verifyToken(token, "open");
  } catch {
    return null;
  }
}

export async function GET(request, { params }) {
  const { token } = await params;
  const payload = safeVerify(token);
  const db = adminClient();
  if (payload?.d && db) {
    const userAgent = request.headers.get("user-agent") || "";
    after(() => recordOpen(db, payload.d, { userAgent }));
  }
  return new Response(PIXEL, { status: 200, headers: HEADERS });
}
