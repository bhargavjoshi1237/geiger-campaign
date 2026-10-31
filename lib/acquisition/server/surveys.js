import { recordEvent } from "@/lib/events/record";
import { notFound } from "@/lib/server/http";
import { npsFrom, validateAnswers } from "../surveys";
import { cleanUtm, parseUtm } from "../tracking";
import { bump, loadSurvey } from "./loaders";
import { responseThrottled } from "./throttle";
import { cleanText, cleanUrl, isUuid } from "./request";

// Public survey response (service-role db): validate answers against the survey's questions, throttle,
// store the response (tied to a contact when the link carried a contact token) and record survey_completed.

const bag = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

export async function submitSurveyResponse(db, { surveyId, body, ip, userAgent, contactId = null }) {
  const survey = await loadSurvey(db, surveyId);
  if (!survey) throw notFound("This survey doesn't exist.");
  if (survey.status !== "live") return { ok: false, status: 409, error: "This survey is closed." };
  if (cleanText(body?._gc_hp)) return { ok: true, message: survey.settings.thankYouMessage };
  if (await responseThrottled(db, { ip, surveyId: survey.id })) {
    return { ok: false, status: 429, error: "Too many responses from your network. Try again in a few minutes." };
  }

  const { answers, errors } = validateAnswers(survey.questions, bag(body?.answers));
  if (Object.keys(errors).length) return { ok: false, status: 422, error: "Answer the highlighted questions.", fieldErrors: errors };
  if (!Object.keys(answers).length) return { ok: false, status: 422, error: "Answer at least one question." };

  let contact = null;
  if (isUuid(contactId)) {
    const { data } = await db.from("contacts").select("id").eq("id", contactId).eq("project_id", survey.projectId).maybeSingle();
    contact = data?.id || null;
  }
  const sourceUrl = cleanUrl(body?._gc_url);
  const utm = cleanUtm({ ...parseUtm(sourceUrl || ""), ...bag(body?.utm) });

  const { data: response, error } = await db
    .from("survey_responses")
    .insert({ project_id: survey.projectId, survey_id: survey.id, contact_id: contact, answers, source_url: sourceUrl, utm, ip, user_agent: userAgent })
    .select("id")
    .single();
  if (error) {
    console.error("[acquisition.survey.respond]", error.message);
    return { ok: false, status: 500, error: "Couldn't save your answers. Try again." };
  }
  await bump(db, "surveys", survey.id, "response_count");
  await db.from("surveys").update({ last_response_at: new Date().toISOString() }).eq("id", survey.id);

  const npsQuestion = survey.questions.find((q) => q.type === "nps");
  const score = npsQuestion && Number.isInteger(answers[npsQuestion.id]) ? answers[npsQuestion.id] : null;
  const category = score == null ? null : npsFrom([score]).promoters ? "promoter" : npsFrom([score]).detractors ? "detractor" : "passive";
  await recordEvent(db, {
    projectId: survey.projectId,
    contactId: contact,
    name: "survey_completed",
    properties: { surveyId: survey.id, surveyName: survey.name, responseId: response.id, npsScore: score, npsCategory: category },
    source: "web",
    url: sourceUrl,
    utm,
  });
  return { ok: true, message: survey.settings.thankYouMessage };
}
