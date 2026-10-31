"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ExternalLink, Info, Loader2, Pencil, Play, Plus, Radar, Trash2 } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import {
  ActionMenu,
  Button,
  Checkbox,
  DataTable,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Field,
  Input,
  ScreenHeader,
  SearchInput,
  StatsBar,
  StatusPill,
  Switch,
  Textarea,
  Toolbar,
  cn,
} from "@geiger/ui";
import { useProject } from "@/context/project-context";
import { useCan } from "@/context/rbac-context";
import { apiPost } from "@/lib/api/client";
import { getUser } from "@/lib/supabase/user";
import { createListeningQuery, listListeningQueries, listMentions, softDeleteListeningQuery, updateListeningQuery } from "@/lib/supabase/listening";
import { HASHTAG_LIMIT, HASHTAG_WINDOW_DAYS, hashtagBudget, queryHashtags } from "@/lib/social/listening_limits";
import { networkLabel } from "@/lib/social/networks";
import { ConnectAccountsNotice, LoadingPanel, NetworkIcon, useNow, useSocialAccounts } from "./social_kit";
import { MENTION_SOURCE_LABELS, OUTLINE_BUTTON, SENTIMENT_FILTER_OPTIONS, SENTIMENT_MAP, excerpt, formatDateTime, formatNumber, formatPercent, formatRelative } from "./constants";

const VIEWS = [
  { value: "mentions", label: "Mentions" },
  { value: "queries", label: "Queries" },
];
const SOURCES = [
  { value: "hashtags", label: "Instagram hashtags", hint: "Public posts using the terms as hashtags. Recent posts cover the last 24 hours; counts toward the 30-hashtag weekly limit." },
  { value: "tags", label: "Posts you're tagged in", hint: "Media where your Instagram business account is tagged." },
  { value: "comments", label: "Comments on your posts", hint: "Comments already arriving in the inbox, on every connected network." },
];
const COMMENT_NETWORKS = ["instagram", "facebook", "telegram"];
const lines = (value) => String(value || "").split(/\n|,/).map((s) => s.trim()).filter(Boolean);
const EMPTY = { name: "", terms: "", excluded: "", sources: ["hashtags", "tags", "comments"], networks: ["instagram"], active: true };

