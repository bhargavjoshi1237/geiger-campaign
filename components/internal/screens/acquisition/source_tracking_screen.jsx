"use client";

import React, { useMemo, useState } from "react";
import { Plus, Copy, Trash2, Link2 } from "lucide-react";
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
  Progress,
  ScreenHeader,
  SearchInput,
  Toolbar,
  DataTable,
  EmptyState,
  ActionMenu,
  Field,
} from "@geiger/ui";

const INITIAL = [
  { id: 1, url: "https://geiger.app/lp/summer-sale", source: "google", medium: "cpc", campaign: "summer_sale_2026", visits: 18420, signups: 1290 },
  { id: 2, url: "https://geiger.app/lp/saas-playbook", source: "newsletter", medium: "email", campaign: "weekly_digest", visits: 9640, signups: 2110 },
  { id: 3, url: "https://geiger.app/lp/q3-webinar", source: "linkedin", medium: "social", campaign: "q3_webinar", visits: 6210, signups: 1840 },
  { id: 4, url: "https://geiger.app/pricing", source: "facebook", medium: "cpc", campaign: "retargeting_jun", visits: 12300, signups: 640 },
  { id: 5, url: "https://geiger.app/lp/beta-waitlist", source: "producthunt", medium: "referral", campaign: "launch_day", visits: 4180, signups: 1320 },
  { id: 6, url: "https://geiger.app/blog/email-deliverability", source: "twitter", medium: "social", campaign: "content_push", visits: 7720, signups: 380 },
  { id: 7, url: "https://geiger.app/lp/black-friday", source: "google", medium: "display", campaign: "bf_teaser", visits: 21400, signups: 1180 },
];

function conv(row) {
  return row.visits ? Math.round((row.signups / row.visits) * 100) : 0;
}

function UtmBuilderDialog({ open, onOpenChange, onCreate }) {
  const [form, setForm] = useState({ url: "", source: "", medium: "", campaign: "" });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const assembled = useMemo(() => {
    const base = form.url.trim() || "https://example.com";
    const params = [
      ["utm_source", form.source.trim()],
      ["utm_medium", form.medium.trim()],
      ["utm_campaign", form.campaign.trim()],
    ].filter(([, v]) => v);
    const query = params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
    return query ? `${base}?${query}` : base;
  }, [form]);

  const valid = form.url.trim() && form.source.trim() && form.medium.trim() && form.campaign.trim();

  const submit = () => {
    if (!valid) return;
    onCreate({
      url: form.url.trim(),
      source: form.source.trim(),
      medium: form.medium.trim(),
      campaign: form.campaign.trim(),
      visits: 0,
      signups: 0,
    });
    setForm({ url: "", source: "", medium: "", campaign: "" });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>New tracked link</DialogTitle>
          <DialogDescription>Build a UTM-tagged URL to attribute signups to the right channel.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <Field label="Destination URL" htmlFor="utm-url">
            <Input id="utm-url" value={form.url} onChange={(e) => set("url")(e.target.value)} placeholder="https://geiger.app/lp/your-page" className="font-mono" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Source" hint="e.g. google">
              <Input value={form.source} onChange={(e) => set("source")(e.target.value)} placeholder="google" />
            </Field>
            <Field label="Medium" hint="e.g. cpc">
              <Input value={form.medium} onChange={(e) => set("medium")(e.target.value)} placeholder="cpc" />
            </Field>
          </div>
          <Field label="Campaign" htmlFor="utm-campaign">
            <Input id="utm-campaign" value={form.campaign} onChange={(e) => set("campaign")(e.target.value)} placeholder="summer_sale_2026" />
          </Field>
          <Field label="Assembled URL">
            <div className="break-all rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-muted-foreground">{assembled}</div>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!valid}>Create link</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SourceTrackingScreen() {
  const [links, setLinks] = useState(INITIAL);
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return links;
    return links.filter((l) =>
      l.source.toLowerCase().includes(q) ||
      l.medium.toLowerCase().includes(q) ||
      l.campaign.toLowerCase().includes(q),
    );
  }, [links, query]);

  const columns = [
    {
      key: "source",
      header: "Source / Medium",
      render: (l) => <span className="font-mono text-sm text-foreground">{l.source} / {l.medium}</span>,
    },
    {
      key: "campaign",
      header: "Campaign",
      render: (l) => <span className="font-mono text-xs text-muted-foreground">{l.campaign}</span>,
    },
    { key: "visits", header: "Visits", className: "tabular-nums text-muted-foreground", render: (l) => l.visits.toLocaleString() },
    { key: "signups", header: "Signups", className: "tabular-nums text-muted-foreground", render: (l) => l.signups.toLocaleString() },
    {
      key: "conversion",
      header: "Conversion",
      render: (l) => {
        const c = conv(l);
        return c > 0 ? (
          <div className="w-[120px] space-y-1.5">
            <Progress value={c} className="h-1.5 bg-surface-hover" />
            <p className="text-xs text-text-secondary">{c}%</p>
          </div>
        ) : <span className="text-text-secondary">—</span>;
      },
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (l) => {
        const link = `${l.url}?utm_source=${encodeURIComponent(l.source)}&utm_medium=${encodeURIComponent(l.medium)}&utm_campaign=${encodeURIComponent(l.campaign)}`;
        return (
          <ActionMenu
            items={[
              { label: "Copy link", icon: Copy, onSelect: () => { try { navigator.clipboard?.writeText(link); } catch {} } },
              { separator: true },
              { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setLinks((prev) => prev.filter((x) => x.id !== l.id)) },
            ]}
          />
        );
      },
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Source Tracking"
        description="Attribute signups and revenue to the channels that drove them."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> New tracked link
          </Button>
        }
      />

      <Toolbar>
        <div />
        <SearchInput value={query} onChange={setQuery} placeholder="Search by source, medium, or campaign…" />
      </Toolbar>

      <DataTable
        columns={columns}
        data={filtered}
        getRowKey={(l) => l.id}
        empty={
          <EmptyState
            icon={Link2}
            title="No tracked links match your search"
            description="Try a different source, medium, or campaign, or build a new tracked link."
            action={
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" /> New tracked link
              </Button>
            }
            className="rounded-xl border border-border bg-surface-subtle"
          />
        }
      />

      <UtmBuilderDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={(l) => setLinks((prev) => [{ id: Date.now(), ...l }, ...prev])} />
    </MainScreenWrapper>
  );
}

export default SourceTrackingScreen;
