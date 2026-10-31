"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, ExternalLink, FlaskConical, Info, Loader2, Lock, Trash2, XCircle } from "lucide-react";
import {
  ActionMenu,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  LogoLoading,
  SectionCard,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
} from "@geiger/ui";
import { apiGet } from "@/lib/api/client";
import { overallStatus } from "@/lib/ai/checks";
import { appendCopyToDocument } from "@/lib/ai/drafts";
import { listCampaigns, updateCampaign } from "@/lib/supabase/campaigns";
import { getGeneration, listGenerations, softDeleteGeneration } from "@/lib/supabase/ai_generations";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";

// Shared pieces of the AI assistant screens: provider status + honest notices, generation history, the
// deterministic check list, clipboard copy and "apply to a draft campaign".

export const OUTLINE_BUTTON = "border-border bg-surface-card text-foreground hover:bg-surface-subtle";

export function formatWhen(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export const formatPercent = (v, digits = 1) => (v == null ? "—" : `${(v * 100).toFixed(digits)}%`);

// { loading, configured, model, sample, error } from GET /api/projects/:id/ai.
export function useAiStatus(projectId) {
  const [state, setState] = useState({ loading: true, configured: false, model: null, sample: false, error: null });
  useEffect(() => {
    if (!projectId) return undefined;
    let alive = true;
    apiGet(`/api/projects/${projectId}/ai`).then((res) => {
      if (!alive) return;
      setState(
        res.ok
          ? { loading: false, configured: Boolean(res.data?.configured), model: res.data?.model ?? null, sample: Boolean(res.data?.sample), error: null }
          : { loading: false, configured: false, model: null, sample: false, error: res.error },
      );
    });
    return () => {
      alive = false;
    };
  }, [projectId]);
  return state;
}

function Notice({ icon: Icon, tone = "neutral", title, children }) {
  const iconClass = {
    warning: "text-amber-600 dark:text-amber-400",
    info: "text-sky-600 dark:text-sky-400",
    neutral: "text-text-secondary",
  }[tone];
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-surface-subtle px-4 py-3">
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", iconClass)} />
      <div className="min-w-0 text-sm">
        <p className="font-medium text-foreground">{title}</p>
        {children ? <div className="mt-0.5 text-text-secondary">{children}</div> : null}
      </div>
    </div>
  );
}

// The one notice that explains why generating won't work (or that output is sample data).
export function AiStatusNotice({ status, canUse, fallback }) {
  if (status.loading) return null;
  if (!canUse) {
    return (
      <Notice icon={Lock} title="Your role can't run the AI assistant">
        Ask a workspace admin for the “Generate with the AI assistant” permission.{fallback ? ` ${fallback}` : ""}
      </Notice>
    );
  }
  if (status.sample) {
    return (
      <Notice icon={FlaskConical} tone="info" title="Playground — sample output">
        No model is called here; responses are sample text assembled from your inputs and the demo workspace&apos;s data.
      </Notice>
    );
  }
  if (!status.configured) {
    return (
      <Notice icon={AlertTriangle} tone="warning" title="AI isn't configured on this deployment">
        Set CAMPAIGN_LLM_BASE_URL, CAMPAIGN_LLM_API_KEY and CAMPAIGN_LLM_MODEL (any OpenAI-compatible provider) on the server.
        {fallback ? ` ${fallback}` : ""}
      </Notice>
    );
  }
  return null;
}

const CHECK_META = {
  pass: { icon: CheckCircle2, className: "text-emerald-600 dark:text-emerald-400" },
  warn: { icon: AlertTriangle, className: "text-amber-600 dark:text-amber-400" },
  fail: { icon: XCircle, className: "text-red-600 dark:text-red-400" },
  info: { icon: Info, className: "text-text-tertiary" },
};

