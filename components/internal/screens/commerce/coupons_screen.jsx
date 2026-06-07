"use client";

import React, { useMemo, useState } from "react";
import { Plus, Pencil, Copy, Ban, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader } from "@/components/internal/shared/screen_header";
import { TableShell, Pill, RowActions, Field } from "@/components/internal/shared/screen_kit";
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

const STATUS_TONE = { Active: "green", Scheduled: "blue", Expired: "zinc" };

const TYPE_TONE = { Percentage: "violet", "Fixed amount": "amber", "Free shipping": "blue" };
const TYPES = ["Percentage", "Fixed amount", "Free shipping"];
const STATUSES = ["Active", "Scheduled", "Expired"];

const formatValue = (type, value) => {
  if (type === "Free shipping") return "Free";
  if (type === "Fixed amount") return `$${value}`;
  return `${value}%`;
};

const INITIAL = [
  { id: 1, code: "SUMMER20", type: "Percentage", value: "20", used: 142, limit: 500, expires: "Aug 31, 2026", status: "Active" },
  { id: 2, code: "FREESHIP", type: "Free shipping", value: "", used: 980, limit: 2000, expires: "Dec 31, 2026", status: "Active" },
  { id: 3, code: "WELCOME15", type: "Fixed amount", value: "15", used: 312, limit: 1000, expires: "Sep 30, 2026", status: "Active" },
  { id: 4, code: "FLASH50", type: "Percentage", value: "50", used: 0, limit: 200, expires: "Jul 1, 2026", status: "Scheduled" },
  { id: 5, code: "VIP25", type: "Percentage", value: "25", used: 88, limit: 150, expires: "Jul 15, 2026", status: "Active" },
  { id: 6, code: "SPRING10", type: "Fixed amount", value: "10", used: 640, limit: 640, expires: "May 31, 2026", status: "Expired" },
  { id: 7, code: "BLACKFRI", type: "Percentage", value: "30", used: 0, limit: 5000, expires: "Nov 28, 2026", status: "Scheduled" },
];

