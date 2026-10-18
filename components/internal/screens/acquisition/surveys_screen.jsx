"use client";

import React, { useMemo, useState } from "react";
import { Plus, ClipboardList, Pencil, BarChart3, XCircle, Trash2 } from "lucide-react";
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
  Toolbar,
  DataTable,
  EmptyState,
  Badge,
  ActionMenu,
  Field,
} from "@geiger/ui";

const TYPE_TONE = { NPS: "purple", CSAT: "info", Poll: "warning", Feedback: "neutral" };
const STATUS_TONE = { Live: "success", Closed: "neutral", Draft: "neutral" };

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
        <div className="space-y-4 py-4">
          <Field label="Survey name" htmlFor="survey-name">
            <Input id="survey-name" value={form.name} onChange={(e) => set("name")(e.target.value)} placeholder="e.g. Quarterly NPS" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <Select value={form.type} onValueChange={set("type")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{SURVEY_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Audience">
              <Select value={form.audience} onValueChange={set("audience")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{AUDIENCES.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!form.name.trim()}>Create survey</Button>
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

  const columns = [
    {
      key: "survey",
      header: "Survey",
      render: (s) => (
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-active text-muted-foreground"><ClipboardList className="h-4 w-4" /></span>
          <div className="flex min-w-0 flex-col">
            <span className="font-medium text-foreground">{s.name}</span>
            <span className="truncate text-xs text-text-secondary">{s.audience}</span>
          </div>
        </div>
      ),
    },
    { key: "type", header: "Type", render: (s) => <Badge variant={TYPE_TONE[s.type]}>{s.type}</Badge> },
    {
      key: "responses",
      header: "Responses",
      className: "tabular-nums text-muted-foreground",
      render: (s) => (s.responses ? s.responses.toLocaleString() : "—"),
    },
    { key: "score", header: "Avg score", className: "tabular-nums text-foreground", render: (s) => s.score },
    { key: "status", header: "Status", render: (s) => <Badge variant={STATUS_TONE[s.status]}>{s.status}</Badge> },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (s) => (
        <ActionMenu
          items={[
            { label: "Edit", icon: Pencil },
            { label: "View results", icon: BarChart3 },
            { label: "Close", icon: XCircle },
            { separator: true },
            { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setSurveys((prev) => prev.filter((x) => x.id !== s.id)) },
          ]}
        />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Surveys"
        description="Collect feedback and measure satisfaction."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> Create survey
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
        <SearchInput value={query} onChange={setQuery} placeholder="Search surveys…" />
      </Toolbar>

      <DataTable
        columns={columns}
        data={filtered}
        getRowKey={(s) => s.id}
        empty={
          <EmptyState
            icon={ClipboardList}
            title="No surveys match your filters"
            description="Try a different search or status, or create a new survey."
            action={
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" /> Create survey
              </Button>
            }
            className="rounded-xl border border-border bg-surface-subtle"
          />
        }
      />

      <CreateSurveyDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={(s) => setSurveys((prev) => [{ id: Date.now(), ...s }, ...prev])} />
    </MainScreenWrapper>
  );
}

export default SurveysScreen;
