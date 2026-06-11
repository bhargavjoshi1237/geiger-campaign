"use client";

import React, { useState } from "react";
import { Plus, Braces, SplitSquareVertical, Pencil, Copy, Trash2 } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader } from "@/components/internal/shared/screen_header";
import { SegmentedTabs } from "@/components/internal/shared/segmented_tabs";
import { TableShell, SearchInput, Pill, RowActions, Field } from "@/components/internal/shared/screen_kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

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
        <DialogBody className="space-y-4 py-4">
          <Field label="Source field">
            <Select value={form.source} onValueChange={(v) => setForm((f) => ({ ...f, source: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{SOURCE_FIELDS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Token" hint="Use this in content to insert the value.">
            <div className="rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-muted-foreground">{`{{ ${token} }}`}</div>
          </Field>
          <Field label="Fallback value" htmlFor="p-fallback" hint="Shown when a contact has no value for this field.">
            <Input id="p-fallback" value={form.fallback} onChange={(e) => setForm((f) => ({ ...f, fallback: e.target.value }))} placeholder="e.g. there" className="bg-background border-border" />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-muted-foreground hover:bg-surface-active hover:text-foreground">Cancel</Button>
          <Button onClick={submit} className="bg-white text-black hover:bg-[#e5e5e5]">Create tag</Button>
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

  return (
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="Personalization"
        description="Merge tags and conditional content that tailor every message to the recipient."
      />

      <div className="flex flex-col gap-3 border-t border-surface-active pt-4 sm:flex-row sm:items-center sm:justify-between">
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
            <Button onClick={() => setTokenOpen(true)} className="h-9 shrink-0 bg-white text-black hover:bg-[#e5e5e5]"><Plus className="h-4 w-4" /> New tag</Button>
          ) : (
            <Button className="h-9 shrink-0 bg-white text-black hover:bg-[#e5e5e5]"><Plus className="h-4 w-4" /> New rule</Button>
          )}
        </div>
      </div>

      {tab === "tags" ? (
        <TableShell>
          <Table>
            <TableHeader>
              <TableRow className="border-border bg-surface-subtle hover:bg-surface-subtle">
                <TableHead>Token</TableHead>
                <TableHead>Source field</TableHead>
                <TableHead>Fallback</TableHead>
                <TableHead>Sample</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fTags.map((t) => (
                <TableRow key={t.id} className="border-border">
                  <TableCell className="font-mono text-xs text-foreground">{`{{ ${t.token} }}`}</TableCell>
                  <TableCell className="text-muted-foreground">{t.source}</TableCell>
                  <TableCell className="text-muted-foreground">{t.fallback}</TableCell>
                  <TableCell className="text-muted-foreground">{t.sample}</TableCell>
                  <TableCell className="text-right">
                    <RowActions items={[
                      { label: "Edit", icon: Pencil },
                      { label: "Copy token", icon: Copy },
                      { label: "Delete", icon: Trash2, danger: true, separatorBefore: true, onSelect: () => setTags((p) => p.filter((x) => x.id !== t.id)) },
                    ]} />
                  </TableCell>
                </TableRow>
              ))}
              {fTags.length === 0 && (
                <TableRow className="border-border hover:bg-transparent"><TableCell colSpan={5} className="py-14 text-center text-sm text-text-secondary">No merge tags found.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TableShell>
      ) : (
        <TableShell>
          <Table>
            <TableHeader>
              <TableRow className="border-border bg-surface-subtle hover:bg-surface-subtle">
                <TableHead>Rule</TableHead>
                <TableHead>Condition</TableHead>
                <TableHead>Variants</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fRules.map((r) => (
                <TableRow key={r.id} className="border-border">
                  <TableCell className="font-medium text-foreground">{r.name}</TableCell>
                  <TableCell className="text-muted-foreground">{r.condition}</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{r.variants}</TableCell>
                  <TableCell><Pill tone={r.status === "Active" ? "green" : "zinc"}>{r.status}</Pill></TableCell>
                  <TableCell className="text-right">
                    <RowActions items={[
                      { label: "Edit rule", icon: Pencil },
                      { label: "Duplicate", icon: Copy },
                      { label: "Delete", icon: Trash2, danger: true, separatorBefore: true, onSelect: () => setRules((p) => p.filter((x) => x.id !== r.id)) },
                    ]} />
                  </TableCell>
                </TableRow>
              ))}
              {fRules.length === 0 && (
                <TableRow className="border-border hover:bg-transparent"><TableCell colSpan={5} className="py-14 text-center text-sm text-text-secondary">No dynamic content rules found.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TableShell>
      )}

      <AddTokenDialog open={tokenOpen} onOpenChange={setTokenOpen} onCreate={(t) => setTags((p) => [{ id: Date.now(), ...t }, ...p])} />
    </MainScreenWrapper>
  );
}

export default PersonalizationScreen;
