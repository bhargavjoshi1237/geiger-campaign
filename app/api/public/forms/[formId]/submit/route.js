import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { badRequest, handle, json, notConfigured } from "@/lib/server/http";
import { submitForm } from "@/lib/acquisition/server/submit";
import { contactCookie } from "@/lib/acquisition/server/contact_token";
import { appUrl, cleanUrl, clientIp, readPayload, userAgent } from "@/lib/acquisition/server/request";

// POST /api/public/forms/:formId/submit — public form ingest (embed script, hosted page, landing pages).
// JSON in -> JSON out; a classic <form> post (no JavaScript) gets a 303 back to the hosted page instead.
export const runtime = "nodejs";

export async function POST(request, { params }) {
  const { formId } = await params;
  const { body, isForm } = await readPayload(request);
  return handle("acquisition.submit", async () => {
    const db = adminClient();
    if (!db) throw notConfigured("Form submissions aren't available: the server database key isn't configured.");
    if (!body) throw badRequest("The submission couldn't be read.");

    const result = await submitForm(db, { formId, body, ip: clientIp(request), userAgent: userAgent(request) });
    const cookie = result.ok && result.contactId ? contactCookie(result.contactId) : null;

    if (isForm) {
      const target = result.ok
        ? cleanUrl(result.redirectUrl) || appUrl(request, `/f/${formId}`, { status: result.confirmationRequired ? "confirm" : "success" })
        : appUrl(request, `/f/${formId}`, { status: "error", message: result.error });
      const response = NextResponse.redirect(target, 303);
      if (cookie) response.headers.append("Set-Cookie", cookie);
      return response;
    }

    const response = result.ok
      ? json({ ok: true, message: result.message, redirectUrl: cleanUrl(result.redirectUrl) || "", confirmationRequired: result.confirmationRequired })
      : json({ error: result.error, fieldErrors: result.fieldErrors || {} }, result.status || 400);
    if (cookie) response.headers.append("Set-Cookie", cookie);
    return response;
  });
}
