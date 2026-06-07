"use client";

import React, { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Mail, Smartphone, Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader } from "@/components/internal/shared/screen_header";
import { Field } from "@/components/internal/shared/screen_kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const CHANNEL_META = { Email: { icon: Mail, tone: "border-blue-500/40 bg-blue-500/15 text-blue-200" }, SMS: { icon: Smartphone, tone: "border-emerald-500/40 bg-emerald-500/15 text-emerald-200" }, Push: { icon: Bell, tone: "border-violet-500/40 bg-violet-500/15 text-violet-200" } };

// Default scheduled campaigns for June 2026 (month index 5).
const INITIAL_EVENTS = [
  { id: 1, year: 2026, month: 5, day: 3, name: "Weekly Digest #43", channel: "Email", time: "09:00" },
  { id: 2, year: 2026, month: 5, day: 9, name: "Flash SMS — 24h only", channel: "SMS", time: "12:00" },
  { id: 3, year: 2026, month: 5, day: 12, name: "Summer Sale launch", channel: "Email", time: "08:00" },
  { id: 4, year: 2026, month: 5, day: 12, name: "App push reminder", channel: "Push", time: "18:00" },
  { id: 5, year: 2026, month: 5, day: 18, name: "Webinar invite", channel: "Email", time: "10:00" },
  { id: 6, year: 2026, month: 5, day: 24, name: "Mid-year recap", channel: "Email", time: "07:30" },
];

function ScheduleDialog({ open, onOpenChange, onCreate, year, month, daysInMonth }) {
  const [form, setForm] = useState({ name: "", day: "1", time: "09:00", channel: "Email" });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const submit = () => {
    if (!form.name.trim()) return;
    onCreate({ year, month, day: parseInt(form.day, 10), name: form.name.trim(), channel: form.channel, time: form.time });
    setForm({ name: "", day: "1", time: "09:00", channel: "Email" });
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Schedule campaign</DialogTitle>
          <DialogDescription>Place a campaign on the calendar for {MONTHS[month]} {year}.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4 py-4">
          <Field label="Campaign name" htmlFor="cal-name">
            <Input id="cal-name" value={form.name} onChange={(e) => set("name")(e.target.value)} placeholder="e.g. Spring Promo" className="bg-[#161616] border-[#2a2a2a]" />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Day">
              <Select value={form.day} onValueChange={set("day")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: daysInMonth }, (_, i) => String(i + 1)).map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Time" htmlFor="cal-time">
              <Input id="cal-time" type="time" value={form.time} onChange={(e) => set("time")(e.target.value)} className="bg-[#161616] border-[#2a2a2a]" />
            </Field>
            <Field label="Channel">
              <Select value={form.channel} onValueChange={set("channel")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["Email", "SMS", "Push"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-[#a3a3a3] hover:bg-[#242424] hover:text-white">Cancel</Button>
          <Button onClick={submit} disabled={!form.name.trim()} className="bg-white text-black hover:bg-[#e5e5e5]">Schedule</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CalendarScreen() {
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(5); // June
  const [events, setEvents] = useState(INITIAL_EVENTS);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  const firstWeekday = useMemo(() => new Date(year, month, 1).getDay(), [year, month]);
  const daysInMonth = useMemo(() => new Date(year, month + 1, 0).getDate(), [year, month]);

  const cells = useMemo(() => {
    const arr = [];
    for (let i = 0; i < firstWeekday; i++) arr.push(null);
    for (let d = 1; d <= daysInMonth; d++) arr.push(d);
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [firstWeekday, daysInMonth]);

  const eventsFor = (day) => events.filter((e) => e.year === year && e.month === month && e.day === day);

  const shift = (delta) => {
    let m = month + delta;
    let y = year;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    setMonth(m);
    setYear(y);
  };

  return (
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="Calendar"
        description="See every scheduled campaign across channels in one place."
        actions={
          <Button onClick={() => setScheduleOpen(true)} className="h-9 bg-white text-black hover:bg-[#e5e5e5]"><Plus className="h-4 w-4" /> Schedule campaign</Button>
        }
      />

      <div className="flex items-center justify-between border-t border-[#242424] pt-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-white">{MONTHS[month]} {year}</h2>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon-sm" onClick={() => shift(-1)} className="border-[#2a2a2a] bg-[#202020] text-[#ededed] hover:bg-[#242424]"><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="icon-sm" onClick={() => shift(1)} className="border-[#2a2a2a] bg-[#202020] text-[#ededed] hover:bg-[#242424]"><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => { setYear(2026); setMonth(5); }} className="text-[#a3a3a3] hover:bg-[#242424] hover:text-white">Today</Button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#2a2a2a] bg-[#202020]">
        <div className="grid grid-cols-7 border-b border-[#2a2a2a] bg-[#1a1a1a]">
          {WEEKDAYS.map((w) => (
            <div key={w} className="px-3 py-2 text-center text-[11px] font-medium uppercase tracking-wider text-[#737373]">{w}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((day, i) => (
            <div
              key={i}
              className={cn(
                "min-h-[112px] border-b border-r border-[#242424] p-1.5",
                (i + 1) % 7 === 0 && "border-r-0",
                day === null && "bg-[#1c1c1c]",
              )}
            >
              {day !== null && (
                <>
                  <span className="px-1 text-xs text-[#737373]">{day}</span>
                  <div className="mt-1 space-y-1">
                    {eventsFor(day).map((e) => {
                      const meta = CHANNEL_META[e.channel];
                      const Icon = meta.icon;
                      return (
                        <div key={e.id} className={cn("flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px]", meta.tone)}>
                          <Icon className="h-3 w-3 shrink-0" />
                          <span className="truncate">{e.time} {e.name}</span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      <ScheduleDialog
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        year={year}
        month={month}
        daysInMonth={daysInMonth}
        onCreate={(e) => setEvents((p) => [...p, { id: Date.now(), ...e }])}
      />
    </MainScreenWrapper>
  );
}

export default CalendarScreen;
