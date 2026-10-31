"use client";

import React, { useMemo, useState } from "react";
import { BadgeCheck, FileText, HeartPulse, Loader2, Lock, Plus, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import { EditorShell } from "@/components/internal/shared/editor_shell";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { useProject } from "@/context/project-context";
import { useCan } from "@/context/rbac-context";
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  ScreenHeader,
  StatsBar,
  Toolbar,
  SearchInput,
  SectionCard,
  DataTable,
  EmptyState,
  Badge,
  ActionMenu,
  Field,
  LoadingArea,
} from "@geiger/ui";
import { AUTH_CHECKS } from "@/lib/deliverability/auth_checks";
import { DMARC_POLICIES, bimiValue, dmarcValue, organizationalDomain } from "@/lib/deliverability/records";
import {
  AddDomainDialog,
  CheckBadge,
  CopyButton,
  DANGER_ICON_BUTTON,
  DELIVERABILITY_MANAGE,
  DeleteDialog,
  IssueList,
  OUTLINE_BUTTON,
  PRIMARY_BUTTON,
  RecordsTable,
  formatDateTime,
  number,
  plural,
  useSendingDomains,
} from "./deliverability_kit";

const HEALTH_MAP = {
  passing: { label: "Passing", variant: "success", dotClass: "bg-emerald-400" },
  warnings: { label: "Warnings", variant: "warning", dotClass: "bg-amber-400" },
  failing: { label: "Failing", variant: "danger", dotClass: "bg-red-400" },
  unchecked: { label: "Not checked", variant: "neutral", dotClass: "bg-zinc-400" },
};

const HEALTH_FILTER_OPTIONS = [
  { value: "all", label: "All results" },
  ...Object.entries(HEALTH_MAP).map(([value, s]) => ({ value, label: s.label })),
];

const POLICY_LABEL = { none: "Monitor only", quarantine: "Quarantine", reject: "Reject", missing: "No DMARC" };
const POLICY_TONE = { none: "warning", quarantine: "success", reject: "success", missing: "danger" };
const POLICY_FILTER_OPTIONS = [{ value: "all", label: "All policies" }, ...Object.entries(POLICY_LABEL).map(([value, label]) => ({ value, label }))];

const ALIGNMENT_OPTIONS = [
  { value: "relaxed", label: "Relaxed (adkim=r)" },
  { value: "strict", label: "Strict (adkim=s)" },
];

const AUTH_NAV = [
  { key: "health", label: "Health", icon: HeartPulse, desc: "SPF, DKIM, DMARC and BIMI results from the last check, with fixes." },
  { key: "dmarc", label: "DMARC policy", icon: ShieldCheck, desc: "Build the DMARC record and tighten it step by step." },
  { key: "bimi", label: "BIMI", icon: BadgeCheck, desc: "Show your logo next to authenticated mail." },
  { key: "records", label: "DNS records", icon: FileText, desc: "Every record this domain publishes, with copyable values." },
];

const CORE = ["spf", "dkim", "dmarc"];

function domainHealth(d) {
  if (!d.auth?.checkedAt) return "unchecked";
  const statuses = CORE.map((k) => d.auth[k]?.status);
  if (statuses.some((s) => s === "fail" || s === "error")) return "failing";
  if (statuses.some((s) => s === "warn")) return "warnings";
  return "passing";
}

const policyOf = (d) => (d.auth?.checkedAt ? d.auth.dmarc?.policy || "missing" : null);

const issueCount = (d) =>
  ["spf", "dkim", "dmarc", "bimi", "rootSpf"].reduce((n, k) => n + (d.auth?.[k]?.issues || []).filter((i) => i.level !== "info").length, 0);

function ValueBox({ value, what }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2 rounded-lg border border-border bg-surface-card px-3 py-2">
      <code className="min-w-0 flex-1 break-all font-mono text-xs text-muted-foreground">{value}</code>
      <CopyButton value={value} what={what} />
    </div>
  );
}

function CheckCard({ title, result }) {
  return (
    <SectionCard title={title} description={result.host} action={<CheckBadge status={result.status} />} contentClassName="space-y-4">
      <p className="text-sm font-medium text-foreground">{result.summary}</p>
      <ValueBox value={result.value} what={`${title} record`} />
      <IssueList issues={result.issues} />
    </SectionCard>
  );
}

