"use client";

import React, { useMemo, useState } from "react";
import { Copy, FileText, Globe, KeyRound, Loader2, Plus, RefreshCw, Settings2, Trash2 } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import { EditorShell } from "@/components/internal/shared/editor_shell";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { useProject } from "@/context/project-context";
import { useCan } from "@/context/rbac-context";
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  ScreenHeader,
  StatsBar,
  Toolbar,
  SearchInput,
  DataTable,
  EmptyState,
  Badge,
  ActionMenu,
  Field,
  LoadingArea,
  SectionCard,
  SettingsList,
  SettingRow,
  Textarea,
} from "@geiger/ui";
import { DEFAULT_PROVIDER, RECORD_PURPOSES, providerFor, regionLabel } from "@/lib/deliverability/records";
import {
  AddDomainDialog,
  DANGER_ICON_BUTTON,
  DELIVERABILITY_MANAGE,
  DOMAIN_STATUS_MAP,
  DeleteDialog,
  DomainStatus,
  OUTLINE_BUTTON,
  PRIMARY_BUTTON,
  RecordBadge,
  RecordsTable,
  copyText,
  formatDateTime,
  number,
  recordsAsText,
  requiredProgress,
  useSendingDomains,
  zoneOf,
} from "./deliverability_kit";

const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All statuses" },
  ...Object.entries(DOMAIN_STATUS_MAP).map(([value, s]) => ({ value, label: s.label })),
];

const REGION_FILTER_OPTIONS = [{ value: "all", label: "All regions" }, ...providerFor(DEFAULT_PROVIDER).regions];

const DOMAIN_NAV = [
  { key: "records", label: "DNS records", icon: FileText, desc: "Publish these at your DNS host, then verify." },
  { key: "settings", label: "Settings", icon: Settings2, desc: "Region and the DKIM key the provider issued for this domain." },
  { key: "details", label: "Details", icon: Globe, desc: "How this domain sends and when it was last checked." },
];

const RECORD_KEYS = ["dkim", "spf", "mx", "dmarc"];

