"use client";

import React, { useMemo, useState } from "react";
import { Plus, Code2, ScrollText, Pencil, Trash2 } from "lucide-react";
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

const TRACK_SNIPPET = `geiger.track("product_viewed", {
  id: "SKU-4821",
  name: "Trail Runner GTX",
  price: 149.0,
  currency: "USD",
});`;

const SOURCES = ["Web", "Mobile", "Server", "API"];
const STATUSES = { Active: "green", "No data": "zinc" };

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
        <DialogBody className="space-y-4 py-4">
          <Field label="Event name" htmlFor="e-name" hint="Lowercase with underscores, e.g. product_viewed.">
            <Input id="e-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. product_viewed" className="bg-background border-border font-mono" />
          </Field>
          <Field label="Source">
            <Select value={form.source} onValueChange={(v) => setForm((f) => ({ ...f, source: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{SOURCES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Description" htmlFor="e-desc">
            <Input id="e-desc" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="What does this event represent?" className="bg-background border-border" />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-muted-foreground hover:bg-surface-active hover:text-foreground">Cancel</Button>
          <Button onClick={submit} disabled={!form.name.trim()} className="bg-white text-black hover:bg-[#e5e5e5]">Create event</Button>
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

  return (
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="Event Tracking"
        description="Capture custom behavioral events to power automations and segments."
        actions={
          <Button onClick={() => setCreateOpen(true)} className="h-9 bg-white text-black hover:bg-[#e5e5e5]">
            <Plus className="h-4 w-4" /> New event
          </Button>
        }
      />

      <div className="border-t border-surface-active pt-4">
        <div className="space-y-3 rounded-xl border border-border bg-surface-subtle p-5">
          <div className="flex items-center gap-2">
            <Code2 className="h-4 w-4 text-text-secondary" />
            <h2 className="text-sm font-semibold text-foreground">Send an event</h2>
          </div>
          <p className="text-xs text-text-secondary">Drop the SDK on your site, then call <span className="font-mono text-muted-foreground">geiger.track()</span> wherever a user does something worth tracking.</p>
          <pre className="overflow-x-auto rounded-lg border border-border bg-background p-4 text-xs leading-relaxed text-muted-foreground font-mono">
{TRACK_SNIPPET}
          </pre>
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-surface-active pt-4 sm:flex-row sm:items-center">
        <SearchInput value={query} onChange={setQuery} placeholder="Search events…" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="h-9 justify-between border-border bg-surface-card text-foreground hover:bg-surface-subtle sm:w-40">
              {sourceFilter === "All" ? "All sources" : sourceFilter}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-44 border-border bg-surface-card text-foreground">
            <DropdownMenuLabel className="text-text-secondary">Filter by source</DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-surface-hover" />
            {["All", ...SOURCES].map((s) => (
              <DropdownMenuItem key={s} onSelect={() => setSourceFilter(s)} className={cn("cursor-pointer focus:bg-surface-hover focus:text-foreground", sourceFilter === s && "text-white")}>
                {s === "All" ? "All sources" : s}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <TableShell>
        <Table>
          <TableHeader>
            <TableRow className="border-border bg-surface-subtle hover:bg-surface-subtle">
              <TableHead>Event</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Last 24h</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Last seen</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((e) => (
              <TableRow key={e.id} className="border-border">
                <TableCell className="font-mono text-foreground">{e.name}</TableCell>
                <TableCell className="text-muted-foreground">{e.source}</TableCell>
                <TableCell className="tabular-nums text-muted-foreground">{e.last24h.toLocaleString()}</TableCell>
                <TableCell className="tabular-nums text-muted-foreground">{e.total.toLocaleString()}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{e.lastSeen}</TableCell>
                <TableCell><Pill tone={STATUSES[e.status]}>{e.status}</Pill></TableCell>
                <TableCell className="text-right">
                  <RowActions
                    items={[
                      { label: "View payloads", icon: ScrollText },
                      { label: "Rename", icon: Pencil },
                      { label: "Delete", icon: Trash2, danger: true, separatorBefore: true, onSelect: () => remove(e.id) },
                    ]}
                  />
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow className="border-border hover:bg-transparent">
                <TableCell colSpan={7} className="py-14 text-center text-sm text-text-secondary">No events found.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableShell>

      <CreateEventDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={(e) => setEvents((p) => [{ id: Date.now(), ...e }, ...p])} />
    </MainScreenWrapper>
  );
}

export default EventTrackingScreen;
