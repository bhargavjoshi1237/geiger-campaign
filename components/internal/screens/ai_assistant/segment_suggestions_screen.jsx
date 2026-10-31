"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ExternalLink, Filter, Loader2, Plus, Sparkles, Users, X } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import {
  Button,
  EmptyState,
  Field,
  Input,
  LogoLoading,
  ScreenHeader,
  SectionCard,
  SegmentedTabs,
  Textarea,
} from "@geiger/ui";
import { useProject } from "@/context/project-context";
import { useRbac } from "@/context/rbac-context";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { apiPost } from "@/lib/api/client";
import * as segmentRules from "@/lib/audience/segment_rules";
import { listContacts } from "@/lib/supabase/contacts";
import { listCustomFields } from "@/lib/supabase/custom_fields";
import { listDeliveries } from "@/lib/supabase/deliveries";
import { listAllMemberships, listLists } from "@/lib/supabase/lists";
import { createSegment } from "@/lib/supabase/segments";
import { listTrackedEvents } from "@/lib/supabase/tracked_events";
import { updateGeneration } from "@/lib/supabase/ai_generations";
import { getUser } from "@/lib/supabase/user";
import { AiStatusNotice, HistoryCard, OUTLINE_BUTTON, formatWhen, useAiStatus, useGenerations } from "./ai_shared";

const DAY = 24 * 60 * 60 * 1000;
const CONTACT_LIMIT = 5000;
const MATCH_TABS = [
  { value: "all", label: "Match all" },
  { value: "any", label: "Match any" },
];

// Per-contact evaluation context ({ listIds, events, deliveries }) for matchesConditions.
function contextIndex(memberships, events, deliveries) {
  const lists = new Map();
  for (const m of memberships) {
    if (m.deletedAt || (m.status ?? "subscribed") !== "subscribed" || !m.contactId) continue;
    if (!lists.has(m.contactId)) lists.set(m.contactId, new Set());
    lists.get(m.contactId).add(String(m.listId));
  }
  const group = (rows) => {
    const map = new Map();
    for (const r of rows) {
      if (!r.contactId) continue;
      if (!map.has(r.contactId)) map.set(r.contactId, []);
      map.get(r.contactId).push(r);
    }
    return map;
  };
  const eventsBy = group(events);
  const deliveriesBy = group(deliveries);
  const now = Date.now();
  return (id) => ({ now, listIds: lists.get(id) ?? new Set(), events: eventsBy.get(id) ?? [], deliveries: deliveriesBy.get(id) ?? [] });
}

function conditionText(condition, fields) {
  if (typeof segmentRules.describeCondition === "function") return segmentRules.describeCondition(condition, fields);
  const value = condition.value == null ? "" : typeof condition.value === "object" ? JSON.stringify(condition.value) : condition.value;
  return `${condition.field} ${condition.operator} ${value}`.trim();
}

