import { adminClient } from "@/lib/supabase/admin";
import { handle, json, notConfigured, notFound } from "@/lib/server/http";
import { loadSurvey, publicSurveyView } from "@/lib/acquisition/server/loaders";

// GET /api/public/surveys/:surveyId — a live survey's questions, for embedding outside the hosted page.
export const runtime = "nodejs";

export async function GET(_request, { params }) {
  return handle("acquisition.survey", async () => {
    const { surveyId } = await params;
    const db = adminClient();
    if (!db) throw notConfigured("Surveys aren't available: the server database key isn't configured.");
    const survey = await loadSurvey(db, surveyId);
    if (!survey) throw notFound("This survey doesn't exist.");
    if (survey.status !== "live") throw notFound("This survey is closed.");
    return json({ survey: publicSurveyView(survey) }, 200, { "Cache-Control": "public, max-age=30, s-maxage=30" });
  });
}
