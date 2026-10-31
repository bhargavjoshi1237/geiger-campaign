"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, FlaskConical, History, Loader2, Pencil, Plus, Save, ShieldAlert, SlidersHorizontal, Target, Trash2, Zap } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { EditorShell } from "@/components/internal/shared/editor_shell";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import {
  ActionMenu,
  Badge,
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
  InlineTitleInput,
  Input,
  ScreenHeader,
  SearchInput,
  SectionCard,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingRow,
  SettingsList,
  StatsBar,
  StatusPill,
  Switch,
  Textarea,
  Toolbar,
} from "@geiger/ui";
import { useProject } from "@/context/project-context";
import { useCan } from "@/context/rbac-context";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { apiPost } from "@/lib/api/client";
import { getUser } from "@/lib/supabase/user";
import {
  createModerationRule,
  listModerationLog,
  listModerationRules,
  softDeleteModerationRule,
  updateModerationRule,
} from "@/lib/supabase/moderation_rules";
import {
  AI_LABELS,
  MODERATION_ACTIONS,
  SCOPE_MODES,
  compilePattern,
  describeConditions,
  describeReasons,
  evaluateRule,
  isAllowlisted,
  ruleInScope,
  ruleUsesAi,
} from "@/lib/social/moderation_eval";
import { networkLabel } from "@/lib/social/networks";
import { LoadingPanel, NetworkIcon, useNow } from "./social_kit";
import { LOG_STATUS_MAP, MODERATION_ACTION_MAP, OUTLINE_BUTTON, excerpt, formatDateTime, formatNumber } from "./constants";

const MODERATED_NETWORKS = ["instagram", "facebook", "telegram"];
const VIEWS = [
  { value: "rules", label: "Rules" },
  { value: "log", label: "Activity log" },
];
const NAV = [
  { key: "conditions", label: "Conditions", icon: SlidersHorizontal, desc: "Any matching condition fires the rule." },
  { key: "scope", label: "Scope", icon: Target, desc: "Which accounts, posts and ads the rule watches, and who it never touches." },
  { key: "action", label: "Action", icon: Zap, desc: "What happens to a matching comment." },
  { key: "test", label: "Test", icon: FlaskConical, desc: "Try a sample comment against this rule before it goes live." },
  { key: "activity", label: "Activity", icon: History, desc: "Every comment this rule acted on." },
];

const lines = (value) => String(value || "").split(/\n|,/).map((s) => s.trim()).filter(Boolean);
const joinLines = (list) => (list || []).join("\n");

function blankRule() {
  return {
    name: "",
    conditions: { keywords: [], regex: [], links: false, competitorTerms: [], ai: [] },
    scope: { mode: "allPosts", postIds: [] },
    networks: [],
    action: "hide",
    replyText: "",
    allowlist: [],
    active: true,
    priority: 0,
  };
}

// One-per-line list editor that keeps the raw text while typing.
function ListField({ label, hint, id, value, onChange, placeholder, rows = 3 }) {
  const [text, setText] = useState(() => joinLines(value));
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <Textarea id={id} rows={rows} value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)} onBlur={() => onChange(lines(text))} />
    </Field>
  );
}

