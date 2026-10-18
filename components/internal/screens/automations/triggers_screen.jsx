"use client";

import React, { useMemo, useState } from "react";
import { Plus, MousePointerClick, Pencil, Copy, Trash2 } from "lucide-react";
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
  cn,
  ScreenHeader,
  SearchInput,
  Badge,
  ActionMenu,
  Field,
  Toolbar,
  DataTable,
  EmptyState,
} from "@geiger/ui";

const EVENT_TYPES = {
  Subscription: "info",
  Behavioral: "purple",
  "E-commerce": "success",
  Date: "warning",
  Custom: "neutral",
};
const EVENTS = {
  Subscription: ["Joins a list", "Unsubscribes", "Confirms opt-in"],
  Behavioral: ["Opens an email", "Clicks a link", "Visits a page", "Submits a form"],
  "E-commerce": ["Abandons cart", "Makes a purchase", "Views a product"],
  Date: ["Birthday", "Anniversary", "Date field reached"],
  Custom: ["Custom API event"],
};
const SOURCES = ["Any channel", "Email", "Website", "Mobile app", "API"];

const INITIAL = [
  { id: 1, name: "New subscriber", event: "Joins a list", type: "Subscription", source: "Any channel", usedIn: 4 },
  { id: 2, name: "Cart abandoned", event: "Abandons cart", type: "E-commerce", source: "Website", usedIn: 2 },
  { id: 3, name: "Pricing page visit", event: "Visits a page", type: "Behavioral", source: "Website", usedIn: 3 },
  { id: 4, name: "Purchase made", event: "Makes a purchase", type: "E-commerce", source: "API", usedIn: 5 },
  { id: 5, name: "Contact birthday", event: "Birthday", type: "Date", source: "Any channel", usedIn: 1 },
];

function CreateTriggerDialog({ open, onOpenChange, onCreate }) {
  const [form, setForm] = useState({ name: "", type: "Subscription", event: EVENTS.Subscription[0], source: SOURCES[0] });
  const setType = (t) => setForm((f) => ({ ...f, type: t, event: EVENTS[t][0] }));
  const submit = () => {
    if (!form.name.trim()) return;
    onCreate({ name: form.name.trim(), event: form.event, type: form.type, source: form.source, usedIn: 0 });
    setForm({ name: "", type: "Subscription", event: EVENTS.Subscription[0], source: SOURCES[0] });
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create trigger</DialogTitle>
          <DialogDescription>Triggers start automations when a contact performs an event.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <Field label="Trigger name" htmlFor="trg-name">
            <Input id="trg-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. New subscriber" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">
              <Select value={form.type} onValueChange={setType}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.keys(EVENTS).map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Event">
              <Select value={form.event} onValueChange={(v) => setForm((f) => ({ ...f, event: v }))}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{EVENTS[form.type].map((ev) => <SelectItem key={ev} value={ev}>{ev}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Source">
            <Select value={form.source} onValueChange={(v) => setForm((f) => ({ ...f, source: v }))}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{SOURCES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!form.name.trim()}>Create trigger</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TriggersScreen() {
  const [triggers, setTriggers] = useState(INITIAL);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [createOpen, setCreateOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return triggers.filter((t) => (typeFilter === "All" || t.type === typeFilter) && (!q || t.name.toLowerCase().includes(q)));
  }, [triggers, query, typeFilter]);

  const columns = [
    {
      key: "name",
      header: "Trigger",
      render: (t) => (
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-active text-muted-foreground">
            <MousePointerClick className="h-4 w-4" />
          </span>
          <span className="font-medium text-foreground">{t.name}</span>
        </div>
      ),
    },
    { key: "event", header: "Event", className: "text-muted-foreground", render: (t) => t.event },
    { key: "type", header: "Category", render: (t) => <Badge variant={EVENT_TYPES[t.type]}>{t.type}</Badge> },
    { key: "source", header: "Source", className: "text-muted-foreground", render: (t) => t.source },
    { key: "usedIn", header: "Used in", className: "tabular-nums text-muted-foreground", render: (t) => `${t.usedIn} automations` },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (t) => (
        <ActionMenu
          label={`Actions for ${t.name}`}
          items={[
            { label: "Edit trigger", icon: Pencil },
            { label: "Duplicate", icon: Copy },
            { separator: true },
            { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setTriggers((p) => p.filter((x) => x.id !== t.id)) },
          ]}
        />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Triggers"
        description="Reusable events that kick off workflows and journeys."
        actions={
          <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> Create trigger</Button>
        }
      />

      <Toolbar>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-9 justify-between bg-surface-card sm:w-44">
                {typeFilter === "All" ? "All categories" : typeFilter}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-48">
              <DropdownMenuLabel className="text-text-secondary">Filter by category</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {["All", ...Object.keys(EVENT_TYPES)].map((t) => (
                <DropdownMenuItem key={t} onSelect={() => setTypeFilter(t)} className={cn("cursor-pointer", typeFilter === t && "font-medium")}>
                  {t === "All" ? "All categories" : t}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search triggers…" />
      </Toolbar>

      <DataTable
        columns={columns}
        data={filtered}
        getRowKey={(t) => t.id}
        empty={
          <EmptyState
            icon={MousePointerClick}
            title="No triggers found"
            description="Try a different search or category, or create a new trigger."
            className="rounded-xl border border-border bg-surface-subtle"
            action={<Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> Create trigger</Button>}
          />
        }
      />

      <CreateTriggerDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={(t) => setTriggers((p) => [{ id: Date.now(), ...t }, ...p])} />
    </MainScreenWrapper>
  );
}

export default TriggersScreen;
