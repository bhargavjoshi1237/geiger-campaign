import { LinkIcon } from "lucide-react";

// Shown when a /j/<slug> join link doesn't exist or was turned off.
export const metadata = { title: "Link unavailable", robots: { index: false } };

export default function JoinLinkUnavailablePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-16">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface-subtle p-6 text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface-card text-text-secondary">
          <LinkIcon className="h-5 w-5" aria-hidden="true" />
        </div>
        <h1 className="mt-4 text-base font-semibold text-foreground">This link isn&apos;t active</h1>
        <p className="mt-1 text-sm text-text-secondary">
          The invite link you followed has expired or was turned off. Ask whoever shared it for a new one.
        </p>
      </div>
    </main>
  );
}
