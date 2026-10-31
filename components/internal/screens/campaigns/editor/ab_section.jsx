"use client";

import React from "react";
import { Copy, PencilRuler, Trophy } from "lucide-react";
import {
  Badge,
  Button,
  Field,
  Input,
  SectionCard,
  SegmentedTabs,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingRow,
  SettingsList,
} from "@geiger/ui";
import { AB_DURATIONS, AB_METRICS, AB_TEST_ON, abSplit, normalizeAb } from "@/lib/campaigns/ab";
import { documentIsEmpty } from "@/lib/email/blocks";
import { MergeTextField } from "../builder/merge_tag_picker";
import { PREHEADER_LIMIT, SUBJECT_LIMIT, formatDateTime } from "../constants";

const metricLabel = (m) => (AB_METRICS.find((x) => x.value === m)?.label || "Open rate").toLowerCase();

export function abSummary(abInput) {
  const ab = normalizeAb(abInput);
  const { perVariant, remainder } = abSplit(ab);
  const head = ab.variants.map((v) => `${perVariant}% get ${v.key}`).join(", ");
  if (!remainder) return `${head}. Every recipient is in the test; there's no winner send.`;
  return `${head}. After ${ab.durationHours} ${ab.durationHours === 1 ? "hour" : "hours"}, the remaining ${remainder}% get the variant with the higher ${metricLabel(ab.winnerMetric)}.`;
}

// Problems that block sending this test (empty = fine).
export function abProblems(abInput) {
  const ab = normalizeAb(abInput);
  if (!ab.enabled) return [];
  const b = ab.variants[1] || {};
  if (ab.testOn === "subject" && !String(b.subject || "").trim()) return ["Add a subject line for variant B."];
  if (ab.testOn === "content" && documentIsEmpty(b.content)) return ["Design the content for variant B."];
  return [];
}

export function AbSection({ ab: abInput, setAb, draft, groups, readOnly, onEditVariantContent }) {
  const ab = normalizeAb(abInput);
  const set = (patch) => setAb({ ...ab, ...patch });
  const variantB = ab.variants[1] || { key: "B" };
  const setB = (patch) => set({ variants: ab.variants.map((v, i) => (i === 1 ? { ...v, ...patch } : v)) });
  const noWinnerPhase = ab.testPercent >= 100;

  return (
    <div className="space-y-6">
      <SectionCard bare title="Test mode" description="Whether this campaign tests two versions before the full send.">
        <SettingsList>
          <SettingRow
            title="Run an A/B test"
            description="Send two versions to part of the audience and let the better one go to everyone else."
            checked={ab.enabled}
            onCheckedChange={(v) => !readOnly && set({ enabled: v })}
          />
        </SettingsList>
      </SectionCard>

      {ab.enabled ? (
        <>
          <SectionCard bare title="What to test" description="Pick what differs between the two versions, then set up variant B.">
            <div className="grid gap-4">
              <SegmentedTabs tabs={AB_TEST_ON} value={ab.testOn} onChange={(v) => !readOnly && set({ testOn: v })} className="w-auto" />
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-lg border border-border bg-surface-card p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-sm font-semibold text-foreground">Variant A</span>
                    <Badge variant="neutral">The campaign</Badge>
                  </div>
                  {ab.testOn === "subject" ? (
                    <div className="space-y-1 text-sm">
                      <p className="truncate text-foreground">{draft.subject || "No subject yet"}</p>
                      <p className="truncate text-xs text-text-secondary">{draft.preheader || "No preheader"}</p>
                    </div>
                  ) : (
                    <p className="text-sm text-text-secondary">{documentIsEmpty(draft.content) ? "No content yet." : "Uses the campaign's design."}</p>
                  )}
                </div>
                <div className="rounded-lg border border-border bg-surface-card p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-sm font-semibold text-foreground">Variant B</span>
                    {ab.winner ? null : <Badge variant="warning">Challenger</Badge>}
                  </div>
                  {ab.testOn === "subject" ? (
                    <div className="grid gap-3">
                      <MergeTextField id="ab-b-subject" label="Subject" value={variantB.subject || ""} onChange={(v) => setB({ subject: v })} groups={groups} limit={SUBJECT_LIMIT} disabled={readOnly} />
                      <MergeTextField id="ab-b-preheader" label="Preheader" value={variantB.preheader || ""} onChange={(v) => setB({ preheader: v })} groups={groups} limit={PREHEADER_LIMIT} placeholder="Empty = same as A" disabled={readOnly} />
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-sm text-text-secondary">{documentIsEmpty(variantB.content) ? "No design yet." : "Has its own design."}</p>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" onClick={onEditVariantContent} disabled={readOnly && documentIsEmpty(variantB.content)}>
                          <PencilRuler className="h-3.5 w-3.5" /> {readOnly ? "View" : "Edit"} variant B
                        </Button>
                        {!readOnly ? (
                          <Button size="sm" variant="outline" className="bg-surface-card" onClick={() => setB({ content: JSON.parse(JSON.stringify(draft.content || {})) })} disabled={documentIsEmpty(draft.content)}>
                            <Copy className="h-3.5 w-3.5" /> Copy design from A
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard bare title="Split and winner" description="How much of the audience is tested and how the winning version is chosen.">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Test group" hint="Share of the audience in the test.">
                <div className="flex items-center gap-2">
                  <Input type="number" min={10} max={100} step={5} value={ab.testPercent} onChange={(e) => set({ testPercent: Number(e.target.value) || 10 })} className="tabular-nums" disabled={readOnly} />
                  <span className="text-sm text-text-secondary">%</span>
                </div>
              </Field>
              <Field label="Winner metric">
                <Select value={ab.winnerMetric} onValueChange={(v) => set({ winnerMetric: v })} disabled={readOnly || noWinnerPhase}>
                  <SelectTrigger className="w-full bg-surface-card">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AB_METRICS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Test duration">
                <Select value={String(ab.durationHours)} onValueChange={(v) => set({ durationHours: Number(v) })} disabled={readOnly || noWinnerPhase}>
                  <SelectTrigger className="w-full bg-surface-card">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AB_DURATIONS.map((h) => (
                      <SelectItem key={h} value={String(h)}>
                        {h} {h === 1 ? "hour" : "hours"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <p className="mt-4 rounded-lg border border-border bg-surface-card px-4 py-3 text-sm text-foreground">{abSummary(ab)}</p>
            {ab.winner ? (
              <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-foreground">
                <Trophy className="h-4 w-4 text-amber-600 dark:text-amber-400" /> Variant {ab.winner} won{ab.decidedAt ? ` on ${formatDateTime(ab.decidedAt)}` : ""}.
              </p>
            ) : null}
          </SectionCard>
        </>
      ) : null}
    </div>
  );
}

export default AbSection;
