"use client";

import React, { useMemo, useState } from "react";
import { Plus, Pencil, Copy, Pause, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader } from "@/components/internal/shared/screen_header";
import { TableShell, SearchInput, Pill, RowActions, Field } from "@/components/internal/shared/screen_kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
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

const TRIGGER_TONE = { "Exit intent": "red", "On scroll": "blue", "Time delay": "violet", "On click": "amber" };
const STATUS_TONE = { Active: "green", Paused: "amber", Draft: "zinc" };

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
        <DialogBody className="space-y-4 py-4">
          <Field label="Popup name" htmlFor="popup-name">
            <Input id="popup-name" value={form.name} onChange={(e) => set("name")(e.target.value)} placeholder="e.g. Welcome 15% Off" className="bg-[#161616] border-[#2a2a2a]" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Trigger">
              <Select value={form.trigger} onValueChange={set("trigger")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TRIGGERS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Type">
              <Select value={form.type} onValueChange={set("type")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{POPUP_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-[#a3a3a3] hover:bg-[#242424] hover:text-white">Cancel</Button>
          <Button onClick={submit} disabled={!form.name.trim()} className="bg-white text-black hover:bg-[#e5e5e5]">Create popup</Button>
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

  return (
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="Popups"
        description="On-site popups triggered by visitor behavior."
        actions={
          <Button onClick={() => setCreateOpen(true)} className="h-9 bg-white text-black hover:bg-[#e5e5e5]">
            <Plus className="h-4 w-4" /> Create popup
          </Button>
        }
      />

      <div className="flex flex-col gap-3 border-t border-[#242424] pt-4 sm:flex-row sm:items-center">
        <SearchInput value={query} onChange={setQuery} placeholder="Search popups…" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="h-9 justify-between border-[#2a2a2a] bg-[#202020] text-[#ededed] hover:bg-[#1a1a1a] sm:w-40">
              {status === "All" ? "All statuses" : status}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-44 border-[#2a2a2a] bg-[#202020] text-[#ededed]">
            <DropdownMenuLabel className="text-[#737373]">Filter by status</DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-[#2a2a2a]" />
            {STATUSES.map((s) => (
              <DropdownMenuItem key={s} onSelect={() => setStatus(s)} className={cn("cursor-pointer focus:bg-[#2a2a2a] focus:text-white", status === s && "text-white")}>
                {s === "All" ? "All statuses" : s}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <TableShell>
        <Table>
          <TableHeader>
            <TableRow className="border-[#2a2a2a] bg-[#1a1a1a] hover:bg-[#1a1a1a]">
              <TableHead>Popup</TableHead>
              <TableHead>Trigger</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Impressions</TableHead>
              <TableHead>Conversion</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((p) => (
              <TableRow key={p.id} className="border-[#2a2a2a]">
                <TableCell><span className="font-medium text-[#ededed]">{p.name}</span></TableCell>
                <TableCell><Pill tone={TRIGGER_TONE[p.trigger]}>{p.trigger}</Pill></TableCell>
                <TableCell className="text-[#a3a3a3]">{p.type}</TableCell>
                <TableCell className="tabular-nums text-[#a3a3a3]">{p.impressions ? p.impressions.toLocaleString() : "—"}</TableCell>
                <TableCell>
                  {p.conversion > 0 ? (
                    <div className="w-[120px] space-y-1.5">
                      <Progress value={p.conversion} className="h-1.5 bg-[#2a2a2a] [&_[data-slot=progress-indicator]]:bg-[#ededed]" />
                      <p className="text-xs text-[#737373]">{p.conversion}%</p>
                    </div>
                  ) : <span className="text-[#737373]">—</span>}
                </TableCell>
                <TableCell><Pill tone={STATUS_TONE[p.status]}>{p.status}</Pill></TableCell>
                <TableCell className="text-right">
                  <RowActions
                    items={[
                      { label: "Edit", icon: Pencil },
                      { label: "Duplicate", icon: Copy },
                      { label: "Pause", icon: Pause },
                      { label: "Delete", icon: Trash2, danger: true, separatorBefore: true, onSelect: () => setPopups((prev) => prev.filter((x) => x.id !== p.id)) },
                    ]}
                  />
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow className="border-[#2a2a2a] hover:bg-transparent">
                <TableCell colSpan={7} className="py-14 text-center text-sm text-[#737373]">No popups match your filters.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableShell>

      <CreatePopupDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={(p) => setPopups((prev) => [{ id: Date.now(), ...p }, ...prev])} />
    </MainScreenWrapper>
  );
}

export default PopupsScreen;
