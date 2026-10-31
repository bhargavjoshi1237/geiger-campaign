import { notFound } from "next/navigation";
import { connection } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { loadPublishedPage } from "@/lib/acquisition/server/loaders";
import { PublicMessage, PublicShell } from "@/lib/acquisition/ui/public_shell";
import { LandingPageView } from "@/lib/acquisition/ui/landing_view";
import { ViewBeacon } from "@/lib/acquisition/ui/view_beacon";
import { slugify } from "@/lib/acquisition/blocks";

// /p/:slug — a published landing page, rendered server-side from its blocks with the brand kit.

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const db = adminClient();
  const result = db ? await loadPublishedPage(db, slug) : null;
  if (!result) return { title: "Page not found" };
  const { page } = result;
  const title = page.seo.title || page.name;
  const description = page.seo.description || undefined;
  return {
    title,
    description,
    robots: page.seo.noIndex ? { index: false, follow: false } : undefined,
    openGraph: { title, description, images: page.seo.imageUrl ? [page.seo.imageUrl] : undefined },
  };
}

export default async function LandingPage({ params }) {
  await connection();
  const { slug } = await params;
  const db = adminClient();
  if (!db) return <PublicMessage title="This page is unavailable">Landing pages aren&apos;t configured on this deployment yet.</PublicMessage>;
  const result = await loadPublishedPage(db, slug);
  if (!result) notFound();
  const { page, forms, brand } = result;
  return (
    <PublicShell brand={brand} width="wide">
      <LandingPageView page={page} forms={forms} />
      <ViewBeacon path={`/p/${slugify(page.slug)}/view`} sessionKey={`gc_pv_${page.id}`} />
    </PublicShell>
  );
}
