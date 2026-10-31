"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Film, Image as ImageIcon, KeyRound, Link2, Loader2, Plug, Trash2 } from "lucide-react";
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Field,
  Input,
  LogoLoading,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@geiger/ui";
import { useProject } from "@/context/project-context";
import { useCan } from "@/context/rbac-context";
import { apiGet, apiPost } from "@/lib/api/client";
import { listAdAccounts, normalizeAdAccount } from "@/lib/supabase/ad_accounts";

// Shared pieces for the Ads screens: ad-account loading + connect flows, the honest disconnected state,
// list empty/delete/loading states. Mirrors channels_kit so every Ads screen reads the same.

export const PRIMARY_BUTTON = "bg-primary text-primary-foreground hover:bg-primary/90";
export const OUTLINE_BUTTON =
  "border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground";
export const ADS_MANAGE = "campaign.ads.manage";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

export const adsPath = (projectId, suffix = "") => `/api/projects/${projectId}/ads${suffix}`;

// Writes need campaign.ads.manage; screens disable controls (with the reason) when it's missing.
export function useAdsManage() {
  return useCan(ADS_MANAGE);
}

export const NO_PERMISSION = "Your role can't manage ads.";

// A timestamp fixed at mount so relative times render purely.
export function useNow() {
  const [now] = useState(() => Date.now());
  return now;
}

// Multi-select as a bordered checkbox list (lists, campaigns, ads…).
export function CheckboxList({ options, value = [], onChange, empty = "Nothing to choose from yet.", disabled, className = "max-h-56" }) {
  const selected = new Set(value);
  const toggle = (id, on) => onChange(on ? [...new Set([...value, id])] : value.filter((v) => v !== id));
  if (!options.length) return <p className="rounded-lg border border-border bg-surface-card px-3 py-2.5 text-sm text-text-secondary">{empty}</p>;
  return (
    <div className={`space-y-0.5 overflow-y-auto rounded-lg border border-border bg-surface-card p-1.5 ${className}`}>
      {options.map((o) => (
        <label key={o.value} className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-foreground hover:bg-surface-hover">
          <Checkbox checked={selected.has(o.value)} onCheckedChange={(v) => toggle(o.value, v === true)} disabled={disabled} />
          <span className="min-w-0 flex-1 truncate">{o.label}</span>
          {o.meta ? <span className="shrink-0 text-xs text-text-tertiary">{o.meta}</span> : null}
        </label>
      ))}
    </div>
  );
}

export async function copyText(value, label = "Copied") {
  try {
    await navigator.clipboard.writeText(String(value ?? ""));
    toast.success(`${label}.`);
  } catch {
    toast.error("Couldn't copy to the clipboard.");
  }
}

// Comma-separated text <-> clean string array.
export const splitList = (text) => String(text || "").split(",").map((s) => s.trim()).filter(Boolean);

