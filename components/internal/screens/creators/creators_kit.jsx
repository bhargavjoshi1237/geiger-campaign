"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  LoadingArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingRow,
  cn,
} from "@geiger/ui";
import { useCan } from "@/context/rbac-context";
import { listCreators, primaryHandle } from "@/lib/supabase/creators";
import { initials } from "./constants";

// Shared pieces for the Creators screens (list states, creator cells/pickers, notices, permissions).

export const OUTLINE_BUTTON =
  "border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground";
export const DANGER_BUTTON = "bg-red-500/90 text-white hover:bg-red-500";

export const CREATOR_WRITE_KEY = "campaign.creator.manage";

export function useCanManageCreators() {
  return useCan(CREATOR_WRITE_KEY);
}

// The project's creators for names and pickers on screens that list other entities.
export function useCreatorDirectory(projectId) {
  const [creators, setCreators] = useState([]);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    const rows = await listCreators(projectId);
    setCreators(rows ?? []);
    setLoading(false);
    return rows;
  }, [projectId]);
  useEffect(() => {
    let alive = true;
    listCreators(projectId).then((rows) => {
      if (!alive) return;
      setCreators(rows ?? []);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [projectId]);
  const byId = useMemo(() => new Map(creators.map((c) => [c.id, c])), [creators]);
  return { creators, byId, loading, reload, setCreators };
}

export function LoadingPanel({ label = "Loading", size = 48 }) {
  return <LoadingArea panel size={size} label={label} />;
}

// First-run vs filtered-empty state; filtered offers "Clear filters", first-run the create action.
export function ListEmptyState({ icon, filtersActive, title, description, onClear, action }) {
  return (
    <div className="rounded-xl border border-border bg-surface-subtle">
      <EmptyState
        icon={icon}
        title={filtersActive ? "No matches" : title}
        description={filtersActive ? "Try a different search or filter." : description}
        action={
          filtersActive ? (
            <Button variant="outline" className={OUTLINE_BUTTON} onClick={onClear}>
              Clear filters
            </Button>
          ) : (
            action
          )
        }
      />
    </div>
  );
}

export function DeleteConfirmDialog({ target, title, name, description, onCancel, onConfirm, confirmLabel = "Delete" }) {
  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {confirmLabel} <span className="font-medium text-foreground">{name}</span>? {description || "This can't be undone."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button className={DANGER_BUTTON} onClick={() => onConfirm(target)}>
            <Trash2 className="h-4 w-4" /> {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CreatorAvatar({ creator, size = "default", className }) {
  return (
    <Avatar size={size} className={cn("border border-border", className)}>
      {creator?.avatarUrl ? <AvatarImage src={creator.avatarUrl} alt="" /> : null}
      <AvatarFallback className="bg-surface-active text-[11px] font-medium text-muted-foreground">
        {initials(creator?.name)}
      </AvatarFallback>
    </Avatar>
  );
}

export function handleLabel(creator) {
  const primary = primaryHandle(creator);
  return primary ? `@${primary.handle}` : creator?.email || "";
}

// Avatar + name + handle (or a custom meta line).
export function CreatorCell({ creator, meta, fallback = "Unknown creator" }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <CreatorAvatar creator={creator} />
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-medium text-foreground">{creator?.name || fallback}</span>
        <span className="truncate text-xs text-text-secondary">{meta ?? handleLabel(creator)}</span>
      </div>
    </div>
  );
}

export function CreatorPicker({ creators, value, onChange, placeholder = "Choose a creator", id, allowNone = false, disabled }) {
  return (
    <Select value={value || (allowNone ? "none" : "")} onValueChange={(v) => onChange(v === "none" ? null : v)} disabled={disabled}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {allowNone ? <SelectItem value="none">No creator</SelectItem> : null}
        {creators.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.name}
            {handleLabel(c) ? <span className="ml-1 text-text-tertiary">{handleLabel(c)}</span> : null}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// A bordered inline notice for gated or honest states: what's missing and the one action to fix it.
export function Notice({ icon: Icon, title, children, action, className }) {
  return (
    <div className={cn("flex flex-col gap-3 rounded-xl border border-border bg-surface-subtle p-4 sm:flex-row sm:items-start sm:justify-between", className)}>
      <div className="flex min-w-0 items-start gap-3">
        {Icon ? <Icon className="mt-0.5 h-4 w-4 shrink-0 text-text-secondary" /> : null}
        <div className="min-w-0 space-y-0.5">
          {title ? <p className="text-sm font-medium text-foreground">{title}</p> : null}
          {children ? <div className="text-sm text-text-secondary">{children}</div> : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

// Read-only label/value row for overview sections.
export function ValueRow({ title, description, value }) {
  return (
    <SettingRow
      title={title}
      description={description}
      control={<span className="text-sm tabular-nums text-foreground">{value}</span>}
    />
  );
}

// Downloads a same-origin route response (CSV export) as a file; returns false on failure.
export async function downloadFrom(path, filename) {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH || ""}${path}`, { credentials: "same-origin" });
    if (!res.ok) return false;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return true;
  } catch (e) {
    console.error("[creators.download]", e);
    return false;
  }
}
