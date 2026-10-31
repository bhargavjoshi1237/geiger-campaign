import { notFound } from "next/navigation";
import { connection } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { loadPublicForm } from "@/lib/acquisition/server/loaders";
import { PublicMessage, PublicShell } from "@/lib/acquisition/ui/public_shell";
import { PublicForm } from "@/lib/acquisition/ui/public_form";

// /f/:formId — the hosted version of a form, rendered server-side with the project's brand kit.

export async function generateMetadata({ params }) {
  const { formId } = await params;
  const db = adminClient();
  const result = db ? await loadPublicForm(db, formId) : null;
  const title = result?.view?.title || result?.name || "Form";
  return { title, robots: { index: false, follow: false } };
}

export default async function HostedFormPage({ params, searchParams }) {
  await connection();
  const { formId } = await params;
  const { status, message } = await searchParams;
  const db = adminClient();
  if (!db) {
    return <PublicMessage title="This form is unavailable">Hosted forms aren&apos;t configured on this deployment yet.</PublicMessage>;
  }
  const result = await loadPublicForm(db, formId);
  if (result.status === "missing") notFound();
  if (!result.form) {
    return (
      <PublicMessage brand={result.brand} title={result.name || "This form is closed"}>
        This form isn&apos;t accepting submissions right now.
      </PublicMessage>
    );
  }
  const view = result.view;
  return (
    <PublicShell brand={result.brand}>
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl" style={{ fontFamily: "var(--brand-font-heading, inherit)" }}>
            {view.title}
          </h1>
          {view.intro ? <p className="whitespace-pre-line text-base leading-7 text-muted-foreground">{view.intro}</p> : null}
        </div>
        <PublicForm form={view} initialStatus={typeof status === "string" ? status : null} initialMessage={typeof message === "string" ? message : ""} />
      </div>
    </PublicShell>
  );
}
