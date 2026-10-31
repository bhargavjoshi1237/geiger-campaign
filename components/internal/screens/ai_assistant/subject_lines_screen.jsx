"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Copy, Loader2, Send, Sparkles, Type } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  LogoLoading,
  ScreenHeader,
  SectionCard,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  cn,
} from "@geiger/ui";
import { useProject } from "@/context/project-context";
import { useRbac } from "@/context/rbac-context";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { apiPost } from "@/lib/api/client";
import { BASE_MERGE_TOKENS, SUBJECT_PREVIEW_LIMITS, checkSubject, renderedLength } from "@/lib/ai/checks";
import { TONES } from "@/lib/ai/options";
import { MIN_DELIVERED, MIN_SUBJECTS, buildSubjectHistory, predictSubject } from "@/lib/ai/subject_insights";
import { listCampaigns } from "@/lib/supabase/campaigns";
import { listCustomFields } from "@/lib/supabase/custom_fields";
import { listDeliveries } from "@/lib/supabase/deliveries";
import {
  AiStatusNotice,
  ApplyToCampaignDialog,
  ChecksBadge,
  ChecksList,
  HistoryCard,
  OUTLINE_BUTTON,
  copyText,
  formatPercent,
  formatWhen,
  useAiStatus,
  useGenerations,
} from "./ai_shared";

const VERDICT = {
  above: { label: "Above your average", variant: "success" },
  in_line: { label: "In line with your average", variant: "neutral" },
  below: { label: "Below your average", variant: "warning" },
};

const DAY = 24 * 60 * 60 * 1000;

function clip(text, limit) {
  return text.length > limit ? `${text.slice(0, limit).trimEnd()}…` : text;
}

function InboxPreviews({ subject }) {
  const length = renderedLength(subject);
  return (
    <div className="grid gap-1.5 sm:grid-cols-3">
      {SUBJECT_PREVIEW_LIMITS.map((c) => (
        <div key={c.key} className="min-w-0 rounded-md border border-border bg-background px-2.5 py-1.5">
          <p className="text-[11px] text-text-tertiary">
            {c.label} · {length > c.limit ? `cut at ~${c.limit}` : "fits"}
          </p>
          <p className="truncate text-xs text-foreground">{clip(subject, c.limit)}</p>
        </div>
      ))}
    </div>
  );
}

function Prediction({ subject, history }) {
  const p = useMemo(() => predictSubject(subject, history), [subject, history]);
  if (p.status !== "ok") return <p className="text-xs text-text-tertiary">{p.explanation}</p>;
  const verdict = VERDICT[p.verdict];
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={verdict.variant}>{verdict.label}</Badge>
        <span className="text-xs text-text-tertiary">from {p.baseline.subjects} of your past subjects</span>
      </div>
      <p className="text-xs text-text-secondary">{p.explanation}</p>
      {p.similar.length ? (
        <p className="text-xs text-text-tertiary">
          Similar past subject{p.similar.length > 1 ? "s" : ""}:{" "}
          {p.similar.map((s) => `“${s.subject}” (${formatPercent(s.openRate)} over ${s.delivered})`).join("; ")}
        </p>
      ) : null}
    </div>
  );
}

function SubjectRow({ line, history, knownTokens, canApply, onApply }) {
  const [open, setOpen] = useState(false);
  const result = useMemo(() => checkSubject(line.subject, { preheader: line.preheader, knownTokens }), [line, knownTokens]);
  return (
    <li className="px-4 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-foreground">{line.subject}</p>
          {line.preheader ? <p className="mt-0.5 text-sm text-text-secondary">{line.preheader}</p> : null}
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-text-tertiary">
            {line.angle ? <Badge variant="neutral">{line.angle}</Badge> : null}
            <span className="tabular-nums">{result.length} characters</span>
            <ChecksBadge checks={result.checks} />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => copyText(line.preheader ? `${line.subject}\n${line.preheader}` : line.subject)}>
            <Copy className="h-3.5 w-3.5" /> Copy
          </Button>
          {canApply ? (
            <Button size="sm" variant="outline" className={OUTLINE_BUTTON} onClick={() => onApply(line)}>
              <Send className="h-3.5 w-3.5" /> Use
            </Button>
          ) : null}
          <Button size="icon" variant="ghost" className="h-8 w-8 text-text-secondary" aria-label={open ? "Hide details" : "Show details"} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </div>
      <div className="mt-2">
        <Prediction subject={line.subject} history={history} />
      </div>
      {open ? (
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          <InboxPreviews subject={line.subject} />
          <ChecksList checks={result.checks} />
        </div>
      ) : null}
    </li>
  );
}