function DomainEditor({ domain, canManage, verifying, onBack, onVerify, onSaveSettings, onDelete }) {
  const provider = providerFor(domain.provider);
  const [region, setRegion] = useState(domain.region);
  const [dkimKey, setDkimKey] = useState(domain.settings.dkimKey || "");
  const [saving, setSaving] = useState(false);
  const dirty = region !== domain.region || dkimKey.trim() !== (domain.settings.dkimKey || "");
  const { verified, total } = requiredProgress(domain);
  const zone = zoneOf(domain.domain);

  const save = async () => {
    setSaving(true);
    await onSaveSettings(domain, { region, settings: { ...domain.settings, dkimKey: dkimKey.replace(/\s+/g, "").replace(/^p=/i, "") } });
    setSaving(false);
  };

  return (
    <EditorShell
      back={{ label: "Back", onClick: onBack }}
      title={domain.domain}
      badges={
        <>
          <DomainStatus domain={domain} />
          <Badge variant="neutral">{regionLabel(domain.provider, domain.region)}</Badge>
          <span className="text-xs text-text-tertiary">
            {verified} of {total} required records verified · Checked {formatDateTime(domain.lastCheckedAt).toLowerCase()}
          </span>
        </>
      }
      actions={
        <>
          <Button variant="ghost" size="icon" aria-label="Delete domain" className={DANGER_ICON_BUTTON} disabled={!canManage} onClick={() => onDelete(domain)}>
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button variant="outline" className={OUTLINE_BUTTON} onClick={() => copyText(recordsAsText(domain), "DNS records")}>
            <Copy className="h-4 w-4" /> Copy records
          </Button>
          <Button className={PRIMARY_BUTTON} disabled={!canManage || verifying} onClick={() => onVerify(domain)}>
            {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Verify now
          </Button>
        </>
      }
      nav={DOMAIN_NAV}
      defaultSection="records"
    >
      {({ active }) => (
        <>
          {active === "records" ? (
            <div className="space-y-4">
              <p className="text-sm text-text-secondary">
                Add these records at the DNS host for <span className="font-medium text-foreground">{zone}</span>. Hosts are shown
                relative to the zone; some DNS hosts want the full name instead.
              </p>
              <RecordsTable domain={domain} />
              <SectionCard>
                <SettingsList>
                  {domain.records.map((r) => (
                    <SettingRow
                      key={r.key}
                      title={RECORD_PURPOSES[r.purpose]?.label || r.key}
                      description={r.message || RECORD_PURPOSES[r.purpose]?.description}
                      control={<RecordBadge status={r.status} />}
                    />
                  ))}
                </SettingsList>
              </SectionCard>
            </div>
          ) : null}

          {active === "settings" ? (
            <SectionCard bare title="Region & DKIM key" description="Where this domain sends from, and the exact DKIM key to verify against." contentClassName="space-y-4">
              <Field label="Sending region" hint="The bounce MX record points at this region's feedback server.">
                <Select value={region} onValueChange={setRegion} disabled={!canManage}>
                  <SelectTrigger className="w-full sm:w-80"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {provider.regions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field
                label="DKIM public key"
                htmlFor="sd-dkim"
                hint="Paste the p= value the provider issued so we verify an exact match. Left empty, any valid published key passes."
              >
                <Textarea
                  id="sd-dkim"
                  value={dkimKey}
                  disabled={!canManage}
                  onChange={(e) => setDkimKey(e.target.value)}
                  placeholder="MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQ…"
                  className="min-h-[96px] font-mono text-xs"
                />
              </Field>
              <div className="flex justify-end">
                <Button className={PRIMARY_BUTTON} disabled={!canManage || !dirty || saving} onClick={save}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save and re-check
                </Button>
              </div>
            </SectionCard>
          ) : null}

          {active === "details" ? (
            <SectionCard bare title="Sending setup" description="How this domain sends, and when it was last verified and checked.">
              <SettingsList>
                <SettingRow icon={KeyRound} title="Sending provider" description="Email leaves through geiger-dash, which registers the domain with this provider and issues its DKIM key." control={<span className="text-sm text-muted-foreground">{provider.label}</span>} />
                <SettingRow title="Region" description="Where the provider sends and receives bounces for this domain." control={<span className="text-sm text-muted-foreground">{regionLabel(domain.provider, domain.region)}</span>} />
                <SettingRow title="Return path" description="SPF and bounce handling live on this subdomain, so the domain's own SPF is untouched." control={<span className="font-mono text-xs text-muted-foreground">{provider.returnPathSubdomain}.{domain.domain}</span>} />
                <SettingRow title="First verified" description="When every required record first passed." control={<span className="text-sm text-muted-foreground">{formatDateTime(domain.verifiedAt)}</span>} />
                <SettingRow title="Last DNS check" description="Domains are re-checked every day; a broken record marks the domain as failing." control={<span className="text-sm text-muted-foreground">{formatDateTime(domain.lastCheckedAt)}</span>} />
                <SettingRow title="Last blocklist check" description="See Blocklist Monitor for results." control={<span className="text-sm text-muted-foreground">{formatDateTime(domain.blocklistCheckedAt)}</span>} />
              </SettingsList>
            </SectionCard>
          ) : null}
        </>
      )}
    </EditorShell>
  );
}

export function SendingDomainsScreen() {
  const { projectId } = useProject();
  const canManage = useCan(DELIVERABILITY_MANAGE);
  const { recordId, openRecord, closeRecord } = useWorkspaceUrl();
  const { loading, domains, verifying, verify, create, saveSettings, remove } = useSendingDomains(projectId);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [regionFilter, setRegionFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return domains.filter((d) => {
      if (q && !d.domain.toLowerCase().includes(q)) return false;
      if (statusFilter !== "all" && d.status !== statusFilter) return false;
      if (regionFilter !== "all" && d.region !== regionFilter) return false;
      return true;
    });
  }, [domains, search, statusFilter, regionFilter]);

  const stats = useMemo(() => {
    const count = (s) => domains.filter((d) => d.status === s).length;
    const missing = domains.reduce((n, d) => n + d.records.filter((r) => r.required && r.status !== "verified").length, 0);
    return [
      { label: "Domains", value: loading ? "" : number(domains.length), footer: "Registered for sending" },
      { label: "Verified", value: loading ? "" : number(count("verified")), footer: "All required records pass" },
      { label: "Pending", value: loading ? "" : number(count("pending")), footer: `${number(missing)} required records outstanding` },
      { label: "Failing", value: loading ? "" : number(count("failing")), footer: "Verified once, now broken" },
    ];
  }, [domains, loading]);

  const pager = usePagination(filtered, { resetKey: `${search}|${statusFilter}|${regionFilter}` });

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
      description="Campaigns can't send from it until it's added again. DNS records at your host aren't touched."
      onCancel={() => setDeleteTarget(null)}
      onConfirm={handleDelete}
    />
  );

  const open = domains.find((d) => d.id === recordId);
  if (open) {
    return (
      <>
        <DomainEditor
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

  const filtersActive = search || statusFilter !== "all" || regionFilter !== "all";
  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setRegionFilter("all");
  };

  const recordColumn = (key) => ({
    key,
    header: RECORD_PURPOSES[key].label,
    className: "whitespace-nowrap",
    render: (d) => {
      const r = d.records.find((x) => x.key === key);
      return r ? <RecordBadge status={r.status} /> : <span className="text-xs text-text-tertiary">—</span>;
    },
  });

  const columns = [
    {
      key: "domain",
      header: "Domain",
      render: (d) => (
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-card text-muted-foreground">
            <Globe className="h-4 w-4" />
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-medium text-foreground">{d.domain}</span>
            <span className="truncate text-xs text-text-secondary">{regionLabel(d.provider, d.region)}</span>
          </div>
        </div>
      ),
    },
    ...RECORD_KEYS.map(recordColumn),
    { key: "status", header: "Status", className: "whitespace-nowrap", render: (d) => <DomainStatus domain={d} /> },
    { key: "checked", header: "Last checked", className: "whitespace-nowrap text-muted-foreground", render: (d) => formatDateTime(d.lastCheckedAt) },
    {
      key: "actions",
      header: "",
      align: "right",
      className: "text-right",
      render: (d) => (
        <ActionMenu
          label={`Actions for ${d.domain}`}
          items={[
            { icon: FileText, label: "View DNS records", onSelect: () => openRecord(d.id) },
            { icon: Copy, label: "Copy records", onSelect: () => copyText(recordsAsText(d), "DNS records") },
            canManage && { icon: RefreshCw, label: "Verify now", onSelect: () => verify(d) },
            canManage && { separator: true },
            canManage && { icon: Trash2, label: "Delete", variant: "destructive", onSelect: () => setDeleteTarget(d) },
          ]}
        />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Sending Domains"
        description="Verify the domains you send from and keep their DNS records healthy."
        actions={
          <Button className={PRIMARY_BUTTON} disabled={!canManage} onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> Add domain
          </Button>
        }
      />

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={statusFilter} onValueChange={setStatusFilter} options={STATUS_FILTER_OPTIONS} height="h-9" />
          <FilterDropdown value={regionFilter} onValueChange={setRegionFilter} options={REGION_FILTER_OPTIONS} height="h-9" />
        </div>
        <SearchInput value={search} onChange={setSearch} placeholder="Search domains…" />
      </Toolbar>

      {loading ? (
        <LoadingArea size={48} label="Loading sending domains" panel />
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
                  icon={Globe}
                  title={filtersActive ? "No matches" : "No sending domains yet"}
                  description={
                    filtersActive
                      ? "Try a different search or filter."
                      : "Add the domain you send from to get its DKIM, SPF, bounce and DMARC records."
                  }
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

      <AddDomainDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        existing={domains}
        onCreate={handleCreate}
      />
      {deleteDialog}
    </MainScreenWrapper>
  );
}

export default SendingDomainsScreen;
