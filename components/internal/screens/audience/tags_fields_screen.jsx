"use client";

import React, { useState } from "react";
import { Plus, Tag as TagIcon, Pencil, Trash2, Merge, Hash } from "lucide-react";
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
  cn,
  ScreenHeader,
  SearchInput,
  Badge,
  ActionMenu,
  Field,
  Toolbar,
  DataTable,
  EmptyState,
  SettingsList,
  SettingRow,
  Progress,
} from "@geiger/ui";

const TAG_COLORS = [
  { name: "Emerald", value: "#34d399" },
  { name: "Blue", value: "#60a5fa" },
  { name: "Amber", value: "#fbbf24" },
  { name: "Violet", value: "#a78bfa" },
  { name: "Red", value: "#f87171" },
  { name: "Zinc", value: "#a1a1aa" },
];

const INITIAL_TAGS = [
  { id: 1, name: "VIP", color: "#fbbf24", contacts: 940 },
  { id: 2, name: "Beta tester", color: "#a78bfa", contacts: 312 },
  { id: 3, name: "Webinar 2026", color: "#60a5fa", contacts: 3120 },
  { id: 4, name: "Churned", color: "#f87171", contacts: 1880 },
  { id: 5, name: "Newsletter", color: "#34d399", contacts: 18420 },
];

const FIELD_TYPES = ["Text", "Number", "Date", "Dropdown", "Boolean"];

const INITIAL_FIELDS = [
  { id: 1, label: "Company", key: "company", type: "Text", filled: 78, required: false },
  { id: 2, label: "Plan tier", key: "plan_tier", type: "Dropdown", filled: 64, required: true },
  { id: 3, label: "Lifetime value", key: "ltv", type: "Number", filled: 41, required: false },
  { id: 4, label: "Renewal date", key: "renewal_date", type: "Date", filled: 33, required: false },
  { id: 5, label: "Marketing consent", key: "marketing_consent", type: "Boolean", filled: 92, required: true },
];

