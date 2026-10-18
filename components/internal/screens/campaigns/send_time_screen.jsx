"use client";

import React, { useState } from "react";
import { Clock, Sparkles, Globe, Sun } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
  ScreenHeader,
  SectionCard,
  SettingsList,
  SettingRow,
  Field,
} from "@geiger/ui";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = ["6a", "8a", "10a", "12p", "2p", "4p", "6p", "8p", "10p"];

// Deterministic engagement intensity (0–4) per day/hour cell.
function intensity(d, h) {
  const base = (Math.sin(d * 1.3 + 1) + Math.cos(h * 0.9)) * 2 + 2;
  const peak = h >= 2 && h <= 5 && d < 5 ? 1.6 : 0;
  return Math.max(0, Math.min(4, Math.round(base + peak)));
}
const HEAT = ["bg-zinc-100 dark:bg-[#1f1f1f]", "bg-emerald-100 dark:bg-[#28332b]", "bg-emerald-200 dark:bg-[#2f5141]", "bg-emerald-400 dark:bg-[#3f8a5e]", "bg-emerald-500 dark:bg-[#56d68f]"];

const STRATEGIES = [
  { value: "ai", label: "AI per-recipient (recommended)", icon: Sparkles },
  { value: "tz", label: "Recipient time zone", icon: Globe },
  { value: "best", label: "Best time of day", icon: Sun },
];

export function SendTimeScreen() {
  const [enabled, setEnabled] = useState(true);
  const [strategy, setStrategy] = useState("ai");
  const [fallback, setFallback] = useState("10a");
  const [window, setWindow] = useState("24h");

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Send-Time Optimization"
        description="Deliver each message when a contact is most likely to open it."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
        {/* Config */}
        <SectionCard contentClassName="space-y-4">
          <SettingsList className="rounded-lg border border-border bg-surface-card px-4 py-3">
            <SettingRow
              title="Enable optimization"
              description="Applies to all broadcast campaigns."
              checked={enabled}
              onCheckedChange={setEnabled}
            />
          </SettingsList>

          <div className={cn("space-y-4 transition-opacity", !enabled && "pointer-events-none opacity-40")}>
            <Field label="Strategy">
              <Select value={strategy} onValueChange={setStrategy}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STRATEGIES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Fallback send time" hint="Used when there isn't enough history for a contact.">
              <Select value={fallback} onValueChange={setFallback}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{HOURS.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Optimization window" hint="How long after launch the engine may hold a send to hit the best time.">
              <Select value={window} onValueChange={setWindow}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="12h">Within 12 hours</SelectItem>
                  <SelectItem value="24h">Within 24 hours</SelectItem>
                  <SelectItem value="48h">Within 48 hours</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
        </SectionCard>

        {/* Heatmap */}
        <SectionCard
          title={
            <span className="inline-flex items-center gap-2">
              <Clock className="h-4 w-4 text-text-secondary" /> Engagement by send time
            </span>
          }
          description="Open rate across the last 90 days, by day and hour."
        >
          <div className="overflow-x-auto">
            <div className="min-w-[440px]">
              <div className="mb-1 grid grid-cols-[40px_repeat(9,1fr)] gap-1">
                <span />
                {HOURS.map((h) => <span key={h} className="text-center text-[10px] text-text-secondary">{h}</span>)}
              </div>
              {DAYS.map((day, d) => (
                <div key={day} className="mb-1 grid grid-cols-[40px_repeat(9,1fr)] items-center gap-1">
                  <span className="text-[11px] text-text-secondary">{day}</span>
                  {HOURS.map((_, h) => {
                    const v = intensity(d, h);
                    return <span key={h} className={cn("aspect-square rounded-[3px]", HEAT[v])} title={`${day} ${HOURS[h]}`} />;
                  })}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-end gap-2 text-[10px] text-text-secondary">
            Less
            {HEAT.map((c) => <span key={c} className={cn("h-3 w-3 rounded-[3px]", c)} />)}
            More
          </div>
        </SectionCard>
      </div>
    </MainScreenWrapper>
  );
}

export default SendTimeScreen;
