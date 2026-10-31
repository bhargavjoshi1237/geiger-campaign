"use client";

import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Plus, Mail, Smartphone, Bell, Trash2, FileText, CalendarClock } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { EditorShell } from "@/components/internal/shared/editor_shell";
import { CAMPAIGN_STATUS_MAP } from "@/components/internal/screens/campaigns/constants";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
  ScreenHeader,
  SectionCard,
  Field,
  Badge,
  InlineTitleInput,
} from "@geiger/ui";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const CHANNEL_META = {
  Email: { icon: Mail, variant: "info", tone: "border-blue-500/40 bg-blue-500/15 text-blue-800 hover:bg-blue-500/25 dark:text-blue-200" },
  SMS: { icon: Smartphone, variant: "success", tone: "border-emerald-500/40 bg-emerald-500/15 text-emerald-800 hover:bg-emerald-500/25 dark:text-emerald-200" },
  Push: { icon: Bell, variant: "purple", tone: "border-violet-500/40 bg-violet-500/15 text-violet-800 hover:bg-violet-500/25 dark:text-violet-200" },
};
const CHANNELS = Object.keys(CHANNEL_META);

// Statuses a calendar entry can be set to by hand; "Sending" belongs to the send pipeline.
const EVENT_STATUSES = ["Scheduled", "Draft", "Paused", "Sent"];

const EVENT_NAV = [
  { key: "details", label: "Details", icon: FileText, desc: "The campaign, its channel, and where it stands." },
  { key: "schedule", label: "Schedule", icon: CalendarClock, desc: "When it goes out. A new date moves it on the calendar." },
];

const OUTLINE_BUTTON =
  "border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground";

// Default scheduled campaigns for June 2026 (month index 5).
const INITIAL_EVENTS = [
  { id: 1, year: 2026, month: 5, day: 3, name: "Weekly Digest #43", channel: "Email", time: "09:00" },
  { id: 2, year: 2026, month: 5, day: 9, name: "Flash SMS — 24h only", channel: "SMS", time: "12:00" },
  { id: 3, year: 2026, month: 5, day: 12, name: "Summer Sale launch", channel: "Email", time: "08:00" },
  { id: 4, year: 2026, month: 5, day: 12, name: "App push reminder", channel: "Push", time: "18:00" },
  { id: 5, year: 2026, month: 5, day: 18, name: "Webinar invite", channel: "Email", time: "10:00" },
  { id: 6, year: 2026, month: 5, day: 24, name: "Mid-year recap", channel: "Email", time: "07:30" },
];

