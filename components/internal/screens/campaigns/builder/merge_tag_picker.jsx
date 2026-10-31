"use client";

import React, { useMemo, useRef, useState } from "react";
import { Braces } from "lucide-react";
import { Button, Input, Popover, PopoverContent, PopoverTrigger, Textarea, cn } from "@geiger/ui";
import { formatMergeTag } from "@/lib/email/merge_tags";

// Field picker that inserts {{key}} / {{key|fallback}} tokens; groups come from mergeTagGroups().
export function MergeTagPicker({ groups = [], onInsert, disabled, label = "Insert merge tag", align = "end" }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [fallback, setFallback] = useState("");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return groups
      .map((g) => ({ ...g, fields: g.fields.filter((f) => !q || `${f.key} ${f.label}`.toLowerCase().includes(q)) }))
      .filter((g) => g.fields.length);
  }, [groups, query]);

  const pick = (key) => {
    onInsert?.(formatMergeTag(key, fallback));
    setOpen(false);
    setQuery("");
    setFallback("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={disabled}
          aria-label={label}
          className="size-7 text-text-secondary hover:bg-surface-active hover:text-foreground"
        >
          <Braces className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align={align} className="w-72 border-border bg-surface-subtle p-0">
        <div className="border-b border-border p-2">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search fields…" aria-label="Search merge fields" className="h-8 bg-surface-card" autoFocus />
        </div>
        <div className="max-h-64 overflow-y-auto p-1">
          {visible.map((g) => (
            <div key={g.group} className="py-1">
              <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">{g.group}</p>
              {g.fields.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => pick(f.key)}
                  className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-sm text-foreground hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none"
                >
                  <span className="truncate">{f.label}</span>
                  <code className="shrink-0 font-mono text-[11px] text-text-tertiary">{f.key}</code>
                </button>
              ))}
            </div>
          ))}
          {visible.length === 0 ? <p className="px-2 py-3 text-sm text-text-secondary">No fields match “{query}”.</p> : null}
        </div>
        <div className="border-t border-border p-2">
          <Input
            value={fallback}
            onChange={(e) => setFallback(e.target.value)}
            placeholder="Fallback when empty (optional)"
            aria-label="Fallback value"
            className="h-8 bg-surface-card"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Input or textarea with a merge-tag picker that inserts at the cursor, plus an optional character counter.
export function MergeTextField({
  id,
  label,
  hint,
  value,
  onChange,
  groups,
  multiline = false,
  rows = 4,
  placeholder,
  disabled,
  limit,
  className,
  inputClassName,
}) {
  const ref = useRef(null);
  const text = value ?? "";

  const insert = (token) => {
    const el = ref.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    onChange(text.slice(0, start) + token + text.slice(end));
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const over = limit && text.length > limit;
  const Control = multiline ? Textarea : Input;

  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      <div className="flex min-h-7 items-center justify-between gap-2">
        {label ? (
          <label htmlFor={id} className="text-sm font-medium text-muted-foreground">
            {label}
          </label>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-1.5">
          {limit ? (
            <span className={cn("text-xs tabular-nums", over ? "text-amber-600 dark:text-amber-400" : "text-text-tertiary")}>
              {text.length}/{limit}
            </span>
          ) : null}
          {groups?.length ? <MergeTagPicker groups={groups} onInsert={insert} disabled={disabled} /> : null}
        </div>
      </div>
      <Control
        ref={ref}
        id={id}
        value={text}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        rows={multiline ? rows : undefined}
        className={inputClassName}
      />
      {hint ? <p className="text-xs text-text-secondary">{hint}</p> : null}
    </div>
  );
}

export default MergeTagPicker;
