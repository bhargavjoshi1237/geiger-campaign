"use client";

import React from "react";
import { Sparkles, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader } from "@/components/internal/shared/screen_header";
import { Pill } from "@/components/internal/shared/screen_kit";
import { Button } from "@/components/ui/button";

const STATUS = {
  good: { icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/25", action: "Review" },
  warn: { icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/25", action: "Fix" },
  bad: { icon: XCircle, color: "text-red-400", bg: "bg-red-500/10 border-red-500/25", action: "Fix" },
};

const CHECKS = [
  {
    id: 1,
    name: "List hygiene",
    status: "good",
    finding: "Bounce rate is 0.4% and your list was last cleaned 9 days ago.",
    recommendation: "Keep your monthly suppression sweep running.",
  },
  {
    id: 2,
    name: "Send frequency",
    status: "warn",
    finding: "You sent 6 campaigns this week — above the 3–4 sweet spot for this audience.",
    recommendation: "Consolidate sends or add a frequency cap to reduce fatigue.",
  },
  {
    id: 3,
    name: "Deliverability",
    status: "good",
    finding: "Inbox placement is 97% with spam complaints under 0.1%.",
    recommendation: "Maintain current sending volume and warm-up cadence.",
  },
  {
    id: 4,
    name: "Engagement trend",
    status: "warn",
    finding: "Open rate slipped from 34% to 28% over the last 30 days.",
    recommendation: "Refresh subject lines and re-engage your most active 25%.",
  },
  {
    id: 5,
    name: "Authentication",
    status: "bad",
    finding: "DMARC is missing and DKIM is only partially configured.",
    recommendation: "Publish a DMARC record and complete DKIM to protect your domain.",
  },
  {
    id: 6,
    name: "Unsubscribe rate",
    status: "good",
    finding: "Unsubscribes are steady at 0.18%, well within a healthy range.",
    recommendation: "No action needed — continue monitoring weekly.",
  },
];

export function CampaignHealthScreen() {
  return (
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="Campaign Health"
        description="An AI audit of your sending health with prioritized fixes."
        actions={
          <Button className="h-9 bg-white text-black hover:bg-[#e5e5e5]">
            <Sparkles className="h-4 w-4" /> Re-run audit
          </Button>
        }
      />

      {/* Overall score */}
      <div className="flex flex-col gap-4 rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-baseline gap-3">
          <span className="text-4xl font-bold tabular-nums text-white">82</span>
          <span className="text-lg text-[#737373]">/ 100</span>
          <Pill tone="green">Good</Pill>
        </div>
        <p className="max-w-md text-sm text-[#a3a3a3]">
          Your sending is healthy overall. Fixing authentication and easing send frequency
          would push you into excellent territory.
        </p>
      </div>

      {/* Health checks */}
      <div className="flex items-center gap-2 border-t border-[#242424] pt-4">
        <h2 className="text-sm font-semibold text-[#ededed]">Health checks</h2>
        <span className="text-xs text-[#737373]">{CHECKS.length} checks</span>
      </div>

      <div className="space-y-3">
        {CHECKS.map((c) => {
          const s = STATUS[c.status];
          const Icon = s.icon;
          return (
            <div key={c.id} className="flex flex-col gap-3 rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] p-5 sm:flex-row sm:items-start">
              <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border", s.bg)}>
                <Icon className={cn("h-4 w-4", s.color)} />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="font-medium text-[#ededed]">{c.name}</h3>
                <p className="mt-1 text-sm text-[#a3a3a3]">{c.finding}</p>
                <p className="mt-1 text-sm text-[#737373]">{c.recommendation}</p>
              </div>
              <Button size="sm" variant="ghost" className="h-8 shrink-0 text-[#a3a3a3] hover:bg-[#242424] hover:text-white">
                {s.action}
              </Button>
            </div>
          );
        })}
      </div>
    </MainScreenWrapper>
  );
}

export default CampaignHealthScreen;