function CreateTagDialog({ open, onOpenChange, onCreate }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(TAG_COLORS[0].value);

  const submit = () => {
    if (!name.trim()) return;
    onCreate({ name: name.trim(), color, contacts: 0 });
    setName("");
    setColor(TAG_COLORS[0].value);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create tag</DialogTitle>
          <DialogDescription>Tags are lightweight labels you can apply to any contact.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <Field label="Tag name" htmlFor="t-name">
            <Input id="t-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. VIP" />
          </Field>
          <Field label="Color">
            <div className="flex flex-wrap gap-2">
              {TAG_COLORS.map((c) => (
                <Button
                  key={c.value}
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setColor(c.value)}
                  className={cn(
                    "rounded-full border-2 hover:bg-transparent",
                    color === c.value ? "border-foreground" : "border-transparent hover:border-border-strong",
                  )}
                  aria-label={c.name}
                  aria-pressed={color === c.value}
                >
                  <span className="h-4 w-4 rounded-full" style={{ backgroundColor: c.value }} />
                </Button>
              ))}
            </div>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!name.trim()}>Create tag</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateFieldDialog({ open, onOpenChange, onCreate }) {
  const [form, setForm] = useState({ label: "", type: "Text", required: false });
  const key = form.label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

  const submit = () => {
    if (!form.label.trim()) return;
    onCreate({ label: form.label.trim(), key: key || "field", type: form.type, filled: 0, required: form.required });
    setForm({ label: "", type: "Text", required: false });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New custom field</DialogTitle>
          <DialogDescription>Custom fields store structured data on every contact.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <Field label="Field label" htmlFor="f-label">
            <Input id="f-label" value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} placeholder="e.g. Company" />
          </Field>
          <Field label="API key" hint="Auto-generated from the label; used in personalization and the API.">
            <div className="flex items-center rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-muted-foreground">
              {key || "field_key"}
            </div>
          </Field>
          <Field label="Field type">
            <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {FIELD_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <SettingsList className="rounded-lg border border-border bg-surface-card px-4 py-3">
            <SettingRow
              title="Required field"
              description="Forms must collect this value before submitting."
              checked={form.required}
              onCheckedChange={(v) => setForm((f) => ({ ...f, required: v }))}
            />
          </SettingsList>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!form.label.trim()}>Create field</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TagsFieldsScreen() {
  const [tab, setTab] = useState("tags");
  const [tags, setTags] = useState(INITIAL_TAGS);
  const [fields, setFields] = useState(INITIAL_FIELDS);
  const [query, setQuery] = useState("");
  const [tagOpen, setTagOpen] = useState(false);
  const [fieldOpen, setFieldOpen] = useState(false);

  const q = query.trim().toLowerCase();
  const filteredTags = tags.filter((t) => t.name.toLowerCase().includes(q));
  const filteredFields = fields.filter((f) => f.label.toLowerCase().includes(q) || f.key.includes(q));

  const tagColumns = [
    {
      key: "tag",
      header: "Tag",
      render: (t) => (
        <span className="inline-flex items-center gap-2 rounded-md border border-border bg-surface-active px-2.5 py-1 text-sm text-foreground">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t.color }} />
          {t.name}
        </span>
      ),
    },
    {
      key: "contacts",
      header: "Contacts tagged",
      className: "tabular-nums font-medium text-foreground",
      render: (t) => t.contacts.toLocaleString(),
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (t) => (
        <ActionMenu
          label={`Actions for ${t.name}`}
          items={[
            { label: "Rename", icon: Pencil },
            { label: "Merge into…", icon: Merge },
            { separator: true },
            { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setTags((p) => p.filter((x) => x.id !== t.id)) },
          ]}
        />
      ),
    },
  ];

  const fieldColumns = [
    {
      key: "field",
      header: "Field",
      render: (f) => (
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">{f.label}</span>
          {f.required && <Badge variant="warning" className="min-w-0">Required</Badge>}
        </div>
      ),
    },
    { key: "key", header: "API key", className: "font-mono text-xs text-muted-foreground", render: (f) => f.key },
    { key: "type", header: "Type", render: (f) => <Badge variant="info">{f.type}</Badge> },
    {
      key: "filled",
      header: "Completeness",
      render: (f) => (
        <div className="flex items-center gap-2">
          <Progress value={f.filled} className="h-1.5 w-24 bg-surface-hover" />
          <span className="text-xs tabular-nums text-text-secondary">{f.filled}%</span>
        </div>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (f) => (
        <ActionMenu
          label={`Actions for ${f.label}`}
          items={[
            { label: "Edit field", icon: Pencil },
            { separator: true },
            { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setFields((p) => p.filter((x) => x.id !== f.id)) },
          ]}
        />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Tags & Fields"
        description="Label contacts with tags and store structured data in custom fields."
        actions={
          tab === "tags" ? (
            <Button onClick={() => setTagOpen(true)}>
              <Plus className="h-4 w-4" /> New tag
            </Button>
          ) : (
            <Button onClick={() => setFieldOpen(true)}>
              <Plus className="h-4 w-4" /> New field
            </Button>
          )
        }
      />

      <Toolbar>
        <SegmentedTabs
          value={tab}
          onChange={setTab}
          tabs={[
            { label: "Tags", value: "tags", icon: TagIcon },
            { label: "Custom Fields", value: "fields", icon: Hash },
          ]}
        />
        <SearchInput value={query} onChange={setQuery} placeholder={tab === "tags" ? "Search tags…" : "Search fields…"} />
      </Toolbar>

      {tab === "tags" ? (
        <DataTable
          columns={tagColumns}
          data={filteredTags}
          getRowKey={(t) => t.id}
          empty={
            <EmptyState
              icon={TagIcon}
              title="No tags found"
              description="Try a different search, or create a new tag."
              className="rounded-xl border border-border bg-surface-subtle"
              action={
                <Button onClick={() => setTagOpen(true)}>
                  <Plus className="h-4 w-4" /> New tag
                </Button>
              }
            />
          }
        />
      ) : (
        <DataTable
          columns={fieldColumns}
          data={filteredFields}
          getRowKey={(f) => f.id}
          empty={
            <EmptyState
              icon={Hash}
              title="No fields found"
              description="Try a different search, or create a new custom field."
              className="rounded-xl border border-border bg-surface-subtle"
              action={
                <Button onClick={() => setFieldOpen(true)}>
                  <Plus className="h-4 w-4" /> New field
                </Button>
              }
            />
          }
        />
      )}

      <CreateTagDialog open={tagOpen} onOpenChange={setTagOpen} onCreate={(t) => setTags((p) => [{ id: Date.now(), ...t }, ...p])} />
      <CreateFieldDialog open={fieldOpen} onOpenChange={setFieldOpen} onCreate={(f) => setFields((p) => [{ id: Date.now(), ...f }, ...p])} />
    </MainScreenWrapper>
  );
}

export default TagsFieldsScreen;