// Editable slice of a domain's settings; compared against the saved settings to derive dirty state.
const toDraft = (domain) => ({
  dmarcPolicy: domain.settings.dmarcPolicy || "none",
  dmarcRua: domain.settings.dmarcRua ?? `dmarc@${organizationalDomain(domain.domain)}`,
  dmarcAlignment: domain.settings.dmarcAlignment || "relaxed",
  bimiLogoUrl: domain.settings.bimiLogoUrl || "",
  bimiVmcUrl: domain.settings.bimiVmcUrl || "",
});

const trimDraft = (draft) => Object.fromEntries(Object.entries(draft).map(([k, v]) => [k, String(v).trim()]));

function AuthenticationEditor({ domain, canManage, verifying, onBack, onVerify, onSaveSettings, onDelete }) {
  const [draft, setDraft] = useState(() => toDraft(domain));
  const [saving, setSaving] = useState(false);
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  const settings = { ...domain.settings, ...trimDraft(draft) };
  const dirty = JSON.stringify(trimDraft(draft)) !== JSON.stringify(toDraft(domain));
  const auth = domain.auth || {};
  const checked = Boolean(auth.checkedAt);
  const dmarc = auth.dmarc;
  const enforced = dmarc && ["quarantine", "reject"].includes(dmarc.policy) && (dmarc.pct ?? 100) === 100;

  const save = async () => {
    setSaving(true);
    await onSaveSettings(domain, { settings });
    setSaving(false);
  };

  const saveButton = (
    <div className="flex justify-end">
      <Button className={PRIMARY_BUTTON} disabled={!canManage || !dirty || saving} onClick={save}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save and re-check
      </Button>
    </div>
  );

  const health = domainHealth(domain);

  return (
    <EditorShell
      back={{ label: "Back", onClick: onBack }}
      title={domain.domain}
      status={health}
      statusMap={HEALTH_MAP}
      badges={
        <>
          {policyOf(domain) ? <Badge variant={POLICY_TONE[policyOf(domain)]}>DMARC: {POLICY_LABEL[policyOf(domain)]}</Badge> : null}
          <span className="text-xs text-text-tertiary">
            {checked ? `${plural(issueCount(domain), "issue")} · Checked ${formatDateTime(auth.checkedAt).toLowerCase()}` : "Not checked yet"}
          </span>
        </>
      }
      actions={
        <>
          <Button variant="ghost" size="icon" aria-label="Delete domain" className={DANGER_ICON_BUTTON} disabled={!canManage} onClick={() => onDelete(domain)}>
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button className={PRIMARY_BUTTON} disabled={!canManage || verifying} onClick={() => onVerify(domain)}>
            {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Re-check DNS
          </Button>
        </>
      }
      nav={AUTH_NAV}
      defaultSection="health"
    >
      {({ active }) => (
        <>
          {active === "health" ? (
            checked ? (
              <div className="space-y-4">
                {AUTH_CHECKS.map((c) => (auth[c.key] ? <CheckCard key={c.key} title={c.label} result={auth[c.key]} /> : null))}
                {auth.rootSpf && auth.rootSpf.status !== "none" && auth.rootSpf.issues?.some((i) => i.level !== "info") ? (
                  <CheckCard title="SPF on the From domain" result={auth.rootSpf} />
                ) : null}
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-surface-subtle">
                <EmptyState
                  icon={HeartPulse}
                  title="Not checked yet"
                  description="Run a DNS check to see SPF, DKIM, DMARC and BIMI results for this domain."
                  action={
                    canManage ? (
                      <Button className={PRIMARY_BUTTON} disabled={verifying} onClick={() => onVerify(domain)}>
                        {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Check DNS
                      </Button>
                    ) : null
                  }
                />
              </div>
            )
          ) : null}

          {active === "dmarc" ? (
            <SectionCard bare title="Policy & reporting" description="How receivers treat mail that fails DMARC, and where they send their reports." contentClassName="space-y-4">
              <p className="text-sm text-text-secondary">
                Start at monitor only while you read the aggregate reports, move to quarantine once your own mail passes, then to reject.
                Saving changes the record below; it takes effect when you publish it at your DNS host.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Policy">
                  <Select value={draft.dmarcPolicy} onValueChange={set("dmarcPolicy")} disabled={!canManage}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DMARC_POLICIES.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="DKIM alignment" hint="Relaxed lets subdomains align; strict needs an exact match.">
                  <Select value={draft.dmarcAlignment} onValueChange={set("dmarcAlignment")} disabled={!canManage}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ALIGNMENT_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Aggregate report address (rua)" htmlFor="au-rua" hint="Daily XML reports from receivers. A mailbox or a DMARC reporting service." className="sm:col-span-2">
                  <Input id="au-rua" value={draft.dmarcRua} disabled={!canManage} onChange={(e) => set("dmarcRua")(e.target.value)} placeholder={`dmarc@${organizationalDomain(domain.domain)}`} />
                </Field>
              </div>
              <Field label={`TXT record at _dmarc.${domain.domain}`}>
                <ValueBox value={dmarcValue(domain.domain, settings)} what="DMARC record" />
              </Field>
              {dmarc?.inheritedFrom ? (
                <p className="text-xs text-text-tertiary">
                  Today this domain inherits {dmarc.inheritedFrom}. Publishing its own record overrides that policy for this subdomain only.
                </p>
              ) : null}
              {saveButton}
            </SectionCard>
          ) : null}

          {active === "bimi" ? (
            <SectionCard bare title="Brand logo" description="The logo and certificate receivers use to show your brand next to authenticated mail." contentClassName="space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-text-secondary">DMARC enforcement:</span>
                {enforced ? <Badge variant="success">Ready (p={dmarc.policy})</Badge> : <Badge variant="warning">Needs p=quarantine or p=reject at 100%</Badge>}
              </div>
              <div className="grid gap-4">
                <Field label="Logo URL" htmlFor="au-bimi-logo" hint="HTTPS link to a square SVG Tiny PS file.">
                  <Input id="au-bimi-logo" value={draft.bimiLogoUrl} disabled={!canManage} onChange={(e) => set("bimiLogoUrl")(e.target.value)} placeholder="https://yourbrand.com/bimi/logo.svg" />
                </Field>
                <Field label="Certificate URL (optional)" htmlFor="au-bimi-vmc" hint="A VMC or CMC (.pem). Gmail and Apple Mail require one to show the logo.">
                  <Input id="au-bimi-vmc" value={draft.bimiVmcUrl} disabled={!canManage} onChange={(e) => set("bimiVmcUrl")(e.target.value)} placeholder="https://yourbrand.com/bimi/vmc.pem" />
                </Field>
              </div>
              {settings.bimiLogoUrl ? (
                <Field label={`TXT record at default._bimi.${domain.domain}`}>
                  <ValueBox value={bimiValue(settings)} what="BIMI record" />
                </Field>
              ) : null}
              {saveButton}
            </SectionCard>
          ) : null}

          {active === "records" ? <RecordsTable domain={domain} /> : null}
        </>
      )}
    </EditorShell>
  );
}

export function AuthenticationScreen() {
  const { projectId } = useProject();
  const canManage = useCan(DELIVERABILITY_MANAGE);
  const { recordId, openRecord, closeRecord } = useWorkspaceUrl();
  const { loading, domains, verifying, verify, create, saveSettings, remove } = useSendingDomains(projectId);
  const [query, setQuery] = useState("");
  const [healthFilter, setHealthFilter] = useState("all");
  const [policyFilter, setPolicyFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return domains.filter((d) => {
      if (healthFilter !== "all" && domainHealth(d) !== healthFilter) return false;
      if (policyFilter !== "all" && policyOf(d) !== policyFilter) return false;
      if (q && !d.domain.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [domains, query, healthFilter, policyFilter]);

  const stats = useMemo(() => {
    const issues = domains.reduce((n, d) => n + issueCount(d), 0);
    const enforced = domains.filter((d) => ["quarantine", "reject"].includes(policyOf(d))).length;
    return [
      { label: "Domains", value: loading ? "" : number(domains.length), footer: `${number(domains.filter((d) => d.auth?.checkedAt).length)} checked` },
      { label: "Passing", value: loading ? "" : number(domains.filter((d) => domainHealth(d) === "passing").length), footer: "SPF, DKIM and DMARC clean" },
      { label: "Issues to fix", value: loading ? "" : number(issues), footer: "Errors and warnings" },
      { label: "DMARC enforced", value: loading ? "" : number(enforced), footer: "Quarantine or reject" },
    ];
  }, [domains, loading]);

  const pager = usePagination(filtered, { resetKey: `${query}|${healthFilter}|${policyFilter}` });

  const handleCreate = async (input) => {
    const created = await create(input);
    if (created) openRecord(created.id);
    return Boolean(created);
  };

  const handleDelete = async (d) => {
    setDeleteTarget(null);
    if (d.id === recordId) closeRecord();
    await remove(d);
  };

  const deleteDialog = (
    <DeleteDialog
      target={deleteTarget}
      label={deleteTarget?.domain}
      noun="domain"
      description="It's removed from Sending Domains too. DNS records at your host aren't touched."
      onCancel={() => setDeleteTarget(null)}
      onConfirm={handleDelete}
    />
  );

  const open = domains.find((d) => d.id === recordId);
  if (open) {
    return (
      <>
        <AuthenticationEditor
          key={open.id}
          domain={open}
          canManage={canManage}
          verifying={verifying.includes(open.id)}
          onBack={closeRecord}
          onVerify={verify}
          onSaveSettings={saveSettings}
          onDelete={setDeleteTarget}
        />
        {deleteDialog}
      </>
    );
  }

  const filtersActive = query || healthFilter !== "all" || policyFilter !== "all";
  const clearFilters = () => {
    setQuery("");
    setHealthFilter("all");
    setPolicyFilter("all");
  };

  const checkColumn = (key, header) => ({
    key,
    header,
    className: "whitespace-nowrap",
    render: (d) => (d.auth?.[key] ? <CheckBadge status={d.auth[key].status} /> : <span className="text-xs text-text-tertiary">—</span>),
  });

  const columns = [
    {
      key: "domain",
      header: "Domain",
      render: (d) => (
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-active text-muted-foreground">
            <Lock className="h-4 w-4" />
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-medium text-foreground">{d.domain}</span>
            <span className="truncate text-xs text-text-secondary">{policyOf(d) ? `DMARC: ${POLICY_LABEL[policyOf(d)]}` : "Not checked yet"}</span>
          </div>
        </div>
      ),
    },
    checkColumn("spf", "SPF"),
    checkColumn("dkim", "DKIM"),
    checkColumn("dmarc", "DMARC"),
    checkColumn("bimi", "BIMI"),
    {
      key: "issues",
      header: "Issues",
      className: "tabular-nums text-muted-foreground",
      render: (d) => (d.auth?.checkedAt ? number(issueCount(d)) : "—"),
    },
    { key: "checked", header: "Last checked", className: "whitespace-nowrap text-muted-foreground", render: (d) => formatDateTime(d.auth?.checkedAt || d.lastCheckedAt) },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (d) => (
        <ActionMenu
          label={`Actions for ${d.domain}`}
          items={[
            { label: "View health", icon: HeartPulse, onSelect: () => openRecord(d.id) },
            canManage && { label: "Re-check DNS", icon: RefreshCw, onSelect: () => verify(d) },
            canManage && { separator: true },
            canManage && { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setDeleteTarget(d) },
          ]}
        />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Authentication"
        description="Check SPF, DKIM, DMARC and BIMI on every sending domain, with the fix for each problem."
        actions={
          <Button className={PRIMARY_BUTTON} disabled={!canManage} onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> Add domain
          </Button>
        }
      />

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={healthFilter} onValueChange={setHealthFilter} options={HEALTH_FILTER_OPTIONS} height="h-9" />
          <FilterDropdown value={policyFilter} onValueChange={setPolicyFilter} options={POLICY_FILTER_OPTIONS} height="h-9" />
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search domains…" />
      </Toolbar>

      {loading ? (
        <LoadingArea size={48} label="Loading domains" panel />
      ) : (
        <div className="space-y-5">
          <DataTable
            columns={columns}
            data={pager.pageItems}
            getRowKey={(d) => d.id}
            onRowClick={(d) => openRecord(d.id)}
            empty={
              <div className="rounded-xl border border-border bg-surface-subtle">
                <EmptyState
                  icon={ShieldCheck}
                  title={filtersActive ? "No matches" : "No domains to authenticate yet"}
                  description={filtersActive ? "Try a different search or filter." : "Add a sending domain to check its SPF, DKIM and DMARC setup."}
                  action={
                    filtersActive ? (
                      <Button variant="outline" className={OUTLINE_BUTTON} onClick={clearFilters}>
                        Clear filters
                      </Button>
                    ) : canManage ? (
                      <Button className={PRIMARY_BUTTON} onClick={() => setCreateOpen(true)}>
                        <Plus className="h-4 w-4" /> Add domain
                      </Button>
                    ) : null
                  }
                />
              </div>
            }
          />
          <ListPagination {...pager} itemLabel="domains" />
        </div>
      )}

      <AddDomainDialog open={createOpen} onOpenChange={setCreateOpen} existing={domains} onCreate={handleCreate} />
      {deleteDialog}
    </MainScreenWrapper>
  );
}

export default AuthenticationScreen;
