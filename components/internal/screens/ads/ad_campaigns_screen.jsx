"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ExternalLink, Gauge, KeyRound, Link2, Loader2, Megaphone, Pause, Pencil, Play, Plus, RefreshCw, Trash2, Unplug } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import {
  ActionMenu,
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
  ScreenHeader,
  SearchInput,
  SectionCard,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatsBar,
  StatusPill,
  Switch,
  Toolbar,
} from "@geiger/ui";
import { apiPost } from "@/lib/api/client";
import { getUser } from "@/lib/supabase/user";
import { disconnectAdAccount, listAdSnapshots, normalizeAdSnapshot, updateAdAccount } from "@/lib/supabase/ad_accounts";
import { createAdRule, listAdRules, softDeleteAdRule, updateAdRule } from "@/lib/supabase/ad_rules";
import { LEVELS, RULE_METRICS, adsManagerUrl, objectiveLabel, ruleMetricMeta } from "@/lib/ads/catalog";
import {
  AccountSelect,
  AdsConnectState,
  DeleteConfirmDialog,
  ListEmptyState,
  LoadingPanel,
  ManualConnectDialog,
  NO_PERMISSION,
  OUTLINE_BUTTON,
  PRIMARY_BUTTON,
  adsPath,
  startMetaConnect,
  useAdAccounts,
  useAdsManage,
  useNow,
} from "./ads_kit";
import { ACCOUNT_STATUS_MAP, DELIVERY_STATUS_MAP, RULE_STATUS_MAP, formatDateTime, formatMoney, formatNumber, formatPercent, timeAgo } from "./constants";

const LEVEL_OPTIONS = [
  { value: "campaign", label: "Campaigns" },
  { value: "adset", label: "Ad sets" },
  { value: "ad", label: "Ads" },
];

const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "issues", label: "Needs attention" },
];

const PAUSED = new Set(["PAUSED", "CAMPAIGN_PAUSED", "ADSET_PAUSED"]);
const ISSUES = new Set(["WITH_ISSUES", "DISAPPROVED", "PENDING_BILLING_INFO"]);

const EMPTY_RULE = { name: "", adAccountId: "", level: "adset", metric: "cpl", operator: "gt", threshold: "", minSpend: "", action: "pause" };

function metricValue(metric, value, currency) {
  if (value == null) return "—";
  return ruleMetricMeta(metric).kind === "percent" ? formatPercent(value, 2) : formatMoney(value, currency);
}

function ruleSentence(rule, currency) {
  const metric = ruleMetricMeta(rule.metric);
  const level = LEVELS.find((l) => l.value === rule.level)?.label.toLowerCase() || rule.level;
  const parts = [`${metric.label} ${rule.operator === "lt" ? "below" : "above"} ${metricValue(rule.metric, rule.threshold, currency)}`];
  if (rule.minSpend) parts.push(`min spend ${formatMoney(rule.minSpend, currency)}`);
  parts.push(`${level}s`);
  return parts.join(" · ");
}

