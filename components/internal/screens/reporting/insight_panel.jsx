"use client";

import React, { useState } from "react";
import { Loader2, MessageSquareText, Minus, TrendingDown, TrendingUp } from "lucide-react";
import {
  Button,
  SectionCard,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
} from "@geiger/ui";
import { apiPost } from "@/lib/api/client";
import { insightPayload } from "@/lib/reporting/insights";
import { formatPercent, formatPts } from "@/lib/reporting/format";
import { ConfidenceBadge, OUTLINE_BUTTON } from "./report_ui";

// "Why this campaign worked": the deterministic findings from lib/reporting/insights.js, plus an optional
// AI narrative (POST /reporting/insights) that only rephrases those findings.

const TITLES = {
  outperformed: "Why this campaign worked",
  underperformed: "What held this campaign back",
  in_line: "How this campaign compares",
  insufficient: "Why this campaign worked",
};

const DIRECTION = {
  positive: { icon: TrendingUp, className: "text-emerald-600 dark:text-emerald-400", label: "Helped" },
  negative: { icon: TrendingDown, className: "text-red-600 dark:text-red-400", label: "Held back" },
  neutral: { icon: Minus, className: "text-text-tertiary", label: "No clear effect" },
};

function Finding({ finding }) {
  const meta = DIRECTION[finding.direction] || DIRECTION.neutral;
  const Icon = meta.icon;
  return (
    <div className="flex items-start gap-3 px-5 py-3.5">
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", meta.className)} aria-label={meta.label} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-foreground">{finding.title}</p>
          <ConfidenceBadge level={finding.confidence} />
        </div>
        <p className="mt-0.5 text-sm text-text-secondary">{finding.detail}</p>
      </div>
    </div>
  );
}

function FindingGroup({ label, findings }) {
  if (!findings.length) return null;
  return (
    <div>
      <p className="border-b border-border px-5 pb-2 pt-4 text-[11px] font-medium uppercase tracking-wider text-text-secondary">{label}</p>
      <div className="divide-y divide-border">
        {findings.map((f) => (
          <Finding key={f.id} finding={f} />
        ))}
      </div>
    </div>
  );
}

export function InsightPanel({ analysis, campaign, options, focusId, onFocus, projectId, canUseAi }) {
  const [narrative, setNarrative] = useState({ for: null, status: "idle", text: "", error: "", model: "" });
  const current = narrative.for === focusId ? narrative : { status: "idle" };

  const explain = async () => {
    setNarrative({ for: focusId, status: "loading", text: "", error: "", model: "" });
    const res = await apiPost(`/api/projects/${projectId}/reporting/insights`, insightPayload(analysis, campaign));
    if (res.ok) setNarrative({ for: focusId, status: "done", text: res.data?.narrative || "", error: "", model: res.data?.model || "" });
    else {
      const message =
        res.status === 503
          ? "AI isn't configured for this workspace. An admin can set CAMPAIGN_LLM_BASE_URL, CAMPAIGN_LLM_API_KEY and CAMPAIGN_LLM_MODEL to enable explanations."
          : res.status === 403
            ? "Your role can't use the AI assistant."
            : res.error;
      setNarrative({ for: focusId, status: "error", text: "", error: message, model: "" });
    }
  };

  const positive = analysis?.findings.filter((f) => f.direction === "positive") || [];
  const negative = analysis?.findings.filter((f) => f.direction === "negative") || [];
  const neutral = analysis?.findings.filter((f) => f.direction === "neutral") || [];

  return (
    <SectionCard
      bodyPadding={false}
      title={TITLES[analysis?.verdict] || TITLES.in_line}
      description={analysis?.summary || "Pick a sent campaign to analyse."}
      action={
        <div className="flex flex-wrap items-center gap-2">
          <Select value={focusId || ""} onValueChange={onFocus}>
            <SelectTrigger size="sm" className="w-56" aria-label="Campaign to explain"><SelectValue placeholder="Choose a campaign" /></SelectTrigger>
            <SelectContent>
              {options.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {canUseAi ? (
            <Button
              size="sm"
              variant="outline"
              className={OUTLINE_BUTTON}
              onClick={explain}
              disabled={!analysis || analysis.verdict === "insufficient" || current.status === "loading"}
            >
              {current.status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquareText className="h-4 w-4" />} Explain
            </Button>
          ) : null}
        </div>
      }
    >
      {analysis?.headline?.length ? (
        <div className="grid grid-cols-1 divide-y divide-border border-b border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {analysis.headline.map((h) => (
            <div key={h.metric} className="px-5 py-4">
              <p className="text-[11px] font-medium uppercase tracking-wider text-text-secondary">{h.label}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">{formatPercent(h.value)}</p>
              <p className="mt-1 text-xs tabular-nums text-text-secondary">
                Baseline {formatPercent(h.baseline)} ·{" "}
                <span className={cn(h.delta > 0 ? "text-emerald-600 dark:text-emerald-400" : h.delta < 0 ? "text-red-600 dark:text-red-400" : "")}>
                  {formatPts(h.delta) || "—"}
                </span>
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {current.status === "done" || current.status === "error" ? (
        <div className="border-b border-border px-5 py-4">
          {current.status === "done" ? (
            <>
              <p className="text-sm leading-relaxed text-foreground">{current.text}</p>
              <p className="mt-2 text-xs text-text-tertiary">Written by {current.model || "the AI model"} from the findings below. Check it against them before acting.</p>
            </>
          ) : (
            <p className="text-sm text-text-secondary">{current.error}</p>
          )}
        </div>
      ) : null}

      {analysis?.findings?.length ? (
        <div className="pb-2">
          <FindingGroup label="Helped" findings={positive} />
          <FindingGroup label="Held back" findings={negative} />
          <FindingGroup label="No clear effect" findings={neutral} />
        </div>
      ) : (
        <p className="px-5 py-8 text-center text-sm text-text-secondary">
          {analysis ? "No factor stood out for this campaign." : "Select at least one sent campaign above."}
        </p>
      )}

      <p className="border-t border-border px-5 py-3 text-xs text-text-tertiary">
        Compared against {analysis?.peers ?? 0} other sent {campaign?.channel || "email"} campaigns in this workspace. Confidence reflects sample sizes; it isn&apos;t proof of cause.
      </p>
    </SectionCard>
  );
}
