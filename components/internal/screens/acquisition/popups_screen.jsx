"use client";

import React, { useMemo, useState } from "react";
import { Plus, Pencil, Copy, Pause, Trash2, AppWindow } from "lucide-react";
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
  Progress,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
  ScreenHeader,
  SearchInput,
  Toolbar,
  DataTable,
  EmptyState,
  Badge,
  ActionMenu,
  Field,
} from "@geiger/ui";

const TRIGGER_TONE = { "Exit intent": "danger", "On scroll": "info", "Time delay": "purple", "On click": "warning" };
const STATUS_TONE = { Active: "success", Paused: "warning", Draft: "neutral" };

const STATUSES = ["All", "Active", "Paused", "Draft"];
const TRIGGERS = ["Exit intent", "On scroll", "Time delay", "On click"];
const POPUP_TYPES = ["Modal", "Banner", "Slide-in"];

const INITIAL = [
  { id: 1, name: "Exit Discount — 10% Off", trigger: "Exit intent", type: "Modal", impressions: 42100, conversion: 12, status: "Active" },
  { id: 2, name: "Newsletter Slide-in", trigger: "On scroll", type: "Slide-in", impressions: 28700, conversion: 8, status: "Active" },
  { id: 3, name: "Free Shipping Banner", trigger: "Time delay", type: "Banner", impressions: 61400, conversion: 5, status: "Active" },
  { id: 4, name: "Webinar Invite Modal", trigger: "Time delay", type: "Modal", impressions: 15200, conversion: 19, status: "Paused" },
  { id: 5, name: "Spin-to-Win Game", trigger: "On click", type: "Modal", impressions: 0, conversion: 0, status: "Draft" },
  { id: 6, name: "Cart Abandonment Nudge", trigger: "Exit intent", type: "Slide-in", impressions: 9340, conversion: 23, status: "Active" },
];

function CreatePopupDialog({ open, onOpenChange, onCreate }) {
  const [form, setForm] = useState({ name: "", trigger: TRIGGERS[0], type: POPUP_TYPES[0] });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    if (!form.name.trim()) return;
    onCreate({ name: form.name.trim(), trigger: form.trigger, type: form.type, impressions: 0, conversion: 0, status: "Draft" });
    setForm({ name: "", trigger: TRIGGERS[0], type: POPUP_TYPES[0] });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create popup</DialogTitle>
          <DialogDescription>Decide when it fires and how it appears on the page.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <Field label="Popup name" htmlFor="popup-name">
            <Input id="popup-name" value={form.name} onChange={(e) => set("name")(e.target.value)} placeholder="e.g. Welcome 15% Off" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Trigger">
              <Select value={form.trigger} onValueChange={set("trigger")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{TRIGGERS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Type">
              <Select value={form.type} onValueChange={set("type")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{POPUP_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!form.name.trim()}>Create popup</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PopupsScreen() {
  const [popups, setPopups] = useState(INITIAL);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All");
  const [createOpen, setCreateOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return popups.filter((p) =>
      (status === "All" || p.status === status) &&
      (!q || p.name.toLowerCase().includes(q)),
    );
  }, [popups, query, status]);

  const columns = [
    { key: "name", header: "Popup", render: (p) => <span className="font-medium text-foreground">{p.name}</span> },
    { key: "trigger", header: "Trigger", render: (p) => <Badge variant={TRIGGER_TONE[p.trigger]}>{p.trigger}</Badge> },
    { key: "type", header: "Type", className: "text-muted-foreground", render: (p) => p.type },
    {
      key: "impressions",
      header: "Impressions",
      className: "tabular-nums text-muted-foreground",
      render: (p) => (p.impressions ? p.impressions.toLocaleString() : "—"),
    },
    {
      key: "conversion",
      header: "Conversion",
      render: (p) =>
        p.conversion > 0 ? (
          <div className="w-[120px] space-y-1.5">
            <Progress value={p.conversion} className="h-1.5 bg-surface-hover" />
            <p className="text-xs text-text-secondary">{p.conversion}%</p>
          </div>
        ) : <span className="text-text-secondary">—</span>,
    },
    { key: "status", header: "Status", render: (p) => <Badge variant={STATUS_TONE[p.status]}>{p.status}</Badge> },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (p) => (
        <ActionMenu
          items={[
            { label: "Edit", icon: Pencil },
            { label: "Duplicate", icon: Copy },
            { label: "Pause", icon: Pause },
            { separator: true },
            { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setPopups((prev) => prev.filter((x) => x.id !== p.id)) },
          ]}
        />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Popups"
        description="On-site popups triggered by visitor behavior."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> Create popup
          </Button>
        }
      />

      <Toolbar>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="justify-between bg-surface-card hover:bg-surface-subtle sm:w-40">
                {status === "All" ? "All statuses" : status}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-44">
              <DropdownMenuLabel className="text-text-secondary">Filter by status</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {STATUSES.map((s) => (
                <DropdownMenuItem key={s} onSelect={() => setStatus(s)} className={cn("cursor-pointer", status === s && "font-medium")}>
                  {s === "All" ? "All statuses" : s}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search popups…" />
      </Toolbar>

      <DataTable
        columns={columns}
        data={filtered}
        getRowKey={(p) => p.id}
        empty={
          <EmptyState
            icon={AppWindow}
            title="No popups match your filters"
            description="Try a different search or status, or create a new popup."
            action={
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" /> Create popup
              </Button>
            }
            className="rounded-xl border border-border bg-surface-subtle"
          />
        }
      />

      <CreatePopupDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={(p) => setPopups((prev) => [{ id: Date.now(), ...p }, ...prev])} />
    </MainScreenWrapper>
  );
}

export default PopupsScreen;
