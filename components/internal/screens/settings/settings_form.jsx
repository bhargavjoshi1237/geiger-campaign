"use client";

import React, { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@geiger/ui";

// Settings form state: a saved snapshot vs the live form, so Save Changes is enabled only when dirty.
// onSave(form) persists it and returns true, an error message to show, or false; `reset(values)` loads
// fetched values as the new saved snapshot. Without onSave the save only commits the local snapshot.
export function useSettingsForm(initial, { onSave } = {}) {
  const [form, setForm] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [saving, setSaving] = useState(false);

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(saved), [form, saved]);

  // Curried updater: set("name")(value).
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));

  const reset = useCallback((values) => {
    setForm(values);
    setSaved(values);
  }, []);

  const save = async () => {
    const snapshot = form;
    if (!onSave) {
      setSaving(true);
      await new Promise((resolve) => setTimeout(resolve, 400));
      setSaved(snapshot);
      setSaving(false);
      toast.success("Settings saved.");
      return;
    }
    setSaving(true);
    const result = await onSave(snapshot);
    setSaving(false);
    if (result === true) {
      setSaved(snapshot);
      toast.success("Settings saved.");
    } else {
      toast.error(typeof result === "string" ? result : "Couldn't save settings.");
    }
  };

  return { form, set, setForm, dirty, saving, save, reset };
}

// The ScreenHeader primary action shared by every settings screen.
export function SaveChangesButton({ dirty, saving, onClick, disabled = false }) {
  return (
    <Button
      className="bg-primary text-primary-foreground hover:bg-primary/90"
      disabled={!dirty || saving || disabled}
      onClick={onClick}
    >
      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {saving ? "Saving…" : "Save Changes"}
    </Button>
  );
}
