"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, ExternalLink, Loader2, PenLine, RotateCcw, Sparkles } from "lucide-react";
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
  Textarea,
  cn,
} from "@geiger/ui";
import { useProject } from "@/context/project-context";
import { useRbac } from "@/context/rbac-context";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { apiPost } from "@/lib/api/client";
import { checkCopy, checkSubject } from "@/lib/ai/checks";
import { briefToCampaignInput } from "@/lib/ai/drafts";
import { BRIEF_CHANNELS, BRIEF_GOALS, TONES } from "@/lib/ai/options";
import { createCampaign } from "@/lib/supabase/campaigns";
import { listLists } from "@/lib/supabase/lists";
import { listSegments } from "@/lib/supabase/segments";
import { updateGeneration } from "@/lib/supabase/ai_generations";
import { getUser } from "@/lib/supabase/user";
import {
  AiStatusNotice,
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

const EMPTY_FORM = { goalType: "Acquisition", goal: "", audience: "all", offer: "", channel: "email", tone: "Friendly", constraints: "" };
const CHANNEL_LABEL = Object.fromEntries(BRIEF_CHANNELS.map((c) => [c.value, c.label]));
const PLAN_CHANNEL = { email: "Email", sms: "SMS", whatsapp: "WhatsApp", push: "Push", social: "Social", ads: "Ads" };

const audienceValue = (a) => (a?.kind && a.kind !== "all" && a.id ? `${a.kind}:${a.id}` : "all");
function parseAudience(value) {
  if (!value || value === "all") return { kind: "all", id: null };
  const [kind, id] = value.split(":");
  return { kind, id };
}

function formInputs(input) {
  return {
    goalType: input.goalType || EMPTY_FORM.goalType,
    goal: input.goal || "",
    audience: audienceValue(input.audience),
    offer: input.offer || "",
    channel: input.channel || "email",
    tone: input.tone || "Friendly",
    constraints: input.constraints || "",
  };
}

function Section({ title, children, aside }) {
  return (
    <div className="border-t border-border pt-4 first:border-t-0 first:pt-0">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {aside}
      </div>
      {children}
    </div>
  );
}

// KPI targets next to the workspace's own baseline for the same metric, when there is one.
function baselineFor(metric, baseline) {
  if (!baseline?.sent) return null;
  const m = metric.toLowerCase();
  if (m.includes("open")) return formatPercent(baseline.openRate);
  if (m.includes("click")) return formatPercent(baseline.clickRate, 2);
  if (m.includes("unsub")) return formatPercent(baseline.unsubscribeRate, 2);
  if (m.includes("convers")) return baseline.conversionRate == null ? null : formatPercent(baseline.conversionRate, 2);
  return null;
}

function ScheduleBasis({ sendTime, suggestedSendAt }) {
  if (!sendTime) return null;
  if (!sendTime.enough) {
    return (
      <p className="mt-2 text-xs text-text-tertiary">
        Only {sendTime.opens.toLocaleString()} opens in the last 90 days — too little to ground a time, so treat this as a starting point to test.
      </p>
    );
  }
  const next = suggestedSendAt
    ? new Date(suggestedSendAt).toLocaleString(undefined, { timeZone: sendTime.timeZone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : null;
  return (
    <div className="mt-2 space-y-1 text-xs text-text-tertiary">
      <p>
        Based on {sendTime.opens.toLocaleString()} opens across {sendTime.delivered.toLocaleString()} sends ({sendTime.timeZone}): opens peak {sendTime.peakOpen.label} (
        {Math.round(sendTime.peakOpen.share * 100)}% of opens).
        {sendTime.bestSentSlot ? ` Best tried send slot: ${sendTime.bestSentSlot.label} at ${formatPercent(sendTime.bestSentSlot.openRate)} opens.` : ""}
      </p>
      {next ? <p>Next matching slot: {next}.</p> : null}
    </div>
  );
}

function VariantCard({ variant, channel, onCreate, creating, canCreate, created }) {
  const isEmail = channel === "email" || channel === "multi";
  const checks = useMemo(() => {
    const body = checkCopy(variant.body, { contentType: isEmail ? "email" : channel }).checks;
    return isEmail ? [...checkSubject(variant.subject, { preheader: variant.preheader }).checks, ...body] : body;
  }, [variant, channel, isEmail]);
  const asText = [isEmail && variant.subject ? `Subject: ${variant.subject}` : "", isEmail && variant.preheader ? `Preheader: ${variant.preheader}` : "", variant.headline, variant.body, variant.cta ? `[${variant.cta}]` : ""]
    .filter(Boolean)
    .join("\n\n");

  return (
    <div className="flex flex-col rounded-xl border border-border bg-surface-card p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-foreground">Variant {variant.label}</span>
        <ChecksBadge checks={checks} />
      </div>
      {variant.angle ? <p className="mt-0.5 text-xs text-text-tertiary">{variant.angle}</p> : null}
      {isEmail ? (
        <div className="mt-3 space-y-0.5">
          <p className="text-sm font-medium text-foreground">{variant.subject}</p>
          {variant.preheader ? <p className="text-xs text-text-secondary">{variant.preheader}</p> : null}
        </div>
      ) : null}
      <div className="mt-3 flex-1 space-y-2 text-sm leading-relaxed text-muted-foreground">
        {variant.headline ? <p className="font-medium text-foreground">{variant.headline}</p> : null}
        <p className="whitespace-pre-line">{variant.body}</p>
        {variant.cta ? (
          <span className="inline-flex rounded-md border border-border bg-surface-subtle px-2.5 py-1 text-xs font-medium text-foreground">{variant.cta}</span>
        ) : null}
      </div>
      <ChecksList checks={checks.filter((c) => c.status !== "pass")} className="mt-3" />
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <Button size="sm" variant="outline" className={OUTLINE_BUTTON} onClick={() => copyText(asText)}>
          <Copy className="h-3.5 w-3.5" /> Copy
        </Button>
        {canCreate && !created ? (
          <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-foreground" disabled={creating} onClick={onCreate}>
            {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PenLine className="h-3.5 w-3.5" />}
            Create draft
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function BriefView({ generation, sample, onReuse, onCreateDraft, creating, canCreate, onOpenCampaign }) {
  const { input, output } = generation;
  const brief = output.brief || {};
  const channel = input.channel || "email";
  return (
    <SectionCard
      title={brief.title || "Campaign brief"}
      description={[output.audience?.name, CHANNEL_LABEL[channel], formatWhen(generation.createdAt), sample ? "sample output" : generation.model].filter(Boolean).join(" · ")}
      action={
        <div className="flex items-center gap-2">
          {generation.campaignId ? (
            <Button size="sm" variant="outline" className={OUTLINE_BUTTON} onClick={() => onOpenCampaign(generation.campaignId)}>
              <ExternalLink className="h-3.5 w-3.5" /> Open draft
            </Button>
          ) : null}
          <Button size="sm" variant="outline" className={OUTLINE_BUTTON} onClick={onReuse}>
            <RotateCcw className="h-3.5 w-3.5" /> Reuse inputs
          </Button>
        </div>
      }
      contentClassName="space-y-5"
    >
      <Section title="Objective">
        <p className="text-sm text-muted-foreground">{brief.objective}</p>
      </Section>
      <Section
        title="Audience"
        aside={output.audience?.size != null ? <span className="text-xs tabular-nums text-text-tertiary">{output.audience.size.toLocaleString()} subscribed</span> : null}
      >
        <p className="text-sm text-muted-foreground">{brief.audienceRationale}</p>
      </Section>
      <Section title="Key message">
        <p className="text-sm text-foreground">{brief.keyMessage}</p>
      </Section>
      {brief.offerFraming ? (
        <Section title="Offer framing">
          <p className="text-sm text-muted-foreground">{brief.offerFraming}</p>
        </Section>
      ) : null}
      {brief.channelPlan?.length ? (
        <Section title="Channel plan">
          <ol className="divide-y divide-border rounded-lg border border-border">
            {brief.channelPlan.map((s, i) => (
              <li key={i} className="grid gap-1 px-3 py-2.5 sm:grid-cols-[110px_90px_1fr] sm:items-start sm:gap-3">
                <span className="text-xs font-medium tabular-nums text-text-secondary">{s.timing || `Step ${i + 1}`}</span>
                <span>
                  <Badge variant="neutral">{PLAN_CHANNEL[s.channel] || s.channel}</Badge>
                </span>
                <span className="text-sm">
                  <span className="font-medium text-foreground">{s.step}</span>
                  {s.purpose ? <span className="text-text-secondary"> — {s.purpose}</span> : null}
                </span>
              </li>
            ))}
          </ol>
        </Section>
      ) : null}
      <Section title="Copy variants">
        <div className="grid gap-3 xl:grid-cols-3">
          {(brief.variants || []).map((v) => (
            <VariantCard
              key={v.label}
              variant={v}
              channel={channel}
              canCreate={canCreate}
              created={Boolean(generation.campaignId)}
              creating={creating === v.label}
              onCreate={() => onCreateDraft(v.label)}
            />
          ))}
        </div>
      </Section>
      {brief.subjectLines?.length && (channel === "email" || channel === "multi") ? (
        <Section title="More subject lines">
          <ul className="divide-y divide-border rounded-lg border border-border">
            {brief.subjectLines.map((s) => (
              <li key={s} className="flex items-center gap-3 px-3 py-2">
                <span className="min-w-0 flex-1 text-sm text-foreground">{s}</span>
                <ChecksBadge checks={checkSubject(s).checks} />
                <Button size="icon" variant="ghost" className="h-7 w-7 text-text-secondary" aria-label={`Copy “${s}”`} onClick={() => copyText(s)}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      <Section title="Schedule">
        <p className="text-sm text-foreground">{brief.schedule?.recommendation}</p>
        {brief.schedule?.rationale ? <p className="mt-1 text-sm text-text-secondary">{brief.schedule.rationale}</p> : null}
        <ScheduleBasis sendTime={output.sendTime} suggestedSendAt={output.suggestedSendAt} />
      </Section>
      {brief.kpis?.length ? (
        <Section title="KPIs">
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface-card text-left text-xs text-text-secondary">
                <tr>
                  <th className="px-3 py-2 font-medium">Metric</th>
                  <th className="px-3 py-2 text-right font-medium">Target</th>
                  <th className="px-3 py-2 text-right font-medium">Your 90-day baseline</th>
                  <th className="hidden px-3 py-2 font-medium md:table-cell">Why</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {brief.kpis.map((k) => (
                  <tr key={k.metric}>
                    <td className="px-3 py-2 text-foreground">{k.metric}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-foreground">{k.target}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-text-secondary">{baselineFor(k.metric, output.baseline) ?? "—"}</td>
                    <td className="hidden px-3 py-2 text-text-secondary md:table-cell">{k.rationale}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!output.baseline?.sent ? <p className="mt-2 text-xs text-text-tertiary">No sends in the last 90 days, so targets are initial guesses to calibrate.</p> : null}
        </Section>
      ) : null}
    </SectionCard>
  );
}

export function CampaignBriefScreen() {
  const { projectId } = useProject();
  const { can } = useRbac();
  const { openRecord, closeRecord, openRecordInTab } = useWorkspaceUrl();
  const status = useAiStatus(projectId);
  const history = useGenerations(projectId, "brief");
  const canUse = can("campaign.ai.use");
  const canCreate = can("campaign.campaign.edit");

  const [form, setForm] = useState(EMPTY_FORM);
  const [lists, setLists] = useState([]);
  const [segments, setSegments] = useState([]);
  const [pending, setPending] = useState(false);
  const [unsaved, setUnsaved] = useState(null);
  const [creating, setCreating] = useState(null);
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));

  useEffect(() => {
    if (!projectId) return undefined;
    let alive = true;
    Promise.all([listLists(projectId), listSegments(projectId)]).then(([l, s]) => {
      if (!alive) return;
      setLists(l ?? []);
      setSegments(s ?? []);
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const shown = history.active ?? unsaved;
  const ready = canUse && (status.configured || status.sample);

  const generate = async () => {
    if (!form.goal.trim()) {
      toast.error("Describe the goal first.");
      return;
    }
    setPending(true);
    const res = await apiPost(`/api/projects/${projectId}/ai/brief`, {
      goal: form.goal,
      goalType: form.goalType,
      audience: parseAudience(form.audience),
      offer: form.offer,
      channel: form.channel,
      tone: form.tone,
      constraints: form.constraints,
    });
    setPending(false);
    if (!res.ok) {
      toast.error(res.error || "Couldn't generate the brief.");
      return;
    }
    const { generation, ...output } = res.data;
    if (generation) {
      history.add(generation);
      setUnsaved(null);
      openRecord(generation.id);
    } else {
      setUnsaved({ id: null, tool: "brief", title: output.brief?.title, input: { ...form, audience: parseAudience(form.audience) }, output, createdAt: new Date().toISOString() });
      closeRecord();
      toast.warning("Brief generated, but it couldn't be saved to history.");
    }
  };

  const createDraft = async (label) => {
    if (!shown) return;
    setCreating(label);
    const user = await getUser();
    const id = crypto.randomUUID();
    const created = await createCampaign(projectId, { id, ...briefToCampaignInput(shown, label, { createdBy: user?.id ?? null }) });
    if (!created) {
      setCreating(null);
      toast.error("Couldn't create the draft campaign.");
      return;
    }
    if (shown.id) {
      const linked = await updateGeneration(shown.id, { campaignId: created.id });
      if (linked) history.replace(linked);
    } else {
      setUnsaved((u) => (u ? { ...u, campaignId: created.id } : u));
    }
    setCreating(null);
    toast.success(`Draft “${created.name}” created from variant ${label}.`, {
      action: { label: "Open", onClick: () => openRecordInTab(created.id, "All Campaigns") },
    });
  };

  return (
    <MainScreenWrapper>
      <ScreenHeader title="Campaign Brief" description="Turn a goal and an audience into a structured brief grounded in your own send data." />

      <AiStatusNotice status={status} canUse={canUse} />

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[380px_1fr]">
        <div className="space-y-4">
          <SectionCard contentClassName="space-y-4">
            <Field label="Objective">
              <Select value={form.goalType} onValueChange={set("goalType")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BRIEF_GOALS.map((g) => (
                    <SelectItem key={g} value={g}>
                      {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Goal" htmlFor="cb-goal" hint="What should change because this campaign ran?">
              <Textarea
                id="cb-goal"
                value={form.goal}
                onChange={(e) => set("goal")(e.target.value)}
                placeholder="e.g. Get last season's customers to pre-order the new collection before launch day."
                className="min-h-20 bg-background"
              />
            </Field>
            <Field label="Audience">
              <Select value={form.audience} onValueChange={set("audience")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All subscribed contacts</SelectItem>
                  {lists.length ? (
                    <SelectGroup>
                      <SelectLabel>Lists</SelectLabel>
                      {lists.map((l) => (
                        <SelectItem key={l.id} value={`list:${l.id}`}>
                          {l.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ) : null}
                  {segments.length ? (
                    <SelectGroup>
                      <SelectLabel>Segments</SelectLabel>
                      {segments.map((s) => (
                        <SelectItem key={s.id} value={`segment:${s.id}`}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ) : null}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Offer" htmlFor="cb-offer">
              <Input id="cb-offer" value={form.offer} onChange={(e) => set("offer")(e.target.value)} placeholder="e.g. 15% off pre-orders until Friday" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Channel">
                <Select value={form.channel} onValueChange={set("channel")}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BRIEF_CHANNELS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Tone">
                <Select value={form.tone} onValueChange={set("tone")}>
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
            </div>
            <Field label="Constraints" htmlFor="cb-constraints" hint="Legal lines, dates, discount limits, words to avoid.">
              <Textarea id="cb-constraints" value={form.constraints} onChange={(e) => set("constraints")(e.target.value)} className="min-h-16 bg-background" />
            </Field>
            <Button onClick={generate} disabled={!ready || pending || !form.goal.trim()} className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {pending ? "Generating…" : shown ? "Generate new brief" : "Generate brief"}
            </Button>
          </SectionCard>

          <HistoryCard
            items={history.items}
            loading={history.loading}
            activeId={shown?.id}
            canDelete={canUse}
            onOpen={(g) => openRecord(g.id)}
            onDelete={async (g) => {
              if (await history.remove(g)) {
                if (shown?.id === g.id) closeRecord();
              }
            }}
            describe={(g) => [g.output?.audience?.name, CHANNEL_LABEL[g.input?.channel]].filter(Boolean).join(" · ")}
          />
        </div>

        {pending ? (
          <div className={cn("flex min-h-80 items-center justify-center rounded-xl border border-border bg-surface-subtle")}>
            <LogoLoading size={56} aria-label="Generating brief" />
          </div>
        ) : shown ? (
          <BriefView
            generation={shown}
            sample={status.sample}
            canCreate={canCreate}
            creating={creating}
            onReuse={() => setForm(formInputs(shown.input || {}))}
            onCreateDraft={createDraft}
            onOpenCampaign={(id) => openRecordInTab(id, "All Campaigns")}
          />
        ) : (
          <EmptyState
            icon={PenLine}
            title="No brief open"
            description="Describe the goal, pick an audience and generate — or reopen one from history."
            className="rounded-xl border border-dashed border-border bg-surface-subtle py-20"
          />
        )}
      </div>
    </MainScreenWrapper>
  );
}

export default CampaignBriefScreen;
