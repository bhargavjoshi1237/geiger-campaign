import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { confirmDoubleOptIn } from "@/lib/acquisition/server/double_opt_in";
import { contactCookie } from "@/lib/acquisition/server/contact_token";
import { appUrl, clientIp, readPayload, userAgent } from "@/lib/acquisition/server/request";

// POST /api/public/forms/:formId/confirm — the double opt-in button on /f/:formId/confirm. A button post
// (not the emailed GET) so link scanners that prefetch the email link can't confirm on someone's behalf.
export const runtime = "nodejs";

export async function POST(request, { params }) {
  const { formId } = await params;
  let status = "error";
  let contactId = null;
  try {
    const { body } = await readPayload(request);
    const db = adminClient();
    if (db && typeof body?.token === "string") {
      const result = await confirmDoubleOptIn(db, body.token, { ip: clientIp(request), userAgent: userAgent(request) });
      status = result.status === "invalid" ? "invalid" : "confirmed";
      contactId = result.contactId || null;
    }
  } catch (error) {
    console.error("[api.acquisition.confirm]", error);
  }
  const response = NextResponse.redirect(appUrl(request, `/f/${formId}/confirm`, { status }), 303);
  const cookie = contactId ? contactCookie(contactId) : null;
  if (cookie) response.headers.append("Set-Cookie", cookie);
  return response;
}