// Ad accounts for the project plus whether the Meta app is configured for OAuth on this deployment.
export function useAdAccounts() {
  const { projectId } = useProject();
  const [accounts, setAccounts] = useState([]);
  const [status, setStatus] = useState({ oauth: false, admin: false });
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!projectId) return [];
    const [rows, res] = await Promise.all([listAdAccounts(projectId), apiGet(adsPath(projectId, "/status"))]);
    setAccounts(rows ?? []);
    if (res.ok && res.data) setStatus(res.data);
    setLoading(false);
    return rows ?? [];
  }, [projectId]);

  useEffect(() => {
    let alive = true;
    Promise.all([listAdAccounts(projectId), apiGet(adsPath(projectId, "/status"))]).then(([rows, res]) => {
      if (!alive) return;
      setAccounts(rows ?? []);
      if (res.ok && res.data) setStatus(res.data);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const connected = useMemo(() => accounts.filter((a) => a.status === "connected"), [accounts]);
  return { projectId, accounts, connected, status, loading, reload, setAccounts };
}

// Full-page navigation into Meta's OAuth dialog (the callback lands back on Ad Campaigns).
export function startMetaConnect(projectId) {
  if (typeof window !== "undefined") window.location.assign(`${BASE_PATH}${adsPath(projectId, "/connect")}`);
}

const VIDEO_URL = /\.(mp4|mov|webm|m4v)(\?|$)/i;

// Square media preview (background image so remote hosts need no image config); video shows an icon.
export function MediaThumb({ url, label = "Media preview", className = "h-10 w-10" }) {
  const image = url && !VIDEO_URL.test(url) ? url : "";
  return image ? (
    <span role="img" aria-label={label} className={`block shrink-0 rounded-lg border border-border bg-surface-active bg-cover bg-center ${className}`} style={{ backgroundImage: `url("${image.replace(/"/g, "%22")}")` }} />
  ) : (
    <span className={`flex shrink-0 items-center justify-center rounded-lg border border-border bg-surface-active text-muted-foreground ${className}`}>
      {url ? <Film className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
    </span>
  );
}

export function LoadingPanel({ size = 48, label = "Loading" }) {
  return (
    <div className="flex items-center justify-center rounded-xl border border-border bg-surface-subtle px-6 py-16">
      <LogoLoading size={size} aria-label={label} />
    </div>
  );
}

// System-user token connect: for businesses that manage ads through Business Manager system users.
export function ManualConnectDialog({ open, onOpenChange, onConnected }) {
  const { projectId } = useProject();
  const [form, setForm] = useState({ accessToken: "", adAccountId: "" });
  const [saving, setSaving] = useState(false);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async () => {
    if (!form.accessToken.trim() || !form.adAccountId.trim()) {
      toast.error("Paste the token and the ad account id.");
      return;
    }
    setSaving(true);
    const res = await apiPost(adsPath(projectId, "/accounts"), {
      accessToken: form.accessToken.trim(),
      adAccountId: form.adAccountId.trim(),
    });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error || "Couldn't connect the ad account.");
      return;
    }
    const account = normalizeAdAccount(res.data?.account);
    toast.success(`Connected ${account?.name || "ad account"}.`);
    setForm({ accessToken: "", adAccountId: "" });
    onOpenChange(false);
    onConnected?.(account);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect with a system user token</DialogTitle>
          <DialogDescription>
            Create a system user in Meta Business Settings, assign it the ad account and page, and generate a token with
            ads_management, ads_read, leads_retrieval and business_management.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <Field label="Ad account id" htmlFor="ads-act" hint="Shown in Ads Manager, e.g. act_1234567890.">
            <Input id="ads-act" value={form.adAccountId} onChange={set("adAccountId")} placeholder="act_1234567890" />
          </Field>
          <Field label="Access token" htmlFor="ads-token" hint="Stored server-side only; the browser never reads it back.">
            <Input id="ads-token" type="password" autoComplete="off" value={form.accessToken} onChange={set("accessToken")} placeholder="EAAG…" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className={PRIMARY_BUTTON} disabled={saving} onClick={submit}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Connect
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// The honest "no ad account" state: what's missing and the one action that fixes it.
export function AdsConnectState({ status, title = "Connect a Meta ad account", description, onConnected }) {
  const { projectId } = useProject();
  const canManage = useAdsManage();
  const [manualOpen, setManualOpen] = useState(false);
  const oauthReady = Boolean(status?.oauth);
  const hint = !canManage
    ? "Ask a workspace admin for the Manage ads permission to connect an account."
    : oauthReady
      ? description || "Campaign reads campaigns, insights and lead forms through the Meta Marketing API."
      : "Meta login isn't configured on this deployment (META_APP_ID / META_APP_SECRET). You can still connect with a system user token.";

  return (
    <div className="rounded-xl border border-border bg-surface-subtle">
      <EmptyState
        icon={Plug}
        title={title}
        description={hint}
        action={
          canManage ? (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button className={PRIMARY_BUTTON} disabled={!oauthReady} onClick={() => startMetaConnect(projectId)}>
                <Link2 className="h-4 w-4" /> Connect with Meta
              </Button>
              <Button variant="outline" className={OUTLINE_BUTTON} onClick={() => setManualOpen(true)}>
                <KeyRound className="h-4 w-4" /> Use a system user token
              </Button>
            </div>
          ) : null
        }
      />
      <ManualConnectDialog open={manualOpen} onOpenChange={setManualOpen} onConnected={onConnected} />
    </div>
  );
}

export function AccountSelect({ accounts, value, onValueChange, includeAll = false, className = "w-full", disabled }) {
  return (
    <Select value={value || (includeAll ? "all" : "")} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger className={className}>
        <SelectValue placeholder="Choose an ad account" />
      </SelectTrigger>
      <SelectContent>
        {includeAll ? <SelectItem value="all">All ad accounts</SelectItem> : null}
        {accounts.map((a) => (
          <SelectItem key={a.id} value={a.id}>
            {a.name} · {a.accountNumber}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
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
          <Button className="bg-red-500/90 text-white hover:bg-red-500" onClick={() => onConfirm(target)}>
            <Trash2 className="h-4 w-4" /> {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
