"use client";

import React from "react";
import { Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Switch } from "@geiger/ui";
import { WEEKDAYS, normalizeBusinessHours } from "@/lib/inbox/sla";

// Business-hours editor shared by SLA policies and chat widgets: on/off, time zone, per-day open window.

const ZONES = [
  "UTC",
  "Europe/Lisbon",
  "Europe/London",
  "Europe/Madrid",
  "Europe/Berlin",
  "Europe/Amsterdam",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
];

export function businessHoursSummary(value) {
  const hours = normalizeBusinessHours(value);
  if (!hours.enabled) return "24/7";
  const open = WEEKDAYS.filter((d) => hours.days[d.key].open);
  if (!open.length) return "Closed every day";
  const first = hours.days[open[0].key];
  const same = open.every((d) => hours.days[d.key].start === first.start && hours.days[d.key].end === first.end);
  const span = open.length === 5 && open.every((d) => !["sat", "sun"].includes(d.key)) ? "Mon–Fri" : open.map((d) => d.label.slice(0, 3)).join(", ");
  return `${span} ${same ? `${first.start}–${first.end}` : "(varies)"} · ${hours.timezone}`;
}

export function BusinessHoursEditor({ value, onChange, idPrefix = "bh" }) {
  const hours = normalizeBusinessHours(value);
  const set = (patch) => onChange({ ...hours, ...patch });
  const setDay = (key, patch) => onChange({ ...hours, days: { ...hours.days, [key]: { ...hours.days[key], ...patch } } });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">Business hours</p>
          <p className="text-xs text-text-secondary">{hours.enabled ? "Timers only run while you're open." : "Off — the clock runs 24/7."}</p>
        </div>
        <Switch checked={hours.enabled} onCheckedChange={(enabled) => set({ enabled })} aria-label="Use business hours" />
      </div>
      {hours.enabled ? (
        <>
          <Select value={hours.timezone} onValueChange={(timezone) => set({ timezone })}>
            <SelectTrigger className="w-full" aria-label="Time zone"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[...new Set([hours.timezone, ...ZONES])].map((z) => (
                <SelectItem key={z} value={z}>{z}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="divide-y divide-border rounded-lg border border-border">
            {WEEKDAYS.map((d) => {
              const day = hours.days[d.key];
              return (
                <div key={d.key} className="flex items-center gap-3 px-3 py-2">
                  <Switch checked={day.open} onCheckedChange={(open) => setDay(d.key, { open })} aria-label={`Open on ${d.label}`} />
                  <span className="w-24 text-sm text-foreground">{d.label}</span>
                  {day.open ? (
                    <div className="ml-auto flex items-center gap-1.5">
                      <Input id={`${idPrefix}-${d.key}-start`} type="time" value={day.start} onChange={(e) => setDay(d.key, { start: e.target.value })} aria-label={`${d.label} opens`} className="h-8 w-28 border-border bg-surface-card text-sm" />
                      <span className="text-xs text-text-tertiary">to</span>
                      <Input id={`${idPrefix}-${d.key}-end`} type="time" value={day.end} onChange={(e) => setDay(d.key, { end: e.target.value })} aria-label={`${d.label} closes`} className="h-8 w-28 border-border bg-surface-card text-sm" />
                    </div>
                  ) : (
                    <span className="ml-auto text-xs text-text-tertiary">Closed</span>
                  )}
                </div>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}
