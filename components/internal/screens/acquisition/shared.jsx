"use client";

import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Check, Copy, Loader2, Trash2 } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  cn,
} from "@geiger/ui";
import { apiGet } from "@/lib/api/client";
import { OUTLINE_BUTTON } from "./constants";

// Small pieces every acquisition / content screen shares: deployment status, copy-able snippets,
// configuration notices and the delete confirmation.

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

// { status, baseUrl }: the server's view of ingest / signing / email config and the public base URL used
// in embed snippets and share links (the configured CAMPAIGN_PUBLIC_URL, else this browser's origin).
export function useAcquisitionStatus(projectId) {
  const [status, setStatus] = useState(null);
  const [baseUrl, setBaseUrl] = useState("");
  useEffect(() => {
    if (!projectId) return undefined;
    let cancelled = false;
    apiGet(`/api/projects/${projectId}/acquisition/status`).then((res) => {
      if (cancelled) return;
      const data = res.ok ? res.data : null;
      setStatus(data);
      setBaseUrl(data?.publicUrlConfigured && data.publicBaseUrl ? data.publicBaseUrl : `${window.location.origin}${BASE_PATH}`);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);
  return { status, baseUrl };
}

export async function copyText(text, message = "Copied to the clipboard.") {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    toast.success(message);
  } catch {
    toast.error("Couldn't copy. Check your browser's clipboard permission.");
  }
}

export function CopyField({ label, hint, value, placeholder = "—", copyMessage, className }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await copyText(value, copyMessage);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <Field label={label} hint={hint} className={className}>
      <div className="flex items-start gap-2">
        <pre className="min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap break-all rounded-md border border-border bg-background px-3 py-2 font-mono text-xs leading-5 text-muted-foreground">
          {value || placeholder}
        </pre>
        <Button type="button" size="sm" variant="outline" className={cn(OUTLINE_BUTTON, "shrink-0")} disabled={!value} onClick={copy} aria-label={`Copy ${label || "value"}`}>
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </Field>
  );
}

// An inline "this needs setting up" notice: what's missing and what to do, never decoration.
export function ConfigNotice({ title, children, className }) {
  return (
    <div className={cn("flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3", className)} role="note">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
      <div className="min-w-0 space-y-0.5 text-sm">
        <p className="font-medium text-foreground">{title}</p>
        {children ? <div className="text-text-secondary">{children}</div> : null}
      </div>
    </div>
  );
}

export function DeleteDialog({ target, noun, name, consequence, pending, onCancel, onConfirm }) {
  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && !pending && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete {noun}</DialogTitle>
          <DialogDescription>
            Delete <span className="font-medium text-foreground">{name}</span>? {consequence}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
          <Button className="bg-red-500/90 text-white hover:bg-red-500" onClick={() => onConfirm(target)} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Tiny horizontal distribution bar for analytics rows (single accent colour, tabular count).
export function DistributionRow({ label, count, total, highlight = false }) {
  const pct = total ? Math.round((count / total) * 100) : 0;
  return (
    <div className="grid grid-cols-[minmax(0,10rem)_1fr_4.5rem] items-center gap-3 text-sm">
      <span className="truncate text-muted-foreground">{label}</span>
      <div className="h-2 overflow-hidden rounded-full bg-surface-hover">
        <div className={cn("h-full rounded-full", highlight ? "bg-primary" : "bg-foreground/40")} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-right tabular-nums text-text-secondary">
        {count.toLocaleString("en-US")} · {pct}%
      </span>
    </div>
  );
}
