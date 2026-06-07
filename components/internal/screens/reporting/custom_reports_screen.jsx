"use client";

import React, { useMemo, useState } from "react";
import { Plus, FileBarChart, Play, Pencil, Download, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader } from "@/components/internal/shared/screen_header";
import { TableShell, SearchInput, Pill, RowActions, Field } from "@/components/internal/shared/screen_kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const SCHEDULE_TONE = {
  Daily: "green",
  Weekly: "blue",
  Monthly: "violet",
  Manual: "zinc",
};

const INITIAL = [
  { id: 1, name: "Weekly performance summary", description: "Sends, opens, clicks, and revenue by campaign", metrics: ["Open rate", "Click rate", "Revenue"], schedule: "Weekly", lastRun: "Jun 5, 2026", format: "PDF" },
  { id: 2, name: "Daily deliverability digest", description: "Bounce and complaint rates by sending domain", metrics: ["Delivered %", "Bounce %"], schedule: "Daily", lastRun: "Jun 7, 2026", format: "CSV" },
  { id: 3, name: "Revenue attribution by channel", description: "Attributed revenue split across channels", metrics: ["Revenue", "Touchpoints", "Share"], schedule: "Monthly", lastRun: "Jun 1, 2026", format: "XLSX" },
  { id: 4, name: "Segment engagement breakdown", description: "Open and click behaviour per audience segment", metrics: ["Open rate", "Click rate"], schedule: "Weekly", lastRun: "Jun 4, 2026", format: "PDF" },
  { id: 5, name: "Win-back campaign export", description: "Recipient-level results for the win-back series", metrics: ["Recipients", "Conversion", "Revenue"], schedule: "Manual", lastRun: "May 28, 2026", format: "CSV" },
  { id: 6, name: "Executive overview", description: "Top-line KPIs for the leadership review", metrics: ["Revenue", "Open rate", "Subscribers"], schedule: "Monthly", lastRun: "Jun 1, 2026", format: "PDF" },
];

const GROUP_BY = ["Campaign", "Channel", "Segment", "Date"];
const SCHEDULES = ["Daily", "Weekly", "Monthly", "Manual"];
const FORMATS = ["CSV", "PDF", "XLSX"];

const GROUP_METRICS = {
  Campaign: ["Open rate", "Click rate", "Revenue"],
  Channel: ["Revenue", "Touchpoints", "Share"],
  Segment: ["Open rate", "Click rate"],
  Date: ["Sends", "Opens", "Revenue"],
};

function CreateReportDialog({ open, onOpenChange, onCreate }) {
  const [form, setForm] = useState({ name: "", description: "", groupBy: "Campaign", schedule: "Weekly", format: "PDF" });
  const submit = () => {
    if (!form.name.trim()) return;
    onCreate({
      name: form.name.trim(),
      description: form.description.trim() || "—",
      metrics: GROUP_METRICS[form.groupBy] || ["Revenue"],
      schedule: form.schedule,
      lastRun: "Never",
      format: form.format,
    });
    setForm({ name: "", description: "", groupBy: "Campaign", schedule: "Weekly", format: "PDF" });
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create report</DialogTitle>
          <DialogDescription>Define what to measure, how to group it, and when it runs.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4 py-4">
          <Field label="Report name" htmlFor="r-name">
            <Input id="r-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Monthly revenue review" className="bg-[#161616] border-[#2a2a2a]" />
          </Field>
          <Field label="Description" htmlFor="r-desc">
            <Textarea id="r-desc" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="What does this report cover?" />
          </Field>
          <Field label="Group by">
            <Select value={form.groupBy} onValueChange={(v) => setForm((f) => ({ ...f, groupBy: v }))}>
              <SelectTrigger className="bg-[#161616] border-[#2a2a2a]"><SelectValue /></SelectTrigger>
              <SelectContent>{GROUP_BY.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Schedule">
              <Select value={form.schedule} onValueChange={(v) => setForm((f) => ({ ...f, schedule: v }))}>
                <SelectTrigger className="bg-[#161616] border-[#2a2a2a]"><SelectValue /></SelectTrigger>
                <SelectContent>{SCHEDULES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Format">
              <Select value={form.format} onValueChange={(v) => setForm((f) => ({ ...f, format: v }))}>
                <SelectTrigger className="bg-[#161616] border-[#2a2a2a]"><SelectValue /></SelectTrigger>
                <SelectContent>{FORMATS.map((fmt) => <SelectItem key={fmt} value={fmt}>{fmt}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-[#a3a3a3] hover:bg-[#242424] hover:text-white">Cancel</Button>
          <Button onClick={submit} disabled={!form.name.trim()} className="bg-white text-black hover:bg-[#e5e5e5]">Create report</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CustomReportsScreen() {
  const [reports, setReports] = useState(INITIAL);
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return reports.filter((r) => !q || r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q));
  }, [reports, query]);

  return (
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="Custom Reports"
        description="Build, schedule, and export the reports your team needs."
        actions={
          <Button onClick={() => setCreateOpen(true)} className="h-9 bg-white text-black hover:bg-[#e5e5e5]">
            <Plus className="h-4 w-4" /> Create report
          </Button>
        }
      />

      <div className="border-t border-[#242424] pt-4">
        <SearchInput value={query} onChange={setQuery} placeholder="Search reports…" />
      </div>

      <TableShell>
        <Table>
          <TableHeader>
            <TableRow className="border-[#2a2a2a] bg-[#1a1a1a] hover:bg-[#1a1a1a]">
              <TableHead>Report</TableHead>
              <TableHead>Metrics</TableHead>
              <TableHead>Schedule</TableHead>
              <TableHead>Last run</TableHead>
              <TableHead>Format</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((r) => (
              <TableRow key={r.id} className="border-[#2a2a2a]">
                <TableCell>
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#2a2a2a] bg-[#242424] text-[#a3a3a3]">
                      <FileBarChart className="h-4 w-4" />
                    </span>
                    <div className="flex min-w-0 flex-col">
                      <span className="font-medium text-[#ededed]">{r.name}</span>
                      <span className="truncate text-xs text-[#737373]">{r.description}</span>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {r.metrics.map((m) => (
                      <span key={m} className="rounded-md border border-[#2a2a2a] bg-[#242424] px-2 py-0.5 text-xs text-[#a3a3a3]">{m}</span>
                    ))}
                  </div>
                </TableCell>
                <TableCell><Pill tone={SCHEDULE_TONE[r.schedule]}>{r.schedule}</Pill></TableCell>
                <TableCell className="whitespace-nowrap text-[#a3a3a3]">{r.lastRun}</TableCell>
                <TableCell className="font-mono text-xs text-[#a3a3a3]">{r.format}</TableCell>
                <TableCell className="text-right">
                  <RowActions
                    items={[
                      { label: "Run now", icon: Play },
                      { label: "Edit", icon: Pencil },
                      { label: "Download", icon: Download },
                      { label: "Delete", icon: Trash2, danger: true, separatorBefore: true, onSelect: () => setReports((p) => p.filter((x) => x.id !== r.id)) },
                    ]}
                  />
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow className="border-[#2a2a2a] hover:bg-transparent">
                <TableCell colSpan={6} className="py-14 text-center text-sm text-[#737373]">No reports found.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableShell>

      <CreateReportDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={(r) => setReports((p) => [{ id: Date.now(), ...r }, ...p])} />
    </MainScreenWrapper>
  );
}

export default CustomReportsScreen;
