"use client";

import React, { useMemo, useState } from "react";
import { Check, ChevronDown, ListChecks, Loader2, RefreshCw, Users, X } from "lucide-react";
import {
  Badge,
  Button,
  Field,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SectionCard,
  SettingRow,
  SettingsList,
  cn,
} from "@geiger/ui";
import { formatNumber } from "../constants";

// Multi-select over lists or segments: chips for the picked ones, a searchable checklist in a popover.
export function AudiencePicker({ label, hint, options, value = [], onChange, disabled, emptyText }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = new Set(value);
  const byId = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);
  const filtered = options.filter((o) => !query.trim() || o.name.toLowerCase().includes(query.trim().toLowerCase()));

  const toggle = (id) => onChange(selected.has(id) ? value.filter((v) => v !== id) : [...value, id]);

  return (
    <Field label={label} hint={hint}>
      <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-border bg-surface-card p-1.5">
        {value.map((id) => (
          <Badge key={id} variant="neutral" className="gap-1 pr-1">
            {byId.get(id)?.name || "Removed"}
            {!disabled ? (
              <button type="button" aria-label={`Remove ${byId.get(id)?.name || "item"}`} onClick={() => toggle(id)} className="rounded-sm p-0.5 text-text-tertiary hover:bg-surface-active hover:text-foreground">
                <X className="h-3 w-3" />
              </button>
            ) : null}
          </Badge>
        ))}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="sm" disabled={disabled} className="h-7 px-2 text-xs text-text-secondary hover:bg-surface-active hover:text-foreground">
              {value.length ? "Add" : `Choose ${label.toLowerCase()}`} <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 border-border bg-surface-subtle p-0">
            <div className="border-b border-border p-2">
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" aria-label={`Search ${label.toLowerCase()}`} className="h-8 bg-surface-card" autoFocus />
            </div>
            <div className="max-h-64 overflow-y-auto p-1">
              {filtered.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => toggle(o.id)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none"
                >
                  <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border", selected.has(o.id) ? "border-foreground bg-foreground text-background" : "border-border-strong")}>
                    {selected.has(o.id) ? <Check className="h-3 w-3" /> : null}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{o.name}</span>
                  {o.count != null ? <span className="shrink-0 text-xs tabular-nums text-text-tertiary">{formatNumber(o.count)}</span> : null}
                </button>
              ))}
              {filtered.length === 0 ? <p className="px-2 py-3 text-sm text-text-secondary">{options.length ? "No matches." : emptyText}</p> : null}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </Field>
  );
}

const EXCLUDED_LABELS = [
  ["unsubscribed", "Unsubscribed or bounced"],
  ["suppressed", "On a suppression list"],
  ["noAddress", "No address for this channel"],
  ["noConsent", "No opt-in for this channel"],
];

export function AudienceSection({ audience, setAudience, options, estimate, dirty, readOnly }) {
  const listOptions = options.lists.map((l) => ({ id: l.id, name: l.name }));
  const segmentOptions = options.segments.map((s) => ({ id: s.id, name: s.name, count: s.contactCount ?? s.contact_count ?? null }));
  const a = audience || {};
  const set = (key) => (ids) => setAudience({ ...a, [key]: ids });
  const hasInclude = (a.listIds || []).length + (a.segmentIds || []).length > 0;
  const excluded = estimate.data?.excluded || {};

  return (
    <div className="space-y-6">
      <SectionCard bare title="Send to" description="Contacts in any of these lists or segments receive the campaign.">
        <div className="grid gap-4 sm:grid-cols-2">
          <AudiencePicker label="Lists" options={listOptions} value={a.listIds || []} onChange={set("listIds")} disabled={readOnly} emptyText="No lists yet — create one in Audience → Lists." />
          <AudiencePicker label="Segments" options={segmentOptions} value={a.segmentIds || []} onChange={set("segmentIds")} disabled={readOnly} emptyText="No segments yet — create one in Audience → Segments." />
        </div>
      </SectionCard>

      <SectionCard bare title="Don't send to" description="Contacts in these are removed, even if they're also included above.">
        <div className="grid gap-4 sm:grid-cols-2">
          <AudiencePicker label="Lists" options={listOptions} value={a.excludeListIds || []} onChange={set("excludeListIds")} disabled={readOnly} emptyText="No lists yet." />
          <AudiencePicker label="Segments" options={segmentOptions} value={a.excludeSegmentIds || []} onChange={set("excludeSegmentIds")} disabled={readOnly} emptyText="No segments yet." />
        </div>
      </SectionCard>

      <SectionCard
        title="Recipient estimate"
        description={dirty ? "Save your changes to update the estimate." : "Counted from the saved audience, after unsubscribes, suppressions and consent."}
        action={
          <Button variant="outline" size="sm" className="bg-surface-card" onClick={estimate.refresh} disabled={estimate.loading || !hasInclude}>
            {estimate.loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Refresh
          </Button>
        }
      >
        {!hasInclude ? (
          <p className="flex items-center gap-2 text-sm text-text-secondary">
            <ListChecks className="h-4 w-4 text-text-tertiary" /> Choose at least one list or segment to send to.
          </p>
        ) : estimate.loading ? (
          <p className="flex items-center gap-2 text-sm text-text-secondary">
            <Loader2 className="h-4 w-4 animate-spin" /> Counting recipients…
          </p>
        ) : estimate.error ? (
          <p className="text-sm text-text-secondary">Couldn&apos;t estimate recipients: {estimate.error}</p>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2.5">
              <Users className="h-4 w-4 text-text-tertiary" />
              <span className="text-2xl font-semibold tabular-nums text-foreground">{formatNumber(estimate.data?.recipients)}</span>
              <span className="text-sm text-text-secondary">{estimate.data?.recipients === 1 ? "recipient" : "recipients"}</span>
            </div>
            <SettingsList>
              {EXCLUDED_LABELS.map(([key, label]) => (
                <SettingRow key={key} title={label} description="Excluded from this send" control={<span className="text-sm tabular-nums text-muted-foreground">{formatNumber(excluded[key])}</span>} />
              ))}
            </SettingsList>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

export default AudienceSection;
