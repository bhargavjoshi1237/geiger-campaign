import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ArrowUpRight } from "lucide-react";
import { adminClient } from "@/lib/supabase/admin";
import { PublicMessage, PublicShell } from "@/lib/acquisition/ui/public_shell";
import { loadPublishedBioPage } from "@/lib/social/bio_server";

// /bio/:slug — a published link-in-bio page, server-rendered with the project's brand kit. Every link goes through
// /bio/:slug/go/:linkId so clicks are counted and recorded as link_clicked.

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const db = adminClient();
  const result = db ? await loadPublishedBioPage(db, slug) : null;
  if (!result) return { title: "Page not found" };
  const title = result.page.title || result.brand?.displayName || "Links";
  return { title, description: result.page.bio || undefined, openGraph: { title, description: result.page.bio || undefined } };
}

export default async function BioPage({ params }) {
  await connection();
  const { slug } = await params;
  const db = adminClient();
  if (!db) return <PublicMessage title="This page is unavailable">Link-in-bio pages aren&apos;t configured on this deployment yet.</PublicMessage>;
  const result = await loadPublishedBioPage(db, slug);
  if (!result) notFound();
  const { page, links, brand } = result;
  const theme = page.theme && typeof page.theme === "object" ? page.theme : {};
  const outline = theme.buttonStyle === "outline";
  const avatar = page.avatar_url || brand?.iconUrl || "";
  const title = page.title || brand?.displayName || "";

  return (
    <PublicShell brand={theme.useBrandKit === false ? {} : brand}>
      <div className="flex flex-col items-center text-center">
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatar} alt="" className="h-20 w-20 rounded-full border border-border bg-surface-card object-cover" />
        ) : null}
        {title ? (
          <h1 className="mt-4 text-xl font-semibold tracking-tight text-foreground" style={{ fontFamily: "var(--brand-font-heading, inherit)" }}>
            {title}
          </h1>
        ) : null}
        {page.bio ? <p className="mt-2 max-w-md whitespace-pre-line text-sm leading-6 text-muted-foreground">{page.bio}</p> : null}
      </div>

      <nav aria-label="Links" className="mt-8 flex flex-col gap-3">
        {links.length ? (
          links.map((link) => (
            <a
              key={link.id}
              href={`${BASE_PATH}/bio/${page.slug}/go/${link.id}`}
              rel="noopener"
              className={
                outline
                  ? "group flex min-h-12 items-center justify-between gap-3 rounded-xl border border-border-strong bg-transparent px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  : "group flex min-h-12 items-center justify-between gap-3 rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              }
            >
              <span className="min-w-0 flex-1 truncate text-left">{link.label || link.url}</span>
              <ArrowUpRight aria-hidden="true" className="h-4 w-4 shrink-0 opacity-70 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </a>
          ))
        ) : (
          <p className="text-center text-sm text-text-secondary">No links yet.</p>
        )}
      </nav>
    </PublicShell>
  );
}
