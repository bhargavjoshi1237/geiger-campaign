"use client";

import React, { useState } from "react";
import { Sparkles, Plus, X, Users } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader } from "@/components/internal/shared/screen_header";
import { Button } from "@/components/ui/button";

const SEED = [
  {
    id: 1,
    name: "High-intent, not yet purchased",
    rationale: "Visited pricing twice and opened the last 3 emails, but hasn't converted.",
    size: 2480,
    conditions: ["Viewed pricing ≥ 2", "No purchase", "Opened recent emails"],
  },
  {
    id: 2,
    name: "Lapsing loyal customers",
    rationale: "Bought 3+ times historically but no order in the last 90 days.",
    size: 1145,
    conditions: ["≥ 3 orders", "Last order > 90d", "Email subscribed"],
  },
  {
    id: 3,
    name: "Newsletter-only, never clicked",
    rationale: "Subscribed over 60 days ago and opens but never clicks a link.",
    size: 5310,
    conditions: ["Subscribed > 60d", "0 clicks", "Open rate > 20%"],
  },
  {
    id: 4,
    name: "Mobile-first weekend shoppers",
    rationale: "Most engagement happens on mobile during weekends — worth a tailored send time.",
    size: 3920,
    conditions: ["Device: mobile", "Engages Sat–Sun", "Active last 30d"],
  },
  {
    id: 5,
    name: "Discount-driven buyers",
    rationale: "Every purchase used a promo code — likely to respond to a targeted offer.",
    size: 1760,
    conditions: ["Used promo code", "≥ 2 orders", "AOV < $45"],
  },
];

export function SegmentSuggestionsScreen() {
  const [suggestions, setSuggestions] = useState(SEED);

  const dismiss = (id) =>
    setSuggestions((p) => p.filter((s) => s.id !== id));

  const refresh = () => setSuggestions(SEED);

  return (
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="Segment Suggestions"
        description="AI-surfaced audience segments worth targeting next."
        actions={
          <Button onClick={refresh} className="h-9 bg-white text-black hover:bg-[#e5e5e5]">
            <Sparkles className="h-4 w-4" /> Refresh suggestions
          </Button>
        }
      />

      <div className="border-t border-[#242424] pt-4">
        <p className="text-sm text-[#a3a3a3]">
          Based on recent behavior across your list, here are {suggestions.length} segment
          {suggestions.length === 1 ? "" : "s"} that look ready to act on.
        </p>
      </div>

      {suggestions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#2a2a2a] bg-[#1a1a1a] py-16 text-center text-sm text-[#737373]">
          No suggestions right now. Refresh to surface new ones.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {suggestions.map((s) => (
            <div key={s.id} className="flex flex-col rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] p-5 transition-colors hover:border-[#474747]">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-medium text-[#ededed]">{s.name}</h3>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#2a2a2a] bg-[#242424] text-[#a3a3a3]">
                  <Users className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-2 flex-1 text-sm text-[#737373]">{s.rationale}</p>
              <p className="mt-3 text-sm tabular-nums text-[#a3a3a3]">≈ {s.size.toLocaleString()} contacts</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {s.conditions.map((c) => (
                  <span key={c} className="rounded border border-[#2a2a2a] bg-[#242424] px-1.5 py-0.5 text-xs text-[#a3a3a3]">{c}</span>
                ))}
              </div>
              <div className="mt-5 flex items-center gap-2 border-t border-[#242424] pt-4">
                <Button size="sm" className="h-8 bg-white text-black hover:bg-[#e5e5e5]">
                  <Plus className="h-3.5 w-3.5" /> Create segment
                </Button>
                <Button onClick={() => dismiss(s.id)} size="sm" variant="ghost" className="h-8 text-[#a3a3a3] hover:bg-[#242424] hover:text-white">
                  <X className="h-3.5 w-3.5" /> Dismiss
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </MainScreenWrapper>
  );
}

export default SegmentSuggestionsScreen;
