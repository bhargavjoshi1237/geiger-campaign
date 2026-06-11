"use client";

import React, { useState } from "react";
import { Plus, Building2, Pencil, Handshake, Trash2 } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader } from "@/components/internal/shared/screen_header";
import { TableShell, RowActions, Field } from "@/components/internal/shared/screen_kit";
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

const INDUSTRIES = ["Logistics", "Software", "Finance", "Manufacturing", "Media", "Telecom"];
const SIZES = ["1–10", "11–50", "51–200", "201–500", "501–1000", "1000+"];

const INITIAL_COMPANIES = [
  { id: 1, name: "Northwind Logistics", domain: "northwind.io", industry: "Logistics", size: "201–500", openDeals: 3, owner: "Alex Rivera" },
  { id: 2, name: "Lumen Analytics", domain: "lumen.co", industry: "Software", size: "51–200", openDeals: 2, owner: "Marcus Cole" },
  { id: 3, name: "Kaisho Industries", domain: "kaisho.jp", industry: "Manufacturing", size: "1000+", openDeals: 1, owner: "Hana Sato" },
  { id: 4, name: "Brightmail Co.", domain: "brightmail.com", industry: "Media", size: "11–50", openDeals: 2, owner: "Priya Nair" },
  { id: 5, name: "Crestwood Bank", domain: "crestwood.com", industry: "Finance", size: "501–1000", openDeals: 1, owner: "Priya Nair" },
  { id: 6, name: "Aria Telecom", domain: "ariatel.net", industry: "Telecom", size: "501–1000", openDeals: 4, owner: "Hana Sato" },
];

function AddCompanyDialog({ open, onOpenChange, onCreate }) {
  const [form, setForm] = useState({ name: "", domain: "", industry: INDUSTRIES[0], size: SIZES[2] });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const valid = form.name.trim();

  const submit = () => {
    if (!valid) return;
    onCreate({
      name: form.name.trim(),
      domain: form.domain.trim() || "—",
      industry: form.industry,
      size: form.size,
      openDeals: 0,
      owner: "Alex Rivera",
    });
    setForm({ name: "", domain: "", industry: INDUSTRIES[0], size: SIZES[2] });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add company</DialogTitle>
          <DialogDescription>Create an organization record for your contacts and deals.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4 py-4">
          <Field label="Company name" htmlFor="co-name">
            <Input id="co-name" value={form.name} onChange={(e) => set("name")(e.target.value)} placeholder="Northwind Logistics" className="bg-background border-border" />
          </Field>
          <Field label="Domain" htmlFor="co-domain">
            <Input id="co-domain" value={form.domain} onChange={(e) => set("domain")(e.target.value)} placeholder="northwind.io" className="bg-background border-border" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Industry">
              <Select value={form.industry} onValueChange={set("industry")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INDUSTRIES.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Size">
              <Select value={form.size} onValueChange={set("size")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SIZES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-muted-foreground hover:bg-surface-active hover:text-foreground">Cancel</Button>
          <Button onClick={submit} disabled={!valid} className="bg-white text-black hover:bg-[#e5e5e5]">Add company</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CompaniesScreen() {
  const [companies, setCompanies] = useState(INITIAL_COMPANIES);
  const [addOpen, setAddOpen] = useState(false);

  return (
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="Companies"
        description="The organizations behind your contacts and deals."
        actions={
          <Button onClick={() => setAddOpen(true)} className="h-9 bg-white text-black hover:bg-[#e5e5e5]"><Plus className="h-4 w-4" /> Add company</Button>
        }
      />

      <TableShell className="mt-4">
        <Table>
          <TableHeader>
            <TableRow className="border-border bg-surface-subtle hover:bg-surface-subtle">
              <TableHead>Company</TableHead>
              <TableHead>Industry</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Open deals</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {companies.map((c) => (
              <TableRow key={c.id} className="border-border">
                <TableCell>
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-active text-muted-foreground">
                      <Building2 className="h-4 w-4" />
                    </span>
                    <div className="flex min-w-0 flex-col">
                      <span className="font-medium text-foreground">{c.name}</span>
                      <span className="truncate text-xs text-text-secondary">{c.domain}</span>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">{c.industry}</TableCell>
                <TableCell className="text-muted-foreground">{c.size}</TableCell>
                <TableCell className="tabular-nums text-muted-foreground">{c.openDeals}</TableCell>
                <TableCell className="text-muted-foreground">{c.owner}</TableCell>
                <TableCell className="text-right">
                  <RowActions
                    items={[
                      { label: "Edit company", icon: Pencil },
                      { label: "View deals", icon: Handshake },
                      { label: "Delete", icon: Trash2, danger: true, separatorBefore: true, onSelect: () => setCompanies((p) => p.filter((x) => x.id !== c.id)) },
                    ]}
                  />
                </TableCell>
              </TableRow>
            ))}
            {companies.length === 0 && (
              <TableRow className="border-border hover:bg-transparent">
                <TableCell colSpan={6} className="py-14 text-center text-sm text-text-secondary">No companies found.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableShell>

      <AddCompanyDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreate={(c) => setCompanies((prev) => [{ id: Date.now(), ...c }, ...prev])}
      />
    </MainScreenWrapper>
  );
}

export default CompaniesScreen;
