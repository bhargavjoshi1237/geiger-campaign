"use client";

import React, { useMemo, useState } from "react";
import { Plus, Copy, Trash2 } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader } from "@/components/internal/shared/screen_header";
import { TableShell, SearchInput, RowActions, Field } from "@/components/internal/shared/screen_kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

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
        <DialogBody className="space-y-4 py-4">
          <Field label="Destination URL" htmlFor="utm-url">
            <Input id="utm-url" value={form.url} onChange={(e) => set("url")(e.target.value)} placeholder="https://geiger.app/lp/your-page" className="bg-[#161616] border-[#2a2a2a] font-mono" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Source" hint="e.g. google">
              <Input value={form.source} onChange={(e) => set("source")(e.target.value)} placeholder="google" className="bg-[#161616] border-[#2a2a2a]" />
            </Field>
            <Field label="Medium" hint="e.g. cpc">
              <Input value={form.medium} onChange={(e) => set("medium")(e.target.value)} placeholder="cpc" className="bg-[#161616] border-[#2a2a2a]" />
            </Field>
          </div>
          <Field label="Campaign" htmlFor="utm-campaign">
            <Input id="utm-campaign" value={form.campaign} onChange={(e) => set("campaign")(e.target.value)} placeholder="summer_sale_2026" className="bg-[#161616] border-[#2a2a2a]" />
          </Field>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-[#a3a3a3]">Assembled URL</p>
            <div className="break-all rounded-md border border-[#2a2a2a] bg-[#161616] px-3 py-2 font-mono text-sm text-[#a3a3a3]">{assembled}</div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-[#a3a3a3] hover:bg-[#242424] hover:text-white">Cancel</Button>
          <Button onClick={submit} disabled={!valid} className="bg-white text-black hover:bg-[#e5e5e5]">Create link</Button>
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

  return (
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="Source Tracking"
        description="Attribute signups and revenue to the channels that drove them."
        actions={
          <Button onClick={() => setCreateOpen(true)} className="h-9 bg-white text-black hover:bg-[#e5e5e5]">
            <Plus className="h-4 w-4" /> New tracked link
          </Button>
        }
      />

      <div className="border-t border-[#242424] pt-4">
        <SearchInput value={query} onChange={setQuery} placeholder="Search by source, medium, or campaign…" />
      </div>

      <TableShell>
        <Table>
          <TableHeader>
            <TableRow className="border-[#2a2a2a] bg-[#1a1a1a] hover:bg-[#1a1a1a]">
              <TableHead>Source / Medium</TableHead>
              <TableHead>Campaign</TableHead>
              <TableHead>Visits</TableHead>
              <TableHead>Signups</TableHead>
              <TableHead>Conversion</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((l) => {
              const c = conv(l);
              const link = `${l.url}?utm_source=${encodeURIComponent(l.source)}&utm_medium=${encodeURIComponent(l.medium)}&utm_campaign=${encodeURIComponent(l.campaign)}`;
              return (
                <TableRow key={l.id} className="border-[#2a2a2a]">
                  <TableCell><span className="font-mono text-sm text-[#ededed]">{l.source} / {l.medium}</span></TableCell>
                  <TableCell><span className="font-mono text-xs text-[#a3a3a3]">{l.campaign}</span></TableCell>
                  <TableCell className="tabular-nums text-[#a3a3a3]">{l.visits.toLocaleString()}</TableCell>
                  <TableCell className="tabular-nums text-[#a3a3a3]">{l.signups.toLocaleString()}</TableCell>
                  <TableCell>
                    {c > 0 ? (
                      <div className="w-[120px] space-y-1.5">
                        <Progress value={c} className="h-1.5 bg-[#2a2a2a] [&_[data-slot=progress-indicator]]:bg-[#ededed]" />
                        <p className="text-xs text-[#737373]">{c}%</p>
                      </div>
                    ) : <span className="text-[#737373]">—</span>}
                  </TableCell>
                  <TableCell className="text-right">
                    <RowActions
                      items={[
                        { label: "Copy link", icon: Copy, onSelect: () => { try { navigator.clipboard?.writeText(link); } catch {} } },
                        { label: "Delete", icon: Trash2, danger: true, separatorBefore: true, onSelect: () => setLinks((prev) => prev.filter((x) => x.id !== l.id)) },
                      ]}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
            {filtered.length === 0 && (
              <TableRow className="border-[#2a2a2a] hover:bg-transparent">
                <TableCell colSpan={6} className="py-14 text-center text-sm text-[#737373]">No tracked links match your search.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableShell>

      <UtmBuilderDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={(l) => setLinks((prev) => [{ id: Date.now(), ...l }, ...prev])} />
    </MainScreenWrapper>
  );
}

export default SourceTrackingScreen;
