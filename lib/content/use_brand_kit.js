"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { getBrandKit, saveBrandKit } from "@/lib/supabase/brand_kits";
import { getUser } from "@/lib/supabase/user";
import { BRAND_DEFAULTS } from "./brand";

// Shared editor state for the one brand kit row (Content -> Brand kit, Settings -> Branding): load it,
// track a saved snapshot vs the live form, and persist only the keys this editor owns.

export function useBrandKit(projectId, keys) {
  const [saved, setSaved] = useState(null);
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!projectId) return undefined;
    let cancelled = false;
    getBrandKit(projectId).then((kit) => {
      if (cancelled) return;
      const value = kit ? { ...BRAND_DEFAULTS, ...kit } : { ...BRAND_DEFAULTS };
      setFailed(!kit);
      setSaved(value);
      setForm(value);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const pick = useCallback((value) => Object.fromEntries(keys.map((k) => [k, value?.[k]])), [keys]);
  const dirty = useMemo(() => Boolean(form && saved) && JSON.stringify(pick(form)) !== JSON.stringify(pick(saved)), [form, saved, pick]);

  const set = useCallback((key) => (value) => setForm((f) => ({ ...f, [key]: value })), []);

  const save = useCallback(async () => {
    if (!form || saving) return false;
    setSaving(true);
    const user = await getUser().catch(() => null);
    const result = await saveBrandKit(projectId, pick(form), { createdBy: user?.id ?? null });
    setSaving(false);
    if (!result) {
      toast.error("Couldn't save the brand kit. Check your access and try again.");
      return false;
    }
    const next = { ...BRAND_DEFAULTS, ...result };
    setSaved(next);
    setForm((f) => ({ ...next, ...Object.fromEntries(Object.entries(f).filter(([k]) => !keys.includes(k))) }));
    toast.success("Brand kit saved.");
    return true;
  }, [form, saving, projectId, pick, keys]);

  const reset = useCallback(() => setForm(saved), [saved]);

  return { form, saved, set, setForm, dirty, saving, save, reset, loading, failed };
}
