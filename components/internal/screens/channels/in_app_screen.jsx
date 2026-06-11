"use client";

import React, { useMemo, useState } from "react";
import { Plus, AppWindow, Pencil, Copy, Pause, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader } from "@/components/internal/shared/screen_header";
import { TableShell, SearchInput, Pill, RowActions, Field } from "@/components/internal/shared/screen_kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const TYPE_TONE = { Banner: "blue", Modal: "violet", Tooltip: "zinc", "Slide-in": "amber" };
const STATUS_TONE = { Live: "green", Scheduled: "blue", Draft: "zinc", Paused: "amber" };
const TYPES = ["Banner", "Modal", "Tooltip", "Slide-in"];
const AUDIENCES = ["All users", "Free plan", "Trial users", "Power users"];
const TRIGGERS = ["On screen view", "On action", "On app open"];

const INITIAL = [
  { id: 1, name: "New feature announcement", description: "Highlights the redesigned dashboard", type: "Modal", audience: "All users", status: "Live", impressions: 48200 },
  { id: 2, name: "Upgrade nudge", description: "Prompts free users to try Pro", type: "Banner", audience: "Free plan", status: "Live", impressions: 31650 },
  { id: 3, name: "Onboarding tooltip", description: "Points to the create button on first run", type: "Tooltip", audience: "All users", status: "Draft", impressions: 0 },
  { id: 4, name: "Survey prompt", description: "Asks for product feedback after a session", type: "Slide-in", audience: "Power users", status: "Scheduled", impressions: 0 },
  { id: 5, name: "Maintenance notice", description: "Warns of scheduled downtime Sunday", type: "Banner", audience: "All users", status: "Paused", impressions: 12400 },
  { id: 6, name: "Trial ending", description: "Reminds trial users 3 days before expiry", type: "Modal", audience: "Trial users", status: "Live", impressions: 8730 },
];

function CreateMessageDialog({ open, onOpenChange, onCreate }) {
  const [form, setForm] = useState({ name: "", type: "Banner", audience: "All users", trigger: "On screen view" });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    if (!form.name.trim()) return;
    onCreate({
      name: form.name.trim(),
      description: `${form.type} shown ${form.trigger.toLowerCase()}`,
      type: form.type,
      audience: form.audience,
      status: "Draft",
      impressions: 0,
    });
    setForm({ name: "", type: "Banner", audience: "All users", trigger: "On screen view" });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create message</DialogTitle>
          <DialogDescription>Compose an in-app message shown while users are active.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4 py-4">
          <Field label="Message name" htmlFor="ia-name">
            <Input id="ia-name" value={form.name} onChange={(e) => set("name")(e.target.value)} placeholder="e.g. New feature announcement" className="bg-background border-border" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <Select value={form.type} onValueChange={set("type")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Audience">
              <Select value={form.audience} onValueChange={set("audience")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{AUDIENCES.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Trigger">
            <Select value={form.trigger} onValueChange={set("trigger")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TRIGGERS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-muted-foreground hover:bg-surface-active hover:text-foreground">Cancel</Button>
          <Button onClick={submit} disabled={!form.name.trim()} className="bg-white text-black hover:bg-[#e5e5e5]">Create message</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function InAppScreen() {
  const [messages, setMessages] = useState(INITIAL);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("All");
  const [createOpen, setCreateOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return messages.filter((m) =>
      (type === "All" || m.type === type) &&
      (!q || m.name.toLowerCase().includes(q)),
    );
  }, [messages, query, type]);

  return (
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="In-App"
        description="Reach users with messages shown while they're active in your product."
        actions={
          <Button onClick={() => setCreateOpen(true)} className="h-9 bg-white text-black hover:bg-[#e5e5e5]">
            <Plus className="h-4 w-4" /> Create message
          </Button>
        }
      />

      <div className="flex flex-col gap-3 border-t border-surface-active pt-4 sm:flex-row sm:items-center">
        <SearchInput value={query} onChange={setQuery} placeholder="Search messages…" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="h-9 justify-between border-border bg-surface-card text-foreground hover:bg-surface-subtle sm:w-40">
              {type === "All" ? "All types" : type}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-44 border-border bg-surface-card text-foreground">
            <DropdownMenuLabel className="text-text-secondary">Filter by type</DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-surface-hover" />
            {["All", ...TYPES].map((t) => (
              <DropdownMenuItem key={t} onSelect={() => setType(t)} className={cn("cursor-pointer focus:bg-surface-hover focus:text-foreground", type === t && "text-white")}>
                {t === "All" ? "All types" : t}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <TableShell>
        <Table>
          <TableHeader>
            <TableRow className="border-border bg-surface-subtle hover:bg-surface-subtle">
              <TableHead>Message</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Audience</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Impressions</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((m) => (
              <TableRow key={m.id} className="border-border">
                <TableCell>
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-active text-muted-foreground">
                      <AppWindow className="h-4 w-4" />
                    </span>
                    <div className="flex min-w-0 flex-col">
                      <span className="font-medium text-foreground">{m.name}</span>
                      <span className="truncate text-xs text-text-secondary">{m.description}</span>
                    </div>
                  </div>
                </TableCell>
                <TableCell><Pill tone={TYPE_TONE[m.type]}>{m.type}</Pill></TableCell>
                <TableCell className="text-muted-foreground">{m.audience}</TableCell>
                <TableCell><Pill tone={STATUS_TONE[m.status]}>{m.status}</Pill></TableCell>
                <TableCell className="tabular-nums text-muted-foreground">{m.impressions ? m.impressions.toLocaleString() : "—"}</TableCell>
                <TableCell className="text-right">
                  <RowActions
                    items={[
                      { label: "Edit", icon: Pencil },
                      { label: "Duplicate", icon: Copy },
                      { label: "Pause", icon: Pause },
                      { label: "Delete", icon: Trash2, danger: true, separatorBefore: true, onSelect: () => setMessages((p) => p.filter((x) => x.id !== m.id)) },
                    ]}
                  />
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow className="border-border hover:bg-transparent">
                <TableCell colSpan={6} className="py-14 text-center text-sm text-text-secondary">No messages found.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableShell>

      <CreateMessageDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={(m) => setMessages((p) => [{ id: Date.now(), ...m }, ...p])} />
    </MainScreenWrapper>
  );
}

export default InAppScreen;
