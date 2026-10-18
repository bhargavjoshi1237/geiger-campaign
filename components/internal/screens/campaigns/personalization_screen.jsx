"use client";

import React, { useState } from "react";
import { Plus, Braces, SplitSquareVertical, Pencil, Copy, Trash2 } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  SegmentedTabs,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  ScreenHeader,
  SearchInput,
  Toolbar,
  DataTable,
  EmptyState,
  Badge,
  ActionMenu,
  Field,
} from "@geiger/ui";

const SOURCE_FIELDS = ["First name", "Last name", "Company", "Plan tier", "City", "Last order"];

const INITIAL_TAGS = [
  { id: 1, token: "first_name", source: "First name", fallback: "there", sample: "Amara" },
  { id: 2, token: "company", source: "Company", fallback: "your team", sample: "Northwind" },
  { id: 3, token: "plan_tier", source: "Plan tier", fallback: "your plan", sample: "Pro" },
  { id: 4, token: "city", source: "City", fallback: "your city", sample: "Lagos" },
];

const INITIAL_RULES = [
  { id: 1, name: "VIP greeting block", condition: "Tag is VIP", variants: 2, status: "Active" },
  { id: 2, name: "Region-based offer", condition: "Country in EU", variants: 3, status: "Active" },
  { id: 3, name: "New vs returning hero", condition: "Lifetime orders = 0", variants: 2, status: "Draft" },
];

function AddTokenDialog({ open, onOpenChange, onCreate }) {
  const [form, setForm] = useState({ source: SOURCE_FIELDS[0], fallback: "" });
  const token = form.source.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  const submit = () => {
    onCreate({ token, source: form.source, fallback: form.fallback.trim() || "—", sample: "—" });
    setForm({ source: SOURCE_FIELDS[0], fallback: "" });
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New merge tag</DialogTitle>
          <DialogDescription>Merge tags insert per-contact values into your content.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <Field label="Source field">
            <Select value={form.source} onValueChange={(v) => setForm((f) => ({ ...f, source: v }))}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{SOURCE_FIELDS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Token" hint="Use this in content to insert the value.">
            <Input readOnly value={`{{ ${token} }}`} aria-label="Token" className="border-border font-mono text-muted-foreground" />
          </Field>
          <Field label="Fallback value" htmlFor="p-fallback" hint="Shown when a contact has no value for this field.">
            <Input id="p-fallback" value={form.fallback} onChange={(e) => setForm((f) => ({ ...f, fallback: e.target.value }))} placeholder="e.g. there" className="border-border" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit}>Create tag</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PersonalizationScreen() {
  const [tab, setTab] = useState("tags");
  const [tags, setTags] = useState(INITIAL_TAGS);
  const [rules, setRules] = useState(INITIAL_RULES);
  const [query, setQuery] = useState("");
  const [tokenOpen, setTokenOpen] = useState(false);

  const q = query.trim().toLowerCase();
  const fTags = tags.filter((t) => t.token.includes(q) || t.source.toLowerCase().includes(q));
  const fRules = rules.filter((r) => r.name.toLowerCase().includes(q));

  const tagColumns = [
    { key: "token", header: "Token", className: "font-mono text-xs text-foreground", render: (t) => `{{ ${t.token} }}` },
    { key: "source", header: "Source field", className: "text-muted-foreground", render: (t) => t.source },
    { key: "fallback", header: "Fallback", className: "text-muted-foreground", render: (t) => t.fallback },
    { key: "sample", header: "Sample", className: "text-muted-foreground", render: (t) => t.sample },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (t) => (
        <ActionMenu items={[
          { label: "Edit", icon: Pencil },
          { label: "Copy token", icon: Copy },
          { separator: true },
          { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setTags((p) => p.filter((x) => x.id !== t.id)) },
        ]} />
      ),
    },
  ];

  const ruleColumns = [
    { key: "name", header: "Rule", className: "font-medium text-foreground", render: (r) => r.name },
    { key: "condition", header: "Condition", className: "text-muted-foreground", render: (r) => r.condition },
    { key: "variants", header: "Variants", className: "tabular-nums text-muted-foreground", render: (r) => r.variants },
    { key: "status", header: "Status", render: (r) => <Badge variant={r.status === "Active" ? "success" : "neutral"}>{r.status}</Badge> },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (r) => (
        <ActionMenu items={[
          { label: "Edit rule", icon: Pencil },
          { label: "Duplicate", icon: Copy },
          { separator: true },
          { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setRules((p) => p.filter((x) => x.id !== r.id)) },
        ]} />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Personalization"
        description="Merge tags and conditional content that tailor every message to the recipient."
      />

      <Toolbar>
        <SegmentedTabs
          value={tab}
          onChange={setTab}
          tabs={[
            { label: "Merge Tags", value: "tags", icon: Braces },
            { label: "Dynamic Content", value: "rules", icon: SplitSquareVertical },
          ]}
        />
        <div className="flex items-center gap-2">
          <SearchInput value={query} onChange={setQuery} placeholder={tab === "tags" ? "Search tags…" : "Search rules…"} />
          {tab === "tags" ? (
            <Button onClick={() => setTokenOpen(true)} className="shrink-0"><Plus className="h-4 w-4" /> New tag</Button>
          ) : (
            <Button className="shrink-0"><Plus className="h-4 w-4" /> New rule</Button>
          )}
        </div>
      </Toolbar>

      {tab === "tags" ? (
        <DataTable
          columns={tagColumns}
          data={fTags}
          getRowKey={(t) => t.id}
          empty={
            <EmptyState
              icon={Braces}
              title="No merge tags found"
              className="rounded-xl border border-border bg-surface-subtle"
              action={<Button variant="outline" onClick={() => setTokenOpen(true)}><Plus className="h-4 w-4" /> New tag</Button>}
            />
          }
        />
      ) : (
        <DataTable
          columns={ruleColumns}
          data={fRules}
          getRowKey={(r) => r.id}
          empty={
            <EmptyState
              icon={SplitSquareVertical}
              title="No dynamic content rules found"
              className="rounded-xl border border-border bg-surface-subtle"
            />
          }
        />
      )}

      <AddTokenDialog open={tokenOpen} onOpenChange={setTokenOpen} onCreate={(t) => setTags((p) => [{ id: Date.now(), ...t }, ...p])} />
    </MainScreenWrapper>
  );
}

export default PersonalizationScreen;
