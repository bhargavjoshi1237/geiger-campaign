"use client";

import React, { useState } from "react";
import {
  Plus, Route, ChevronRight, Mail, Clock, GitBranch, Flag, LogIn, Pencil, Copy, Trash2, Users,
} from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
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
  ScreenHeader,
  SearchInput,
  Badge,
  ActionMenu,
  Field,
  Toolbar,
  SectionCard,
  EmptyState,
  Progress,
} from "@geiger/ui";

const STAGE_ICON = { Entry: LogIn, Email: Mail, Wait: Clock, Branch: GitBranch, Goal: Flag };
const STATUS_TONE = { Active: "success", Paused: "warning", Draft: "neutral" };

const INITIAL = [
  { id: 1, name: "New customer onboarding", status: "Active", active: 1240, completion: 62, stages: ["Entry", "Email", "Wait", "Email", "Goal"] },
  { id: 2, name: "Lead nurture — long cycle", status: "Active", active: 3180, completion: 34, stages: ["Entry", "Email", "Wait", "Branch", "Email", "Goal"] },
  { id: 3, name: "Re-engagement path", status: "Paused", active: 540, completion: 12, stages: ["Entry", "Email", "Wait", "Branch", "Goal"] },
  { id: 4, name: "VIP upgrade journey", status: "Draft", active: 0, completion: 0, stages: ["Entry", "Email", "Goal"] },
];

const ENTRY_TRIGGERS = ["Joins a list", "Becomes a customer", "Tag added", "Submits a form"];

function CreateJourneyDialog({ open, onOpenChange, onCreate }) {
  const [form, setForm] = useState({ name: "", trigger: ENTRY_TRIGGERS[0] });
  const submit = () => {
    if (!form.name.trim()) return;
    onCreate({ name: form.name.trim(), status: "Draft", active: 0, completion: 0, stages: ["Entry", "Goal"] });
    setForm({ name: "", trigger: ENTRY_TRIGGERS[0] });
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create journey</DialogTitle>
          <DialogDescription>Journeys map a contact's path across multiple stages and branches.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <Field label="Journey name" htmlFor="jr-name">
            <Input id="jr-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. New customer onboarding" />
          </Field>
          <Field label="Entry condition">
            <Select value={form.trigger} onValueChange={(v) => setForm((f) => ({ ...f, trigger: v }))}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{ENTRY_TRIGGERS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!form.name.trim()}>Create journey</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function JourneysScreen() {
  const [journeys, setJourneys] = useState(INITIAL);
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const filtered = journeys.filter((j) => j.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Journeys"
        description="Visual, multi-stage paths that guide contacts toward a goal."
        actions={
          <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> Create journey</Button>
        }
      />

      <Toolbar>
        <div />
        <SearchInput value={query} onChange={setQuery} placeholder="Search journeys…" />
      </Toolbar>

      <div className="space-y-4">
        {filtered.map((j) => (
          <SectionCard key={j.id}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-active text-muted-foreground">
                  <Route className="h-4 w-4" />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-foreground">{j.name}</h3>
                    <Badge variant={STATUS_TONE[j.status]}>{j.status}</Badge>
                  </div>
                  <p className="text-xs text-text-secondary">{j.stages.length} stages</p>
                </div>
              </div>

              {/* Stats moved up, left of the menu */}
              <div className="flex items-center gap-4 sm:gap-6">
                <div className="hidden items-center gap-2 text-sm sm:flex">
                  <Users className="h-4 w-4 text-text-secondary" />
                  <span className="font-medium text-foreground tabular-nums">{j.active.toLocaleString()}</span>
                  <span className="text-text-secondary">active</span>
                </div>
                <div className="hidden items-center gap-3 md:flex">
                  <span className="text-xs text-text-secondary">Completion</span>
                  <Progress value={j.completion} className="h-1.5 w-[140px] bg-surface-hover" />
                  <span className="text-xs tabular-nums text-muted-foreground">{j.completion}%</span>
                </div>
                <ActionMenu
                  label={`Actions for ${j.name}`}
                  items={[
                    { label: "Edit journey", icon: Pencil },
                    { label: "Duplicate", icon: Copy },
                    { separator: true },
                    { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setJourneys((p) => p.filter((x) => x.id !== j.id)) },
                  ]}
                />
              </div>
            </div>

            {/* Stage flow */}
            <div className="mt-4 flex flex-wrap items-center gap-1.5 rounded-lg border border-border p-3">
              {j.stages.map((stage, i) => {
                const Icon = STAGE_ICON[stage] || Mail;
                return (
                  <React.Fragment key={i}>
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-active px-2.5 py-1 text-xs text-foreground">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" /> {stage}
                    </span>
                    {i < j.stages.length - 1 && <ChevronRight className="h-3.5 w-3.5 text-text-tertiary" />}
                  </React.Fragment>
                );
              })}
            </div>

            {/* Compact stats for small screens */}
            <div className="mt-3 flex items-center gap-4 sm:hidden">
              <div className="flex items-center gap-2 text-sm">
                <Users className="h-4 w-4 text-text-secondary" />
                <span className="font-medium text-foreground tabular-nums">{j.active.toLocaleString()}</span>
                <span className="text-text-secondary">active</span>
              </div>
              <span className="text-xs tabular-nums text-muted-foreground">{j.completion}% complete</span>
            </div>
          </SectionCard>
        ))}
        {filtered.length === 0 && (
          <EmptyState
            icon={Route}
            title="No journeys found"
            description="Try a different search, or create a new journey."
            className="rounded-xl border border-border bg-surface-subtle"
            action={<Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> Create journey</Button>}
          />
        )}
      </div>

      <CreateJourneyDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={(j) => setJourneys((p) => [{ id: Date.now(), ...j }, ...p])} />
    </MainScreenWrapper>
  );
}

export default JourneysScreen;
