"use client";

import React, { useMemo, useState } from "react";
import { Plus, Mail, Smartphone, Bell, Copy, Pencil, BarChart3, Pause, Trash2, Megaphone } from "lucide-react";
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
  Progress,
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

const STATUS_TONE = {
  Draft: "neutral", Scheduled: "info", Sending: "warning", Sent: "success", Paused: "neutral",
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
        <div className="space-y-4 py-4">
          <Field label="Campaign name" htmlFor="cmp-name">
            <Input id="cmp-name" value={form.name} onChange={(e) => set("name")(e.target.value)} placeholder="e.g. Spring Promo 2026" className="border-border" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <Select value={form.type} onValueChange={set("type")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Broadcast", "Automated", "A/B Test"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Channel">
              <Select value={form.channel} onValueChange={set("channel")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Email", "SMS", "Push"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Send to" hint="You can refine the audience with segments later.">
            <Select value={form.list} onValueChange={set("list")}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {LISTS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!form.name.trim()}>Create campaign</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FilterMenu({ label, value, options, onChange, width = "sm:w-40" }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className={cn("h-9 justify-between bg-surface-card", width)}>
          {value === "All" ? label : value}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-44">
        <DropdownMenuLabel className="text-text-secondary">{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.map((o) => (
          <DropdownMenuItem key={o} onSelect={() => onChange(o)} className={cn("cursor-pointer", value === o && "font-medium")}>
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

  const columns = [
    {
      key: "campaign",
      header: "Campaign",
      render: (c) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-foreground">{c.name}</span>
          <span className="line-clamp-1 text-xs text-text-secondary">{c.description}</span>
        </div>
      ),
    },
    { key: "type", header: "Type", className: "text-muted-foreground", render: (c) => c.type },
    {
      key: "channel",
      header: "Channel",
      render: (c) => {
        const ChannelIcon = CHANNEL_ICON[c.channel] || Mail;
        return (
          <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <ChannelIcon className="h-3.5 w-3.5" /> {c.channel}
          </span>
        );
      },
    },
    { key: "status", header: "Status", render: (c) => <Badge variant={STATUS_TONE[c.status]}>{c.status}</Badge> },
    { key: "recipients", header: "Recipients", className: "tabular-nums text-muted-foreground", render: (c) => (c.recipients ? c.recipients.toLocaleString() : "—") },
    {
      key: "openRate",
      header: "Open rate",
      render: (c) =>
        c.openRate > 0 ? (
          <div className="w-[120px] space-y-1.5">
            <Progress value={c.openRate} className="h-1.5" />
            <p className="text-xs text-text-secondary">{c.openRate}%</p>
          </div>
        ) : <span className="text-text-secondary">—</span>,
    },
    { key: "date", header: "Date", className: "whitespace-nowrap text-muted-foreground", render: (c) => c.date },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (c) => (
        <ActionMenu
          items={[
            { label: "Edit", icon: Pencil },
            { label: "Duplicate", icon: Copy },
            { label: "View report", icon: BarChart3 },
            { label: "Pause", icon: Pause },
            { separator: true },
            { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setCampaigns((p) => p.filter((x) => x.id !== c.id)) },
          ]}
        />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="All Campaigns"
        description="Every broadcast, automated, and A/B campaign across your channels."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> Create campaign
          </Button>
        }
      />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterMenu label="All statuses" value={status} options={STATUSES} onChange={setStatus} />
          <FilterMenu label="All types" value={type} options={TYPES} onChange={setType} />
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search campaigns…" />
      </Toolbar>

      <DataTable
        columns={columns}
        data={filtered}
        getRowKey={(c) => c.id}
        empty={
          <EmptyState
            icon={Megaphone}
            title="No campaigns found"
            description="No campaigns match your filters."
            className="rounded-xl border border-border bg-surface-subtle"
            action={
              <Button variant="outline" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" /> Create campaign
              </Button>
            }
          />
        }
      />

      <CreateCampaignDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={(c) => setCampaigns((p) => [{ id: Date.now(), ...c }, ...p])} />
    </MainScreenWrapper>
  );
}

export default AllCampaignsScreen;
