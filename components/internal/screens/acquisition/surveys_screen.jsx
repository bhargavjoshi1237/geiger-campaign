"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  BarChart3,
  ClipboardList,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Gauge,
  Inbox,
  LayoutTemplate,
  Loader2,
  Pencil,
  Play,
  Plus,
  Rocket,
  Share2,
  Trash2,
  XCircle,
  Clock,
} from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import { EditorShell } from "@/components/internal/shared/editor_shell";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { useProject } from "@/context/project-context";
import { useCan } from "@/context/rbac-context";
import {
  ActionMenu,
  Badge,
  Button,
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
  LoadingArea,
  ScreenHeader,
  SearchInput,
  SectionCard,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatGrid,
  StatsBar,
  StatusPill,
  Textarea,
  Toolbar,
} from "@geiger/ui";
import { createSurvey, listSurveyResponses, listSurveys, softDeleteSurvey, updateSurvey } from "@/lib/supabase/surveys";
import { listContactsByIds } from "@/lib/supabase/contacts";
import { getBrandKit } from "@/lib/supabase/brand_kits";
import { getUser } from "@/lib/supabase/user";
import { SURVEY_SETTINGS_DEFAULTS, publicSurveyView } from "@/lib/acquisition/models";
import { SURVEY_KINDS, SURVEY_KIND_LABEL, summarizeQuestion, surveyHeadline, templateQuestions } from "@/lib/acquisition/surveys";
import { brandCssVars } from "@/lib/content/brand";
import { SurveyForm } from "@/lib/acquisition/ui/survey_form";
import { SurveyQuestionBuilder, surveyIssues } from "./survey_builder";
import { DESTRUCTIVE_ICON_BUTTON, OUTLINE_BUTTON, SURVEY_STATUS_MAP, filterOptions, formatDate, formatNumber, relativeTime } from "./constants";
import { ConfigNotice, CopyField, DeleteDialog, DistributionRow, copyText, useAcquisitionStatus } from "./shared";

const KIND_TONE = { nps: "purple", csat: "info", poll: "warning", feedback: "neutral" };

const STATUS_FILTER_OPTIONS = filterOptions("All statuses", SURVEY_STATUS_MAP);
const TYPE_FILTER_OPTIONS = [{ value: "all", label: "All types" }, ...SURVEY_KINDS];

const SURVEY_NAV = [
  { key: "results", label: "Results", icon: BarChart3, desc: "Responses so far, the headline score and a summary of every question." },
  { key: "questions", label: "Questions", icon: FileText, desc: "What the survey asks. Changes show in the preview as you type." },
  { key: "page", label: "Hosted page", icon: LayoutTemplate, desc: "The intro, button and thank-you message respondents see." },
  { key: "share", label: "Share", icon: Share2, desc: "The hosted link to send in campaigns, post or embed in a button." },
];

// Status-changing primary action for each survey status.
const PRIMARY_ACTION = {
  draft: { label: "Launch", icon: Rocket, next: "live", toast: "Survey launched. It's collecting responses." },
  live: { label: "Close", icon: XCircle, next: "closed", toast: "Survey closed. New responses are refused." },
  closed: { label: "Reopen", icon: Play, next: "live", toast: "Survey reopened." },
};

const toDraft = (s) => ({
  name: s.name,
  description: s.description,
  questions: s.questions,
  settings: { ...SURVEY_SETTINGS_DEFAULTS, ...s.settings },
});

const answerText = (value) => (Array.isArray(value) ? value.join("; ") : value == null ? "" : String(value));

const responsesCsv = (rows, questions) => {
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ["submitted_at", "contact_id", ...questions.map((q) => q.label || q.id), "utm_source", "utm_medium", "utm_campaign", "source_url"];
  const lines = rows.map((r) =>
    [r.createdAt, r.contactId, ...questions.map((q) => answerText(r.answers?.[q.id])), r.utm?.source, r.utm?.medium, r.utm?.campaign, r.sourceUrl].map(esc).join(","),
  );
  return [header.map(esc).join(","), ...lines].join("\n");
};

