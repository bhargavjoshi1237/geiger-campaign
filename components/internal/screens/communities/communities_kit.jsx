"use client";

import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Calendar as CalendarIcon, Check, Copy, Info, Loader2, Trash2 } from "lucide-react";
import {
  Button,
  DatePicker,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  LoadingArea,
  Popover,
  PopoverContent,
  PopoverTrigger,
  cn,
} from "@geiger/ui";
import { listMembers } from "@/lib/supabase/rbac";
import { listCommunityPosts } from "@/lib/supabase/community_posts";
import { listJoinLinks } from "@/lib/supabase/join_links";
import { listMemberSnapshots } from "@/lib/supabase/member_snapshots";

// Shared building blocks for the Communities screens (Telegram, WhatsApp Channels, Instagram broadcasts, groups).

export const PRIMARY_BUTTON = "bg-primary text-primary-foreground hover:bg-primary/90";
export const OUTLINE_BUTTON =
  "border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground";
export const DANGER_BUTTON = "bg-red-500/90 text-white hover:bg-red-500";

export function LoadingBlock({ size = 48, panel = true, label = "Loading" }) {
  return <LoadingArea size={size} panel={panel} label={label} />;
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

// Platform limitations and setup notes: plain, bordered, no colour unless it's a warning.
export function Notice({ title, children, action, tone = "neutral", className }) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border px-4 py-3.5 sm:flex-row sm:items-start sm:justify-between",
        tone === "warning" ? "border-amber-500/20 bg-amber-500/10" : "border-border bg-surface-subtle",
        className,
      )}
    >
      <div className="flex min-w-0 gap-3">
        <Info
          className={cn("mt-0.5 h-4 w-4 shrink-0", tone === "warning" ? "text-amber-600 dark:text-amber-400" : "text-text-tertiary")}
          aria-hidden="true"
        />
        <div className="min-w-0 space-y-0.5">
          {title ? <p className="text-sm font-medium text-foreground">{title}</p> : null}
          <div className="text-sm text-text-secondary">{children}</div>
        </div>
      </div>
      {action ? <div className="shrink-0 sm:pl-4">{action}</div> : null}
    </div>
  );
}

export function ConfirmDialog({ open, title, description, confirmLabel = "Delete", pending, onCancel, onConfirm }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
          <Button className={DANGER_BUTTON} onClick={onConfirm} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export async function copyText(value, message = "Copied to clipboard.") {
  try {
    await navigator.clipboard.writeText(String(value ?? ""));
    toast.success(message);
    return true;
  } catch {
    toast.error("Couldn't copy — select the text and copy it manually.");
    return false;
  }
}

export function CopyButton({ value, label = "Copy", message, size = "sm", className, iconOnly = false }) {
  const [done, setDone] = useState(false);
  const onClick = async (e) => {
    e.stopPropagation();
    if (await copyText(value, message)) {
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    }
  };
  const Icon = done ? Check : Copy;
  if (iconOnly) {
    return (
      <Button type="button" variant="ghost" size="icon-sm" aria-label={label} onClick={onClick} className={cn("text-muted-foreground hover:text-foreground", className)}>
        <Icon className="h-3.5 w-3.5" />
      </Button>
    );
  }
  return (
    <Button type="button" variant="outline" size={size} className={cn(OUTLINE_BUTTON, className)} onClick={onClick}>
      <Icon className="h-3.5 w-3.5" /> {label}
    </Button>
  );
}

// Date (popover calendar) + time (native) editing one "YYYY-MM-DDTHH:mm" local value.
export function DateTimeField({ value, onChange, disabled, id }) {
  const [datePart, timePart] = String(value || "").split("T");
  const selected = datePart ? new Date(`${datePart}T00:00`) : undefined;
  const pad = (n) => String(n).padStart(2, "0");
  const setDate = (d) => {
    if (!d) return;
    onChange(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${timePart || "09:00"}`);
  };
  return (
    <div className="grid grid-cols-[1fr_8rem] gap-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn("w-full justify-start border-border bg-surface-card font-normal", !selected && "text-muted-foreground")}
          >
            <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
            {selected ? format(selected, "PPP") : "Pick a date"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <DatePicker mode="single" selected={selected} onSelect={setDate} disabled={{ before: new Date(new Date().setHours(0, 0, 0, 0)) }} autoFocus />
        </PopoverContent>
      </Popover>
      <Input
        type="time"
        aria-label="Time"
        disabled={disabled || !datePart}
        value={timePart || ""}
        onChange={(e) => datePart && onChange(`${datePart}T${e.target.value || "09:00"}`)}
      />
    </div>
  );
}

// Project roster for assignee pickers: [{ userId, name, email }].
export function useProjectMembers(projectId) {
  const [members, setMembers] = useState([]);
  useEffect(() => {
    if (!projectId) return undefined;
    let alive = true;
    listMembers(projectId).then((rows) => {
      if (alive) setMembers((rows || []).filter((m) => m.status === "active"));
    });
    return () => {
      alive = false;
    };
  }, [projectId]);
  return members;
}

export function memberName(members, userId) {
  if (!userId) return "Unassigned";
  const m = members.find((x) => x.userId === userId);
  return m?.name || m?.email || "Former member";
}

// A stable "now" for render-time comparisons (scheduled vs. past), refreshed every minute.
export function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

// Posts, join links and follower snapshots for one channel, fetched together when its editor opens.
export function useChannelData(projectId, channelId) {
  const [posts, setPosts] = useState([]);
  const [links, setLinks] = useState([]);
  const [snapshots, setSnapshots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!projectId || !channelId) return undefined;
    let alive = true;
    Promise.all([
      listCommunityPosts(projectId, { channelId }),
      listJoinLinks(projectId, { channelId }),
      listMemberSnapshots(projectId, { channelId }),
    ]).then(([p, l, s]) => {
      if (!alive) return;
      if (p === null || l === null || s === null) toast.error("Couldn't load everything for this channel.");
      setPosts(p ?? []);
      setLinks(l ?? []);
      setSnapshots(s ?? []);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [projectId, channelId, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { posts, setPosts, links, setLinks, snapshots, setSnapshots, loading, reload };
}