const pad = (n) => String(n).padStart(2, "0");
// { year, month (0-based), day } <-> "YYYY-MM-DD" for the date input.
const toIsoDate = (e) => `${e.year}-${pad(e.month + 1)}-${pad(e.day)}`;
const fromIsoDate = (iso) => {
  const [year, month, day] = iso.split("-").map(Number);
  return { year, month: month - 1, day };
};
const formatLongDate = (e) =>
  new Date(e.year, e.month, e.day).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });

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
        <div className="space-y-4 py-4">
          <Field label="Campaign name" htmlFor="cal-name">
            <Input id="cal-name" value={form.name} onChange={(e) => set("name")(e.target.value)} placeholder="e.g. Spring Promo" className="border-border" />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Day">
              <Select value={form.day} onValueChange={set("day")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: daysInMonth }, (_, i) => String(i + 1)).map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Time" htmlFor="cal-time">
              <Input id="cal-time" type="time" value={form.time} onChange={(e) => set("time")(e.target.value)} className="border-border" />
            </Field>
            <Field label="Channel">
              <Select value={form.channel} onValueChange={set("channel")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{CHANNELS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!form.name.trim()}>Schedule</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Editable slice of a calendar entry; sample entries predate status, so it defaults to Scheduled.
const toDraft = (e) => ({
  name: e.name,
  channel: e.channel,
  status: e.status ?? "Scheduled",
  date: toIsoDate(e),
  time: e.time,
});

function EventEditor({ record, onBack, onSave, onDelete }) {
  const [draft, setDraft] = useState(() => toDraft(record));
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(record));

  const save = () => {
    const patch = {
      name: draft.name.trim() || "Untitled campaign",
      channel: draft.channel,
      status: draft.status,
      time: draft.time || record.time,
      ...fromIsoDate(draft.date),
    };
    onSave(record.id, patch);
    setDraft(toDraft({ ...record, ...patch }));
  };

  const meta = CHANNEL_META[draft.channel];
  const ChannelIcon = meta.icon;
  const when = draft.date ? formatLongDate(fromIsoDate(draft.date)) : "No date set";

  return (
    <EditorShell
      back={{ label: "Back", onClick: onBack }}
      title={
        <InlineTitleInput
          value={draft.name}
          onChange={(e) => set("name")(e.target.value)}
          aria-label="Campaign name"
          placeholder="Untitled campaign"
          className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl"
        />
      }
      status={draft.status}
      statusMap={CAMPAIGN_STATUS_MAP}
      badges={
        <>
          <Badge variant={meta.variant}><ChannelIcon /> {draft.channel}</Badge>
          <span className="text-xs text-text-tertiary">{when} · {draft.time || "No time set"}</span>
        </>
      }
      actions={
        <>
          <Button variant="ghost" size="icon" aria-label="Delete scheduled campaign" className="text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400 dark:hover:text-red-400" onClick={() => onDelete(record)}>
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button variant="outline" className={OUTLINE_BUTTON} disabled={!dirty || !draft.date} onClick={save}>
            Save
          </Button>
        </>
      }
      nav={EVENT_NAV}
      defaultSection="details"
    >
      {({ active }) => (
        <>
          {active === "details" ? (
            <SectionCard bare title="Campaign details" description="The name, channel and status shown on the calendar.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Campaign name" htmlFor="ce-name" className="sm:col-span-2">
                  <Input id="ce-name" value={draft.name} onChange={(e) => set("name")(e.target.value)} placeholder="e.g. Spring Promo" />
                </Field>
                <Field label="Channel">
                  <Select value={draft.channel} onValueChange={set("channel")}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>{CHANNELS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="Status" hint="Drafts and paused sends show with a dashed outline on the calendar.">
                  <Select value={draft.status} onValueChange={set("status")}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>{EVENT_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
              </div>
            </SectionCard>
          ) : null}

          {active === "schedule" ? (
            <SectionCard bare title="Send date & time" description="The day and time this campaign goes out.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Date" htmlFor="ce-date" hint={draft.date ? when : "Pick a date before saving."}>
                  <Input id="ce-date" type="date" value={draft.date} onChange={(e) => set("date")(e.target.value)} />
                </Field>
                <Field label="Send time" htmlFor="ce-time">
                  <Input id="ce-time" type="time" value={draft.time} onChange={(e) => set("time")(e.target.value)} />
                </Field>
              </div>
            </SectionCard>
          ) : null}
        </>
      )}
    </EditorShell>
  );
}

export function CalendarScreen() {
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(5); // June
  const [events, setEvents] = useState(INITIAL_EVENTS);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const { recordId, openRecord, closeRecord } = useWorkspaceUrl();

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

  const handleCreate = (e) => {
    setEvents((p) => [...p, { id: crypto.randomUUID(), status: "Scheduled", ...e }]);
    toast.success(`Scheduled "${e.name}" for ${MONTHS[e.month]} ${e.day}.`);
  };

  const handleSave = (id, patch) => {
    setEvents((p) => p.map((e) => (e.id === id ? { ...e, ...patch } : e)));
    // Follow the entry to its month so the moved chip is in view on Back.
    setYear(patch.year);
    setMonth(patch.month);
    toast.success("Scheduled campaign saved.");
  };

  const handleDelete = (ev) => {
    setDeleteTarget(null);
    setEvents((p) => p.filter((x) => x.id !== ev.id));
    if (String(ev.id) === recordId) closeRecord();
    toast.success(`Deleted "${ev.name}".`);
  };

  const deleteDialog = (
    <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete scheduled campaign</DialogTitle>
          <DialogDescription>
            Delete <span className="font-medium text-foreground">{deleteTarget?.name}</span>? It comes off the calendar and won&apos;t be sent. This can&apos;t be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button className="bg-red-500/90 text-white hover:bg-red-500" onClick={() => handleDelete(deleteTarget)}>
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const open = events.find((e) => String(e.id) === recordId);
  if (open) {
    return (
      <>
        <EventEditor key={open.id} record={open} onBack={closeRecord} onSave={handleSave} onDelete={setDeleteTarget} />
        {deleteDialog}
      </>
    );
  }

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Calendar"
        description="See every scheduled campaign across channels in one place."
        actions={
          <Button onClick={() => setScheduleOpen(true)}><Plus className="h-4 w-4" /> Schedule campaign</Button>
        }
      />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-foreground">{MONTHS[month]} {year}</h2>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon-sm" onClick={() => shift(-1)} className="bg-surface-card" aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="icon-sm" onClick={() => shift(1)} className="bg-surface-card" aria-label="Next month"><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => { setYear(2026); setMonth(5); }} className="text-muted-foreground">Today</Button>
      </div>

      <SectionCard bodyPadding={false}>
        <div className="grid grid-cols-7 border-b border-border bg-surface-subtle">
          {WEEKDAYS.map((w) => (
            <div key={w} className="px-3 py-2 text-center text-[11px] font-medium uppercase tracking-wider text-text-secondary">{w}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((day, i) => (
            <div
              key={i}
              className={cn(
                "min-h-[112px] border-b border-r border-surface-active p-1.5",
                (i + 1) % 7 === 0 && "border-r-0",
                day === null && "bg-surface-card",
              )}
            >
              {day !== null && (
                <>
                  <span className="px-1 text-xs text-text-secondary">{day}</span>
                  <div className="mt-1 space-y-1">
                    {eventsFor(day).map((e) => {
                      const meta = CHANNEL_META[e.channel];
                      const Icon = meta.icon;
                      return (
                        <button
                          key={e.id}
                          type="button"
                          title={`${e.time} ${e.name}`}
                          onClick={() => openRecord(String(e.id))}
                          className={cn(
                            "flex w-full cursor-pointer items-center gap-1 rounded-md border px-1.5 py-0.5 text-left text-[11px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/40",
                            meta.tone,
                            (e.status === "Draft" || e.status === "Paused") && "border-dashed",
                          )}
                        >
                          <Icon className="h-3 w-3 shrink-0" />
                          <span className="truncate">{e.time} {e.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </SectionCard>

      <ScheduleDialog
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        year={year}
        month={month}
        daysInMonth={daysInMonth}
        onCreate={handleCreate}
      />
      {deleteDialog}
    </MainScreenWrapper>
  );
}

export default CalendarScreen;
