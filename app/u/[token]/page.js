import { CircleCheck, Info, MailX } from "lucide-react";
import { Button } from "@geiger/ui/button";
import Logo from "@geiger/ui/logo";
import { loadPreferenceContext } from "@/lib/campaigns/unsubscribe";
import { adminClient } from "@/lib/supabase/admin";

// Recipient preference centre behind the signed link in every campaign email. Server-rendered, no
// login, works without JavaScript: plain forms POST to /api/public/unsubscribe, which redirects back
// here with ?status. Viewing the page never changes anything.

export const metadata = {
  title: "Email preferences",
  robots: { index: false, follow: false },
};

const ACTION = `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/api/public/unsubscribe`;

const NOTICES = {
  updated: { tone: "success", text: "Your preferences are saved." },
  resubscribed: { tone: "success", text: "You're subscribed again." },
  blocked: { tone: "warning", text: "This address can't be resubscribed because earlier messages bounced or were reported as spam." },
  invalid: { tone: "warning", text: "That change couldn't be applied. Open the link from the email again." },
};

const TONE = {
  success: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  warning: "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  info: "border-border bg-surface-card text-text-secondary",
};

function Notice({ tone = "info", children }) {
  return <p className={`rounded-lg border px-3 py-2 text-sm ${TONE[tone]}`}>{children}</p>;
}

function Shell({ workspace, children }) {
  return (
    <main className="flex flex-1 justify-center bg-background px-4 py-12 text-foreground sm:py-20">
      <div className="w-full max-w-md space-y-5">
        <header className="flex min-h-7 items-center gap-2.5">
          {workspace?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={workspace.logoUrl} alt={workspace.name || "Logo"} className="h-7 w-auto max-w-[160px] object-contain" />
          ) : null}
          {workspace?.name && !workspace?.logoUrl ? <span className="text-sm font-semibold text-foreground">{workspace.name}</span> : null}
        </header>
        <section className="overflow-hidden rounded-xl border border-border bg-surface-subtle">{children}</section>
        <footer className="space-y-1 text-xs text-text-tertiary">
          {workspace?.address ? <p>{[workspace.name, workspace.address].filter(Boolean).join(" · ")}</p> : null}
          <p className="flex items-center gap-1.5">
            <Logo size={12} className="text-text-tertiary" /> Sent with Geiger Campaign
          </p>
        </footer>
      </div>
    </main>
  );
}

function CardHeader({ title, description }) {
  return (
    <div className="border-b border-border px-5 py-4">
      <h1 className="text-lg font-semibold text-foreground">{title}</h1>
      {description ? <p className="mt-0.5 text-sm text-text-secondary">{description}</p> : null}
    </div>
  );
}

function StatusBlock({ icon: Icon, title, description, children }) {
  return (
    <div className="space-y-4 px-5 py-6">
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-text-secondary" aria-hidden="true" />
        <div className="min-w-0">
          <h1 className="text-base font-semibold text-foreground">{title}</h1>
          {description ? <p className="mt-0.5 text-sm text-text-secondary">{description}</p> : null}
        </div>
      </div>
      {children}
    </div>
  );
}

function ListsForm({ token, lists, disabled = false }) {
  return (
    <form method="post" action={ACTION} className="space-y-3 px-5 py-4">
      <input type="hidden" name="token" value={token} />
      <fieldset className="space-y-2" disabled={disabled}>
        <legend className="mb-2 text-sm font-medium text-foreground">Lists you&apos;re on</legend>
        {lists.map((list) => (
          <label
            key={list.id}
            className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-surface-card px-3 py-2.5 hover:bg-surface-hover"
          >
            <input
              type="checkbox"
              name="keep"
              value={list.id}
              defaultChecked={list.subscribed}
              className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-foreground">{list.name}</span>
              {list.description ? <span className="block text-xs text-text-secondary">{list.description}</span> : null}
            </span>
          </label>
        ))}
      </fieldset>
      <p className="text-xs text-text-secondary">Clearing every list unsubscribes you from all marketing email.</p>
      <Button type="submit" name="action" value="lists" variant="outline" disabled={disabled}>
        Save preferences
      </Button>
    </form>
  );
}

