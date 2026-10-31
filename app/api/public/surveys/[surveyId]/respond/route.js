import { adminClient } from "@/lib/supabase/admin";
import { badRequest, handle, json, notConfigured } from "@/lib/server/http";
import { submitSurveyResponse } from "@/lib/acquisition/server/surveys";
import { contactFromRequest, contactFromToken } from "@/lib/acquisition/server/contact_token";
import { clientIp, readPayload, userAgent } from "@/lib/acquisition/server/request";

// POST /api/public/surveys/:surveyId/respond — one survey response from the hosted page or an embed.
export const runtime = "nodejs";

export async function POST(request, { params }) {
  const { surveyId } = await params;
  const { body } = await readPayload(request);
  return handle("acquisition.survey_respond", async () => {
    const db = adminClient();
    if (!db) throw notConfigured("Survey responses aren't available: the server database key isn't configured.");
    if (!body) throw badRequest("The response couldn't be read.");
    const contactId = contactFromToken(typeof body.gc === "string" ? body.gc : null) || contactFromRequest(request);
    const result = await submitSurveyResponse(db, { surveyId, body, ip: clientIp(request), userAgent: userAgent(request), contactId });
    return result.ok
      ? json({ ok: true, message: result.message })
      : json({ error: result.error, fieldErrors: result.fieldErrors || {} }, result.status || 400);
  });
}