function TestSection({ projectId, rule }) {
  const [sample, setSample] = useState({ text: "", network: "instagram", isAd: false, authorName: "" });
  const [aiLabels, setAiLabels] = useState(null);
  const [checking, setChecking] = useState(false);
  const comment = { ...sample, postId: null };
  const inScope = ruleInScope(rule, comment);
  const allowlisted = isAllowlisted(rule, comment);
  const result = sample.text.trim() ? evaluateRule(rule, comment, { aiLabels }) : null;

  const checkAi = async () => {
    setChecking(true);
    const res = await apiPost(`/api/projects/${projectId}/social/moderation/test`, { text: sample.text });
    setChecking(false);
    if (!res.ok) return toast.error(res.error || "Couldn't classify the comment.");
    setAiLabels(res.data.labels);
  };

  const set = (key) => (value) => {
    setSample((s) => ({ ...s, [key]: value }));
    if (key === "text") setAiLabels(null);
  };

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <SectionCard bare title="Sample comment" description="A comment, network and author to run against this rule.">
        <div className="grid gap-4">
          <Field label="Comment" htmlFor="mr-sample">
            <Textarea id="mr-sample" rows={4} value={sample.text} onChange={(e) => set("text")(e.target.value)} placeholder="Paste a real comment you'd want caught" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Network">
              <Select value={sample.network} onValueChange={set("network")}>
                <SelectTrigger className="bg-surface-card"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MODERATED_NETWORKS.map((n) => <SelectItem key={n} value={n}>{networkLabel(n)}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Author" htmlFor="mr-author" hint="Checks the allowlist.">
              <Input id="mr-author" value={sample.authorName} onChange={(e) => set("authorName")(e.target.value)} placeholder="@handle" />
            </Field>
          </div>
          <SettingRow title="Comment is on an ad" description="Ads-only and organic-only scopes depend on this." checked={sample.isAd} onCheckedChange={set("isAd")} />
        </div>
      </SectionCard>
      <SectionCard
        title="Result"
        action={
          ruleUsesAi(rule) ? (
            <Button size="sm" variant="outline" className={OUTLINE_BUTTON} onClick={checkAi} disabled={checking || !sample.text.trim()}>
              {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />} Run AI check
            </Button>
          ) : null
        }
      >
        {!result ? (
          <p className="text-sm text-text-secondary">Type a sample comment to see whether this rule would act on it.</p>
        ) : !inScope ? (
          <p className="text-sm text-text-secondary">Out of scope — this rule doesn&apos;t watch {networkLabel(sample.network)} {sample.isAd ? "ads" : "posts"}.</p>
        ) : allowlisted ? (
          <p className="text-sm text-text-secondary">Skipped — the author is on this rule&apos;s allowlist.</p>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <StatusPill status={result.matched ? rule.action : "none"} map={{ ...MODERATION_ACTION_MAP, none: { label: "No match", variant: "neutral" } }} />
              <span className="text-text-secondary">{result.matched ? describeReasons(result.reasons) : result.needsAi ? "Keywords didn't match. Run the AI check to test the AI conditions." : "Nothing matched."}</span>
            </div>
            {aiLabels ? (
              <p className="text-xs text-text-secondary">
                AI labels: {AI_LABELS.map((l) => `${l.label} ${aiLabels[l.key] ? "yes" : "no"}`).join(" · ")}
              </p>
            ) : null}
            {result.invalid.length ? (
              <p className="text-xs text-red-600 dark:text-red-400">Invalid pattern “{result.invalid[0].pattern}”: {result.invalid[0].error}</p>
            ) : null}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function RuleEditor({ projectId, rule, log, canEdit, onBack, onSaved, onDelete }) {
  const [draft, setDraft] = useState(rule);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(rule);
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  const setCond = (key) => (value) => setDraft((d) => ({ ...d, conditions: { ...d.conditions, [key]: value } }));
  const ruleLog = log.filter((l) => l.ruleId === rule.id);
  const badPatterns = draft.conditions.regex.map((p) => ({ p, ...compilePattern(p) })).filter((x) => !x.re);
  const telegramHide = draft.action === "hide" && (!draft.networks.length || draft.networks.includes("telegram"));

  const save = async () => {
    if (badPatterns.length) return toast.error(`Fix the pattern “${badPatterns[0].p}” first.`);
    if (draft.action === "reply" && !draft.replyText.trim()) return toast.error("Write the reply this rule posts.");
    setSaving(true);
    const saved = await updateModerationRule(rule.id, draft);
    setSaving(false);
    if (!saved) return toast.error("Couldn't save the rule.");
    onSaved(saved);
    toast.success("Rule saved.");
  };

  return (
    <EditorShell
      back={{ label: "Moderation Rules", onClick: onBack }}
      title={
        canEdit ? (
          <InlineTitleInput value={draft.name} onChange={(e) => set("name")(e.target.value)} placeholder="Untitled rule" aria-label="Rule name" className="text-xl font-semibold text-foreground" />
        ) : (
          draft.name || "Untitled rule"
        )
      }
      badges={
        <>
          <Badge variant={draft.active ? "success" : "neutral"}>{draft.active ? "Active" : "Paused"}</Badge>
          <span className="text-xs text-text-tertiary">{describeConditions(draft.conditions)}</span>
        </>
      }
      actions={
        canEdit ? (
          <>
            <Button variant="ghost" size="icon" aria-label="Delete rule" className="text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400" onClick={() => onDelete(rule)}>
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button onClick={save} disabled={!dirty || saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save changes
            </Button>
          </>
        ) : null
      }
      nav={NAV}
      defaultSection="conditions"
    >
      {({ active }) => (
        <fieldset disabled={!canEdit} className="min-w-0">
          {active === "conditions" ? (
            <SectionCard bare title="Match triggers" description="Keywords, patterns, links and AI labels that make a comment match.">
              <div className="grid gap-5">
                <div className="grid gap-5 md:grid-cols-2">
                  <ListField id="mr-keywords" label="Keywords or phrases" hint="One per line. Whole-word, case-insensitive." value={draft.conditions.keywords} onChange={setCond("keywords")} placeholder={"free followers\ndm me"} rows={5} />
                  <ListField id="mr-competitors" label="Competitor mentions" hint="Brand names or handles to catch." value={draft.conditions.competitorTerms} onChange={setCond("competitorTerms")} placeholder={"@rivalstudio\nRival Studio"} rows={5} />
                </div>
                <div>
                  <ListField id="mr-regex" label="Patterns" hint="Regular expressions, one per line, up to 200 characters each." value={draft.conditions.regex} onChange={setCond("regex")} placeholder={"\\b(whats ?app|wa\\.me)\\b"} />
                  {badPatterns.map((b) => (
                    <p key={b.p} className="mt-1 text-xs text-red-600 dark:text-red-400">“{b.p}”: {b.error}</p>
                  ))}
                </div>
                <SettingsList>
                  <SettingRow title="Any link" description="Comments containing a URL or a bare domain." checked={draft.conditions.links} onCheckedChange={setCond("links")} />
                  {AI_LABELS.map((l) => (
                    <SettingRow
                      key={l.key}
                      title={`AI: ${l.label.toLowerCase()}`}
                      description="Classified by your workspace's AI provider. Skipped when AI isn't configured."
                      checked={draft.conditions.ai.includes(l.key)}
                      onCheckedChange={(on) => setCond("ai")(on ? [...draft.conditions.ai, l.key] : draft.conditions.ai.filter((k) => k !== l.key))}
                    />
                  ))}
                </SettingsList>
              </div>
            </SectionCard>
          ) : null}

          {active === "scope" ? (
            <SectionCard bare title="Where it applies" description="The networks, posts and ads this rule watches, and the authors it skips.">
              <div className="grid gap-5">
                <Field label="Networks" hint="None checked watches every connected account.">
                  <div className="flex flex-wrap gap-4 pt-1">
                    {MODERATED_NETWORKS.map((n) => (
                      <label key={n} className="inline-flex items-center gap-2 text-sm text-foreground">
                        <Checkbox checked={draft.networks.includes(n)} onCheckedChange={(on) => set("networks")(on ? [...draft.networks, n] : draft.networks.filter((x) => x !== n))} />
                        <NetworkIcon network={n} className="h-3.5 w-3.5 text-muted-foreground" /> {networkLabel(n)}
                      </label>
                    ))}
                  </div>
                </Field>
                <Field label="Posts and ads">
                  <Select value={draft.scope.mode} onValueChange={(mode) => set("scope")({ ...draft.scope, mode })}>
                    <SelectTrigger className="bg-surface-card sm:max-w-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SCOPE_MODES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                {draft.scope.mode === "postIds" ? (
                  <ListField id="mr-posts" label="Post or ad ids" hint="The network's media / post ids, one per line." value={draft.scope.postIds} onChange={(postIds) => set("scope")({ ...draft.scope, postIds })} />
                ) : null}
                <ListField id="mr-allow" label="Allowlist" hint="Handles this rule never acts on — your team, partners, regulars." value={draft.allowlist} onChange={set("allowlist")} placeholder={"@halcyonstudio\n@maya.chen"} />
              </div>
            </SectionCard>
          ) : null}

          {active === "action" ? (
            <SectionCard bare title="Response" description="What the rule does to a matching comment, its priority and whether it's running.">
              <div className="grid gap-5">
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="When it matches">
                    <Select value={draft.action} onValueChange={set("action")}>
                      <SelectTrigger className="bg-surface-card"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {MODERATION_ACTIONS.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Priority" htmlFor="mr-priority" hint="Higher runs first; the first matching rule acts.">
                    <Input id="mr-priority" type="number" value={draft.priority} onChange={(e) => set("priority")(Number(e.target.value) || 0)} className="tabular-nums" />
                  </Field>
                </div>
                {draft.action === "reply" ? (
                  <Field label="Public reply" htmlFor="mr-reply" hint="Posted under the comment. Keep it useful — the same reply on every comment reads as spam.">
                    <Textarea id="mr-reply" rows={3} maxLength={2200} value={draft.replyText} onChange={(e) => set("replyText")(e.target.value)} />
                  </Field>
                ) : null}
                {draft.action === "delete" ? <p className="text-sm text-text-secondary">Deleting is permanent on the network. Hide keeps the comment visible to its author and reversible.</p> : null}
                {telegramHide ? <p className="text-sm text-text-secondary">Telegram&apos;s Bot API can&apos;t hide messages, so this rule logs a failure on Telegram comments. Scope it to Instagram and Facebook, or use delete.</p> : null}
                <SettingsList>
                  <SettingRow title="Active" description="Paused rules are kept but don't run on new comments." checked={draft.active} onCheckedChange={set("active")} />
                </SettingsList>
              </div>
            </SectionCard>
          ) : null}

          {active === "test" ? <TestSection projectId={projectId} rule={draft} /> : null}

          {active === "activity" ? <LogTable rows={ruleLog} rules={[rule]} empty="This rule hasn't acted on any comment yet." /> : null}
        </fieldset>
      )}
    </EditorShell>
  );
}

function LogTable({ rows, rules, empty }) {
  const ruleName = new Map(rules.map((r) => [r.id, r.name]));
  const pager = usePagination(rows, { resetKey: rows.length });
  return (
    <div className="space-y-5">
      <DataTable
        data={pager.pageItems}
        getRowKey={(l) => l.id}
        empty={<SectionCard><p className="text-sm text-text-secondary">{empty}</p></SectionCard>}
        columns={[
          { key: "when", header: "When", className: "whitespace-nowrap text-sm text-text-secondary", render: (l) => formatDateTime(l.createdAt) },
          {
            key: "comment",
            header: "Comment",
            className: "max-w-md whitespace-normal",
            render: (l) => (
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{l.author || "Unknown author"}</p>
                <p className="line-clamp-2 text-xs text-text-secondary">{excerpt(l.text, 160) || "No text"}</p>
              </div>
            ),
          },
          { key: "network", header: "Network", render: (l) => <span className="inline-flex items-center gap-1.5 text-sm text-text-secondary"><NetworkIcon network={l.network} className="h-3.5 w-3.5" /> {networkLabel(l.network)}</span> },
          { key: "action", header: "Action", render: (l) => <StatusPill status={l.action} map={MODERATION_ACTION_MAP} /> },
          { key: "by", header: "By", className: "text-sm text-text-secondary", render: (l) => (l.source === "auto" ? ruleName.get(l.ruleId) || "A deleted rule" : "A teammate") },
          { key: "status", header: "Result", render: (l) => <StatusPill status={l.status} map={LOG_STATUS_MAP} /> },
          {
            key: "reason",
            header: "Detail",
            className: "max-w-xs whitespace-normal text-xs",
            render: (l) => (l.error ? <span className="text-red-600 dark:text-red-400">{l.error}</span> : <span className="text-text-secondary">{l.reason || "—"}</span>),
          },
        ]}
      />
      <ListPagination {...pager} itemLabel="actions" />
    </div>
  );
}

function CreateDialog({ open, onOpenChange, onCreate }) {
  const [name, setName] = useState("");
  const [action, setAction] = useState("hide");
  const [pending, setPending] = useState(false);
  const submit = async () => {
    if (!name.trim()) return toast.error("Name the rule.");
    setPending(true);
    const ok = await onCreate({ name: name.trim(), action });
    setPending(false);
    if (ok) {
      setName("");
      setAction("hide");
      onOpenChange(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New moderation rule</DialogTitle>
          <DialogDescription>Name it and pick what it does. Add its conditions next — it does nothing until one is set.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Name" htmlFor="mr-name">
            <Input id="mr-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Hide spam links" autoFocus />
          </Field>
          <Field label="When it matches">
            <Select value={action} onValueChange={setAction}>
              <SelectTrigger className="bg-surface-card"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MODERATION_ACTIONS.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create rule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ModerationRulesScreen() {
  const { projectId } = useProject();
  const canEdit = useCan("campaign.social.edit");
  const { recordId, openRecord, closeRecord } = useWorkspaceUrl();
  const [rules, setRules] = useState([]);
  const [log, setLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("rules");
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const now = useNow();

  useEffect(() => {
    let alive = true;
    const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
    Promise.all([listModerationRules(projectId), listModerationLog(projectId, { since, limit: 2000 })]).then(([r, l]) => {
      if (!alive) return;
      if (r === null) toast.error("Couldn't load moderation rules.");
      setRules(r ?? []);
      setLog(l ?? []);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const matches30 = useMemo(() => {
    const since = now - 30 * 86_400_000;
    const by = new Map();
    for (const l of log) if (l.ruleId && l.source === "auto" && new Date(l.createdAt).getTime() >= since) by.set(l.ruleId, (by.get(l.ruleId) || 0) + 1);
    return by;
  }, [log, now]);

  const stats = useMemo(() => {
    const since = now - 30 * 86_400_000;
    const recent = log.filter((l) => new Date(l.createdAt).getTime() >= since);
    return [
      { label: "Active rules", value: formatNumber(rules.filter((r) => r.active).length) },
      { label: "Automatic actions · 30 days", value: formatNumber(recent.filter((l) => l.source === "auto").length) },
      { label: "Hidden or deleted · 30 days", value: formatNumber(recent.filter((l) => ["hide", "delete"].includes(l.action) && l.status === "done").length) },
      { label: "Failed actions · 30 days", value: formatNumber(recent.filter((l) => l.status === "failed").length) },
    ];
  }, [rules, log, now]);

  const sorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...rules]
      .filter((r) => !q || `${r.name} ${describeConditions(r.conditions)}`.toLowerCase().includes(q))
      .sort((a, b) => b.priority - a.priority || String(a.createdAt).localeCompare(String(b.createdAt)));
  }, [rules, query]);

  const filteredLog = useMemo(() => {
    const q = query.trim().toLowerCase();
    return log.filter((l) => !q || `${l.author} ${l.text} ${l.reason}`.toLowerCase().includes(q));
  }, [log, query]);
  const rulesPager = usePagination(sorted, { resetKey: query });

  const patchRule = async (rule, patch, message) => {
    setRules((list) => list.map((r) => (r.id === rule.id ? { ...r, ...patch } : r)));
    const saved = await updateModerationRule(rule.id, patch);
    if (!saved) {
      setRules((list) => list.map((r) => (r.id === rule.id ? rule : r)));
      return toast.error("Couldn't update the rule.");
    }
    setRules((list) => list.map((r) => (r.id === rule.id ? saved : r)));
    if (message) toast.success(message);
  };

  const create = async (input, { open = true } = {}) => {
    const user = await getUser();
    const id = crypto.randomUUID();
    const optimistic = { ...blankRule(), ...input, id, createdAt: new Date().toISOString() };
    setRules((list) => [...list, optimistic]);
    const created = await createModerationRule(projectId, { ...blankRule(), ...input, id, createdBy: user?.id || null });
    if (!created) {
      setRules((list) => list.filter((r) => r.id !== id));
      toast.error("Couldn't create the rule.");
      return false;
    }
    setRules((list) => list.map((r) => (r.id === id ? created : r)));
    if (open) openRecord(id);
    return true;
  };

  const duplicate = async (rule) => {
    const { id: _id, createdAt: _c, updatedAt: _u, projectId: _p, createdBy: _b, ...rest } = rule;
    if (await create({ ...rest, name: `${rule.name} (copy)`, active: false }, { open: false })) toast.success("Duplicated as a paused rule.");
  };

  const remove = async (rule) => {
    setDeleteTarget(null);
    setRules((list) => list.filter((r) => r.id !== rule.id));
    if (recordId === rule.id) closeRecord();
    const ok = await softDeleteModerationRule(rule.id);
    if (!ok) {
      setRules((list) => [...list, rule]);
      return toast.error("Couldn't delete the rule.");
    }
    toast.success("Rule deleted. Its log entries stay.");
  };

  const deleteDialog = (
    <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete rule</DialogTitle>
          <DialogDescription>
            Delete <span className="font-medium text-foreground">{deleteTarget?.name || "this rule"}</span>? New comments stop being checked against it. Comments it already hid stay hidden.
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
  );

  if (loading) {
    return (
      <MainScreenWrapper>
        <LoadingPanel label="Loading moderation rules" size={80} />
      </MainScreenWrapper>
    );
  }

  const open = rules.find((r) => r.id === recordId);
  if (open) {
    return (
      <>
        <RuleEditor
          key={`${open.id}-${open.updatedAt}`}
          projectId={projectId}
          rule={open}
          log={log}
          canEdit={canEdit}
          onBack={closeRecord}
          onSaved={(saved) => setRules((list) => list.map((r) => (r.id === saved.id ? saved : r)))}
          onDelete={setDeleteTarget}
        />
        {deleteDialog}
      </>
    );
  }

  const columns = [
    {
      key: "rule",
      header: "Rule",
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{r.name || "Untitled rule"}</p>
          <p className="truncate text-xs text-text-secondary">{describeConditions(r.conditions)}</p>
        </div>
      ),
    },
    {
      key: "scope",
      header: "Watches",
      className: "text-sm text-text-secondary",
      render: (r) => (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          {(r.networks.length ? r.networks : ["all"]).map((n) => (n === "all" ? <span key={n}>All accounts</span> : <NetworkIcon key={n} network={n} className="h-3.5 w-3.5" />))}
          <span className="text-text-tertiary">· {SCOPE_MODES.find((m) => m.value === r.scope.mode)?.label}</span>
        </span>
      ),
    },
    { key: "action", header: "Action", render: (r) => <StatusPill status={r.action} map={MODERATION_ACTION_MAP} /> },
    { key: "matches", header: "Matches · 30d", align: "right", className: "tabular-nums", render: (r) => formatNumber(matches30.get(r.id) || 0) },
    { key: "priority", header: "Priority", align: "right", className: "tabular-nums text-text-secondary", render: (r) => r.priority },
    {
      key: "active",
      header: "Active",
      render: (r) => (
        <div onClick={(e) => e.stopPropagation()}>
          <Switch aria-label={`${r.active ? "Pause" : "Activate"} ${r.name}`} checked={r.active} disabled={!canEdit} onCheckedChange={(active) => patchRule(r, { active }, active ? "Rule activated." : "Rule paused.")} />
        </div>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (r) => (
        <ActionMenu
          label={`Actions for ${r.name}`}
          items={[
            { label: canEdit ? "Edit" : "View", icon: Pencil, onSelect: () => openRecord(r.id) },
            canEdit && { label: "Duplicate", icon: Copy, onSelect: () => duplicate(r) },
            { separator: true },
            canEdit && { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setDeleteTarget(r) },
          ]}
        />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Moderation Rules"
        description="Rules that hide, delete, reply to or flag comments as they arrive. The highest-priority matching rule acts."
        actions={
          canEdit ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> New rule
            </Button>
          ) : null
        }
      />

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={view} onValueChange={setView} options={VIEWS} height="h-9" />
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder={view === "rules" ? "Search rules…" : "Search the log…"} />
      </Toolbar>

      {view === "rules" ? (
        <div className="space-y-5">
          <DataTable
            columns={columns}
            data={rulesPager.pageItems}
            getRowKey={(r) => r.id}
            onRowClick={(r) => openRecord(r.id)}
            empty={
              <div className="rounded-xl border border-border bg-surface-subtle">
                <EmptyState
                  icon={ShieldAlert}
                  title={query ? "No matches" : "No moderation rules"}
                  description={query ? "Try a different search." : "Start with one rule that hides comments containing links or the spam phrases you see most."}
                  action={
                    query ? (
                      <Button variant="outline" className={OUTLINE_BUTTON} onClick={() => setQuery("")}>Clear search</Button>
                    ) : canEdit ? (
                      <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> New rule</Button>
                    ) : null
                  }
                />
              </div>
            }
          />
          <ListPagination {...rulesPager} itemLabel="rules" />
        </div>
      ) : (
        <LogTable rows={filteredLog} rules={rules} empty={query ? "No log entries match." : "No moderation actions in the last 90 days."} />
      )}

      <CreateDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={(input) => create(input)} />
      {deleteDialog}
    </MainScreenWrapper>
  );
}

export default ModerationRulesScreen;
