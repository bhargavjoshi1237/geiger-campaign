"use client";

import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  SettingRow,
} from "@geiger/ui";

// Shared list + editor helpers for the Channels screens (mirrors geiger-events campaigns.jsx).

export const PRIMARY_BUTTON = "bg-primary text-primary-foreground hover:bg-primary/90";
export const OUTLINE_BUTTON =
  "border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground";

// Delete confirmation, same shape as the campaigns.jsx `deleteTarget` dialog.
export function DeleteConfirmDialog({ target, title, name, description, onCancel, onConfirm }) {
  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Delete <span className="font-medium text-foreground">{name}</span>?{" "}
            {description || "This can't be undone."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button className="bg-red-500/90 text-white hover:bg-red-500" onClick={() => onConfirm(target)}>
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
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

// Local settings draft with a saved snapshot so "Save Changes" is only live when dirty.
export function useSettingsDraft(initial) {
  const [values, setValues] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [saving, setSaving] = useState(false);
  const dirty = useMemo(() => JSON.stringify(values) !== JSON.stringify(saved), [values, saved]);
  const set = (patch) => setValues((v) => ({ ...v, ...patch }));
  const save = () => {
    setSaving(true);
    setTimeout(() => {
      setSaved(values);
      setSaving(false);
      toast.success("Settings saved.");
    }, 300);
  };
  return { values, set, dirty, saving, save };
}

export function SaveChangesButton({ dirty, saving, onClick, label = "Save Changes" }) {
  return (
    <Button className={PRIMARY_BUTTON} disabled={!dirty || saving} onClick={onClick}>
      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {saving ? "Saving…" : label}
    </Button>
  );
}

// Editor draft seeded from the record; dirty until the saved row matches the draft again.
export function useRecordDraft(record, pick) {
  const initial = useMemo(() => pick(record), [record, pick]);
  const [draft, setDraft] = useState(initial);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  return { draft, setDraft, set, dirty };
}

// Read-only label/value row for Performance/Overview sections.
export function ValueRow({ title, description, value }) {
  return (
    <SettingRow
      title={title}
      description={description}
      control={<span className="text-sm tabular-nums text-foreground">{value}</span>}
    />
  );
}