function RuleDialog({ open, rule, accounts, onOpenChange, onSave, saving }) {
  const [form, setForm] = useState(EMPTY_RULE);
  const [lastKey, setLastKey] = useState(null);
  const key = open ? rule?.id || "new" : null;
  if (key !== lastKey) {
    setLastKey(key);
    if (open) {
      setForm(
        rule
          ? { name: rule.name, adAccountId: rule.adAccountId || "", level: rule.level, metric: rule.metric, operator: rule.operator, threshold: String(rule.threshold), minSpend: String(rule.minSpend || ""), action: rule.action }
          : EMPTY_RULE,
      );
    }
  }
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const metric = ruleMetricMeta(form.metric);
  const valid = form.name.trim() && form.threshold !== "" && !Number.isNaN(Number(form.threshold));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{rule ? "Edit rule" : "New automated rule"}</DialogTitle>
          <DialogDescription>Checked every 5 minutes against the last 7 days of insights. Only active entities are judged.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2 sm:grid-cols-2">
          <Field label="Rule name" htmlFor="rule-name" className="sm:col-span-2">
            <Input id="rule-name" value={form.name} onChange={(e) => set("name")(e.target.value)} placeholder="e.g. Pause ad sets over $25 CPL" />
          </Field>
          <Field label="Ad account">
            <AccountSelect accounts={accounts} value={form.adAccountId || "all"} onValueChange={(v) => set("adAccountId")(v === "all" ? "" : v)} includeAll />
          </Field>
          <Field label="Applies to">
            <Select value={form.level} onValueChange={set("level")}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {LEVELS.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}s</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Metric">
            <Select value={form.metric} onValueChange={set("metric")}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {RULE_METRICS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Condition">
            <Select value={form.operator} onValueChange={set("operator")}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="gt">Is above</SelectItem>
                <SelectItem value="lt">Is below</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label={metric.kind === "percent" ? "Threshold (%)" : "Threshold"} htmlFor="rule-threshold">
            <Input id="rule-threshold" type="number" min="0" step="0.01" value={form.threshold} onChange={(e) => set("threshold")(e.target.value)} placeholder="25" />
          </Field>
          <Field label="Minimum spend" htmlFor="rule-min" hint="Skip entities that haven't spent this much yet.">
            <Input id="rule-min" type="number" min="0" step="1" value={form.minSpend} onChange={(e) => set("minSpend")(e.target.value)} placeholder="50" />
          </Field>
          <Field label="Action" className="sm:col-span-2">
            <Select value={form.action} onValueChange={set("action")}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pause">Pause it on Meta</SelectItem>
                <SelectItem value="log">Log only (no change on Meta)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {rule?.history?.length ? (
            <div className="sm:col-span-2">
              <p className="mb-1.5 text-sm font-medium text-muted-foreground">Recent matches</p>
              <div className="divide-y divide-border rounded-lg border border-border bg-surface-card">
                {rule.history.slice(0, 10).map((h, i) => (
                  <div key={`${h.at}-${i}`} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                    <span className="min-w-0 truncate text-foreground">{h.entityName || h.entityId}</span>
                    <span className="shrink-0 tabular-nums text-text-secondary">{h.metric}: {h.value} · {h.result} · {formatDateTime(h.at)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className={PRIMARY_BUTTON} disabled={!valid || saving} onClick={() => onSave(form)}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {rule ? "Save rule" : "Create rule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Several ad accounts came back from Facebook Login: choose which ones this project uses.
function ChooseAccountsDialog({ accounts, onDone }) {
  const [chosen, setChosen] = useState(() => new Set(accounts.map((a) => a.id)));
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    const results = await Promise.all(
      accounts.map((a) => (chosen.has(a.id) ? updateAdAccount(a.id, { status: "connected" }) : disconnectAdAccount(a.id))),
    );
    setSaving(false);
    if (results.some((r) => !r)) toast.error("Some accounts couldn't be updated.");
    else toast.success(`Connected ${chosen.size} ad account${chosen.size === 1 ? "" : "s"}.`);
    onDone();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onDone()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Choose ad accounts</DialogTitle>
          <DialogDescription>Your Facebook login can manage several ad accounts. Pick the ones this project should use.</DialogDescription>
        </DialogHeader>
        <div className="divide-y divide-border rounded-lg border border-border bg-surface-card">
          {accounts.map((a) => (
            <label key={a.id} className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2.5">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-foreground">{a.name}</span>
                <span className="block text-xs text-text-secondary">{a.externalId} · {a.currency}{a.businessName ? ` · ${a.businessName}` : ""}</span>
              </span>
              <Switch
                checked={chosen.has(a.id)}
                onCheckedChange={(on) => setChosen((prev) => {
                  const next = new Set(prev);
                  if (on) next.add(a.id);
                  else next.delete(a.id);
                  return next;
                })}
              />
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button className={PRIMARY_BUTTON} disabled={saving} onClick={save}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConnectDialog({ open, onOpenChange, oauthReady, projectId, onManual }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect an ad account</DialogTitle>
          <DialogDescription>
            {oauthReady
              ? "Log in with Facebook to grant ads, lead and page access, or paste a system user token."
              : "Meta login isn't configured on this deployment (META_APP_ID / META_APP_SECRET). Use a system user token instead."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Button className={PRIMARY_BUTTON} disabled={!oauthReady} onClick={() => startMetaConnect(projectId)}>
            <Link2 className="h-4 w-4" /> Connect with Meta
          </Button>
          <Button variant="outline" className={OUTLINE_BUTTON} onClick={onManual}>
            <KeyRound className="h-4 w-4" /> Use a system user token
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AdCampaignsScreen() {
  const { projectId, accounts, connected, status, loading, reload } = useAdAccounts();
  const canManage = useAdsManage();
  const searchParams = useSearchParams();
  const now = useNow();
  const [snapshots, setSnapshots] = useState([]);
  const [snapLoading, setSnapLoading] = useState(true);
  const [rules, setRules] = useState([]);
  const [level, setLevel] = useState("campaign");
  const [accountFilter, setAccountFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [busyRow, setBusyRow] = useState(null);
  const [connectOpen, setConnectOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [disconnectTarget, setDisconnectTarget] = useState(null);
  const [ruleDialog, setRuleDialog] = useState({ open: false, rule: null });
  const [ruleSaving, setRuleSaving] = useState(false);
  const [ruleDelete, setRuleDelete] = useState(null);
  const [runningRules, setRunningRules] = useState(false);
  const [pendingDismissed, setPendingDismissed] = useState(false);
  const noticeShown = useRef(false);

  useEffect(() => {
    if (!projectId) return undefined;
    let alive = true;
    Promise.all([listAdSnapshots(projectId), listAdRules(projectId)]).then(([snaps, ruleRows]) => {
      if (!alive) return;
      setSnapshots(snaps ?? []);
      setRules(ruleRows ?? []);
      setSnapLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  // Outcome of the Facebook Login round-trip, shown once.
  useEffect(() => {
    const outcome = searchParams?.get("ads");
    if (!outcome || noticeShown.current) return;
    noticeShown.current = true;
    if (outcome === "connected") {
      const pending = Number(searchParams.get("pending") || 0);
      toast.success(pending ? "Facebook connected — choose which ad accounts to use." : "Ad account connected.");
    } else if (outcome === "error") {
      toast.error(searchParams.get("reason") || "Couldn't connect the ad account.");
    }
  }, [searchParams]);

  const pendingAccounts = useMemo(() => accounts.filter((a) => a.status === "pending"), [accounts]);
  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);

  const reloadSnapshots = async () => {
    const rows = await listAdSnapshots(projectId);
    if (rows) setSnapshots(rows);
  };

  const refreshAll = async (targets = connected) => {
    if (!targets.length) return;
    setRefreshing(true);
    const results = await Promise.all(targets.map((a) => apiPost(adsPath(projectId, `/accounts/${a.id}/sync`), {})));
    setRefreshing(false);
    const failed = results.filter((r) => !r.ok);
    const totals = results.filter((r) => r.ok).reduce((s, r) => ({ c: s.c + (r.data?.campaigns || 0), a: s.a + (r.data?.ads || 0) }), { c: 0, a: 0 });
    if (failed.length) toast.error(failed[0].error || "Meta didn't return the account.");
    if (failed.length < results.length) toast.success(`Synced ${totals.c} campaigns and ${totals.a} ads from Meta.`);
    await Promise.all([reloadSnapshots(), reload()]);
  };

  const scoped = useMemo(
    () => snapshots.filter((s) => accountFilter === "all" || s.adAccountId === accountFilter),
    [snapshots, accountFilter],
  );

  const names = useMemo(() => new Map(snapshots.map((s) => [`${s.level}:${s.externalId}`, s.name])), [snapshots]);

  const stats = useMemo(() => {
    const campaigns = scoped.filter((s) => s.level === "campaign");
    const accountIds = new Set(campaigns.map((c) => c.adAccountId));
    const currencies = new Set([...accountIds].map((id) => accountById.get(id)?.currency).filter(Boolean));
    const currency = currencies.size === 1 ? [...currencies][0] : null;
    const spend = campaigns.reduce((s, c) => s + c.insights.spend, 0);
    const leads = campaigns.reduce((s, c) => s + c.insights.leads, 0);
    const conversations = campaigns.reduce((s, c) => s + c.insights.conversations, 0);
    const captured = campaigns.map((c) => c.capturedAt).filter(Boolean).sort().pop();
    const active = campaigns.filter((c) => c.effectiveStatus === "ACTIVE").length;
    const money = (v) => (currency ? formatMoney(v, currency) : "—");
    return [
      { label: "Spend", value: campaigns.length ? (currencies.size > 1 ? "Mixed" : money(spend)) : "—", footer: currencies.size > 1 ? "Pick one account to total spend" : "Last 7 days" },
      { label: "Leads", value: formatNumber(leads), footer: leads && currency ? `${money(spend / leads)} per lead` : "No leads yet" },
      { label: "Conversations started", value: formatNumber(conversations), footer: conversations && currency ? `${money(spend / conversations)} per conversation` : "Messaging ads" },
      { label: "Active campaigns", value: formatNumber(active), footer: captured ? `Updated ${timeAgo(captured, now)}` : "Not synced yet" },
    ];
  }, [scoped, accountById, now]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return scoped
      .filter((s) => s.level === level)
      .filter((s) => {
        if (statusFilter === "active" && s.effectiveStatus !== "ACTIVE") return false;
        if (statusFilter === "paused" && !PAUSED.has(s.effectiveStatus)) return false;
        if (statusFilter === "issues" && !ISSUES.has(s.effectiveStatus)) return false;
        if (q && !`${s.name} ${s.externalId}`.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => b.insights.spend - a.insights.spend);
  }, [scoped, level, statusFilter, query]);

  const pager = usePagination(filtered, { resetKey: `${level}|${accountFilter}|${statusFilter}|${query}` });

  const setEntityStatus = async (snap, next) => {
    setBusyRow(snap.id);
    const prev = snapshots;
    setSnapshots((rows) => rows.map((r) => (r.id === snap.id ? { ...r, status: next, effectiveStatus: next } : r)));
    const res = await apiPost(adsPath(projectId, "/entities/status"), { accountId: snap.adAccountId, level: snap.level, externalId: snap.externalId, status: next });
    setBusyRow(null);
    if (!res.ok) {
      setSnapshots(prev);
      toast.error(res.error || "Meta didn't change the status.");
      return;
    }
    if (res.data?.snapshot) {
      const saved = normalizeAdSnapshot(res.data.snapshot);
      setSnapshots((rows) => rows.map((r) => (r.id === saved.id ? saved : r)));
    }
    toast.success(`${next === "ACTIVE" ? "Resumed" : "Paused"} "${snap.name}".`);
  };

  const handleDisconnect = async (account) => {
    setDisconnectTarget(null);
    const ok = await disconnectAdAccount(account.id);
    if (!ok) {
      toast.error("Couldn't disconnect the ad account.");
      return;
    }
    toast.success(`Disconnected ${account.name}.`);
    if (accountFilter === account.id) setAccountFilter("all");
    reload();
  };

  const saveRule = async (form) => {
    const patch = {
      name: form.name.trim(),
      adAccountId: form.adAccountId || null,
      level: form.level,
      metric: form.metric,
      operator: form.operator,
      threshold: Number(form.threshold) || 0,
      minSpend: Number(form.minSpend) || 0,
      action: form.action,
    };
    setRuleSaving(true);
    const editing = ruleDialog.rule;
    if (editing) {
      const prev = rules;
      setRules((rows) => rows.map((r) => (r.id === editing.id ? { ...r, ...patch } : r)));
      const saved = await updateAdRule(editing.id, patch);
      setRuleSaving(false);
      if (!saved) {
        setRules(prev);
        toast.error("Couldn't save the rule.");
        return;
      }
      setRules((rows) => rows.map((r) => (r.id === saved.id ? saved : r)));
      toast.success("Rule saved.");
    } else {
      const user = await getUser();
      const optimistic = { ...patch, id: crypto.randomUUID(), status: "active", history: [], triggerCount: 0, scopeIds: [], createdBy: user?.id ?? null };
      setRules((rows) => [...rows, optimistic]);
      const saved = await createAdRule(projectId, optimistic);
      setRuleSaving(false);
      if (!saved) {
        setRules((rows) => rows.filter((r) => r.id !== optimistic.id));
        toast.error("Couldn't create the rule.");
        return;
      }
      setRules((rows) => rows.map((r) => (r.id === saved.id ? saved : r)));
      toast.success("Rule created. It runs on the next scheduler tick.");
    }
    setRuleDialog({ open: false, rule: null });
  };

  const toggleRule = async (rule, on) => {
    const next = on ? "active" : "paused";
    setRules((rows) => rows.map((r) => (r.id === rule.id ? { ...r, status: next } : r)));
    const saved = await updateAdRule(rule.id, { status: next });
    if (!saved) {
      setRules((rows) => rows.map((r) => (r.id === rule.id ? rule : r)));
      toast.error("Couldn't update the rule.");
    }
  };

  const deleteRule = async (rule) => {
    setRuleDelete(null);
    setRules((rows) => rows.filter((r) => r.id !== rule.id));
    const ok = await softDeleteAdRule(rule.id);
    if (!ok) {
      setRules((rows) => [...rows, rule]);
      toast.error("Couldn't delete the rule.");
      return;
    }
    toast.success(`Deleted "${rule.name}".`);
  };

  const runRules = async () => {
    setRunningRules(true);
    const res = await apiPost(adsPath(projectId, "/rules/run"), {});
    setRunningRules(false);
    if (!res.ok) {
      toast.error(res.error || "Couldn't run the rules.");
      return;
    }
    const { evaluated = 0, triggered = 0 } = res.data || {};
    toast.success(triggered ? `${triggered} match${triggered === 1 ? "" : "es"} across ${evaluated} rules.` : `Checked ${evaluated} rules — nothing crossed a threshold.`);
    const [ruleRows] = await Promise.all([listAdRules(projectId), reloadSnapshots()]);
    if (ruleRows) setRules(ruleRows);
  };

  const filtersActive = query || statusFilter !== "all" || accountFilter !== "all";
  const levelCurrency = (s) => accountById.get(s.adAccountId)?.currency || "USD";

  const columns = [
    {
      key: "name",
      header: LEVEL_OPTIONS.find((t) => t.value === level)?.label.replace(/s$/, "") || "Name",
      render: (s) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-foreground">{s.name}</span>
          <span className="truncate text-xs text-text-secondary">
            {s.level === "campaign"
              ? objectiveLabel(s.objective) || "—"
              : [names.get(`campaign:${s.externalCampaignId}`), s.level === "ad" ? names.get(`adset:${s.externalAdsetId}`) : null, s.destinationType ? s.destinationType.toLowerCase().replace(/_/g, " ") : null]
                  .filter(Boolean)
                  .join(" · ") || s.externalId}
          </span>
        </div>
      ),
    },
    { key: "status", header: "Delivery", render: (s) => <StatusPill status={s.effectiveStatus} map={DELIVERY_STATUS_MAP} /> },
    ...(level !== "ad"
      ? [{ key: "budget", header: "Budget/day", align: "right", className: "tabular-nums", render: (s) => (s.dailyBudget ? formatMoney(s.dailyBudget, levelCurrency(s)) : s.lifetimeBudget ? `${formatMoney(s.lifetimeBudget, levelCurrency(s))} total` : "—") }]
      : []),
    { key: "spend", header: "Spend", align: "right", className: "tabular-nums font-medium text-foreground", render: (s) => formatMoney(s.insights.spend, levelCurrency(s)) },
    { key: "impressions", header: "Impr.", align: "right", className: "tabular-nums", render: (s) => formatNumber(s.insights.impressions) },
    { key: "clicks", header: "Clicks · CTR", align: "right", className: "tabular-nums", render: (s) => `${formatNumber(s.insights.clicks)} · ${formatPercent(s.insights.ctr, 2)}` },
    { key: "leads", header: "Leads · CPL", align: "right", className: "tabular-nums", render: (s) => (s.insights.leads ? `${formatNumber(s.insights.leads)} · ${formatMoney(s.insights.cpl, levelCurrency(s))}` : "—") },
    {
      key: "conversations",
      header: "Conv. · cost",
      align: "right",
      className: "tabular-nums",
      render: (s) => (s.insights.conversations ? `${formatNumber(s.insights.conversations)} · ${formatMoney(s.insights.costPerConversation, levelCurrency(s))}` : "—"),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (s) => {
        const paused = s.status === "PAUSED";
        const canToggle = canManage && (s.status === "ACTIVE" || paused) && busyRow !== s.id;
        return (
          <ActionMenu
            label={`Actions for ${s.name}`}
            items={[
              { icon: paused ? Play : Pause, label: paused ? "Resume" : "Pause", disabled: !canToggle, onSelect: () => setEntityStatus(s, paused ? "ACTIVE" : "PAUSED") },
              { icon: ExternalLink, label: "Open in Ads Manager", href: adsManagerUrl(accountById.get(s.adAccountId)?.externalId) },
            ]}
          />
        );
      },
    },
  ];

  const accountColumns = [
    {
      key: "name",
      header: "Ad account",
      render: (a) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-foreground">{a.name}</span>
          <span className="truncate text-xs text-text-secondary">{[a.externalId, a.businessName].filter(Boolean).join(" · ")}</span>
        </div>
      ),
    },
    { key: "status", header: "Status", render: (a) => <StatusPill status={a.status} map={ACCOUNT_STATUS_MAP} /> },
    { key: "currency", header: "Currency", render: (a) => <span className="text-sm text-text-secondary">{a.currency} · {a.timezone}</span> },
    { key: "pages", header: "Pages", align: "right", className: "tabular-nums", render: (a) => formatNumber(a.pages.length) },
    {
      key: "synced",
      header: "Last synced",
      render: (a) => (
        <div className="flex flex-col">
          <span className="text-sm text-text-secondary">{timeAgo(a.lastSyncedAt, now)}</span>
          {a.lastError ? <span className="max-w-64 truncate text-xs text-red-600 dark:text-red-400">{a.lastError}</span> : null}
        </div>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (a) => (
        <ActionMenu
          label={`Actions for ${a.name}`}
          items={[
            { icon: ExternalLink, label: "Open in Ads Manager", href: adsManagerUrl(a.externalId) },
            { icon: RefreshCw, label: "Refresh from Meta", disabled: refreshing || !canManage, onSelect: () => refreshAll([a]) },
            { separator: true },
            { icon: Unplug, label: "Disconnect", destructive: true, disabled: !canManage, onSelect: () => setDisconnectTarget(a) },
          ]}
        />
      ),
    },
  ];

  const ruleColumns = [
    {
      key: "name",
      header: "Rule",
      render: (r) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-foreground">{r.name}</span>
          <span className="truncate text-xs text-text-secondary">
            {ruleSentence(r, accountById.get(r.adAccountId)?.currency || connected[0]?.currency || "USD")}
            {r.adAccountId ? ` · ${accountById.get(r.adAccountId)?.name || "one account"}` : " · all accounts"}
          </span>
        </div>
      ),
    },
    { key: "action", header: "Action", render: (r) => <Badge variant={r.action === "pause" ? "warning" : "neutral"}>{r.action === "pause" ? "Pause" : "Log only"}</Badge> },
    { key: "triggered", header: "Last match", render: (r) => <span className="text-sm text-text-secondary">{r.lastTriggeredAt ? timeAgo(r.lastTriggeredAt, now) : "Never"}</span> },
    { key: "count", header: "Matches", align: "right", className: "tabular-nums", render: (r) => formatNumber(r.triggerCount) },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <Switch checked={r.status === "active"} disabled={!canManage} onCheckedChange={(on) => toggleRule(r, on)} aria-label={`Turn ${r.name} ${r.status === "active" ? "off" : "on"}`} />
          <StatusPill status={r.status} map={RULE_STATUS_MAP} />
        </div>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (r) => (
        <ActionMenu
          label={`Actions for ${r.name}`}
          items={[
            { icon: Pencil, label: "Edit", disabled: !canManage, onSelect: () => setRuleDialog({ open: true, rule: r }) },
            { separator: true },
            { icon: Trash2, label: "Delete", destructive: true, disabled: !canManage, onSelect: () => setRuleDelete(r) },
          ]}
        />
      ),
    },
  ];

  const headerActions = (
    <>
      <Button variant="outline" className={OUTLINE_BUTTON} disabled={!canManage} title={canManage ? undefined : NO_PERMISSION} onClick={() => setConnectOpen(true)}>
        <Plus className="h-4 w-4" /> Connect account
      </Button>
      <Button className={PRIMARY_BUTTON} disabled={!connected.length || refreshing || !canManage} title={canManage ? undefined : NO_PERMISSION} onClick={() => refreshAll()}>
        {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        Refresh from Meta
      </Button>
    </>
  );

  return (
    <MainScreenWrapper>
      <ScreenHeader title="Ad Campaigns" description="Campaigns, ad sets and ads from your connected Meta ad accounts, with automated rules." actions={headerActions} />

      {loading || snapLoading ? (
        <LoadingPanel label="Loading ad campaigns" />
      ) : !connected.length ? (
        <AdsConnectState status={status} onConnected={() => reload()} />
      ) : (
        <>
          <StatsBar stats={stats} />

          <Toolbar>
            <div className="flex items-center gap-2">
              <FilterDropdown value={level} onValueChange={setLevel} options={LEVEL_OPTIONS} height="h-9" />
              {connected.length > 1 ? <AccountSelect accounts={connected} value={accountFilter} onValueChange={setAccountFilter} includeAll className="h-9 w-56" /> : null}
              <FilterDropdown value={statusFilter} onValueChange={setStatusFilter} options={STATUS_FILTER_OPTIONS} height="h-9" />
            </div>
            <SearchInput value={query} onChange={setQuery} placeholder="Search by name or id…" />
          </Toolbar>

          <div className="space-y-5">
            <DataTable
              columns={columns}
              data={pager.pageItems}
              getRowKey={(s) => s.id}
              empty={
                <ListEmptyState
                  icon={Megaphone}
                  filtersActive={filtersActive && scoped.some((s) => s.level === level)}
                  title="Nothing synced yet"
                  description="Refresh from Meta to pull campaigns, ad sets, ads and the last 7 days of insights."
                  onClear={() => {
                    setQuery("");
                    setStatusFilter("all");
                    setAccountFilter("all");
                  }}
                  action={
                    <Button className={PRIMARY_BUTTON} disabled={refreshing || !canManage} onClick={() => refreshAll()}>
                      {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Refresh from Meta
                    </Button>
                  }
                />
              }
            />
            <ListPagination {...pager} itemLabel={LEVEL_OPTIONS.find((t) => t.value === level)?.label.toLowerCase()} />
          </div>

          <SectionCard title="Connected accounts" bodyPadding={false} contentClassName="p-0">
            <DataTable columns={accountColumns} data={connected} getRowKey={(a) => a.id} className="rounded-none border-0" />
          </SectionCard>
        </>
      )}

      {!loading && connected.length ? (
        <SectionCard
          title="Automated rules"
          description="Checked by the scheduler every 5 minutes against the last 7 days of insights."
          bodyPadding={false}
          action={
            <div className="flex items-center gap-2">
              <Button variant="outline" className={OUTLINE_BUTTON} disabled={!rules.length || runningRules || !canManage} onClick={runRules}>
                {runningRules ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gauge className="h-4 w-4" />} Run rules now
              </Button>
              <Button className={PRIMARY_BUTTON} disabled={!canManage} title={canManage ? undefined : NO_PERMISSION} onClick={() => setRuleDialog({ open: true, rule: null })}>
                <Plus className="h-4 w-4" /> New rule
              </Button>
            </div>
          }
        >
          {rules.length ? (
            <DataTable columns={ruleColumns} data={rules} getRowKey={(r) => r.id} onRowClick={canManage ? (r) => setRuleDialog({ open: true, rule: r }) : undefined} className="rounded-none border-0" />
          ) : (
            <p className="px-5 py-6 text-sm text-text-secondary">No rules yet. A rule like &ldquo;pause any ad set whose cost per lead goes above $25 after $50 spend&rdquo; protects budget overnight.</p>
          )}
        </SectionCard>
      ) : null}

      <ConnectDialog
        open={connectOpen}
        onOpenChange={setConnectOpen}
        oauthReady={Boolean(status?.oauth)}
        projectId={projectId}
        onManual={() => {
          setConnectOpen(false);
          setManualOpen(true);
        }}
      />
      <ManualConnectDialog open={manualOpen} onOpenChange={setManualOpen} onConnected={() => reload()} />
      {pendingAccounts.length && !pendingDismissed ? (
        <ChooseAccountsDialog
          accounts={pendingAccounts}
          onDone={() => {
            setPendingDismissed(true);
            reload();
          }}
        />
      ) : null}
      <RuleDialog
        open={ruleDialog.open}
        rule={ruleDialog.rule}
        accounts={connected}
        saving={ruleSaving}
        onOpenChange={(o) => !o && setRuleDialog({ open: false, rule: null })}
        onSave={saveRule}
      />
      <DeleteConfirmDialog
        target={disconnectTarget}
        title="Disconnect ad account"
        name={disconnectTarget?.name}
        confirmLabel="Disconnect"
        description="Campaign stops syncing it. Nothing changes on Meta; synced history stays readable."
        onCancel={() => setDisconnectTarget(null)}
        onConfirm={handleDisconnect}
      />
      <DeleteConfirmDialog target={ruleDelete} title="Delete rule" name={ruleDelete?.name} onCancel={() => setRuleDelete(null)} onConfirm={deleteRule} />
    </MainScreenWrapper>
  );
}

export default AdCampaignsScreen;
