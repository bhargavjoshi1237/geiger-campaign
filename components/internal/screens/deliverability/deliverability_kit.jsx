"use client";

import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Check, Copy, Info, Loader2, Trash2, XCircle } from "lucide-react";
import {
  Badge,
  Button,
  DataTable,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusPill,
  cn,
} from "@geiger/ui";
import { apiPost } from "@/lib/api/client";
import { getUser } from "@/lib/supabase/user";
import {
  createSendingDomain,
  listSendingDomains,
  normalizeSendingDomain,
  softDeleteSendingDomain,
  updateSendingDomain,
} from "@/lib/supabase/sending_domains";
import {
  DEFAULT_PROVIDER,
  RECORD_PURPOSES,
  buildDomainRecords,
  mergeRecordState,
  normalizeDomainName,
  organizationalDomain,
  providerFor,
  relativeHost,
} from "@/lib/deliverability/records";

// Shared looks, maps and helpers for the deliverability list + editor screens.
export const PRIMARY_BUTTON = "bg-primary text-primary-foreground hover:bg-primary/90";
export const OUTLINE_BUTTON =
  "border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground";
export const DANGER_ICON_BUTTON =
  "text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400 dark:hover:text-red-400";
export const DELIVERABILITY_MANAGE = "campaign.deliverability.manage";

export const number = (n) => Number(n || 0).toLocaleString("en-US");
export const plural = (n, word, many = `${word}s`) => `${number(n)} ${n === 1 ? word : many}`;