function SubjectChecker({ history, knownTokens }) {
  const [subject, setSubject] = useState("");
  const [preheader, setPreheader] = useState("");
  const result = useMemo(() => checkSubject(subject, { preheader, knownTokens }), [subject, preheader, knownTokens]);
  return (
    <SectionCard title="Check a subject line" description="Runs every check and the history-based prediction — no AI needed." contentClassName="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Subject" htmlFor="sl-check-subject">
          <Input id="sl-check-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Your subject line" />
        </Field>
        <Field label="Preheader" htmlFor="sl-check-preheader">
          <Input id="sl-check-preheader" value={preheader} onChange={(e) => setPreheader(e.target.value)} placeholder="Optional preview text" />
        </Field>
      </div>
      {subject.trim() ? (
        <div className="space-y-3">
          <InboxPreviews subject={subject.trim()} />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <ChecksList checks={result.checks} />
            <ChecksBadge checks={result.checks} />
          </div>
          <Prediction subject={subject.trim()} history={history} />
        </div>
      ) : null}
    </SectionCard>
  );
}

function HistoryStats({ history, loading }) {
  const top = useMemo(() => [...history].sort((a, b) => b.openRate - a.openRate).slice(0, 3), [history]);
  const delivered = history.reduce((s, h) => s + h.delivered, 0);
  const rate = delivered ? history.reduce((s, h) => s + h.opened, 0) / delivered : null;
  return (
    <SectionCard title="Your subject history" description="The basis for every prediction on this screen.">
      {loading ? (
        <div className="flex justify-center py-6">
          <LogoLoading size={32} aria-label="Loading send history" />
        </div>
      ) : history.length < MIN_SUBJECTS ? (
        <p className="text-sm text-text-secondary">
          {history.length} subject{history.length === 1 ? "" : "s"} with {MIN_DELIVERED}+ deliveries in the last year — predictions start at {MIN_SUBJECTS}.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-text-secondary">Subjects</p>
              <p className="text-lg font-semibold tabular-nums text-foreground">{history.length}</p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-text-secondary">Unique opens</p>
              <p className="text-lg font-semibold tabular-nums text-foreground">{formatPercent(rate)}</p>
            </div>
          </div>
          <ul className="space-y-1.5 border-t border-border pt-3">
            {top.map((h) => (
              <li key={h.subject} className="flex items-baseline justify-between gap-3 text-xs">
                <span className="min-w-0 truncate text-foreground">{h.subject}</span>
                <span className="shrink-0 tabular-nums text-text-secondary">{formatPercent(h.openRate)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </SectionCard>
  );
}

export function SubjectLinesScreen() {
  const { projectId } = useProject();
  const { can } = useRbac();
  const { openRecord, closeRecord } = useWorkspaceUrl();
  const status = useAiStatus(projectId);
  const generations = useGenerations(projectId, "subject_lines");
  const canUse = can("campaign.ai.use");
  const canApply = can("campaign.campaign.edit");

  const [description, setDescription] = useState("");
  const [tone, setTone] = useState("Friendly");
  const [count, setCount] = useState("6");
  const [personalize, setPersonalize] = useState(false);
  const [pending, setPending] = useState(false);
  const [unsaved, setUnsaved] = useState(null);
  const [applyLine, setApplyLine] = useState(null);
  const [subjectHistory, setSubjectHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [customFields, setCustomFields] = useState([]);

  useEffect(() => {
    if (!projectId) return undefined;
    let alive = true;
    const since = new Date(Date.now() - 365 * DAY).toISOString();
    Promise.all([listCampaigns(projectId), listDeliveries(projectId, { channel: "email", since, limit: 10000 }), listCustomFields(projectId)]).then(
      ([campaigns, deliveries, fields]) => {
        if (!alive) return;
        setSubjectHistory(buildSubjectHistory(deliveries ?? [], campaigns ?? []));
        setCustomFields(fields ?? []);
        setHistoryLoading(false);
      },
    );
    return () => {
      alive = false;
    };
  }, [projectId]);

  const knownTokens = useMemo(() => [...BASE_MERGE_TOKENS, ...customFields.map((f) => f.key)], [customFields]);
  const shown = generations.active ?? unsaved;
  const ready = canUse && (status.configured || status.sample);

  const generate = async () => {
    if (!description.trim()) {
      toast.error("Describe the email first.");
      return;
    }
    setPending(true);
    const res = await apiPost(`/api/projects/${projectId}/ai/subject-lines`, { description, tone, count: Number(count), personalize });
    setPending(false);
    if (!res.ok) {
      toast.error(res.error || "Couldn't generate subject lines.");
      return;
    }
    const { generation, ...output } = res.data;
    if (generation) {
      generations.add(generation);
      setUnsaved(null);
      openRecord(generation.id);
    } else {
      setUnsaved({ id: null, tool: "subject_lines", title: description, input: { description, tone }, output, createdAt: new Date().toISOString() });
      closeRecord();
      toast.warning("Subject lines generated, but they couldn't be saved to history.");
    }
  };

  return (
    <MainScreenWrapper>
      <ScreenHeader title="Subject Lines" description="Subject lines checked for every inbox and predicted from your own open-rate history." />

      <AiStatusNotice status={status} canUse={canUse} fallback="You can still check your own subject lines below." />

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <SectionCard contentClassName="space-y-4">
            <Field label="Describe your email" htmlFor="sl-desc">
              <Input
                id="sl-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && ready && !pending) {
                    e.preventDefault();
                    generate();
                  }
                }}
                placeholder="e.g. Autumn sale — 25% off outerwear this weekend only"
              />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_140px_auto] sm:items-end">
              <Field label="Tone">
                <Select value={tone} onValueChange={setTone}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TONES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Options">
                <Select value={count} onValueChange={setCount}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["4", "6", "8"].map((n) => (
                      <SelectItem key={n} value={n}>
                        {n} lines
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <label className="flex h-9 items-center gap-2 text-sm text-muted-foreground">
                <Switch checked={personalize} onCheckedChange={setPersonalize} aria-label="Personalize with first name" />
                Personalize
              </label>
            </div>
            <Button onClick={generate} disabled={!ready || pending || !description.trim()} className="bg-primary text-primary-foreground hover:bg-primary/90">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {pending ? "Generating…" : "Generate subject lines"}
            </Button>
          </SectionCard>

          {pending ? (
            <div className="flex min-h-48 items-center justify-center rounded-xl border border-border bg-surface-subtle">
              <LogoLoading size={48} aria-label="Generating subject lines" />
            </div>
          ) : shown ? (
            <section className="space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold text-foreground">{shown.title}</h2>
                <span className="text-xs text-text-tertiary">
                  {formatWhen(shown.createdAt)}
                  {status.sample ? " · sample output" : shown.model ? ` · ${shown.model}` : ""}
                </span>
              </div>
              <ul className={cn("divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface-subtle")}>
                {(shown.output?.lines || []).map((line) => (
                  <SubjectRow key={line.subject} line={line} history={subjectHistory} knownTokens={knownTokens} canApply={canApply} onApply={setApplyLine} />
                ))}
              </ul>
            </section>
          ) : (
            <EmptyState
              icon={Type}
              title="No subject lines yet"
              description="Describe the email and generate options — each one is checked and compared with your past results."
              className="rounded-xl border border-dashed border-border bg-surface-subtle"
            />
          )}

          <SubjectChecker history={subjectHistory} knownTokens={knownTokens} />
        </div>

        <div className="space-y-4">
          <HistoryStats history={subjectHistory} loading={historyLoading} />
          <HistoryCard
            items={generations.items}
            loading={generations.loading}
            activeId={shown?.id}
            canDelete={canUse}
            onOpen={(g) => openRecord(g.id)}
            onDelete={async (g) => {
              if ((await generations.remove(g)) && shown?.id === g.id) closeRecord();
            }}
            describe={(g) => `${g.output?.lines?.length ?? 0} lines`}
          />
        </div>
      </div>

      <ApplyToCampaignDialog
        open={Boolean(applyLine)}
        onOpenChange={(o) => !o && setApplyLine(null)}
        projectId={projectId}
        mode="subject"
        payload={applyLine || {}}
      />
    </MainScreenWrapper>
  );
}

export default SubjectLinesScreen;
