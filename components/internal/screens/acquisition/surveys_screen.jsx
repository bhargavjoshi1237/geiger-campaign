"use client";

import React, { useMemo, useState } from "react";
import { Plus, ClipboardList, Pencil, BarChart3, XCircle, Trash2 } from "lucide-react";
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

const TYPE_TONE = { NPS: "violet", CSAT: "blue", Poll: "amber", Feedback: "zinc" };
const STATUS_TONE = { Live: "green", Closed: "zinc", Draft: "zinc" };

const STATUSES = ["All", "Live", "Closed", "Draft"];
const SURVEY_TYPES = ["NPS", "CSAT", "Poll", "Feedback"];
const AUDIENCES = ["All contacts", "Active customers", "Trial users", "Recent purchasers"];

const INITIAL = [
  { id: 1, name: "Post-Purchase NPS", type: "NPS", responses: 2140, score: "72 NPS", status: "Live", audience: "Recent purchasers" },
  { id: 2, name: "Support Satisfaction", type: "CSAT", responses: 1860, score: "8.4", status: "Live", audience: "Active customers" },
  { id: 3, name: "Onboarding Feedback", type: "Feedback", responses: 540, score: "—", status: "Live", audience: "Trial users" },
  { id: 4, name: "Feature Priority Poll", type: "Poll", responses: 3210, score: "—", status: "Live", audience: "All contacts" },
  { id: 5, name: "Q1 Relationship NPS", type: "NPS", responses: 4120, score: "61 NPS", status: "Closed", audience: "All contacts" },
  { id: 6, name: "Checkout Experience", type: "CSAT", responses: 0, score: "—", status: "Draft", audience: "Recent purchasers" },
];

function CreateSurveyDialog({ open, onOpenChange, onCreate }) {
  const [form, setForm] = useState({ name: "", type: SURVEY_TYPES[0], audience: AUDIENCES[0] });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    if (!form.name.trim()) return;
    onCreate({ name: form.name.trim(), type: form.type, responses: 0, score: "—", status: "Draft", audience: form.audience });
    setForm({ name: "", type: SURVEY_TYPES[0], audience: AUDIENCES[0] });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create survey</DialogTitle>
          <DialogDescription>Pick a survey type and who should receive it.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4 py-4">
          <Field label="Survey name" htmlFor="survey-name">
            <Input id="survey-name" value={form.name} onChange={(e) => set("name")(e.target.value)} placeholder="e.g. Quarterly NPS" className="bg-[#161616] border-[#2a2a2a]" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <Select value={form.type} onValueChange={set("type")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{SURVEY_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Audience">
              <Select value={form.audience} onValueChange={set("audience")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{AUDIENCES.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-[#a3a3a3] hover:bg-[#242424] hover:text-white">Cancel</Button>
          <Button onClick={submit} disabled={!form.name.trim()} className="bg-white text-black hover:bg-[#e5e5e5]">Create survey</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SurveysScreen() {
  const [surveys, setSurveys] = useState(INITIAL);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All");
  const [createOpen, setCreateOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return surveys.filter((s) =>
      (status === "All" || s.status === status) &&
      (!q || s.name.toLowerCase().includes(q)),
    );
  }, [surveys, query, status]);

  return (
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="Surveys"
        description="Collect feedback and measure satisfaction."
        actions={
          <Button onClick={() => setCreateOpen(true)} className="h-9 bg-white text-black hover:bg-[#e5e5e5]">
            <Plus className="h-4 w-4" /> Create survey
          </Button>
        }
      />

      <div className="flex flex-col gap-3 border-t border-[#242424] pt-4 sm:flex-row sm:items-center">
        <SearchInput value={query} onChange={setQuery} placeholder="Search surveys…" />
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
              <TableHead>Survey</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Responses</TableHead>
              <TableHead>Avg score</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((s) => (
              <TableRow key={s.id} className="border-[#2a2a2a]">
                <TableCell>
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#2a2a2a] bg-[#242424] text-[#a3a3a3]"><ClipboardList className="h-4 w-4" /></span>
                    <div className="flex min-w-0 flex-col">
                      <span className="font-medium text-[#ededed]">{s.name}</span>
                      <span className="truncate text-xs text-[#737373]">{s.audience}</span>
                    </div>
                  </div>
                </TableCell>
                <TableCell><Pill tone={TYPE_TONE[s.type]}>{s.type}</Pill></TableCell>
                <TableCell className="tabular-nums text-[#a3a3a3]">{s.responses ? s.responses.toLocaleString() : "—"}</TableCell>
                <TableCell className="tabular-nums text-[#ededed]">{s.score}</TableCell>
                <TableCell><Pill tone={STATUS_TONE[s.status]}>{s.status}</Pill></TableCell>
                <TableCell className="text-right">
                  <RowActions
                    items={[
                      { label: "Edit", icon: Pencil },
                      { label: "View results", icon: BarChart3 },
                      { label: "Close", icon: XCircle },
                      { label: "Delete", icon: Trash2, danger: true, separatorBefore: true, onSelect: () => setSurveys((prev) => prev.filter((x) => x.id !== s.id)) },
                    ]}
                  />
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow className="border-[#2a2a2a] hover:bg-transparent">
                <TableCell colSpan={6} className="py-14 text-center text-sm text-[#737373]">No surveys match your filters.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableShell>

      <CreateSurveyDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={(s) => setSurveys((prev) => [{ id: Date.now(), ...s }, ...prev])} />
    </MainScreenWrapper>
  );
}

export default SurveysScreen;
