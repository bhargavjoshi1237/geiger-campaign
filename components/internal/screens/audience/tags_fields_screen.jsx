"use client";

import React, { useState } from "react";
import { Plus, Tag as TagIcon, Pencil, Trash2, Merge, Hash } from "lucide-react";
import { cn } from "@/lib/utils";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader } from "@/components/internal/shared/screen_header";
import { SegmentedTabs } from "@/components/internal/shared/segmented_tabs";
import {
  TableShell,
  SearchInput,
  Pill,
  RowActions,
  Field,
} from "@/components/internal/shared/screen_kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
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
        <DialogBody className="space-y-4 py-4">
          <Field label="Tag name" htmlFor="t-name">
            <Input id="t-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. VIP" className="bg-[#161616] border-[#2a2a2a]" />
          </Field>
          <Field label="Color">
            <div className="flex flex-wrap gap-2">
              {TAG_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setColor(c.value)}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors",
                    color === c.value ? "border-white" : "border-transparent hover:border-[#474747]",
                  )}
                  aria-label={c.name}
                >
                  <span className="h-4 w-4 rounded-full" style={{ backgroundColor: c.value }} />
                </button>
              ))}
            </div>
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-[#a3a3a3] hover:bg-[#242424] hover:text-white">Cancel</Button>
          <Button onClick={submit} disabled={!name.trim()} className="bg-white text-black hover:bg-[#e5e5e5]">Create tag</Button>
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
        <DialogBody className="space-y-4 py-4">
          <Field label="Field label" htmlFor="f-label">
            <Input id="f-label" value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} placeholder="e.g. Company" className="bg-[#161616] border-[#2a2a2a]" />
          </Field>
          <Field label="API key" hint="Auto-generated from the label; used in personalization and the API.">
            <div className="flex items-center rounded-md border border-[#2a2a2a] bg-[#161616] px-3 py-2 font-mono text-sm text-[#a3a3a3]">
              {key || "field_key"}
            </div>
          </Field>
          <Field label="Field type">
            <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {FIELD_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <div className="flex items-center justify-between rounded-lg border border-[#2a2a2a] bg-[#202020] px-4 py-3">
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-[#e5e5e5]">Required field</p>
              <p className="text-xs text-[#737373]">Forms must collect this value before submitting.</p>
            </div>
            <Switch checked={form.required} onCheckedChange={(v) => setForm((f) => ({ ...f, required: v }))} />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-[#a3a3a3] hover:bg-[#242424] hover:text-white">Cancel</Button>
          <Button onClick={submit} disabled={!form.label.trim()} className="bg-white text-black hover:bg-[#e5e5e5]">Create field</Button>
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

  return (
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="Tags & Fields"
        description="Label contacts with tags and store structured data in custom fields."
      />

      <div className="flex flex-col gap-3 border-t border-[#242424] pt-4 sm:flex-row sm:items-center sm:justify-between">
        <SegmentedTabs
          value={tab}
          onChange={setTab}
          tabs={[
            { label: "Tags", value: "tags", icon: TagIcon },
            { label: "Custom Fields", value: "fields", icon: Hash },
          ]}
        />
        <div className="flex items-center gap-2">
          <SearchInput value={query} onChange={setQuery} placeholder={tab === "tags" ? "Search tags…" : "Search fields…"} />
          {tab === "tags" ? (
            <Button onClick={() => setTagOpen(true)} className="h-9 shrink-0 bg-white text-black hover:bg-[#e5e5e5]">
              <Plus className="h-4 w-4" /> New tag
            </Button>
          ) : (
            <Button onClick={() => setFieldOpen(true)} className="h-9 shrink-0 bg-white text-black hover:bg-[#e5e5e5]">
              <Plus className="h-4 w-4" /> New field
            </Button>
          )}
        </div>
      </div>

      {tab === "tags" ? (
        <TableShell>
          <Table>
            <TableHeader>
              <TableRow className="border-[#2a2a2a] bg-[#1a1a1a] hover:bg-[#1a1a1a]">
                <TableHead>Tag</TableHead>
                <TableHead>Contacts tagged</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTags.map((t) => (
                <TableRow key={t.id} className="border-[#2a2a2a]">
                  <TableCell>
                    <span className="inline-flex items-center gap-2 rounded-md border border-[#2a2a2a] bg-[#242424] px-2.5 py-1 text-sm text-[#ededed]">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t.color }} />
                      {t.name}
                    </span>
                  </TableCell>
                  <TableCell className="tabular-nums font-medium text-[#ededed]">{t.contacts.toLocaleString()}</TableCell>
                  <TableCell className="text-right">
                    <RowActions
                      items={[
                        { label: "Rename", icon: Pencil },
                        { label: "Merge into…", icon: Merge },
                        { label: "Delete", icon: Trash2, danger: true, separatorBefore: true, onSelect: () => setTags((p) => p.filter((x) => x.id !== t.id)) },
                      ]}
                    />
                  </TableCell>
                </TableRow>
              ))}
              {filteredTags.length === 0 && (
                <TableRow className="border-[#2a2a2a] hover:bg-transparent">
                  <TableCell colSpan={3} className="py-14 text-center text-sm text-[#737373]">No tags found.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableShell>
      ) : (
        <TableShell>
          <Table>
            <TableHeader>
              <TableRow className="border-[#2a2a2a] bg-[#1a1a1a] hover:bg-[#1a1a1a]">
                <TableHead>Field</TableHead>
                <TableHead>API key</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Completeness</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredFields.map((f) => (
                <TableRow key={f.id} className="border-[#2a2a2a]">
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-[#ededed]">{f.label}</span>
                      {f.required && <Pill tone="amber" className="min-w-0">Required</Pill>}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-[#a3a3a3]">{f.key}</TableCell>
                  <TableCell><Pill tone="blue">{f.type}</Pill></TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[#2a2a2a]">
                        <div className="h-full rounded-full bg-[#ededed]" style={{ width: `${f.filled}%` }} />
                      </div>
                      <span className="text-xs tabular-nums text-[#737373]">{f.filled}%</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <RowActions
                      items={[
                        { label: "Edit field", icon: Pencil },
                        { label: "Delete", icon: Trash2, danger: true, separatorBefore: true, onSelect: () => setFields((p) => p.filter((x) => x.id !== f.id)) },
                      ]}
                    />
                  </TableCell>
                </TableRow>
              ))}
              {filteredFields.length === 0 && (
                <TableRow className="border-[#2a2a2a] hover:bg-transparent">
                  <TableCell colSpan={5} className="py-14 text-center text-sm text-[#737373]">No fields found.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableShell>
      )}

      <CreateTagDialog open={tagOpen} onOpenChange={setTagOpen} onCreate={(t) => setTags((p) => [{ id: Date.now(), ...t }, ...p])} />
      <CreateFieldDialog open={fieldOpen} onOpenChange={setFieldOpen} onCreate={(f) => setFields((p) => [{ id: Date.now(), ...f }, ...p])} />
    </MainScreenWrapper>
  );
}

export default TagsFieldsScreen;
