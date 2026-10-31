"use client";

import React from "react";
import { Field, Input, SectionCard, SegmentedTabs, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@geiger/ui";
import { SCHEDULE_MODES, formatDateTime, fromLocalInput, toLocalInput } from "../constants";

const WINDOWS = [6, 12, 24, 48];

const viewerZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

const validZone = (tz) => {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

// The schedule a send would use: { mode, scheduledAt (ISO, the earliest delivery), strategy }.
export function resolveSchedule(strategy = {}, scheduledAt) {
  const mode = strategy.mode || "now";
  if (mode === "now") return { mode: "now", scheduledAt: null, strategy: { mode: "now" } };
  if (mode === "scheduled") return { mode: "schedule", scheduledAt, strategy: { mode: "scheduled" } };
  if (mode === "timezone") {
    // The earliest zone (UTC+14) reaches the local time first; the delivery engine times each contact.
    const at = strategy.date ? new Date(new Date(`${strategy.date}T${strategy.localTime || "09:00"}:00Z`).getTime() - 14 * 3600e3).toISOString() : null;
    return {
      mode: "schedule",
      scheduledAt: at,
      strategy: { mode: "timezone", date: strategy.date || null, localTime: strategy.localTime || "09:00", fallbackTimezone: strategy.fallbackTimezone || "UTC" },
    };
  }
  return {
    mode: "schedule",
    scheduledAt: strategy.windowStart || scheduledAt || null,
    strategy: { mode: "optimized", windowStart: strategy.windowStart || null, windowHours: Number(strategy.windowHours) || 24 },
  };
}

export function scheduleSummary(strategy = {}, scheduledAt) {
  const mode = strategy.mode || "now";
  if (mode === "now") return "Sends immediately when you confirm.";
  if (mode === "scheduled") return scheduledAt ? `Sends ${formatDateTime(scheduledAt)} (${viewerZone()}).` : "Pick a date and time.";
  if (mode === "timezone") {
    return strategy.date
      ? `Delivers at ${strategy.localTime || "09:00"} on ${strategy.date} in each contact's time zone; contacts without one use ${strategy.fallbackTimezone || "UTC"}.`
      : "Pick a date and a local delivery time.";
  }
  return strategy.windowStart
    ? `Each contact receives it within ${strategy.windowHours || 24} hours of ${formatDateTime(strategy.windowStart)}, at the hour they usually open email.`
    : "Pick when the send window opens.";
}

// Problems that block sending with this schedule (empty = fine).
export function scheduleProblems(strategy = {}, scheduledAt, now = Date.now()) {
  const mode = strategy.mode || "now";
  if (mode === "scheduled") {
    if (!scheduledAt) return ["Pick a send date and time."];
    if (new Date(scheduledAt).getTime() < now) return ["The send time is in the past."];
  }
  if (mode === "timezone") {
    if (!strategy.date) return ["Pick the delivery date."];
    if (strategy.fallbackTimezone && !validZone(strategy.fallbackTimezone)) return ["The fallback time zone isn't recognised."];
  }
  if (mode === "optimized" && !strategy.windowStart) return ["Pick when the send window opens."];
  return [];
}

export function ScheduleSection({ strategy, scheduledAt, setStrategy, setScheduledAt, readOnly }) {
  const s = strategy || {};
  const mode = s.mode || "now";
  const set = (patch) => setStrategy({ ...s, ...patch });
  const problems = scheduleProblems(s, scheduledAt);
  return (
    <SectionCard bare title="Send timing" description="Choose a timing mode and the dates and times it needs.">
      <div className="grid gap-5">
        <Field label="Timing">
          <SegmentedTabs tabs={SCHEDULE_MODES} value={mode} onChange={(v) => !readOnly && set({ mode: v })} />
        </Field>

        {mode === "scheduled" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Send at" htmlFor="cmp-send-at" hint={`Your time zone: ${viewerZone()}`}>
              <Input id="cmp-send-at" type="datetime-local" value={toLocalInput(scheduledAt)} onChange={(e) => setScheduledAt(fromLocalInput(e.target.value))} disabled={readOnly} />
            </Field>
          </div>
        ) : null}

        {mode === "timezone" ? (
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Date" htmlFor="cmp-tz-date">
              <Input id="cmp-tz-date" type="date" value={s.date || ""} onChange={(e) => set({ date: e.target.value })} disabled={readOnly} />
            </Field>
            <Field label="Local time" htmlFor="cmp-tz-time">
              <Input id="cmp-tz-time" type="time" value={s.localTime || "09:00"} onChange={(e) => set({ localTime: e.target.value })} disabled={readOnly} />
            </Field>
            <Field label="Fallback time zone" htmlFor="cmp-tz-fallback" hint="For contacts without one.">
              <Input id="cmp-tz-fallback" value={s.fallbackTimezone ?? "UTC"} onChange={(e) => set({ fallbackTimezone: e.target.value.trim() })} placeholder="UTC" disabled={readOnly} />
            </Field>
          </div>
        ) : null}

        {mode === "optimized" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Window opens" htmlFor="cmp-opt-start" hint={`Your time zone: ${viewerZone()}`}>
              <Input id="cmp-opt-start" type="datetime-local" value={toLocalInput(s.windowStart)} onChange={(e) => set({ windowStart: fromLocalInput(e.target.value) })} disabled={readOnly} />
            </Field>
            <Field label="Window length" hint="Contacts with no open history get it when the window opens.">
              <Select value={String(s.windowHours || 24)} onValueChange={(v) => set({ windowHours: Number(v) })} disabled={readOnly}>
                <SelectTrigger className="w-full bg-surface-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WINDOWS.map((h) => (
                    <SelectItem key={h} value={String(h)}>
                      {h} hours
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
        ) : null}

        <div className="rounded-lg border border-border bg-surface-card px-4 py-3 text-sm">
          <p className="text-foreground">{scheduleSummary(s, scheduledAt)}</p>
          {problems.length ? <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">{problems[0]}</p> : null}
          <p className="mt-1 text-xs text-text-secondary">Nothing is sent until you confirm on Review and send.</p>
        </div>
      </div>
    </SectionCard>
  );
}

export default ScheduleSection;
