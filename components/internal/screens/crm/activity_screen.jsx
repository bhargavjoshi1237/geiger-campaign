"use client";

import React, { useMemo, useState } from "react";
import { Plus, Phone, Mail, Calendar, StickyNote, Handshake, Activity } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  cn,
  ScreenHeader,
  Toolbar,
  EmptyState,
  Field,
} from "@geiger/ui";

const TYPE_META = {
  Call: { icon: Phone, color: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30" },
  Email: { icon: Mail, color: "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30" },
  Meeting: { icon: Calendar, color: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30" },
  Note: { icon: StickyNote, color: "bg-zinc-500/15 text-muted-foreground border-zinc-500/30" },
  Deal: { icon: Handshake, color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30" },
};

const TYPES = ["Call", "Email", "Meeting", "Note", "Deal"];
const TYPE_FILTERS = ["All", ...TYPES];

const INITIAL_ACTIVITY = [
  { id: 1, type: "Call", who: "Alex Rivera", action: "logged a call with Northwind Logistics", detail: "Discussed renewal scope and rollout timeline. Decision expected next week.", when: "12 min ago" },
  { id: 2, type: "Email", who: "Priya Nair", action: "sent a proposal to Brightmail Co.", detail: "Onboarding services package — $12,400, valid for 14 days.", when: "1 hour ago" },
  { id: 3, type: "Deal", who: "Alex Rivera", action: "moved Migration & integration to Won", detail: "Vela Studios · $21,500 closed-won.", when: "3 hours ago" },
  { id: 4, type: "Meeting", who: "Maya Chen", action: "booked a demo with Kaisho Industries", detail: "Enterprise rollout walkthrough scheduled for Jun 10, 2:00 PM JST.", when: "Yesterday" },
  { id: 5, type: "Note", who: "Noor Haddad", action: "added a note on Lumen Analytics", detail: "Champion is the VP of Data; budget cycle resets in Q3.", when: "Yesterday" },
  { id: 6, type: "Email", who: "Maya Chen", action: "replied to Aria Telecom", detail: "Confirmed multi-region SLA terms; legal review in progress.", when: "2 days ago" },
  { id: 7, type: "Call", who: "Priya Nair", action: "logged a call with Crestwood Bank", detail: "Renewal at Growth tier confirmed verbally — sending quote.", when: "2 days ago" },
  { id: 8, type: "Deal", who: "Noor Haddad", action: "created Premium support contract", detail: "Hverk GmbH · $33,200 · stage Qualified.", when: "3 days ago" },
  { id: 9, type: "Meeting", who: "Alex Rivera", action: "held a discovery call with Plinth Robotics", detail: "Pilot scope unclear; flagged as low priority for now.", when: "4 days ago" },
  { id: 10, type: "Note", who: "Priya Nair", action: "added a note on Brightmail Co.", detail: "Prefers async updates over email; avoid Friday calls.", when: "5 days ago" },
];

function LogActivityDialog({ open, onOpenChange, onCreate }) {
  const [form, setForm] = useState({ type: TYPES[0], summary: "", related: "", note: "" });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const valid = form.summary.trim();

  const submit = () => {
    if (!valid) return;
    onCreate({
      type: form.type,
      who: "You",
      action: form.summary.trim(),
      detail: form.note.trim() || (form.related.trim() ? `Related to ${form.related.trim()}.` : "No additional details."),
      when: "Just now",
    });
    setForm({ type: TYPES[0], summary: "", related: "", note: "" });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log activity</DialogTitle>
          <DialogDescription>Record an interaction on your CRM timeline.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <Field label="Type">
            <Select value={form.type} onValueChange={set("type")}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Summary" htmlFor="a-summary">
            <Input id="a-summary" value={form.summary} onChange={(e) => set("summary")(e.target.value)} placeholder="e.g. logged a call with Northwind Logistics" className="border-border" />
          </Field>
          <Field label="Related to" htmlFor="a-related" hint="Deal, company, or contact.">
            <Input id="a-related" value={form.related} onChange={(e) => set("related")(e.target.value)} placeholder="Northwind Logistics" className="border-border" />
          </Field>
          <Field label="Note">
            <Textarea value={form.note} onChange={(e) => set("note")(e.target.value)} placeholder="Add context or next steps…" className="bg-background" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!valid}>Log activity</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ActivityScreen() {
  const [activity, setActivity] = useState(INITIAL_ACTIVITY);
  const [typeFilter, setTypeFilter] = useState("All");
  const [logOpen, setLogOpen] = useState(false);

  const filtered = useMemo(
    () => activity.filter((a) => typeFilter === "All" || a.type === typeFilter),
    [activity, typeFilter],
  );

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Activity"
        description="A chronological feed of every interaction across your CRM."
        actions={
          <Button onClick={() => setLogOpen(true)}><Plus className="h-4 w-4" /> Log activity</Button>
        }
      />

      <Toolbar>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="justify-between bg-surface-card hover:bg-surface-subtle sm:w-40">
              {typeFilter === "All" ? "All types" : typeFilter}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-44 bg-surface-card">
            <DropdownMenuLabel className="text-text-secondary">Filter by type</DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-surface-hover" />
            {TYPE_FILTERS.map((t) => (
              <DropdownMenuItem
                key={t}
                onSelect={() => setTypeFilter(t)}
                className={cn("cursor-pointer focus:bg-surface-hover", typeFilter === t && "font-medium")}
              >
                {t === "All" ? "All types" : t}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </Toolbar>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Activity}
          title="No activity found"
          className="rounded-xl border border-border bg-surface-subtle"
        />
      ) : (
        <ol className="space-y-1">
          {filtered.map((a) => {
            const meta = TYPE_META[a.type] || TYPE_META.Note;
            const Icon = meta.icon;
            return (
              <li key={a.id} className="flex gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-surface-subtle">
                <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full border", meta.color)}>
                  <Icon className="h-4 w-4" />
                </span>
                <div className="flex min-w-0 flex-1 items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm text-foreground">
                      <span className="font-semibold text-foreground">{a.who}</span> {a.action}
                    </p>
                    <p className="mt-0.5 text-xs text-text-secondary">{a.detail}</p>
                  </div>
                  <span className="shrink-0 whitespace-nowrap text-xs text-text-secondary">{a.when}</span>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <LogActivityDialog
        open={logOpen}
        onOpenChange={setLogOpen}
        onCreate={(a) => setActivity((prev) => [{ id: Date.now(), ...a }, ...prev])}
      />
    </MainScreenWrapper>
  );
}

export default ActivityScreen;