function SuggestionCard({ suggestion, index, data, fields, canSave, saved, onSave }) {
  const [name, setName] = useState(suggestion.name);
  const [match, setMatch] = useState(suggestion.match);
  const [conditions, setConditions] = useState(suggestion.conditions);
  const [saving, setSaving] = useState(false);

  const matching = useMemo(() => {
    if (!data) return null;
    const rule = { match, conditions };
    return data.contacts.filter((c) => segmentRules.matchesConditions(c, rule, data.ctxFor(c.id)));
  }, [data, match, conditions]);

  const save = async () => {
    if (!name.trim()) {
      toast.error("Give the segment a name.");
      return;
    }
    setSaving(true);
    await onSave(index, { name: name.trim(), description: suggestion.description, match, conditions, contactCount: matching?.length ?? 0 });
    setSaving(false);
  };

  return (
    <div className="rounded-xl border border-border bg-surface-subtle">
      <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-1">
          <Input value={name} onChange={(e) => setName(e.target.value)} aria-label="Segment name" className="h-8 max-w-md font-medium" disabled={Boolean(saved)} />
          {suggestion.description ? <p className="text-sm text-muted-foreground">{suggestion.description}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-sm tabular-nums text-foreground">
            {matching ? (
              <>
                <span className="font-semibold">{matching.length.toLocaleString()}</span>
                <span className="text-text-secondary"> of {data.contacts.length.toLocaleString()} contacts</span>
              </>
            ) : (
              <span className="text-text-tertiary">Counting…</span>
            )}
          </span>
          {saved ? (
            <Button size="sm" variant="outline" className={OUTLINE_BUTTON} onClick={() => onSave(index, null, saved)}>
              <ExternalLink className="h-3.5 w-3.5" /> Open segment
            </Button>
          ) : canSave ? (
            <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={saving || !conditions.length} onClick={save}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Save as segment
            </Button>
          ) : null}
        </div>
      </div>
      <div className="grid gap-5 px-5 py-4 lg:grid-cols-[1fr_280px]">
        <div className="space-y-3">
          {suggestion.rationale ? <p className="text-sm text-text-secondary">{suggestion.rationale}</p> : null}
          <SegmentedTabs tabs={MATCH_TABS} value={match} onChange={saved ? undefined : setMatch} />
          <ul className="space-y-1.5">
            {conditions.map((c) => (
              <li key={c.id} className="flex items-center gap-2 rounded-lg border border-border bg-surface-card px-3 py-2 text-sm text-foreground">
                <Filter className="h-3.5 w-3.5 shrink-0 text-text-tertiary" />
                <span className="min-w-0 flex-1">{conditionText(c, fields)}</span>
                {!saved && conditions.length > 1 ? (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 text-text-secondary"
                    aria-label="Remove condition"
                    onClick={() => setConditions((list) => list.filter((x) => x.id !== c.id))}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
          {suggestion.dropped?.length ? (
            <p className="text-xs text-text-tertiary">
              Dropped {suggestion.dropped.length} condition{suggestion.dropped.length === 1 ? "" : "s"} outside your segment fields:{" "}
              {suggestion.dropped.map((d) => `${d.field || "unknown"} ${d.operator} (${d.reason})`).join("; ")}.
            </p>
          ) : null}
        </div>
        <div>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-text-secondary">Sample</p>
          {!matching ? (
            <div className="flex justify-center py-4">
              <LogoLoading size={32} aria-label="Matching contacts" />
            </div>
          ) : matching.length ? (
            <ul className="space-y-1.5">
              {matching.slice(0, 6).map((c) => (
                <li key={c.id} className="min-w-0 text-sm">
                  <p className="truncate text-foreground">{c.name}</p>
                  {c.email && c.email !== c.name ? <p className="truncate text-xs text-text-tertiary">{c.email}</p> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-text-secondary">No contacts match yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function SegmentSuggestionsScreen() {
  const { projectId } = useProject();
  const { can } = useRbac();
  const { openRecord, closeRecord, openRecordInTab } = useWorkspaceUrl();
  const status = useAiStatus(projectId);
  const history = useGenerations(projectId, "segment");
  const canUse = can("campaign.ai.use");
  const canSave = can("campaign.contact.edit");

  const [goal, setGoal] = useState("");
  const [pending, setPending] = useState(false);
  const [unsaved, setUnsaved] = useState(null);
  const [data, setData] = useState(null);
  const [fields, setFields] = useState(segmentRules.SEGMENT_FIELDS || []);

  useEffect(() => {
    if (!projectId) return undefined;
    let alive = true;
    const since = new Date(Date.now() - 365 * DAY).toISOString();
    Promise.all([
      listContacts(projectId, { limit: CONTACT_LIMIT }),
      listAllMemberships(projectId),
      listTrackedEvents(projectId, { since, limit: 10000 }),
      listDeliveries(projectId, { since, limit: 10000 }),
      listLists(projectId),
      listCustomFields(projectId),
    ]).then(([contacts, memberships, events, deliveries, lists, customFields]) => {
      if (!alive) return;
      setData({ contacts: contacts ?? [], ctxFor: contextIndex(memberships ?? [], events ?? [], deliveries ?? []), capped: (contacts?.length ?? 0) >= CONTACT_LIMIT });
      if (typeof segmentRules.buildSegmentFields === "function") {
        setFields(segmentRules.buildSegmentFields({ customFields: customFields ?? [], lists: lists ?? [] }));
      }
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const shown = history.active ?? unsaved;
  const ready = canUse && (status.configured || status.sample);
  const savedMap = shown?.savedSegments || {};

  const generate = async () => {
    if (!goal.trim()) {
      toast.error("Describe who you want to reach first.");
      return;
    }
    setPending(true);
    const res = await apiPost(`/api/projects/${projectId}/ai/segment`, { goal });
    setPending(false);
    if (!res.ok) {
      toast.error(res.error || "Couldn't suggest segments.");
      return;
    }
    const { generation, ...output } = res.data;
    if (generation) {
      history.add(generation);
      setUnsaved(null);
      openRecord(generation.id);
    } else {
      setUnsaved({ id: null, tool: "segment", title: goal, input: { goal }, output, createdAt: new Date().toISOString() });
      closeRecord();
      toast.warning("Suggestions generated, but they couldn't be saved to history.");
    }
  };

  // values null + segmentId: open an already-saved segment.
  const saveSegment = async (index, values, existingId) => {
    if (!values) {
      openRecordInTab(existingId, "Segments");
      return;
    }
    const user = await getUser();
    const id = crypto.randomUUID();
    const created = await createSegment(projectId, {
      id,
      ...values,
      computedAt: new Date().toISOString(),
      createdBy: user?.id ?? null,
      metadata: { source: "ai_suggestion", aiGenerationId: shown?.id ?? null },
    });
    if (!created) {
      toast.error("Couldn't save the segment.");
      return;
    }
    const nextSaved = { ...savedMap, [index]: created.id };
    if (shown?.id) {
      const linked = await updateGeneration(shown.id, { segmentId: created.id, metadata: { savedSegments: nextSaved } });
      if (linked) history.replace(linked);
    } else {
      setUnsaved((u) => (u ? { ...u, savedSegments: nextSaved } : u));
    }
    toast.success(`Segment “${created.name}” saved with ${values.contactCount.toLocaleString()} matching contacts.`, {
      action: { label: "Open", onClick: () => openRecordInTab(created.id, "Segments") },
    });
  };

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Segment Suggestions"
        description="Describe who you want to reach; get segments built from your own fields, with live matching counts."
      />

      <AiStatusNotice status={status} canUse={canUse} />

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <SectionCard contentClassName="space-y-3">
            <Field label="Who do you want to reach?" htmlFor="ss-goal" hint="Suggestions only use fields, lists and events that exist in this workspace.">
              <Textarea
                id="ss-goal"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="e.g. Subscribers who opened something in the last 30 days but haven't clicked, with a lead score above 40"
                className="min-h-20 bg-background"
              />
            </Field>
            <Button onClick={generate} disabled={!ready || pending || !goal.trim()} className="bg-primary text-primary-foreground hover:bg-primary/90">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {pending ? "Suggesting…" : "Suggest segments"}
            </Button>
          </SectionCard>

          {pending ? (
            <div className="flex min-h-48 items-center justify-center rounded-xl border border-border bg-surface-subtle">
              <LogoLoading size={48} aria-label="Suggesting segments" />
            </div>
          ) : shown ? (
            <section className="space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold text-foreground">{shown.title}</h2>
                <span className="text-xs text-text-tertiary">
                  {formatWhen(shown.createdAt)}
                  {status.sample ? " · sample output" : shown.model ? ` · ${shown.model}` : ""}
                  {data?.capped ? ` · counts over the first ${CONTACT_LIMIT.toLocaleString()} contacts` : ""}
                </span>
              </div>
              {(shown.output?.suggestions || []).map((s, i) => (
                <SuggestionCard
                  key={`${shown.id}-${i}`}
                  suggestion={s}
                  index={i}
                  data={data}
                  fields={fields}
                  canSave={canSave}
                  saved={savedMap[i] || null}
                  onSave={saveSegment}
                />
              ))}
            </section>
          ) : (
            <EmptyState
              icon={Users}
              title="No suggestions open"
              description="Describe the audience in plain language — or reopen earlier suggestions from history."
              className="rounded-xl border border-dashed border-border bg-surface-subtle"
            />
          )}
        </div>

        <HistoryCard
          items={history.items}
          loading={history.loading}
          activeId={shown?.id}
          canDelete={canUse}
          onOpen={(g) => openRecord(g.id)}
          onDelete={async (g) => {
            if ((await history.remove(g)) && shown?.id === g.id) closeRecord();
          }}
          describe={(g) => {
            const n = g.output?.suggestions?.length ?? 0;
            const saved = Object.keys(g.savedSegments || {}).length;
            return `${n} suggestion${n === 1 ? "" : "s"}${saved ? ` · ${saved} saved` : ""}`;
          }}
        />
      </div>
    </MainScreenWrapper>
  );
}

export default SegmentSuggestionsScreen;
