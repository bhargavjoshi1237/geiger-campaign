import { connection } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { loadForm } from "@/lib/acquisition/server/loaders";
import { loadBrandKit } from "@/lib/content/brand_server";
import { PublicMessage, PublicShell } from "@/lib/acquisition/ui/public_shell";
import { buttonVariants } from "@geiger/ui";

// /f/:formId/confirm — the landing spot for the double opt-in email. Confirming is a button press that
// POSTs the signed token, so mail scanners that prefetch the link never subscribe anyone by accident.

export const metadata = { title: "Confirm your subscription", robots: { index: false, follow: false } };

export default async function ConfirmSubscriptionPage({ params, searchParams }) {
  await connection();
  const { formId } = await params;
  const { token, status } = await searchParams;
  const db = adminClient();
  const form = db ? await loadForm(db, formId) : null;
  const brand = db && form ? await loadBrandKit(db, form.projectId) : undefined;

  if (status === "confirmed") {
    return (
      <PublicMessage brand={brand} title="You're subscribed">
        Thanks for confirming. You&apos;ll start hearing from {brand?.displayName || "us"} soon.
      </PublicMessage>
    );
  }
  if (status === "invalid" || status === "error") {
    return (
      <PublicMessage brand={brand} title="This link has expired">
        Confirmation links work for 7 days. Sign up again and we&apos;ll send you a fresh one.
      </PublicMessage>
    );
  }
  if (typeof token !== "string" || !token) {
    return (
      <PublicMessage brand={brand} title="Confirmation link incomplete">
        Open the link from your confirmation email again, or copy the whole address into your browser.
      </PublicMessage>
    );
  }

  const base = process.env.NEXT_PUBLIC_BASE_PATH || "";
  return (
    <PublicShell brand={brand}>
      <form method="post" action={`${base}/api/public/forms/${formId}/confirm`} className="space-y-5">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground" style={{ fontFamily: "var(--brand-font-heading, inherit)" }}>
            Confirm your subscription
          </h1>
          <p className="text-sm leading-6 text-muted-foreground">
            One click and you&apos;re on the list{form?.name ? ` for “${form.name}”` : ""}.
          </p>
        </div>
        <input type="hidden" name="token" value={token} />
        <button type="submit" className={buttonVariants({ size: "lg" })}>
          Confirm subscription
        </button>
      </form>
    </PublicShell>
  );
}
