"use client";

import React, { useMemo, useState } from "react";
import { Plus, Pencil, Copy, Ban, Trash2, TicketPercent } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import {
  Button,
  DataTable,
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
  EmptyState,
  Input,
  Progress,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  ScreenHeader,
  Toolbar,
  Badge,
  ActionMenu,
  Field,
  cn,
} from "@geiger/ui";

const STATUS_TONE = { Active: "success", Scheduled: "info", Expired: "neutral" };

const TYPE_TONE = { Percentage: "purple", "Fixed amount": "warning", "Free shipping": "info" };
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
        <div className="space-y-4 py-4">
          <Field label="Code" htmlFor="c-code">
            <Input id="c-code" value={form.code} onChange={(e) => set("code")(e.target.value.toUpperCase())} placeholder="SUMMER20" className="border-border font-mono uppercase" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <Select value={form.type} onValueChange={set("type")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Value" hint={form.type === "Free shipping" ? "Not needed for free shipping." : 'e.g. "20" or "15"'}>
              <Input value={form.value} onChange={(e) => set("value")(e.target.value)} disabled={form.type === "Free shipping"} placeholder={form.type === "Percentage" ? "20" : "15"} className="border-border" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Usage limit" htmlFor="c-limit">
              <Input id="c-limit" type="number" min="0" value={form.limit} onChange={(e) => set("limit")(e.target.value)} placeholder="500" className="border-border" />
            </Field>
            <Field label="Expiry" htmlFor="c-expiry">
              <Input id="c-expiry" type="date" value={form.expires} onChange={(e) => set("expires")(e.target.value)} className="border-border" />
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!valid}>Create coupon</Button>
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

  const columns = [
    { key: "code", header: "Code", className: "font-mono font-medium uppercase text-foreground", render: (c) => c.code },
    { key: "type", header: "Type", render: (c) => <Badge variant={TYPE_TONE[c.type]}>{c.type}</Badge> },
    { key: "value", header: "Value", className: "tabular-nums text-muted-foreground", render: (c) => formatValue(c.type, c.value) },
    {
      key: "usage",
      header: "Usage",
      render: (c) => {
        const pct = c.limit > 0 ? Math.min(100, Math.round((c.used / c.limit) * 100)) : 0;
        return (
          <div className="w-[120px] space-y-1.5">
            <p className="text-xs tabular-nums text-muted-foreground">{c.used.toLocaleString()} / {c.limit.toLocaleString()}</p>
            <Progress value={pct} className="h-1.5 bg-surface-hover" />
          </div>
        );
      },
    },
    { key: "expires", header: "Expires", className: "whitespace-nowrap text-muted-foreground", render: (c) => c.expires },
    { key: "status", header: "Status", render: (c) => <Badge variant={STATUS_TONE[c.status]}>{c.status}</Badge> },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (c) => (
        <ActionMenu
          items={[
            { label: "Edit", icon: Pencil },
            { label: "Copy code", icon: Copy },
            { label: "Deactivate", icon: Ban, onSelect: () => deactivate(c.id) },
            { separator: true },
            { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setCoupons((p) => p.filter((x) => x.id !== c.id)) },
          ]}
        />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Coupons"
        description="Create and track discount codes for your campaigns."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> Create coupon
          </Button>
        }
      />

      <Toolbar>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="justify-between bg-surface-card hover:bg-surface-subtle sm:w-40">
                {statusFilter === "All" ? "All statuses" : statusFilter}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-44 bg-surface-card">
              <DropdownMenuLabel className="text-text-secondary">Filter by status</DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-surface-hover" />
              {["All", ...STATUSES].map((s) => (
                <DropdownMenuItem key={s} onSelect={() => setStatusFilter(s)} className={cn("cursor-pointer focus:bg-surface-hover", statusFilter === s && "font-medium")}>
                  {s === "All" ? "All statuses" : s}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </Toolbar>

      <DataTable
        columns={columns}
        data={filtered}
        getRowKey={(c) => c.id}
        empty={
          <EmptyState
            icon={TicketPercent}
            title="No coupons found"
            className="rounded-xl border border-border bg-surface-subtle"
            action={
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" /> Create coupon
              </Button>
            }
          />
        }
      />

      <CreateCouponDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={(c) => setCoupons((p) => [{ id: Date.now(), ...c }, ...p])} />
    </MainScreenWrapper>
  );
}

export default CouponsScreen;