function UnsubscribeAllForm({ token, disabled = false, bordered = false }) {
  return (
    <form
      method="post"
      action={ACTION}
      className={`flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between ${bordered ? "border-t border-border" : ""}`}
    >
      <input type="hidden" name="token" value={token} />
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">Unsubscribe from all marketing email</p>
        <p className="text-xs text-text-secondary">You&apos;ll still receive receipts and account messages.</p>
      </div>
      <Button type="submit" name="action" value="all" disabled={disabled} className="shrink-0">
        Unsubscribe
      </Button>
    </form>
  );
}

export default async function PreferencesPage({ params, searchParams }) {
  const { token } = await params;
  const query = (await searchParams) || {};
  const status = typeof query.status === "string" ? query.status : null;
  const db = adminClient();
  const ctx = db ? await loadPreferenceContext(db, token) : { state: "unavailable" };
  const workspace = ctx.workspace || null;
  const sender = workspace?.name || "this sender";

  if (ctx.state === "unavailable") {
    return (
      <Shell workspace={workspace}>
        <StatusBlock icon={Info} title="Preferences are unavailable right now" description="Try the link again in a few minutes." />
      </Shell>
    );
  }

  if (ctx.state === "invalid") {
    return (
      <Shell workspace={workspace}>
        <StatusBlock
          icon={MailX}
          title="This link isn't valid"
          description="It may have been copied incompletely. Open it again from the original email."
        />
      </Shell>
    );
  }

  if (ctx.state === "test") {
    return (
      <Shell workspace={workspace}>
        <CardHeader title="Email preferences" description={ctx.campaignName ? `Preview from a test of “${ctx.campaignName}”` : "Preview from a test send"} />
        <div className="px-5 pt-4">
          <Notice tone="info">This link came from a test email, so nothing here changes. Recipients manage their subscription on this page.</Notice>
        </div>
        <UnsubscribeAllForm token={token} disabled />
      </Shell>
    );
  }

  const { contact, lists } = ctx;
  const blocked = contact.status === "bounced" || contact.status === "complained";

  if (blocked) {
    return (
      <Shell workspace={workspace}>
        <StatusBlock
          icon={MailX}
          title="This address doesn't receive email"
          description={`Messages from ${sender} to ${contact.email || "this address"} bounced or were reported as spam, so no marketing email is sent to it.`}
        />
      </Shell>
    );
  }

  if (contact.status === "unsubscribed") {
    return (
      <Shell workspace={workspace}>
        <StatusBlock
          icon={CircleCheck}
          title="You're unsubscribed"
          description={`${contact.email || "This address"} won't receive marketing email from ${sender}.`}
        >
          {status === "invalid" ? <Notice tone={NOTICES.invalid.tone}>{NOTICES.invalid.text}</Notice> : null}
          <form method="post" action={ACTION} className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
            <input type="hidden" name="token" value={token} />
            <p className="text-sm text-text-secondary">Unsubscribed by mistake?</p>
            <Button type="submit" name="action" value="resubscribe" variant="outline" className="shrink-0">
              Resubscribe
            </Button>
          </form>
        </StatusBlock>
      </Shell>
    );
  }

  const notice = status && NOTICES[status];
  return (
    <Shell workspace={workspace}>
      <CardHeader title="Email preferences" description={contact.email ? `Managing ${contact.email}` : `Your email from ${sender}`} />
      {notice ? (
        <div className="px-5 pt-4">
          <Notice tone={notice.tone}>{notice.text}</Notice>
        </div>
      ) : null}
      {lists.length ? <ListsForm token={token} lists={lists} /> : null}
      <UnsubscribeAllForm token={token} bordered={lists.length > 0} />
    </Shell>
  );
}
