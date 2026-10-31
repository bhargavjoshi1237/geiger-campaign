import { notFound } from "next/navigation";
import { connection } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { loadSurvey, publicSurveyView } from "@/lib/acquisition/server/loaders";
import { loadBrandKit } from "@/lib/content/brand_server";
import { PublicMessage, PublicShell } from "@/lib/acquisition/ui/public_shell";
import { SurveyForm } from "@/lib/acquisition/ui/survey_form";

// /s/:surveyId — the hosted survey. A ?gc=<contact token> on the link ties the answers to the contact.

export async function generateMetadata({ params }) {
  const { surveyId } = await params;
  const db = adminClient();
  const survey = db ? await loadSurvey(db, surveyId) : null;
  return { title: survey?.name || "Survey", robots: { index: false, follow: false } };
}

export default async function HostedSurveyPage({ params, searchParams }) {
  await connection();
  const { surveyId } = await params;
  const { gc } = await searchParams;
  const db = adminClient();
  if (!db) return <PublicMessage title="This survey is unavailable">Surveys aren&apos;t configured on this deployment yet.</PublicMessage>;
  const survey = await loadSurvey(db, surveyId);
  if (!survey) notFound();
  const brand = await loadBrandKit(db, survey.projectId);
  if (survey.status !== "live") {
    return (
      <PublicMessage brand={brand} title={survey.name}>
        {survey.status === "closed" ? "This survey has closed. Thanks for your interest." : "This survey isn't open yet."}
      </PublicMessage>
    );
  }
  const view = publicSurveyView(survey);
  return (
    <PublicShell brand={brand}>
      <div className="space-y-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl" style={{ fontFamily: "var(--brand-font-heading, inherit)" }}>
            {view.name}
          </h1>
          {view.intro ? <p className="whitespace-pre-line text-base leading-7 text-muted-foreground">{view.intro}</p> : null}
        </div>
        <SurveyForm survey={view} contactToken={typeof gc === "string" ? gc : ""} />
      </div>
    </PublicShell>
  );
}