function QueryDialog({ open, query, queries, onOpenChange, onSave }) {
  const [form, setForm] = useState(() =>
    query ? { name: query.name, terms: query.terms.join("\n"), excluded: query.excluded.join("\n"), sources: query.sources, networks: query.networks, active: query.active } : EMPTY,
  );
  const [pending, setPending] = useState(false);
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const toggle = (key, value) => (on) => setForm((f) => ({ ...f, [key]: on ? [...new Set([...f[key], value])] : f[key].filter((x) => x !== value) }));

  const igSource = form.sources.includes("hashtags") || form.sources.includes("tags");
  const networks = form.sources.includes("comments") ? form.networks : [];
  const candidate = { ...form, id: query?.id || "draft", terms: lines(form.terms), networks: igSource ? [...new Set(["instagram", ...networks])] : networks };
  const budget = hashtagBudget([...queries.filter((q) => q.id !== query?.id), candidate]);
  const ownNew = queryHashtags(candidate).filter((t) => !budget.usedTags.includes(t)).length;

  const submit = async () => {
    if (!form.name.trim()) return toast.error("Name the query.");
    if (!candidate.terms.length) return toast.error("Add at least one term.");
    if (!form.sources.length) return toast.error("Pick at least one source.");
    if (!candidate.networks.length) return toast.error("Pick at least one network for comment listening.");
    if (form.active && budget.overBy > 0) return toast.error(`That's ${budget.overBy} hashtag${budget.overBy === 1 ? "" : "s"} over Instagram's weekly limit. Remove some terms or pause another query.`);
    setPending(true);
    const ok = await onSave({ name: form.name.trim(), terms: candidate.terms, excluded: lines(form.excluded), sources: form.sources, networks: candidate.networks, active: form.active });
    setPending(false);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{query ? "Edit query" : "New listening query"}</DialogTitle>
          <DialogDescription>Terms are matched whole-word and case-insensitive. Hashtag search uses each term as a hashtag.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Name" htmlFor="lq-name">
            <Input id="lq-name" value={form.name} onChange={(e) => set("name")(e.target.value)} placeholder="Brand mentions" autoFocus />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Terms" htmlFor="lq-terms" hint="One per line.">
              <Textarea id="lq-terms" rows={4} value={form.terms} onChange={(e) => set("terms")(e.target.value)} placeholder={"halcyonstudio\n#halcyonsummit"} />
            </Field>
            <Field label="Exclude" htmlFor="lq-excluded" hint="Skip mentions containing these.">
              <Textarea id="lq-excluded" rows={4} value={form.excluded} onChange={(e) => set("excluded")(e.target.value)} placeholder="giveaway" />
            </Field>
          </div>
          <Field label="Sources">
            <div className="grid gap-2.5 pt-1">
              {SOURCES.map((s) => (
                <label key={s.value} className="flex items-start gap-2.5 text-sm">
                  <Checkbox className="mt-0.5" checked={form.sources.includes(s.value)} onCheckedChange={toggle("sources", s.value)} />
                  <span>
                    <span className="block text-foreground">{s.label}</span>
                    <span className="block text-xs text-text-secondary">{s.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </Field>
          {form.sources.includes("comments") ? (
            <Field label="Comment networks">
              <div className="flex flex-wrap gap-4 pt-1">
                {COMMENT_NETWORKS.map((n) => (
                  <label key={n} className="inline-flex items-center gap-2 text-sm text-foreground">
                    <Checkbox checked={form.networks.includes(n)} onCheckedChange={toggle("networks", n)} />
                    <NetworkIcon network={n} className="h-3.5 w-3.5 text-muted-foreground" /> {networkLabel(n)}
                  </label>
                ))}
              </div>
            </Field>
          ) : null}
          {form.sources.includes("hashtags") ? (
            <p className={cn("text-xs", budget.overBy > 0 && form.active ? "text-red-600 dark:text-red-400" : "text-text-secondary")}>
              {ownNew ? `Adds ${ownNew} hashtag${ownNew === 1 ? "" : "s"} to the weekly budget` : "No new hashtags"} · {formatNumber(budget.used + budget.planned)} of {HASHTAG_LIMIT} in use across active queries
              {budget.overBy > 0 && form.active ? ` — ${budget.overBy} over the limit` : ""}.
            </p>
          ) : null}
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-card px-3 py-2.5">
            <span className="text-sm text-foreground">Run automatically every hour</span>
            <Switch checked={form.active} onCheckedChange={set("active")} aria-label="Run automatically" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {query ? "Save query" : "Create query"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LimitsNotice({ budget }) {
  return (
    <div className="flex gap-3 rounded-xl border border-border bg-surface-subtle px-4 py-3.5">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-text-tertiary" aria-hidden="true" />
      <div className="min-w-0 space-y-1 text-sm text-text-secondary">
        <p>
          <span className="font-medium text-foreground">What the APIs allow.</span> Instagram hashtag search: {HASHTAG_LIMIT} unique hashtags per account in a rolling {HASHTAG_WINDOW_DAYS} days, recent posts from the last 24 hours only. Tagged media for your own account. Comments on your own posts on every connected network. There is no API to search all of Instagram, Facebook or TikTok, so nothing here claims to.
        </p>
        <p className="tabular-nums">
          {formatNumber(budget.used)} of {HASHTAG_LIMIT} hashtags used this week{budget.planned ? ` · ${formatNumber(budget.planned)} more queued by active queries` : ""}
          {budget.nextReleaseAt ? ` · next slot frees ${formatRelative(budget.nextReleaseAt)}` : ""}.
        </p>
      </div>
    </div>
  );
}

export function ListeningScreen() {
  const { projectId } = useProject();
  const canEdit = useCan("campaign.social.edit");
  const { accounts, loading: accountsLoading } = useSocialAccounts(projectId);
  const [queries, setQueries] = useState([]);
  const [mentions, setMentions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("mentions");
  const [queryFilter, setQueryFilter] = useState("all");
  const [sentiment, setSentiment] = useState("all");
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [running, setRunning] = useState(null);
  const now = useNow();

  const load = async () => {
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const [q, m] = await Promise.all([listListeningQueries(projectId), listMentions(projectId, { since, limit: 2000 })]);
    if (q === null) toast.error("Couldn't load listening queries.");
    setQueries(q ?? []);
    setMentions(m ?? []);
    setLoading(false);
  };

  useEffect(() => {
    let alive = true;
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    Promise.all([listListeningQueries(projectId), listMentions(projectId, { since, limit: 2000 })]).then(([q, m]) => {
      if (!alive) return;
      if (q === null) toast.error("Couldn't load listening queries.");
      setQueries(q ?? []);
      setMentions(m ?? []);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const budget = useMemo(() => hashtagBudget(queries, now), [queries, now]);
  const queryName = useMemo(() => new Map(queries.map((q) => [q.id, q.name])), [queries]);
  const hasInstagram = accounts.some((a) => a.network === "instagram" && a.connected);

  const stats = useMemo(() => {
    const week = mentions.filter((m) => new Date(m.postedAt).getTime() >= now - 7 * 86_400_000);
    const classified = week.filter((m) => m.sentiment);
    return [
      { label: "Mentions · 7 days", value: formatNumber(week.length) },
      { label: "Negative share", value: classified.length ? formatPercent(classified.filter((m) => m.sentiment === "negative").length / classified.length) : "—" },
      { label: "Hashtags this week", value: `${budget.used} / ${HASHTAG_LIMIT}` },
      { label: "Active queries", value: formatNumber(queries.filter((q) => q.active).length) },
    ];
  }, [mentions, queries, budget, now]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return mentions.filter((m) => {
      if (queryFilter !== "all" && m.queryId !== queryFilter) return false;
      if (sentiment !== "all" && (m.sentiment || "unclassified") !== sentiment) return false;
      if (q && !`${m.author} ${m.text} ${m.matchedTerms.join(" ")}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [mentions, queryFilter, sentiment, search]);

  const pager = usePagination(filtered, { resetKey: `${queryFilter}|${sentiment}|${search}` });
  const queriesPager = usePagination(queries);

  const save = async (input) => {
    if (dialog?.query) {
      const before = dialog.query;
      setQueries((list) => list.map((q) => (q.id === before.id ? { ...q, ...input } : q)));
      const saved = await updateListeningQuery(before.id, input);
      if (!saved) {
        setQueries((list) => list.map((q) => (q.id === before.id ? before : q)));
        toast.error("Couldn't save the query.");
        return false;
      }
      setQueries((list) => list.map((q) => (q.id === saved.id ? saved : q)));
      toast.success("Query saved.");
      return true;
    }
    const user = await getUser();
    const id = crypto.randomUUID();
    setQueries((list) => [...list, { ...input, id, lastRunAt: null, lastError: "" }]);
    const created = await createListeningQuery(projectId, { ...input, id, createdBy: user?.id || null });
    if (!created) {
      setQueries((list) => list.filter((q) => q.id !== id));
      toast.error("Couldn't create the query.");
      return false;
    }
    setQueries((list) => list.map((q) => (q.id === id ? created : q)));
    toast.success("Query created. Run it now or wait for the hourly run.");
    return true;
  };

  const setActive = async (query, active) => {
    if (active && hashtagBudget(queries.map((q) => (q.id === query.id ? { ...q, active } : q)), now).overBy > 0) {
      return toast.error("Turning this on would go over Instagram's 30-hashtag weekly limit.");
    }
    setQueries((list) => list.map((q) => (q.id === query.id ? { ...q, active } : q)));
    const saved = await updateListeningQuery(query.id, { active });
    if (!saved) {
      setQueries((list) => list.map((q) => (q.id === query.id ? query : q)));
      toast.error("Couldn't update the query.");
    }
  };

  const run = async (query) => {
    setRunning(query.id);
    const res = await apiPost(`/api/projects/${projectId}/social/listening/run`, { queryId: query.id });
    await load();
    setRunning(null);
    if (!res.ok) return toast.error(res.error || "Couldn't run the query.");
    const { mentions: found = 0, errors = [] } = res.data || {};
    if (errors.length) toast.warning(errors[0]);
    toast.success(found ? `${formatNumber(found)} mention${found === 1 ? "" : "s"} found or updated.` : "No new mentions.");
  };

  const remove = async (query) => {
    setDeleteTarget(null);
    setQueries((list) => list.filter((q) => q.id !== query.id));
    const ok = await softDeleteListeningQuery(query.id);
    if (!ok) {
      setQueries((list) => [...list, query]);
      return toast.error("Couldn't delete the query.");
    }
    setMentions((list) => list.filter((m) => m.queryId !== query.id));
    toast.success("Query deleted.");
  };

  const queryOptions = [{ value: "all", label: "All queries" }, ...queries.map((q) => ({ value: q.id, label: q.name }))];
  const filtersActive = Boolean(search) || queryFilter !== "all" || sentiment !== "all";

  const mentionColumns = [
    {
      key: "mention",
      header: "Mention",
      className: "max-w-xl whitespace-normal",
      render: (m) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{m.author ? `@${m.author.replace(/^@/, "")}` : "Unknown author"}</p>
          <p className="line-clamp-2 text-sm text-text-secondary">{excerpt(m.text, 220) || "No caption"}</p>
        </div>
      ),
    },
    { key: "query", header: "Query", className: "whitespace-nowrap text-sm text-text-secondary", render: (m) => queryName.get(m.queryId) || "—" },
    {
      key: "source",
      header: "Source",
      render: (m) => (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm text-text-secondary">
          <NetworkIcon network={m.network} className="h-3.5 w-3.5" /> {MENTION_SOURCE_LABELS[m.source] || m.source}
        </span>
      ),
    },
    { key: "sentiment", header: "Sentiment", render: (m) => <StatusPill status={m.sentiment || "unclassified"} map={SENTIMENT_MAP} /> },
    {
      key: "engagement",
      header: "Likes · comments",
      align: "right",
      className: "whitespace-nowrap tabular-nums text-sm",
      render: (m) => (m.engagement?.likes != null ? `${formatNumber(m.engagement.likes)} · ${formatNumber(m.engagement.comments)}` : "—"),
    },
    { key: "posted", header: "Posted", className: "whitespace-nowrap text-sm text-text-secondary", render: (m) => formatRelative(m.postedAt, now) },
    {
      key: "link",
      header: "",
      align: "right",
      render: (m) =>
        m.url ? (
          <Button asChild size="icon-sm" variant="ghost" className="text-muted-foreground" aria-label="Open on the network">
            <a href={m.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </Button>
        ) : null,
    },
  ];

  const queryColumns = [
    {
      key: "name",
      header: "Query",
      className: "max-w-md whitespace-normal",
      render: (q) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{q.name}</p>
          <p className="truncate text-xs text-text-secondary">{q.terms.join(", ") || "No terms"}{q.excluded.length ? ` · excluding ${q.excluded.join(", ")}` : ""}</p>
        </div>
      ),
    },
    { key: "sources", header: "Sources", className: "text-sm text-text-secondary", render: (q) => q.sources.map((s) => SOURCES.find((x) => x.value === s)?.label.split(" ")[0]).join(", ") },
    { key: "hashtags", header: "Hashtags", align: "right", className: "tabular-nums", render: (q) => formatNumber(queryHashtags(q).length) },
    {
      key: "run",
      header: "Last run",
      className: "max-w-xs whitespace-normal text-sm",
      render: (q) => (
        <div className="min-w-0">
          <p className="text-text-secondary">{q.lastRunAt ? formatDateTime(q.lastRunAt) : "Never"}</p>
          {q.lastError ? <p className="line-clamp-2 text-xs text-red-600 dark:text-red-400">{q.lastError}</p> : null}
        </div>
      ),
    },
    {
      key: "active",
      header: "Hourly",
      render: (q) => <Switch aria-label={`Run ${q.name} hourly`} checked={q.active} disabled={!canEdit} onCheckedChange={(v) => setActive(q, v)} />,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (q) => (
        <div className="flex justify-end gap-1">
          {canEdit ? (
            <Button size="sm" variant="outline" className={OUTLINE_BUTTON} onClick={() => run(q)} disabled={Boolean(running)}>
              {running === q.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Run now
            </Button>
          ) : null}
          <ActionMenu
            label={`Actions for ${q.name}`}
            items={[
              canEdit && { label: "Edit", icon: Pencil, onSelect: () => setDialog({ query: q }) },
              { separator: true },
              canEdit && { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setDeleteTarget(q) },
            ]}
          />
        </div>
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Listening"
        description="Mentions of your terms from the sources the official APIs expose: Instagram hashtags, posts you're tagged in, and comments on your own posts."
        actions={
          canEdit ? (
            <Button onClick={() => setDialog({ query: null })}>
              <Plus className="h-4 w-4" /> New query
            </Button>
          ) : null
        }
      />

      <StatsBar stats={stats} />
      <LimitsNotice budget={budget} />

      {!accountsLoading && !hasInstagram ? (
        <ConnectAccountsNotice title="No Instagram business account connected" description="Hashtag search and tagged media run through a connected Instagram business or creator account. Comment listening works with any connected account." />
      ) : null}

      <Toolbar>
        <div className="flex flex-wrap items-center gap-2">
          <FilterDropdown value={view} onValueChange={setView} options={VIEWS} height="h-9" />
          {view === "mentions" ? (
            <>
              <FilterDropdown value={queryFilter} onValueChange={setQueryFilter} options={queryOptions} height="h-9" />
              <FilterDropdown value={sentiment} onValueChange={setSentiment} options={SENTIMENT_FILTER_OPTIONS} height="h-9" />
            </>
          ) : null}
        </div>
        {view === "mentions" ? <SearchInput value={search} onChange={setSearch} placeholder="Search mentions…" /> : null}
      </Toolbar>

      {loading ? (
        <LoadingPanel label="Loading mentions" />
      ) : view === "mentions" ? (
        <div className="space-y-5">
          <DataTable
            columns={mentionColumns}
            data={pager.pageItems}
            getRowKey={(m) => m.id}
            empty={
              <div className="rounded-xl border border-border bg-surface-subtle">
                <EmptyState
                  icon={Radar}
                  title={filtersActive ? "No matches" : queries.length ? "No mentions in the last 30 days" : "Nothing to listen for yet"}
                  description={filtersActive ? "Try a different query, sentiment or search." : queries.length ? "Run a query now, or wait for the hourly run." : "Create a query with your brand name, product names or campaign hashtags."}
                  action={
                    filtersActive ? (
                      <Button variant="outline" className={OUTLINE_BUTTON} onClick={() => { setSearch(""); setQueryFilter("all"); setSentiment("all"); }}>Clear filters</Button>
                    ) : !queries.length && canEdit ? (
                      <Button onClick={() => setDialog({ query: null })}><Plus className="h-4 w-4" /> New query</Button>
                    ) : null
                  }
                />
              </div>
            }
          />
          <ListPagination {...pager} itemLabel="mentions" />
        </div>
      ) : (
        <div className="space-y-5">
          <DataTable
            columns={queryColumns}
            data={queriesPager.pageItems}
            getRowKey={(q) => q.id}
            onRowClick={canEdit ? (q) => setDialog({ query: q }) : undefined}
            empty={
              <div className="rounded-xl border border-border bg-surface-subtle">
                <EmptyState
                  icon={Radar}
                  title="No listening queries"
                  description="Create a query with your brand name, product names or campaign hashtags."
                  action={canEdit ? <Button onClick={() => setDialog({ query: null })}><Plus className="h-4 w-4" /> New query</Button> : null}
                />
              </div>
            }
          />
          <ListPagination {...queriesPager} itemLabel="queries" />
        </div>
      )}

      {dialog ? <QueryDialog open query={dialog.query} queries={queries} onOpenChange={(o) => !o && setDialog(null)} onSave={save} /> : null}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete query</DialogTitle>
            <DialogDescription>
              Delete <span className="font-medium text-foreground">{deleteTarget?.name}</span> and its mentions? Hashtags it already searched still count toward this week&apos;s limit.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button className="bg-red-500/90 text-white hover:bg-red-500" onClick={() => remove(deleteTarget)}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainScreenWrapper>
  );
}

export default ListeningScreen;
