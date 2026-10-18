"use client";

import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@geiger/ui";

// Local settings form state: a saved snapshot vs the live form, so Save Changes is enabled only when dirty.
export function useSettingsForm(initial) {
  const [form, setForm] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [saving, setSaving] = useState(false);

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(saved), [form, saved]);

  // Curried updater: set("name")(value).
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));

  // No settings table yet, so a save only commits the snapshot; the short wait keeps the spinner visible.
  const save = async () => {
    const snapshot = form;
    setSaving(true);
    await new Promise((resolve) => setTimeout(resolve, 400));
    setSaved(snapshot);
    setSaving(false);
    toast.success("Settings saved.");
  };

  return { form, set, dirty, saving, save };
}

// The ScreenHeader primary action shared by every settings screen.
export function SaveChangesButton({ dirty, saving, onClick }) {
  return (
    <Button
      className="bg-primary text-primary-foreground hover:bg-primary/90"
      disabled={!dirty || saving}
      onClick={onClick}
    >
      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {saving ? "Saving…" : "Save Changes"}
    </Button>
  );
}