function CreateCouponDialog({ open, onOpenChange, onCreate }) {
  const [form, setForm] = useState({ code: "", type: "Percentage", value: "", limit: "", expires: "" });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const valid = form.code.trim();

  const submit = () => {
    if (!valid) return;
    onCreate({
      code: form.code.trim().toUpperCase(),
      type: form.type,
      value: form.type === "Free shipping" ? "" : form.value.trim(),
      used: 0,
      limit: parseInt(form.limit, 10) || 0,
      expires: form.expires || "—",
      status: "Scheduled",
    });
    setForm({ code: "", type: "Percentage", value: "", limit: "", expires: "" });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create coupon</DialogTitle>
          <DialogDescription>Discount codes go live on their start date and track usage automatically.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4 py-4">
          <Field label="Code" htmlFor="c-code">
            <Input id="c-code" value={form.code} onChange={(e) => set("code")(e.target.value.toUpperCase())} placeholder="SUMMER20" className="bg-[#161616] border-[#2a2a2a] font-mono uppercase" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <Select value={form.type} onValueChange={set("type")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Value" hint={form.type === "Free shipping" ? "Not needed for free shipping." : 'e.g. "20" or "15"'}>
              <Input value={form.value} onChange={(e) => set("value")(e.target.value)} disabled={form.type === "Free shipping"} placeholder={form.type === "Percentage" ? "20" : "15"} className="bg-[#161616] border-[#2a2a2a] disabled:opacity-50" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Usage limit" htmlFor="c-limit">
              <Input id="c-limit" type="number" min="0" value={form.limit} onChange={(e) => set("limit")(e.target.value)} placeholder="500" className="bg-[#161616] border-[#2a2a2a]" />
            </Field>
            <Field label="Expiry" htmlFor="c-expiry">
              <Input id="c-expiry" type="date" value={form.expires} onChange={(e) => set("expires")(e.target.value)} className="bg-[#161616] border-[#2a2a2a]" />
            </Field>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-[#a3a3a3] hover:bg-[#242424] hover:text-white">Cancel</Button>
          <Button onClick={submit} disabled={!valid} className="bg-white text-black hover:bg-[#e5e5e5]">Create coupon</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CouponsScreen() {
  const [coupons, setCoupons] = useState(INITIAL);
  const [statusFilter, setStatusFilter] = useState("All");
  const [createOpen, setCreateOpen] = useState(false);

  const filtered = useMemo(
    () => coupons.filter((c) => statusFilter === "All" || c.status === statusFilter),
    [coupons, statusFilter],
  );

  const deactivate = (id) =>
    setCoupons((p) => p.map((c) => (c.id === id ? { ...c, status: "Expired" } : c)));

  return (
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="Coupons"
        description="Create and track discount codes for your campaigns."
        actions={
          <Button onClick={() => setCreateOpen(true)} className="h-9 bg-white text-black hover:bg-[#e5e5e5]">
            <Plus className="h-4 w-4" /> Create coupon
          </Button>
        }
      />

      <div className="flex flex-col gap-3 border-t border-[#242424] pt-4 sm:flex-row sm:items-center">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="h-9 justify-between border-[#2a2a2a] bg-[#202020] text-[#ededed] hover:bg-[#1a1a1a] sm:w-40">
              {statusFilter === "All" ? "All statuses" : statusFilter}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-44 border-[#2a2a2a] bg-[#202020] text-[#ededed]">
            <DropdownMenuLabel className="text-[#737373]">Filter by status</DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-[#2a2a2a]" />
            {["All", ...STATUSES].map((s) => (
              <DropdownMenuItem key={s} onSelect={() => setStatusFilter(s)} className={cn("cursor-pointer focus:bg-[#2a2a2a] focus:text-white", statusFilter === s && "text-white")}>
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
              <TableHead>Code</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Value</TableHead>
              <TableHead>Usage</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((c) => {
              const pct = c.limit > 0 ? Math.min(100, Math.round((c.used / c.limit) * 100)) : 0;
              return (
                <TableRow key={c.id} className="border-[#2a2a2a]">
                  <TableCell className="font-mono font-medium uppercase text-[#ededed]">{c.code}</TableCell>
                  <TableCell><Pill tone={TYPE_TONE[c.type]}>{c.type}</Pill></TableCell>
                  <TableCell className="tabular-nums text-[#a3a3a3]">{formatValue(c.type, c.value)}</TableCell>
                  <TableCell>
                    <div className="w-[120px] space-y-1.5">
                      <p className="text-xs tabular-nums text-[#a3a3a3]">{c.used.toLocaleString()} / {c.limit.toLocaleString()}</p>
                      <Progress value={pct} className="h-1.5 bg-[#2a2a2a] [&_[data-slot=progress-indicator]]:bg-[#ededed]" />
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-[#a3a3a3]">{c.expires}</TableCell>
                  <TableCell><Pill tone={STATUS_TONE[c.status]}>{c.status}</Pill></TableCell>
                  <TableCell className="text-right">
                    <RowActions
                      items={[
                        { label: "Edit", icon: Pencil },
                        { label: "Copy code", icon: Copy },
                        { label: "Deactivate", icon: Ban, onSelect: () => deactivate(c.id) },
                        { label: "Delete", icon: Trash2, danger: true, separatorBefore: true, onSelect: () => setCoupons((p) => p.filter((x) => x.id !== c.id)) },
                      ]}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
            {filtered.length === 0 && (
              <TableRow className="border-[#2a2a2a] hover:bg-transparent">
                <TableCell colSpan={7} className="py-14 text-center text-sm text-[#737373]">No coupons found.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableShell>

      <CreateCouponDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={(c) => setCoupons((p) => [{ id: Date.now(), ...c }, ...p])} />
    </MainScreenWrapper>
  );
}

export default CouponsScreen;