export function formatDateTime(iso) {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function formatDate(iso) {
  if (!iso) return "—";
  const value = String(iso).length === 10 ? `${iso}T00:00:00Z` : iso;
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export const DOMAIN_STATUS_MAP = {
  verified: { label: "Verified", variant: "success", dotClass: "bg-emerald-400" },
  pending: { label: "Pending", variant: "warning", dotClass: "bg-amber-400" },
  failing: { label: "Failing", variant: "danger", dotClass: "bg-red-400" },
};

export const RECORD_STATUS_MAP = {
  verified: { label: "Verified", variant: "success" },
  missing: { label: "Missing", variant: "warning" },
  mismatch: { label: "Wrong value", variant: "danger" },
  error: { label: "Lookup failed", variant: "warning" },
  pending: { label: "Not checked", variant: "neutral" },
};

export const CHECK_MAP = {
  pass: { label: "Pass", variant: "success" },
  warn: { label: "Warning", variant: "warning" },
  fail: { label: "Fail", variant: "danger" },
  none: { label: "Not set up", variant: "neutral" },
  error: { label: "Lookup failed", variant: "warning" },
};

export function RecordBadge({ status }) {
  const meta = RECORD_STATUS_MAP[status] || RECORD_STATUS_MAP.pending;
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}

export function CheckBadge({ status }) {
  const meta = CHECK_MAP[status] || { label: "Not checked", variant: "neutral" };
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}

export function copyText(value, what = "value") {
  if (!navigator.clipboard) {
    toast.error("Clipboard isn't available in this browser.");
    return;
  }
  navigator.clipboard.writeText(String(value ?? "")).then(
    () => toast.success(`Copied the ${what}.`),
    () => toast.error("Couldn't copy to the clipboard."),
  );
}

export function CopyButton({ value, what = "value", className }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={`Copy ${what}`}
      className={cn("h-7 w-7 shrink-0 text-text-secondary hover:text-foreground", className)}
      onClick={(e) => {
        e.stopPropagation();
        copyText(value, what);
      }}
    >
      <Copy className="h-3.5 w-3.5" />
    </Button>
  );
}

const ISSUE_ICON = {
  error: { icon: XCircle, className: "text-red-600 dark:text-red-400" },
  warn: { icon: AlertTriangle, className: "text-amber-600 dark:text-amber-400" },
  info: { icon: Info, className: "text-text-tertiary" },
};

// Plain-language findings from lib/deliverability/auth_checks.js, each with its fix.
export function IssueList({ issues = [], empty = "No issues found." }) {
  if (!issues.length) {
    return (
      <p className="flex items-center gap-2 text-sm text-text-secondary">
        <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> {empty}
      </p>
    );
  }
  return (
    <ul className="space-y-3">
      {issues.map((issue, i) => {
        const meta = ISSUE_ICON[issue.level] || ISSUE_ICON.info;
        const Icon = meta.icon;
        return (
          <li key={i} className="flex gap-2.5 text-sm">
            <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", meta.className)} />
            <div className="min-w-0 space-y-1">
              <p className="text-foreground">{issue.message}</p>
              {issue.fix ? <p className="break-words text-text-secondary">{issue.fix}</p> : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// Delete confirmation used by every deliverability list row and editor.
export function DeleteDialog({ target, label, noun, description, onCancel, onConfirm }) {
  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete {noun}</DialogTitle>
          <DialogDescription>
            Delete <span className="font-medium text-foreground">{label}</span>?{" "}
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

// Sending domains -------------------------------------------------------------

export const zoneOf = (domain) => organizationalDomain(domain);

export function recordsAsText(domain) {
  return domain.records
    .map((r) => `${r.type}\t${relativeHost(r.host, zoneOf(domain.domain))}\t${r.expected}`)
    .join("\n");
}

// The DNS records table: what to publish (host relative to the zone), what was found, and its status.
export function RecordsTable({ domain }) {
  const zone = zoneOf(domain.domain);
  const columns = [
    {
      key: "purpose",
      header: "Record",
      render: (r) => (
        <div className="flex min-w-0 flex-col">
          <span className="font-medium text-foreground">{RECORD_PURPOSES[r.purpose]?.label || r.key}</span>
          <span className="text-xs text-text-secondary">{r.type}{r.required ? "" : " · recommended"}</span>
        </div>
      ),
    },
    {
      key: "host",
      header: `Host (in ${zone})`,
      render: (r) => (
        <div className="flex max-w-[220px] items-center gap-1">
          <span className="truncate font-mono text-xs text-muted-foreground" title={r.host}>
            {relativeHost(r.host, zone)}
          </span>
          <CopyButton value={relativeHost(r.host, zone)} what={`${r.type} host`} />
        </div>
      ),
    },
    {
      key: "expected",
      header: "Value to publish",
      render: (r) => (
        <div className="flex max-w-[300px] items-center gap-1">
          <span className="truncate font-mono text-xs text-muted-foreground" title={r.expected}>
            {r.type === "MX" ? `${r.expected} (priority ${r.priority ?? 10})` : r.expected}
          </span>
          {r.expected.includes("<") ? null : <CopyButton value={r.type === "MX" ? r.expected.split(" ").pop() : r.expected} what={`${r.type} value`} />}
        </div>
      ),
    },
    {
      key: "found",
      header: "Found",
      render: (r) => (
        <span
          className="block max-w-[220px] truncate font-mono text-xs text-text-secondary"
          title={(r.found || []).join("\n") || r.message}
        >
          {r.found?.length ? `${r.found[0]}${r.found.length > 1 ? ` (+${r.found.length - 1})` : ""}` : r.status === "pending" ? "—" : "Nothing published"}
        </span>
      ),
    },
    { key: "status", header: "Status", className: "whitespace-nowrap", render: (r) => <RecordBadge status={r.status} /> },
  ];
  return <DataTable columns={columns} data={domain.records} getRowKey={(r) => r.key} />;
}

export function requiredProgress(domain) {
  const required = domain.records.filter((r) => r.required);
  return { verified: required.filter((r) => r.status === "verified").length, total: required.length };
}

export function AddDomainDialog({ open, onOpenChange, existing = [], onCreate }) {
  const provider = providerFor(DEFAULT_PROVIDER);
  const [domain, setDomain] = useState("");
  const [region, setRegion] = useState(provider.defaultRegion);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const name = normalizeDomainName(domain);
    if (!name) {
      toast.error("Enter a domain like mail.yourbrand.com.");
      return;
    }
    if (existing.some((d) => d.domain === name)) {
      toast.error(`${name} is already added.`);
      return;
    }
    setBusy(true);
    const ok = await onCreate({ domain: name, region });
    setBusy(false);
    if (!ok) return;
    setDomain("");
    setRegion(provider.defaultRegion);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add sending domain</DialogTitle>
          <DialogDescription>
            We generate the DNS records {provider.label} needs and check them right away.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Domain" htmlFor="dl-domain" hint="Use a subdomain dedicated to email, e.g. mail.yourbrand.com.">
            <Input
              id="dl-domain"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                submit();
              }}
              placeholder="mail.yourbrand.com"
              autoFocus
            />
          </Field>
          <Field label="Sending region" hint="Must match the region the domain is registered in at the provider.">
            <Select value={region} onValueChange={setRegion}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {provider.regions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className={PRIMARY_BUTTON} onClick={submit} disabled={busy || !domain.trim()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Add domain
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Loads sending domains and owns their mutations (shared by Sending Domains and Authentication).
export function useSendingDomains(projectId) {
  const [data, setData] = useState({ key: null, rows: [] });
  const [verifying, setVerifying] = useState([]);

  useEffect(() => {
    let alive = true;
    listSendingDomains(projectId).then((rows) => {
      if (!alive) return;
      if (!rows) toast.error("Couldn't load sending domains.");
      setData({ key: projectId, rows: rows ?? [] });
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const setRows = (fn) => setData((d) => ({ ...d, rows: fn(d.rows) }));
  const replace = (next) => setRows((rows) => rows.map((r) => (r.id === next.id ? next : r)));

  const verify = async (domain, { quiet = false } = {}) => {
    setVerifying((v) => [...v, domain.id]);
    const res = await apiPost(`/api/projects/${projectId}/deliverability/domains/${domain.id}/verify`);
    setVerifying((v) => v.filter((id) => id !== domain.id));
    if (!res.ok) {
      toast.error(res.error || "Couldn't check DNS.");
      return null;
    }
    const next = normalizeSendingDomain(res.data.domain);
    replace(next);
    if (!quiet) {
      const { verified, total } = requiredProgress(next);
      if (next.status === "verified") toast.success(`All ${total} required records for ${next.domain} are verified.`);
      else toast.warning(`${total - verified} of ${total} required records for ${next.domain} are missing or wrong.`);
    }
    return next;
  };

  const create = async ({ domain, region }) => {
    const user = await getUser();
    const id = crypto.randomUUID();
    const settings = { dmarcPolicy: "none", dmarcRua: `dmarc@${organizationalDomain(domain)}`, dmarcAlignment: "relaxed" };
    const input = {
      id,
      domain,
      provider: DEFAULT_PROVIDER,
      region,
      status: "pending",
      settings,
      records: buildDomainRecords(domain, { provider: DEFAULT_PROVIDER, region, settings }),
      createdBy: user?.id ?? null,
    };
    setRows((rows) => [{ ...input, auth: {}, lastCheckedAt: null, verifiedAt: null, createdAt: new Date().toISOString() }, ...rows]);
    const created = await createSendingDomain(projectId, input);
    if (!created) {
      setRows((rows) => rows.filter((r) => r.id !== id));
      toast.error("Couldn't add the domain.");
      return null;
    }
    replace(created);
    toast.success(`Added ${domain}. Checking its DNS…`);
    verify(created, { quiet: true });
    return created;
  };

  // Saves region/settings, rebuilds the expected records and re-checks DNS against them.
  const saveSettings = async (domain, { region = domain.region, settings }) => {
    const records = mergeRecordState(buildDomainRecords(domain.domain, { provider: domain.provider, region, settings }), domain.records);
    const patch = { region, settings, records };
    replace({ ...domain, ...patch });
    const saved = await updateSendingDomain(domain.id, patch);
    if (!saved) {
      replace(domain);
      toast.error("Couldn't save the domain.");
      return null;
    }
    replace(saved);
    toast.success("Saved. Re-checking DNS against the updated records…");
    return verify(saved, { quiet: true });
  };

  const remove = async (domain) => {
    setRows((rows) => rows.filter((r) => r.id !== domain.id));
    const ok = await softDeleteSendingDomain(domain.id);
    if (!ok) {
      setRows((rows) => [domain, ...rows]);
      toast.error("Couldn't delete the domain.");
      return false;
    }
    toast.success(`Deleted ${domain.domain}.`);
    return true;
  };

  return { loading: data.key !== projectId, domains: data.rows, verifying, verify, create, saveSettings, remove };
}

export function DomainStatus({ domain }) {
  return <StatusPill status={domain.status} map={DOMAIN_STATUS_MAP} />;
}
