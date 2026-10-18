"use client";

import React, { useMemo, useState } from "react";
import { Plus, Code2, ScrollText, Pencil, Trash2 } from "lucide-react";
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
  SectionCard,
  Toolbar,
  SearchInput,
  DataTable,
  EmptyState,
  Badge,
  ActionMenu,
  Field,
} from "@geiger/ui";

const TRACK_SNIPPET = `geiger.track("product_viewed", {
  id: "SKU-4821",
  name: "Trail Runner GTX",
  price: 149.0,
  currency: "USD",
});`;

const SOURCES = ["Web", "Mobile", "Server", "API"];
const STATUSES = { Active: "success", "No data": "neutral" };

const INITIAL = [
  { id: 1, name: "product_viewed", source: "Web", last24h: 8421, total: 1284902, lastSeen: "12 seconds ago", status: "Active" },
  { id: 2, name: "added_to_cart", source: "Web", last24h: 1903, total: 312874, lastSeen: "38 seconds ago", status: "Active" },
  { id: 3, name: "checkout_started", source: "Web", last24h: 642, total: 98214, lastSeen: "2 minutes ago", status: "Active" },
  { id: 4, name: "order_completed", source: "Server", last24h: 418, total: 76330, lastSeen: "3 minutes ago", status: "Active" },
  { id: 5, name: "app_opened", source: "Mobile", last24h: 5210, total: 902441, lastSeen: "1 minute ago", status: "Active" },
  { id: 6, name: "support_ticket_created", source: "API", last24h: 73, total: 14820, lastSeen: "26 minutes ago", status: "Active" },
  { id: 7, name: "subscription_paused", source: "Server", last24h: 0, total: 0, lastSeen: "Never", status: "No data" },
];

function CreateEventDialog({ open, onOpenChange, onCreate }) {
  const [form, setForm] = useState({ name: "", source: "Web", description: "" });

  const reset = () => setForm({ name: "", source: "Web", description: "" });

  const submit = () => {
    if (!form.name.trim()) return;
    onCreate({
      name: form.name.trim(),
      source: form.source,
      last24h: 0,
      total: 0,
      lastSeen: "Never",
      status: "No data",
    });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New event</DialogTitle>
          <DialogDescription>Register a custom event before sending it from your client or server.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <Field label="Event name" htmlFor="e-name" hint="Lowercase with underscores, e.g. product_viewed.">
            <Input id="e-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. product_viewed" className="border-border font-mono" />
          </Field>
          <Field label="Source">
            <Select value={form.source} onValueChange={(v) => setForm((f) => ({ ...f, source: v }))}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{SOURCES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Description" htmlFor="e-desc">
            <Input id="e-desc" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="What does this event represent?" className="border-border" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!form.name.trim()}>Create event</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EventTrackingScreen() {
  const [events, setEvents] = useState(INITIAL);
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState("All");
  const [createOpen, setCreateOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter((e) =>
      (sourceFilter === "All" || e.source === sourceFilter) &&
      (!q || e.name.toLowerCase().includes(q)),
    );
  }, [events, query, sourceFilter]);

  const remove = (id) => setEvents((p) => p.filter((e) => e.id !== id));

  const columns = [
    { key: "name", header: "Event", className: "font-mono text-foreground" },
    { key: "source", header: "Source", className: "text-muted-foreground" },
    { key: "last24h", header: "Last 24h", className: "tabular-nums text-muted-foreground", render: (e) => e.last24h.toLocaleString() },
    { key: "total", header: "Total", className: "tabular-nums text-muted-foreground", render: (e) => e.total.toLocaleString() },
    { key: "lastSeen", header: "Last seen", className: "whitespace-nowrap text-muted-foreground" },
    { key: "status", header: "Status", render: (e) => <Badge variant={STATUSES[e.status]}>{e.status}</Badge> },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (e) => (
        <ActionMenu
          items={[
            { label: "View payloads", icon: ScrollText },
            { label: "Rename", icon: Pencil },
            { separator: true },
            { label: "Delete", icon: Trash2, destructive: true, onSelect: () => remove(e.id) },
          ]}
        />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Event Tracking"
        description="Capture custom behavioral events to power automations and segments."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> New event
          </Button>
        }
      />

      <SectionCard
        title={
          <span className="flex items-center gap-2 text-sm">
            <Code2 className="h-4 w-4 text-text-secondary" />
            Send an event
          </span>
        }
        description={<>Drop the SDK on your site, then call <span className="font-mono text-muted-foreground">geiger.track()</span> wherever a user does something worth tracking.</>}
      >
        <pre className="overflow-x-auto rounded-lg border border-border bg-background p-4 text-xs leading-relaxed text-muted-foreground font-mono">
{TRACK_SNIPPET}
        </pre>
      </SectionCard>

      <Toolbar>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="justify-between bg-surface-card hover:bg-surface-subtle sm:w-40">
              {sourceFilter === "All" ? "All sources" : sourceFilter}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-44 bg-surface-card">
            <DropdownMenuLabel className="text-text-secondary">Filter by source</DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-surface-hover" />
            {["All", ...SOURCES].map((s) => (
              <DropdownMenuItem key={s} onSelect={() => setSourceFilter(s)} className={cn("cursor-pointer focus:bg-surface-hover", sourceFilter === s && "font-medium")}>
                {s === "All" ? "All sources" : s}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <SearchInput value={query} onChange={setQuery} placeholder="Search events…" />
      </Toolbar>

      <DataTable
        columns={columns}
        data={filtered}
        getRowKey={(e) => e.id}
        empty={
          <EmptyState
            icon={Code2}
            title="No events found"
            className="rounded-xl border border-border bg-surface-subtle"
            action={<Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> New event</Button>}
          />
        }
      />

      <CreateEventDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={(e) => setEvents((p) => [{ id: Date.now(), ...e }, ...p])} />
    </MainScreenWrapper>
  );
}

export default EventTrackingScreen;
