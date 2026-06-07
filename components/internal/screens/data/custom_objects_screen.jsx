"use client";

import React, { useMemo, useState } from "react";
import { Plus, Boxes, Pencil, Database, Trash2 } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader } from "@/components/internal/shared/screen_header";
import { TableShell, SearchInput, RowActions, Field } from "@/components/internal/shared/screen_kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

const INITIAL = [
  { id: 1, name: "Subscription", plural: "Subscriptions", records: 18420, fields: 11, api: "subscription", updated: "Jun 6, 2026" },
  { id: 2, name: "Booking", plural: "Bookings", records: 9304, fields: 14, api: "booking", updated: "Jun 5, 2026" },
  { id: 3, name: "Pet", plural: "Pets", records: 6127, fields: 8, api: "pet", updated: "Jun 1, 2026" },
  { id: 4, name: "Vehicle", plural: "Vehicles", records: 3491, fields: 12, api: "vehicle", updated: "May 28, 2026" },
  { id: 5, name: "Ticket", plural: "Tickets", records: 24788, fields: 9, api: "ticket", updated: "May 22, 2026" },
];

// "Booking Request" -> "booking_request"
function toApiName(label) {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function CreateObjectDialog({ open, onOpenChange, onCreate }) {
  const [name, setName] = useState("");
  const [primaryField, setPrimaryField] = useState("");

  const apiName = toApiName(name);

  const reset = () => {
    setName("");
    setPrimaryField("");
  };

  const submit = () => {
    if (!name.trim() || !apiName) return;
    const label = name.trim();
    onCreate({
      name: label,
      plural: label.endsWith("s") ? label : `${label}s`,
      records: 0,
      fields: 1,
      api: apiName,
      updated: "Just now",
    });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New custom object</DialogTitle>
          <DialogDescription>Define a new data model with its own records and fields.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4 py-4">
          <Field label="Object name" htmlFor="o-name" hint="Singular, e.g. Subscription.">
            <Input id="o-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Subscription" className="bg-[#161616] border-[#2a2a2a]" />
          </Field>
          <Field label="API name" hint="Auto-derived from the object name; used in code and integrations.">
            <div className="rounded-md border border-[#2a2a2a] bg-[#161616] px-3 py-2 font-mono text-sm text-[#a3a3a3]">
              {apiName || "—"}
            </div>
          </Field>
          <Field label="Primary field label" htmlFor="o-primary" hint="The human-readable field shown when referencing a record.">
            <Input id="o-primary" value={primaryField} onChange={(e) => setPrimaryField(e.target.value)} placeholder="e.g. Plan name" className="bg-[#161616] border-[#2a2a2a]" />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-[#a3a3a3] hover:bg-[#242424] hover:text-white">Cancel</Button>
          <Button onClick={submit} disabled={!name.trim() || !apiName} className="bg-white text-black hover:bg-[#e5e5e5]">Create object</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CustomObjectsScreen() {
  const [objects, setObjects] = useState(INITIAL);
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return objects;
    return objects.filter((o) => o.name.toLowerCase().includes(q) || o.api.toLowerCase().includes(q));
  }, [objects, query]);

  const remove = (id) => setObjects((p) => p.filter((o) => o.id !== id));

  return (
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="Custom Objects"
        description="Model data beyond contacts — subscriptions, bookings, anything."
        actions={
          <Button onClick={() => setCreateOpen(true)} className="h-9 bg-white text-black hover:bg-[#e5e5e5]">
            <Plus className="h-4 w-4" /> New object
          </Button>
        }
      />

      <div className="border-t border-[#242424] pt-4">
        <SearchInput value={query} onChange={setQuery} placeholder="Search objects…" />
      </div>

      <TableShell>
        <Table>
          <TableHeader>
            <TableRow className="border-[#2a2a2a] bg-[#1a1a1a] hover:bg-[#1a1a1a]">
              <TableHead>Object</TableHead>
              <TableHead>Records</TableHead>
              <TableHead>Fields</TableHead>
              <TableHead>API name</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((o) => (
              <TableRow key={o.id} className="border-[#2a2a2a]">
                <TableCell>
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#2a2a2a] bg-[#242424] text-[#a3a3a3]">
                      <Boxes className="h-4 w-4" />
                    </span>
                    <div className="flex min-w-0 flex-col">
                      <span className="font-medium text-[#ededed]">{o.name}</span>
                      <span className="truncate text-xs text-[#737373]">{o.plural}</span>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="tabular-nums text-[#a3a3a3]">{o.records.toLocaleString()}</TableCell>
                <TableCell className="tabular-nums text-[#a3a3a3]">{o.fields}</TableCell>
                <TableCell className="font-mono text-[#a3a3a3]">{o.api}</TableCell>
                <TableCell className="whitespace-nowrap text-[#a3a3a3]">{o.updated}</TableCell>
                <TableCell className="text-right">
                  <RowActions
                    items={[
                      { label: "Edit schema", icon: Pencil },
                      { label: "View records", icon: Database },
                      { label: "Delete", icon: Trash2, danger: true, separatorBefore: true, onSelect: () => remove(o.id) },
                    ]}
                  />
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow className="border-[#2a2a2a] hover:bg-transparent">
                <TableCell colSpan={6} className="py-14 text-center text-sm text-[#737373]">No custom objects found.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableShell>

      <CreateObjectDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={(o) => setObjects((p) => [{ id: Date.now(), ...o }, ...p])} />
    </MainScreenWrapper>
  );
}

export default CustomObjectsScreen;
