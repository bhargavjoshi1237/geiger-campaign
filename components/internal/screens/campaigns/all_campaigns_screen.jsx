"use client";

import React, { useMemo, useState } from "react";
import { Plus, Mail, Smartphone, Bell, Copy, Pencil, BarChart3, Pause, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader } from "@/components/internal/shared/screen_header";
import { TableShell, SearchInput, Pill, RowActions, Field } from "@/components/internal/shared/screen_kit";
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

const STATUS_TONE = {
  Draft: "zinc", Scheduled: "blue", Sending: "amber", Sent: "green", Paused: "zinc",
};
const CHANNEL_ICON = { Email: Mail, SMS: Smartphone, Push: Bell };

const INITIAL = [
  { id: 1, name: "Summer Sale — Early Access", description: "Promo broadcast to engaged subscribers", type: "Broadcast", channel: "Email", status: "Sent", recipients: 12400, openRate: 58, date: "Jun 2, 2026" },
  { id: 2, name: "Weekly Digest #42", description: "Recurring newsletter to all opted-in contacts", type: "Broadcast", channel: "Email", status: "Sent", recipients: 18900, openRate: 44, date: "Jun 1, 2026" },
  { id: 3, name: "Flash SMS — 24h only", description: "Time-boxed discount to VIP segment", type: "Broadcast", channel: "SMS", status: "Scheduled", recipients: 940, openRate: 0, date: "Jun 9, 2026" },
  { id: 4, name: "Cart Reminder", description: "Abandoned cart automation — 1h delay", type: "Automated", channel: "Email", status: "Sending", recipients: 6200, openRate: 39, date: "Ongoing" },
  { id: 5, name: "Product Launch Teaser", description: "Pre-announcement for the autumn collection", type: "A/B Test", channel: "Email", status: "Draft", recipients: 9800, openRate: 0, date: "—" },
  { id: 6, name: "Re-engagement push", description: "Win back contacts quiet for 60 days", type: "Automated", channel: "Push", status: "Paused", recipients: 3400, openRate: 21, date: "Paused Jun 3" },
];

const STATUSES = ["All", "Draft", "Scheduled", "Sending", "Sent", "Paused"];
const TYPES = ["All", "Broadcast", "Automated", "A/B Test"];
const LISTS = ["Newsletter", "Product Updates", "VIP Customers", "Webinar Attendees"];

function CreateCampaignDialog({ open, onOpenChange, onCreate }) {
  const [form, setForm] = useState({ name: "", type: "Broadcast", channel: "Email", list: LISTS[0] });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    if (!form.name.trim()) return;
    onCreate({
      name: form.name.trim(),
      description: `New ${form.type.toLowerCase()} to ${form.list}`,
      type: form.type, channel: form.channel, status: "Draft", recipients: 0, openRate: 0, date: "—",
    });
    setForm({ name: "", type: "Broadcast", channel: "Email", list: LISTS[0] });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create campaign</DialogTitle>
          <DialogDescription>Set up the basics — you can design the content in the next step.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4 py-4">
          <Field label="Campaign name" htmlFor="cmp-name">
            <Input id="cmp-name" value={form.name} onChange={(e) => set("name")(e.target.value)} placeholder="e.g. Spring Promo 2026" className="bg-background border-border" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <Select value={form.type} onValueChange={set("type")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Broadcast", "Automated", "A/B Test"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Channel">
              <Select value={form.channel} onValueChange={set("channel")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Email", "SMS", "Push"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Send to" hint="You can refine the audience with segments later.">
            <Select value={form.list} onValueChange={set("list")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {LISTS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-muted-foreground hover:bg-surface-active hover:text-foreground">Cancel</Button>
          <Button onClick={submit} disabled={!form.name.trim()} className="bg-white text-black hover:bg-[#e5e5e5]">Create campaign</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FilterMenu({ label, value, options, onChange, width = "sm:w-40" }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className={cn("h-9 justify-between border-border bg-surface-card text-foreground hover:bg-surface-subtle", width)}>
          {value === "All" ? label : value}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-44 border-border bg-surface-card text-foreground">
        <DropdownMenuLabel className="text-text-secondary">{label}</DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-surface-hover" />
        {options.map((o) => (
          <DropdownMenuItem key={o} onSelect={() => onChange(o)} className={cn("cursor-pointer focus:bg-surface-hover focus:text-foreground", value === o && "text-white")}>
            {o === "All" ? label : o}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AllCampaignsScreen() {
  const [campaigns, setCampaigns] = useState(INITIAL);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All");
  const [type, setType] = useState("All");
  const [createOpen, setCreateOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return campaigns.filter((c) =>
      (status === "All" || c.status === status) &&
      (type === "All" || c.type === type) &&
      (!q || c.name.toLowerCase().includes(q)),
    );
  }, [campaigns, query, status, type]);

  return (
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="All Campaigns"
        description="Every broadcast, automated, and A/B campaign across your channels."
        actions={
          <Button onClick={() => setCreateOpen(true)} className="h-9 bg-white text-black hover:bg-[#e5e5e5]">
            <Plus className="h-4 w-4" /> Create campaign
          </Button>
        }
      />

      <div className="flex flex-col gap-3 border-t border-surface-active pt-4 sm:flex-row sm:items-center">
        <SearchInput value={query} onChange={setQuery} placeholder="Search campaigns…" />
        <FilterMenu label="All statuses" value={status} options={STATUSES} onChange={setStatus} />
        <FilterMenu label="All types" value={type} options={TYPES} onChange={setType} />
      </div>

      <TableShell>
        <Table>
          <TableHeader>
            <TableRow className="border-border bg-surface-subtle hover:bg-surface-subtle">
              <TableHead>Campaign</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Channel</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Recipients</TableHead>
              <TableHead>Open rate</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((c) => {
              const ChannelIcon = CHANNEL_ICON[c.channel] || Mail;
              return (
                <TableRow key={c.id} className="border-border">
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium text-foreground">{c.name}</span>
                      <span className="line-clamp-1 text-xs text-text-secondary">{c.description}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{c.type}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                      <ChannelIcon className="h-3.5 w-3.5" /> {c.channel}
                    </span>
                  </TableCell>
                  <TableCell><Pill tone={STATUS_TONE[c.status]}>{c.status}</Pill></TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{c.recipients ? c.recipients.toLocaleString() : "—"}</TableCell>
                  <TableCell>
                    {c.openRate > 0 ? (
                      <div className="w-[120px] space-y-1.5">
                        <Progress value={c.openRate} className="h-1.5 bg-surface-hover [&_[data-slot=progress-indicator]]:bg-[#ededed]" />
                        <p className="text-xs text-text-secondary">{c.openRate}%</p>
                      </div>
                    ) : <span className="text-text-secondary">—</span>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{c.date}</TableCell>
                  <TableCell className="text-right">
                    <RowActions
                      items={[
                        { label: "Edit", icon: Pencil },
                        { label: "Duplicate", icon: Copy },
                        { label: "View report", icon: BarChart3 },
                        { label: "Pause", icon: Pause },
                        { label: "Delete", icon: Trash2, danger: true, separatorBefore: true, onSelect: () => setCampaigns((p) => p.filter((x) => x.id !== c.id)) },
                      ]}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
            {filtered.length === 0 && (
              <TableRow className="border-border hover:bg-transparent">
                <TableCell colSpan={8} className="py-14 text-center text-sm text-text-secondary">No campaigns match your filters.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableShell>

      <CreateCampaignDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={(c) => setCampaigns((p) => [{ id: Date.now(), ...c }, ...p])} />
    </MainScreenWrapper>
  );
}

export default AllCampaignsScreen;