export function ChecksList({ checks = [], className }) {
  return (
    <ul className={cn("space-y-1.5", className)}>
      {checks.map((c, i) => {
        const meta = CHECK_META[c.status] || CHECK_META.info;
        const Icon = meta.icon;
        return (
          <li key={`${c.key}-${i}`} className="flex items-start gap-2 text-xs">
            <Icon className={cn("mt-px h-3.5 w-3.5 shrink-0", meta.className)} />
            <span className="text-text-secondary">
              <span className="font-medium text-foreground">{c.label}</span> — {c.detail}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function ChecksBadge({ checks = [] }) {
  const status = overallStatus(checks);
  const warnings = checks.filter((c) => c.status === "warn").length;
  if (status === "fail") return <Badge variant="danger">Needs fixes</Badge>;
  if (status === "warn") return <Badge variant="warning">{warnings} warning{warnings === 1 ? "" : "s"}</Badge>;
  return <Badge variant="success">Passes checks</Badge>;
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard.");
    return true;
  } catch {
    toast.error("Couldn't copy — select the text and copy it manually.");
    return false;
  }
}

// History for one tool + the record open in the URL (?record=<generationId>).
export function useGenerations(projectId, tool) {
  const { recordId } = useWorkspaceUrl();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetched, setFetched] = useState(null);

  useEffect(() => {
    if (!projectId) return undefined;
    let alive = true;
    listGenerations(projectId, { tool }).then((rows) => {
      if (!alive) return;
      setItems(rows ?? []);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [projectId, tool]);

  // A deep link to an entry older than the loaded page.
  const listed = items.find((g) => g.id === recordId) ?? null;
  useEffect(() => {
    if (loading || !recordId || listed || fetched?.id === recordId) return undefined;
    let alive = true;
    getGeneration(projectId, recordId).then((g) => {
      if (alive && g?.tool === tool) setFetched(g);
    });
    return () => {
      alive = false;
    };
  }, [loading, recordId, listed, fetched, projectId, tool]);

  const active = listed ?? (fetched?.id === recordId ? fetched : null);

  const add = useCallback((g) => setItems((prev) => [g, ...prev.filter((x) => x.id !== g.id)]), []);
  const replace = useCallback((g) => setItems((prev) => prev.map((x) => (x.id === g.id ? g : x))), []);
  const remove = useCallback(async (g) => {
    setItems((prev) => prev.filter((x) => x.id !== g.id));
    const ok = await softDeleteGeneration(g.id);
    if (ok) {
      toast.success("Removed from history.");
      return true;
    }
    toast.error("Couldn't remove that entry.");
    setItems((prev) => [g, ...prev].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))));
    return false;
  }, []);

  return { items, loading, active, add, replace, remove };
}

// Compact history list; `describe(g)` returns the secondary line.
export function HistoryCard({ items, loading, activeId, onOpen, onDelete, canDelete = true, describe, title = "History" }) {
  return (
    <SectionCard title={title} description="Every generation is saved here so you can reopen and reuse it." bodyPadding={false}>
      {loading ? (
        <div className="flex justify-center py-10">
          <LogoLoading size={36} aria-label="Loading history" />
        </div>
      ) : !items.length ? (
        <p className="px-5 py-6 text-sm text-text-secondary">Nothing generated yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((g) => (
            <li key={g.id} className={cn("flex items-center gap-2 px-5 py-2.5", activeId === g.id && "bg-surface-card")}>
              <button type="button" onClick={() => onOpen(g)} className="min-w-0 flex-1 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
                <p className="truncate text-sm font-medium text-foreground">{g.title || "Untitled"}</p>
                <p className="truncate text-xs text-text-tertiary">
                  {formatWhen(g.createdAt)}
                  {describe ? ` · ${describe(g)}` : ""}
                </p>
              </button>
              {canDelete ? (
                <ActionMenu
                  label={`Actions for ${g.title || "entry"}`}
                  items={[
                    { label: "Open", icon: ExternalLink, onSelect: () => onOpen(g) },
                    { separator: true },
                    { label: "Remove from history", icon: Trash2, destructive: true, onSelect: () => onDelete(g) },
                  ]}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

// mode "subject" sets subject + preheader on a draft email campaign; mode "body" appends email copy as text
// blocks, or replaces the message of a draft SMS/WhatsApp campaign.
export function ApplyToCampaignDialog({ open, onOpenChange, projectId, mode, payload, channel = "email" }) {
  const { openRecordInTab } = useWorkspaceUrl();
  const [campaigns, setCampaigns] = useState(null);
  const [selected, setSelected] = useState("");
  const [saving, setSaving] = useState(false);
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setCampaigns(null);
      setSelected("");
    }
  }

  useEffect(() => {
    if (!open || !projectId) return undefined;
    let alive = true;
    listCampaigns(projectId).then((rows) => {
      if (alive) setCampaigns(rows ?? []);
    });
    return () => {
      alive = false;
    };
  }, [open, projectId]);

  const options = useMemo(() => (campaigns || []).filter((c) => c.status === "draft" && c.channel === channel), [campaigns, channel]);

  const apply = async () => {
    const campaign = options.find((c) => c.id === selected);
    if (!campaign) return;
    const patch =
      mode === "subject"
        ? { subject: payload.subject, ...(payload.preheader ? { preheader: payload.preheader } : {}) }
        : channel === "email"
          ? { content: appendCopyToDocument(campaign.content, payload.text) }
          : { content: { ...campaign.content, text: payload.text } };
    setSaving(true);
    const updated = await updateCampaign(campaign.id, patch);
    setSaving(false);
    if (!updated) {
      toast.error("Couldn't update the campaign.");
      return;
    }
    onOpenChange(false);
    toast.success(mode === "subject" ? `Subject set on “${campaign.name}”.` : `Copy added to “${campaign.name}”.`, {
      action: { label: "Open", onClick: () => openRecordInTab(campaign.id, "All Campaigns") },
    });
  };

  const label = mode === "subject" ? "Use this subject" : channel === "email" ? "Add copy to a campaign" : "Use as the campaign message";
  const description =
    mode === "subject"
      ? "Sets the subject line (and preheader) on a draft email campaign."
      : channel === "email"
        ? "Appends the copy as text blocks at the end of a draft email campaign — nothing is overwritten."
        : `Replaces the message of a draft ${channel === "sms" ? "SMS" : "WhatsApp"} campaign.`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-background">
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          {campaigns === null ? (
            <div className="flex justify-center py-6">
              <LogoLoading size={32} aria-label="Loading campaigns" />
            </div>
          ) : options.length ? (
            <Field label="Draft campaign">
              <Select value={selected} onValueChange={setSelected}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a campaign" />
                </SelectTrigger>
                <SelectContent>
                  {options.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : (
            <p className="text-sm text-text-secondary">
              No draft {channel === "email" ? "email" : channel === "sms" ? "SMS" : "WhatsApp"} campaigns. Create one in All Campaigns first.
            </p>
          )}
          {mode === "subject" ? (
            <div className="rounded-lg border border-border bg-surface-subtle px-3 py-2 text-sm">
              <p className="font-medium text-foreground">{payload?.subject}</p>
              {payload?.preheader ? <p className="mt-0.5 text-xs text-text-secondary">{payload.preheader}</p> : null}
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={!selected || saving} onClick={apply}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
