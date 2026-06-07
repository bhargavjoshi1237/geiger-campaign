"use client";

import React, { useMemo, useState } from "react";
import { Plus, FileText, Pencil, Code2, Copy, Trash2 } from "lucide-react";
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

const TYPE_TONE = { Embedded: "blue", Popup: "violet", Hosted: "zinc" };
const STATUS_TONE = { Live: "green", Draft: "zinc", Paused: "amber" };

const TYPES = ["All", "Embedded", "Popup", "Hosted"];
const FORM_TYPES = ["Embedded", "Popup", "Hosted"];
const LISTS = ["Newsletter", "Product Updates", "Webinar"];

const INITIAL = [
  { id: 1, name: "Footer Newsletter Signup", purpose: "Site-wide footer opt-in", type: "Embedded", submissions: 8420, conversion: 6, status: "Live" },
  { id: 2, name: "Exit-Intent Discount", purpose: "10% off in exchange for email", type: "Popup", submissions: 3190, conversion: 14, status: "Live" },
  { id: 3, name: "Webinar Registration", purpose: "Hosted page for Q3 product webinar", type: "Hosted", submissions: 1245, conversion: 38, status: "Live" },
  { id: 4, name: "Blog Sidebar Capture", purpose: "Embedded form on article pages", type: "Embedded", submissions: 2760, conversion: 4, status: "Paused" },
  { id: 5, name: "Ebook Download Gate", purpose: "Hosted gate for the SaaS playbook", type: "Hosted", submissions: 0, conversion: 0, status: "Draft" },
  { id: 6, name: "Welcome Mat Opt-in", purpose: "Full-screen popup for new visitors", type: "Popup", submissions: 4980, conversion: 9, status: "Live" },
];

function CreateFormDialog({ open, onOpenChange, onCreate }) {
  const [form, setForm] = useState({ name: "", type: "Embedded", list: LISTS[0] });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    if (!form.name.trim()) return;
    onCreate({
      name: form.name.trim(),
      purpose: `New ${form.type.toLowerCase()} form → ${form.list}`,
      type: form.type, submissions: 0, conversion: 0, status: "Draft",
    });
    setForm({ name: "", type: "Embedded", list: LISTS[0] });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create form</DialogTitle>
          <DialogDescription>Choose how visitors will see it and where new leads should land.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4 py-4">
          <Field label="Form name" htmlFor="form-name">
            <Input id="form-name" value={form.name} onChange={(e) => set("name")(e.target.value)} placeholder="e.g. Homepage Hero Signup" className="bg-[#161616] border-[#2a2a2a]" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <Select value={form.type} onValueChange={set("type")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{FORM_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Destination list">
              <Select value={form.list} onValueChange={set("list")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{LISTS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-[#a3a3a3] hover:bg-[#242424] hover:text-white">Cancel</Button>
          <Button onClick={submit} disabled={!form.name.trim()} className="bg-white text-black hover:bg-[#e5e5e5]">Create form</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function FormsScreen() {
  const [forms, setForms] = useState(INITIAL);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("All");
  const [createOpen, setCreateOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return forms.filter((f) =>
      (type === "All" || f.type === type) &&
      (!q || f.name.toLowerCase().includes(q)),
    );
  }, [forms, query, type]);

  return (
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="Forms"
        description="Capture leads with embedded, popup, and hosted signup forms."
        actions={
          <Button onClick={() => setCreateOpen(true)} className="h-9 bg-white text-black hover:bg-[#e5e5e5]">
            <Plus className="h-4 w-4" /> Create form
          </Button>
        }
      />

      <div className="flex flex-col gap-3 border-t border-[#242424] pt-4 sm:flex-row sm:items-center">
        <SearchInput value={query} onChange={setQuery} placeholder="Search forms…" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="h-9 justify-between border-[#2a2a2a] bg-[#202020] text-[#ededed] hover:bg-[#1a1a1a] sm:w-40">
              {type === "All" ? "All types" : type}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-44 border-[#2a2a2a] bg-[#202020] text-[#ededed]">
            <DropdownMenuLabel className="text-[#737373]">Filter by type</DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-[#2a2a2a]" />
            {TYPES.map((t) => (
              <DropdownMenuItem key={t} onSelect={() => setType(t)} className={cn("cursor-pointer focus:bg-[#2a2a2a] focus:text-white", type === t && "text-white")}>
                {t === "All" ? "All types" : t}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <TableShell>
        <Table>
          <TableHeader>
            <TableRow className="border-[#2a2a2a] bg-[#1a1a1a] hover:bg-[#1a1a1a]">
              <TableHead>Form</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Submissions</TableHead>
              <TableHead>Conversion</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((f) => (
              <TableRow key={f.id} className="border-[#2a2a2a]">
                <TableCell>
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#2a2a2a] bg-[#242424] text-[#a3a3a3]"><FileText className="h-4 w-4" /></span>
                    <div className="flex min-w-0 flex-col">
                      <span className="font-medium text-[#ededed]">{f.name}</span>
                      <span className="truncate text-xs text-[#737373]">{f.purpose}</span>
                    </div>
                  </div>
                </TableCell>
                <TableCell><Pill tone={TYPE_TONE[f.type]}>{f.type}</Pill></TableCell>
                <TableCell className="tabular-nums text-[#a3a3a3]">{f.submissions ? f.submissions.toLocaleString() : "—"}</TableCell>
                <TableCell>
                  {f.conversion > 0 ? (
                    <div className="w-[120px] space-y-1.5">
                      <Progress value={f.conversion} className="h-1.5 bg-[#2a2a2a] [&_[data-slot=progress-indicator]]:bg-[#ededed]" />
                      <p className="text-xs text-[#737373]">{f.conversion}%</p>
                    </div>
                  ) : <span className="text-[#737373]">—</span>}
                </TableCell>
                <TableCell><Pill tone={STATUS_TONE[f.status]}>{f.status}</Pill></TableCell>
                <TableCell className="text-right">
                  <RowActions
                    items={[
                      { label: "Edit", icon: Pencil },
                      { label: "Get embed code", icon: Code2 },
                      { label: "Duplicate", icon: Copy },
                      { label: "Delete", icon: Trash2, danger: true, separatorBefore: true, onSelect: () => setForms((p) => p.filter((x) => x.id !== f.id)) },
                    ]}
                  />
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow className="border-[#2a2a2a] hover:bg-transparent">
                <TableCell colSpan={6} className="py-14 text-center text-sm text-[#737373]">No forms match your filters.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableShell>

      <CreateFormDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={(f) => setForms((p) => [{ id: Date.now(), ...f }, ...p])} />
    </MainScreenWrapper>
  );
}

export default FormsScreen;
