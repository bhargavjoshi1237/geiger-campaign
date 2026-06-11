"use client";

import React from "react";
import { Search, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Rounded surface that wraps a Table (matches the overview "Top Campaigns" form).
export function TableShell({ className, children }) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-border bg-surface-card",
        className,
      )}
    >
      {children}
    </div>
  );
}

// Search field styled for the dark surface; controlled or uncontrolled.
export function SearchInput({ value, onChange, placeholder = "Search…", className }) {
  return (
    <div className={cn("relative w-full sm:w-72", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        className="h-9 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-text-secondary focus:border-border-strong"
      />
    </div>
  );
}

// Tone presets for status pills, reused across screens.
export const PILL_TONES = {
  green: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  blue: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  amber: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  red: "bg-red-500/15 text-red-300 border-red-500/30",
  violet: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  zinc: "bg-zinc-500/15 text-muted-foreground border-zinc-500/30",
};

export function Pill({ tone = "zinc", className, children }) {
  return (
    <span
      className={cn(
        "inline-flex min-w-[68px] items-center justify-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium",
        PILL_TONES[tone] || PILL_TONES.zinc,
        className,
      )}
    >
      {children}
    </span>
  );
}

// A "⋯" trigger that opens a menu of { label, icon, onSelect, danger, separatorBefore } items.
export function RowActions({ items = [], align = "end" }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:bg-surface-hover hover:text-foreground"
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        className="w-44 border-border bg-surface-card text-foreground"
      >
        {items.map((item, i) => (
          <React.Fragment key={item.label}>
            {item.separatorBefore && (
              <DropdownMenuSeparator className="bg-surface-hover" />
            )}
            <DropdownMenuItem
              onSelect={item.onSelect}
              className={cn(
                "cursor-pointer text-sm focus:bg-surface-hover focus:text-foreground",
                item.danger && "text-red-400 focus:bg-red-500/10 focus:text-red-300",
              )}
            >
              {item.icon && <item.icon className="mr-2 h-4 w-4" />}
              {item.label}
            </DropdownMenuItem>
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Small labelled field wrapper for dialog forms.
export function Field({ label, hint, htmlFor, children, className }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <label
          htmlFor={htmlFor}
          className="text-sm font-medium text-[#e5e5e5]"
        >
          {label}
        </label>
      )}
      {children}
      {hint && <p className="text-xs text-text-secondary">{hint}</p>}
    </div>
  );
}
