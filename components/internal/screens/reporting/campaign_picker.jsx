"use client";

import React, { useMemo, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { Badge, Button, Checkbox, Input, Popover, PopoverContent, PopoverTrigger, cn } from "@geiger/ui";
import { formatDate } from "@/lib/reporting/format";
import { channelLabel } from "@/lib/reporting/query";

// Compact multi-select for short option lists (channels, lists): [{ value, label }].
export function OptionPicker({ label, allLabel, options, value, onChange, id, disabled = false }) {
  const selected = new Set(value);
  const toggle = (v) => onChange(selected.has(v) ? value.filter((x) => x !== v) : [...value, v]);
  const summary = value.length === 0 ? allLabel : value.length === 1 ? options.find((o) => o.value === value[0])?.label || "1 selected" : `${value.length} ${label.toLowerCase()}`;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button id={id} variant="outline" disabled={disabled} className="h-9 w-full justify-between rounded-lg border-border bg-surface-card px-3 text-sm font-normal text-foreground hover:bg-surface-subtle">
          <span className="truncate">{summary}</span>
          <ChevronDown className="ml-2 h-3.5 w-3.5 shrink-0 text-text-secondary" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 border-border bg-surface-subtle p-1">
        {options.length ? (
          options.map((o) => (
            <label key={o.value} className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-sm hover:bg-surface-hover">
              <Checkbox checked={selected.has(o.value)} onCheckedChange={() => toggle(o.value)} />
              <span className="min-w-0 truncate text-foreground">{o.label}</span>
            </label>
          ))
        ) : (
          <p className="px-2 py-4 text-center text-sm text-text-secondary">Nothing to choose from yet.</p>
        )}
        {value.length ? (
          <Button variant="ghost" size="sm" className="mt-1 w-full text-xs text-text-secondary" onClick={() => onChange([])}>
            Clear selection
          </Button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

// Multi-select of campaigns with search, capped at `max`; selected ones show as removable chips.
export function CampaignPicker({ campaigns, value, onChange, max = 4, label = "Campaigns", placeholder = "Choose campaigns", disabled = false }) {
  const [query, setQuery] = useState("");
  const selected = useMemo(() => new Set(value), [value]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return campaigns.filter((c) => !q || `${c.name} ${c.subject || ""}`.toLowerCase().includes(q)).slice(0, 60);
  }, [campaigns, query]);
  const byId = useMemo(() => new Map(campaigns.map((c) => [c.id, c])), [campaigns]);

  const toggle = (id) => {
    if (selected.has(id)) onChange(value.filter((x) => x !== id));
    else if (value.length < max) onChange([...value, id]);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" disabled={disabled} className="h-9 rounded-lg border-border bg-surface-card px-3 text-xs font-medium text-foreground hover:bg-surface-subtle">
            {value.length ? `${label} (${value.length}/${max})` : placeholder}
            <ChevronDown className="ml-2 h-3.5 w-3.5 text-text-secondary" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 border-border bg-surface-subtle p-0">
          <div className="border-b border-border p-2">
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search campaigns…" aria-label="Search campaigns" className="h-8" />
          </div>
          <div className="max-h-72 overflow-y-auto p-1">
            {visible.length ? (
              visible.map((c) => {
                const checked = selected.has(c.id);
                const full = !checked && value.length >= max;
                return (
                  <label
                    key={c.id}
                    className={cn(
                      "flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-2 text-sm hover:bg-surface-hover",
                      full && "cursor-not-allowed opacity-50",
                    )}
                  >
                    <Checkbox checked={checked} disabled={full} onCheckedChange={() => toggle(c.id)} className="mt-0.5" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-foreground">{c.name}</span>
                      <span className="block truncate text-xs text-text-secondary">
                        {channelLabel(c.channel)} · {c.sentAt ? `sent ${formatDate(c.sentAt)}` : c.status}
                      </span>
                    </span>
                  </label>
                );
              })
            ) : (
              <p className="px-2 py-6 text-center text-sm text-text-secondary">No campaigns match.</p>
            )}
          </div>
          <p className="border-t border-border px-3 py-2 text-xs text-text-tertiary">Pick up to {max}.</p>
        </PopoverContent>
      </Popover>
      {value.map((id) => (
        <Badge key={id} variant="neutral" className="gap-1 py-1 pl-2 pr-1 text-xs">
          <span className="max-w-[180px] truncate">{byId.get(id)?.name || "Campaign"}</span>
          {disabled ? null : <button
            type="button"
            onClick={() => onChange(value.filter((x) => x !== id))}
            className="rounded p-0.5 text-text-secondary hover:bg-surface-hover hover:text-foreground"
            aria-label={`Remove ${byId.get(id)?.name || "campaign"}`}
          >
            <X className="h-3 w-3" />
          </button>}
        </Badge>
      ))}
    </div>
  );
}
