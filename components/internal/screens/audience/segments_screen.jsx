"use client";

import React, { useState } from "react";
import { Plus, Filter, Pencil, RefreshCw, Copy, Trash2, X } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader } from "@/components/internal/shared/screen_header";
import {
  TableShell,
  SearchInput,
  Pill,
  RowActions,
  Field,
} from "@/components/internal/shared/screen_kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const INITIAL_SEGMENTS = [
  { id: 1, name: "Engaged — last 90 days", description: "Opened or clicked at least one email recently", match: "all", conditions: 2, contacts: 9840 },
  { id: 2, name: "High-value EU", description: "European contacts with LTV over €500", match: "all", conditions: 3, contacts: 1260 },
  { id: 3, name: "At risk of churn", description: "No engagement in 120+ days", match: "any", conditions: 2, contacts: 4310 },
  { id: 4, name: "Webinar + not customer", description: "Attended a webinar but never purchased", match: "all", conditions: 2, contacts: 2075 },
];

const FIELD_OPTIONS = ["Email engagement", "Location", "Lifetime value", "List membership", "Tag", "Signup date", "Last activity"];
const OPERATOR_OPTIONS = ["is", "is not", "is greater than", "is less than", "contains", "in the last"];

function emptyCondition() {
  return { id: Math.random().toString(36).slice(2), field: FIELD_OPTIONS[0], operator: OPERATOR_OPTIONS[0], value: "" };
}

function CreateSegmentDialog({ open, onOpenChange, onCreate }) {
  const [name, setName] = useState("");
  const [match, setMatch] = useState("all");
  const [conditions, setConditions] = useState([emptyCondition()]);

  const reset = () => {
    setName("");
    setMatch("all");
    setConditions([emptyCondition()]);
  };

  const updateCond = (id, key, val) =>
    setConditions((cs) => cs.map((c) => (c.id === id ? { ...c, [key]: val } : c)));

  const submit = () => {
    if (!name.trim()) return;
    onCreate({
      name: name.trim(),
      description: `${conditions.length} condition${conditions.length > 1 ? "s" : ""} · matches ${match}`,
      match,
      conditions: conditions.length,
      contacts: 0,
    });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create segment</DialogTitle>
          <DialogDescription>Segments are live audience slices defined by conditions. Contacts move in and out automatically.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-5 py-4">
          <Field label="Segment name" htmlFor="s-name">
            <Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Engaged — last 90 days" className="bg-[#161616] border-[#2a2a2a]" />
          </Field>

          <div className="space-y-3 rounded-xl border border-[#2a2a2a] bg-[#202020] p-4">
            <div className="flex items-center gap-2 text-sm text-[#a3a3a3]">
              Match
              <Select value={match} onValueChange={setMatch}>
                <SelectTrigger size="sm" className="w-24"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">all</SelectItem>
                  <SelectItem value="any">any</SelectItem>
                </SelectContent>
              </Select>
              of the following conditions
            </div>

            <div className="space-y-2">
              {conditions.map((c) => (
                <div key={c.id} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Select value={c.field} onValueChange={(v) => updateCond(c.id, "field", v)}>
                    <SelectTrigger className="sm:w-48"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FIELD_OPTIONS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={c.operator} onValueChange={(v) => updateCond(c.id, "operator", v)}>
                    <SelectTrigger className="sm:w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {OPERATOR_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input
                    value={c.value}
                    onChange={(e) => updateCond(c.id, "value", e.target.value)}
                    placeholder="value"
                    className="flex-1 bg-[#161616] border-[#2a2a2a]"
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setConditions((cs) => (cs.length > 1 ? cs.filter((x) => x.id !== c.id) : cs))}
                    className="shrink-0 text-[#737373] hover:bg-[#2a2a2a] hover:text-white disabled:opacity-30"
                    disabled={conditions.length === 1}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConditions((cs) => [...cs, emptyCondition()])}
              className="text-[#a3a3a3] hover:bg-[#2a2a2a] hover:text-white"
            >
              <Plus className="h-4 w-4" /> Add condition
            </Button>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-[#a3a3a3] hover:bg-[#242424] hover:text-white">Cancel</Button>
          <Button onClick={submit} disabled={!name.trim()} className="bg-white text-black hover:bg-[#e5e5e5]">Create segment</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SegmentsScreen() {
  const [segments, setSegments] = useState(INITIAL_SEGMENTS);
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const filtered = segments.filter((s) => s.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="Segments"
        description="Live, rule-based slices of your audience that update as contacts change."
        actions={
          <Button onClick={() => setCreateOpen(true)} className="h-9 bg-white text-black hover:bg-[#e5e5e5]">
            <Plus className="h-4 w-4" /> Create segment
          </Button>
        }
      />

      <div className="border-t border-[#242424] pt-4">
        <SearchInput value={query} onChange={setQuery} placeholder="Search segments…" />
      </div>

      <TableShell>
        <Table>
          <TableHeader>
            <TableRow className="border-[#2a2a2a] bg-[#1a1a1a] hover:bg-[#1a1a1a]">
              <TableHead>Segment</TableHead>
              <TableHead>Match</TableHead>
              <TableHead>Conditions</TableHead>
              <TableHead>Contacts</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((s) => (
              <TableRow key={s.id} className="border-[#2a2a2a]">
                <TableCell>
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#2a2a2a] bg-[#242424] text-[#a3a3a3]">
                      <Filter className="h-4 w-4" />
                    </span>
                    <div className="flex min-w-0 flex-col">
                      <span className="font-medium text-[#ededed]">{s.name}</span>
                      <span className="truncate text-xs text-[#737373]">{s.description}</span>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Pill tone={s.match === "all" ? "blue" : "amber"}>Match {s.match}</Pill>
                </TableCell>
                <TableCell className="tabular-nums text-[#a3a3a3]">{s.conditions}</TableCell>
                <TableCell className="tabular-nums font-medium text-[#ededed]">{s.contacts.toLocaleString()}</TableCell>
                <TableCell className="text-right">
                  <RowActions
                    items={[
                      { label: "Edit conditions", icon: Pencil },
                      { label: "Re-evaluate", icon: RefreshCw },
                      { label: "Duplicate", icon: Copy },
                      { label: "Delete", icon: Trash2, danger: true, separatorBefore: true, onSelect: () => setSegments((p) => p.filter((x) => x.id !== s.id)) },
                    ]}
                  />
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow className="border-[#2a2a2a] hover:bg-transparent">
                <TableCell colSpan={5} className="py-14 text-center text-sm text-[#737373]">No segments found.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableShell>

      <CreateSegmentDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={(s) => setSegments((p) => [{ id: Date.now(), ...s }, ...p])} />
    </MainScreenWrapper>
  );
}

export default SegmentsScreen;