function CreateSurveyDialog({ open, onOpenChange, onCreate, pending }) {
  const empty = { name: "", kind: "nps" };
  const [draft, setDraft] = useState(empty);
  const set = (k) => (v) => setDraft((d) => ({ ...d, [k]: v }));

  const submit = async () => {
    if (!draft.name.trim()) {
      toast.error("Give the survey a name first.");
      return;
    }
    const ok = await onCreate({ name: draft.name.trim(), kind: draft.kind });
    if (ok) {
      setDraft(empty);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create survey</DialogTitle>
          <DialogDescription>Pick a type to start from its standard questions. You can change every question afterwards.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Survey name" htmlFor="survey-name">
            <Input
              id="survey-name"
              value={draft.name}
              onChange={(e) => set("name")(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="e.g. Quarterly NPS"
              autoFocus
            />
          </Field>
          <Field label="Type">
            <Select value={draft.kind} onValueChange={set("kind")}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SURVEY_KINDS.map((k) => (
                  <SelectItem key={k.value} value={k.value}>
                    {k.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!draft.name.trim() || pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Create survey
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QuestionResult({ question, index, responses }) {
  const summary = useMemo(() => summarizeQuestion(question, responses), [question, responses]);
  const answered = `${formatNumber(summary.answered)} answer${summary.answered === 1 ? "" : "s"}`;
  let body = null;
  let headline = null;

  if (summary.answered === 0) {
    body = <p className="text-sm text-text-secondary">No answers yet.</p>;
  } else if (summary.type === "nps" && summary.nps) {
    const n = summary.nps;
    headline = `${n.score > 0 ? "+" : ""}${n.score} NPS`;
    body = (
      <div className="space-y-2">
        <DistributionRow label="Promoters (9–10)" count={n.promoters} total={n.total} highlight />
        <DistributionRow label="Passives (7–8)" count={n.passives} total={n.total} />
        <DistributionRow label="Detractors (0–6)" count={n.detractors} total={n.total} />
      </div>
    );
  } else if (summary.type === "rating") {
    headline = `${summary.average.toFixed(1)} / ${summary.max}`;
    body = (
      <div className="space-y-2">
        {[...summary.counts].reverse().map((c) => (
          <DistributionRow key={c.label} label={`${c.label} of ${summary.max}`} count={c.count} total={summary.answered} highlight={Number(c.label) >= Math.ceil(summary.max * 0.8)} />
        ))}
      </div>
    );
  } else if (summary.type === "single" || summary.type === "multiple") {
    const top = Math.max(...summary.counts.map((c) => c.count));
    body = (
      <div className="space-y-2">
        {summary.counts.map((c) => (
          <DistributionRow key={c.label} label={c.label} count={c.count} total={summary.answered} highlight={c.count === top && top > 0} />
        ))}
        {summary.type === "multiple" ? <p className="text-xs text-text-tertiary">Share of respondents who picked each option; one person can pick several.</p> : null}
      </div>
    );
  } else {
    body = (
      <ul className="divide-y divide-border rounded-lg border border-border bg-surface-card">
        {summary.answers.slice(0, 8).map((a, i) => (
          <li key={i} className="px-3 py-2 text-sm leading-6 text-foreground">
            {a}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <SectionCard
      title={
        <span className="normal-case">
          <span className="mr-1.5 tabular-nums text-text-tertiary">{index + 1}.</span>
          {question.label || "Untitled question"}
        </span>
      }
      description={answered}
      action={headline ? <span className="text-sm font-semibold tabular-nums text-foreground">{headline}</span> : null}
    >
      {body}
    </SectionCard>
  );
}

function ResponsesTable({ projectId, responses, questions }) {
  const [names, setNames] = useState({});
  const ids = useMemo(() => [...new Set(responses.map((r) => r.contactId).filter(Boolean))], [responses]);
  const scored = questions.find((q) => q.type === "nps" || q.type === "rating");
  const firstText = questions.find((q) => q.type === "text");

  useEffect(() => {
    if (!ids.length) return undefined;
    let cancelled = false;
    listContactsByIds(projectId, ids).then((rows) => {
      if (!cancelled) setNames(Object.fromEntries((rows || []).map((c) => [c.id, c.name])));
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, ids]);

  const columns = [
    { key: "at", header: "Submitted", className: "whitespace-nowrap text-muted-foreground", render: (r) => formatDate(r.createdAt, { time: true }) },
    { key: "who", header: "Respondent", render: (r) => (r.contactId ? <span className="text-foreground">{names[r.contactId] || "Known contact"}</span> : <span className="text-text-secondary">Anonymous</span>) },
    scored && { key: "score", header: scored.type === "nps" ? "Score" : "Rating", className: "tabular-nums text-foreground", render: (r) => answerText(r.answers?.[scored.id]) || "—" },
    firstText && { key: "comment", header: "Comment", render: (r) => <span className="line-clamp-1 max-w-[360px] text-text-secondary">{answerText(r.answers?.[firstText.id]) || "—"}</span> },
    { key: "source", header: "Source", className: "whitespace-nowrap font-mono text-xs text-text-secondary", render: (r) => r.utm?.source || "—" },
  ].filter(Boolean);

  return (
    <DataTable
      columns={columns}
      data={responses}
      getRowKey={(r) => r.id}
      empty={
        <div className="rounded-xl border border-border bg-surface-subtle">
          <EmptyState icon={Inbox} title="No responses yet" description="Responses show here as soon as someone submits the survey." />
        </div>
      }
    />
  );
}

function SurveyEditor({ record, projectId, brand, status, baseUrl, canEdit, onBack, onSave, onDelete }) {
  const [draft, setDraft] = useState(() => toDraft(record));
  const [saving, setSaving] = useState(false);
  const [responses, setResponses] = useState(null);
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  const setS = (key) => (value) => setDraft((d) => ({ ...d, settings: { ...d.settings, [key]: value } }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(record));
  const primary = PRIMARY_ACTION[record.status] || PRIMARY_ACTION.draft;
  const s = draft.settings;

  useEffect(() => {
    let cancelled = false;
    listSurveyResponses(projectId, { surveyId: record.id }).then((rows) => {
      if (!cancelled) setResponses(rows ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, record.id, record.responseCount]);

  const issues = useMemo(() => surveyIssues(draft.questions), [draft.questions]);
  const preview = useMemo(() => publicSurveyView({ ...record, ...draft }), [record, draft]);
  const hostedUrl = baseUrl ? `${baseUrl}/s/${record.id}` : "";
  const headline = useMemo(() => surveyHeadline(record, responses || []), [record, responses]);

  const save = async (patch = {}, message) => {
    const next = { ...draft, ...patch, name: draft.name.trim() || "Untitled survey" };
    if ((patch.status === "live" || (record.status === "live" && !patch.status)) && issues.length) {
      toast.error(issues[0]);
      return;
    }
    setSaving(true);
    const ok = await onSave(record.id, next, message);
    setSaving(false);
    if (ok) setDraft(toDraft({ ...record, ...next }));
  };

  const exportCsv = () => {
    if (!responses?.length) return;
    const blob = new Blob([responsesCsv(responses, record.questions)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(record.name || "survey").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-responses.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const results = [
    { label: "Responses", value: record.responseCount ? formatNumber(record.responseCount) : "—", icon: Inbox, hint: record.responseCount ? "Completed so far" : "No responses yet" },
    { label: headline?.label === "NPS" ? "Net Promoter Score" : "Average rating", value: headline ? headline.display : "—", icon: Gauge, hint: headline ? "Across all responses" : "No scored question answered yet" },
    { label: "Last response", value: record.lastResponseAt ? relativeTime(record.lastResponseAt) : "—", icon: Clock, hint: record.lastResponseAt ? formatDate(record.lastResponseAt, { time: true }) : "Waiting for the first one" },
  ];

  return (
    <EditorShell
      back={{ label: "Back", onClick: onBack }}
      title={
        <InlineTitleInput
          value={draft.name}
          onChange={(e) => set("name")(e.target.value)}
          aria-label="Survey name"
          placeholder="Untitled survey"
          disabled={!canEdit}
          className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl"
        />
      }
      status={record.status}
      statusMap={SURVEY_STATUS_MAP}
      badges={
        <>
          <Badge variant={KIND_TONE[s.kind] || "neutral"}>{SURVEY_KIND_LABEL[s.kind] || s.kind}</Badge>
          <span className="text-xs text-text-tertiary">
            {draft.questions.length} question{draft.questions.length === 1 ? "" : "s"}
          </span>
        </>
      }
      actions={
        canEdit ? (
          <>
            <Button variant="ghost" size="icon" aria-label="Delete survey" className={DESTRUCTIVE_ICON_BUTTON} onClick={() => onDelete(record)}>
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button variant="outline" className={OUTLINE_BUTTON} disabled={!dirty || saving} onClick={() => save()}>
              Save
            </Button>
            <Button onClick={() => save({ status: primary.next }, primary.toast)} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <primary.icon className="h-4 w-4" />} {primary.label}
            </Button>
          </>
        ) : null
      }
      nav={SURVEY_NAV}
      defaultSection="results"
    >
      {({ active }) => (
        <>
          {active === "results" ? (
            <div className="space-y-5">
              <StatGrid stats={results} columns={3} />
              {responses === null ? (
                <LoadingArea size={40} panel label="Loading responses" />
              ) : (
                <>
                  <div className="grid gap-4 lg:grid-cols-2">
                    {record.questions.map((q, i) => (
                      <QuestionResult key={q.id} question={q} index={i} responses={responses} />
                    ))}
                  </div>
                  <SectionCard
                    bare
                    title="Recent responses"
                    action={
                      <Button size="sm" variant="outline" className={OUTLINE_BUTTON} disabled={!responses.length} onClick={exportCsv}>
                        <Download className="h-3.5 w-3.5" /> Export CSV
                      </Button>
                    }
                  >
                    <ResponsesTable projectId={projectId} responses={responses.slice(0, 50)} questions={record.questions} />
                  </SectionCard>
                </>
              )}
            </div>
          ) : null}

          {active === "questions" ? (
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
              <div className="space-y-4">
                {issues.length ? (
                  <ConfigNotice title="Before this survey can go live">
                    <ul className="list-disc space-y-0.5 pl-4">
                      {issues.map((i) => (
                        <li key={i}>{i}</li>
                      ))}
                    </ul>
                  </ConfigNotice>
                ) : null}
                {record.responseCount > 0 ? (
                  <p className="text-xs text-text-secondary">Editing a question keeps its existing answers. Removing one hides its answers from results.</p>
                ) : null}
                <SurveyQuestionBuilder questions={draft.questions} onChange={set("questions")} disabled={!canEdit} />
              </div>
              <div className="xl:sticky xl:top-0 xl:self-start">
                <SectionCard title="Preview" description="Uses your brand kit's colour and fonts.">
                  <div className="rounded-lg border border-border bg-background p-4 text-foreground" style={brandCssVars(brand || {})}>
                    <SurveyForm survey={preview} preview />
                  </div>
                </SectionCard>
              </div>
            </div>
          ) : null}

          {active === "page" ? (
            <SectionCard bare title="Page copy" description="How the survey introduces itself and thanks people once they answer.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Type" hint="Sets the badge and the default questions for new copies.">
                  <Select value={s.kind} onValueChange={setS("kind")} disabled={!canEdit}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SURVEY_KINDS.map((k) => (
                        <SelectItem key={k.value} value={k.value}>
                          {k.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Submit button" htmlFor="se-submit">
                  <Input id="se-submit" value={s.submitLabel} onChange={(e) => setS("submitLabel")(e.target.value)} disabled={!canEdit} />
                </Field>
                <Field label="Internal description" htmlFor="se-desc" hint="Only your team sees this." className="sm:col-span-2">
                  <Input id="se-desc" value={draft.description} onChange={(e) => set("description")(e.target.value)} placeholder="Sent after every completed project" disabled={!canEdit} />
                </Field>
                <Field label="Intro" htmlFor="se-intro" hint="Shown under the survey name on the hosted page." className="sm:col-span-2">
                  <Textarea id="se-intro" rows={3} value={s.intro} onChange={(e) => setS("intro")(e.target.value)} placeholder="Two minutes, three questions. Your answers shape what we do next." disabled={!canEdit} />
                </Field>
                <Field label="Thank-you message" htmlFor="se-thanks" className="sm:col-span-2">
                  <Textarea id="se-thanks" rows={2} value={s.thankYouMessage} onChange={(e) => setS("thankYouMessage")(e.target.value)} disabled={!canEdit} />
                </Field>
              </div>
            </SectionCard>
          ) : null}

          {active === "share" ? (
            <div className="space-y-5">
              {record.status !== "live" ? (
                <ConfigNotice title={record.status === "closed" ? "This survey is closed" : "This survey is a draft"}>
                  {record.status === "closed" ? "The link shows a closed message until you reopen it." : "Launch it before sharing — until then the link shows a not-open-yet message."}
                </ConfigNotice>
              ) : null}
              {status && !status.ingestConfigured ? (
                <ConfigNotice title="Responses can't be received on this deployment">Set SUPABASE_SERVICE_ROLE_KEY on the server so public responses can be stored.</ConfigNotice>
              ) : null}
              <SectionCard
                title="Hosted survey"
                description="Answers through this link are anonymous unless it carries a signed contact token (?gc=…), which ties them to the contact."
                action={
                  hostedUrl ? (
                    <Button size="sm" variant="outline" className={OUTLINE_BUTTON} asChild>
                      <a href={hostedUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3.5 w-3.5" /> Open
                      </a>
                    </Button>
                  ) : null
                }
              >
                <CopyField value={hostedUrl} copyMessage="Survey link copied." />
              </SectionCard>
              <SectionCard title="Track where answers come from" description="Add UTM tags to the link you share and each response records its source.">
                <CopyField value={hostedUrl ? `${hostedUrl}?utm_source=newsletter&utm_medium=email&utm_campaign=${encodeURIComponent(record.name.toLowerCase().replace(/[^a-z0-9]+/g, "_"))}` : ""} copyMessage="Tagged link copied." />
              </SectionCard>
            </div>
          ) : null}
        </>
      )}
    </EditorShell>
  );
}

export function SurveysScreen() {
  const { projectId } = useProject();
  const { recordId, openRecord, closeRecord } = useWorkspaceUrl();
  const canEdit = useCan("campaign.acquisition.edit");
  const { status, baseUrl } = useAcquisitionStatus(projectId);
  const [surveys, setSurveys] = useState([]);
  const [responses, setResponses] = useState([]);
  const [recentResponses, setRecentResponses] = useState(0);
  const [loading, setLoading] = useState(true);
  const [brand, setBrand] = useState(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!projectId) return undefined;
    let cancelled = false;
    Promise.all([listSurveys(projectId), listSurveyResponses(projectId), getBrandKit(projectId)]).then(([rows, responseRows, kit]) => {
      if (cancelled) return;
      if (rows === null) toast.error("Couldn't load surveys.");
      setSurveys(rows ?? []);
      const since = Date.now() - 30 * 86400000;
      setResponses(responseRows ?? []);
      setRecentResponses((responseRows ?? []).filter((r) => new Date(r.createdAt).getTime() >= since).length);
      setBrand(kit);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const responsesBySurvey = useMemo(() => {
    const map = new Map();
    for (const r of responses) {
      if (!map.has(r.surveyId)) map.set(r.surveyId, []);
      map.get(r.surveyId).push(r);
    }
    return map;
  }, [responses]);

  const headlines = useMemo(() => Object.fromEntries(surveys.map((s) => [s.id, surveyHeadline(s, responsesBySurvey.get(s.id) || [])])), [surveys, responsesBySurvey]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return surveys.filter((s) => {
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (typeFilter !== "all" && s.settings.kind !== typeFilter) return false;
      if (q && !`${s.name} ${s.description}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [surveys, query, statusFilter, typeFilter]);

  const stats = useMemo(
    () => [
      { label: "Surveys", value: formatNumber(surveys.length) },
      { label: "Live", value: formatNumber(surveys.filter((s) => s.status === "live").length) },
      { label: "Responses", value: formatNumber(surveys.reduce((sum, s) => sum + s.responseCount, 0)) },
      { label: "Last 30 days", value: formatNumber(recentResponses) },
    ],
    [surveys, recentResponses],
  );

  const pager = usePagination(filtered, { resetKey: `${query}|${statusFilter}|${typeFilter}` });

  const handleCreate = async ({ name, kind }) => {
    setCreating(true);
    const user = await getUser().catch(() => null);
    const row = await createSurvey(projectId, {
      id: crypto.randomUUID(),
      name,
      status: "draft",
      questions: templateQuestions(kind),
      settings: { ...SURVEY_SETTINGS_DEFAULTS, kind },
      createdBy: user?.id ?? null,
    });
    setCreating(false);
    if (!row) {
      toast.error("Couldn't create the survey.");
      return false;
    }
    setSurveys((p) => [row, ...p]);
    openRecord(row.id);
    return true;
  };

  // Optimistic: apply locally, persist, roll back on failure.
  const handleSave = async (id, patch, message = "Survey saved.") => {
    const before = surveys.find((s) => s.id === id);
    setSurveys((p) => p.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    const saved = await updateSurvey(id, patch);
    if (!saved) {
      setSurveys((p) => p.map((s) => (s.id === id ? before : s)));
      toast.error("Couldn't save the survey.");
      return false;
    }
    setSurveys((p) => p.map((s) => (s.id === id ? saved : s)));
    toast.success(message);
    return true;
  };

  const handleDuplicate = async (s) => {
    const user = await getUser().catch(() => null);
    const copy = await createSurvey(projectId, {
      id: crypto.randomUUID(),
      name: `${s.name} (copy)`,
      description: s.description,
      status: "draft",
      questions: s.questions,
      settings: s.settings,
      createdBy: user?.id ?? null,
    });
    if (!copy) {
      toast.error("Couldn't duplicate the survey.");
      return;
    }
    setSurveys((p) => [copy, ...p]);
    toast.success("Survey duplicated as a draft.");
  };

  const quickStatus = async (s) => {
    const action = PRIMARY_ACTION[s.status] || PRIMARY_ACTION.draft;
    if (action.next === "live" && surveyIssues(s.questions).length) {
      toast.error(surveyIssues(s.questions)[0]);
      return;
    }
    await handleSave(s.id, { status: action.next }, action.toast);
  };

  const handleDelete = async (s) => {
    setDeleting(true);
    const ok = await softDeleteSurvey(s.id);
    setDeleting(false);
    setDeleteTarget(null);
    if (!ok) {
      toast.error("Couldn't delete the survey.");
      return;
    }
    setSurveys((p) => p.filter((x) => x.id !== s.id));
    if (recordId === s.id) closeRecord();
    toast.success(`Deleted "${s.name}".`);
  };

  const deleteDialog = (
    <DeleteDialog
      target={deleteTarget}
      noun="survey"
      name={deleteTarget?.name}
      consequence="The hosted link stops accepting responses. Responses already collected are kept."
      pending={deleting}
      onCancel={() => setDeleteTarget(null)}
      onConfirm={handleDelete}
    />
  );

  const open = surveys.find((s) => s.id === recordId);
  if (open) {
    return (
      <>
        <SurveyEditor
          key={open.id}
          record={open}
          projectId={projectId}
          brand={brand}
          status={status}
          baseUrl={baseUrl}
          canEdit={canEdit}
          onBack={closeRecord}
          onSave={handleSave}
          onDelete={setDeleteTarget}
        />
        {deleteDialog}
      </>
    );
  }

  const filtersActive = query || statusFilter !== "all" || typeFilter !== "all";
  const clearFilters = () => {
    setQuery("");
    setStatusFilter("all");
    setTypeFilter("all");
  };

  const columns = [
    {
      key: "survey",
      header: "Survey",
      render: (s) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-foreground">{s.name}</span>
          <span className="truncate text-xs text-text-secondary">{s.description || `${s.questions.length} question${s.questions.length === 1 ? "" : "s"}`}</span>
        </div>
      ),
    },
    { key: "type", header: "Type", render: (s) => <Badge variant={KIND_TONE[s.settings.kind] || "neutral"}>{SURVEY_KIND_LABEL[s.settings.kind] || s.settings.kind}</Badge> },
    { key: "responses", header: "Responses", className: "tabular-nums text-muted-foreground", render: (s) => (s.responseCount ? formatNumber(s.responseCount) : "—") },
    { key: "score", header: "Score", className: "whitespace-nowrap tabular-nums text-foreground", render: (s) => headlines[s.id]?.display || <span className="text-text-secondary">—</span> },
    { key: "last", header: "Last response", className: "whitespace-nowrap text-muted-foreground", render: (s) => relativeTime(s.lastResponseAt) },
    { key: "status", header: "Status", className: "whitespace-nowrap", render: (s) => <StatusPill status={s.status} map={SURVEY_STATUS_MAP} /> },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (s) => {
        const action = PRIMARY_ACTION[s.status] || PRIMARY_ACTION.draft;
        return (
          <div onClick={(e) => e.stopPropagation()}>
            <ActionMenu
              label={`Actions for ${s.name}`}
              items={[
                { label: canEdit ? "Edit" : "Open", icon: Pencil, onSelect: () => openRecord(s.id) },
                { label: "Copy survey link", icon: Copy, onSelect: () => copyText(baseUrl ? `${baseUrl}/s/${s.id}` : "", "Survey link copied."), disabled: !baseUrl },
                canEdit && { label: "Duplicate", icon: ClipboardList, onSelect: () => handleDuplicate(s) },
                canEdit && { label: action.label, icon: action.icon, onSelect: () => quickStatus(s) },
                canEdit && { separator: true },
                canEdit && { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setDeleteTarget(s) },
              ]}
            />
          </div>
        );
      },
    },
  ];

  const createButton = canEdit ? (
    <Button onClick={() => setCreateOpen(true)}>
      <Plus className="h-4 w-4" /> Create survey
    </Button>
  ) : null;

  return (
    <MainScreenWrapper>
      <ScreenHeader title="Surveys" description="Ask NPS, satisfaction and quick-poll questions and see the answers per question." actions={createButton} />

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={statusFilter} onValueChange={setStatusFilter} options={STATUS_FILTER_OPTIONS} height="h-9" />
          <FilterDropdown value={typeFilter} onValueChange={setTypeFilter} options={TYPE_FILTER_OPTIONS} height="h-9" />
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search surveys…" />
      </Toolbar>

      {loading ? (
        <LoadingArea size={48} panel label="Loading surveys" />
      ) : (
        <div className="space-y-5">
          <DataTable
            columns={columns}
            data={pager.pageItems}
            getRowKey={(s) => s.id}
            onRowClick={(s) => openRecord(s.id)}
            empty={
              <div className="rounded-xl border border-border bg-surface-subtle">
                <EmptyState
                  icon={ClipboardList}
                  title={filtersActive ? "No matches" : "No surveys yet"}
                  description={filtersActive ? "Try a different search or filter." : "Create a survey to measure satisfaction or ask your audience a quick question."}
                  action={
                    filtersActive ? (
                      <Button variant="outline" className={OUTLINE_BUTTON} onClick={clearFilters}>
                        Clear filters
                      </Button>
                    ) : (
                      createButton
                    )
                  }
                />
              </div>
            }
          />
          <ListPagination {...pager} itemLabel="surveys" />
        </div>
      )}

      <CreateSurveyDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={handleCreate} pending={creating} />
      {deleteDialog}
    </MainScreenWrapper>
  );
}

export default SurveysScreen;
