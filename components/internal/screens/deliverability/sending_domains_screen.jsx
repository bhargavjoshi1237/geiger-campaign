"use client";

import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, FileText, Globe, Pencil, Plus, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import { EditorShell } from "@/components/internal/shared/editor_shell";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
  DataTable,
  EmptyState,
  StatusPill,
  Badge,
  ActionMenu,
  Field,
  InlineTitleInput,
  SectionCard,
  SettingsList,
  SettingRow,
} from "@geiger/ui";
import { DeleteDialog, OUTLINE_BUTTON, PRIMARY_BUTTON } from "./deliverability_kit";

const REGION_LABEL = { us: "US (us-east)", eu: "EU (eu-west)", au: "AU (ap-southeast)" };

const REGION_OPTIONS = [
  { value: "us", label: "United States" },
  { value: "eu", label: "European Union" },
  { value: "au", label: "Australia" },
];

const INITIAL = [
  { id: 1, domain: "mail.halcyon.studio", region: "us", spf: "pass", dkim: "pass", dmarc: "pass", status: "Verified" },
  { id: 2, domain: "news.brightlabs.io", region: "eu", spf: "pass", dkim: "pass", dmarc: "pass", status: "Verified" },
  { id: 3, domain: "send.northwind.co", region: "us", spf: "pass", dkim: "fail", dmarc: "pass", status: "Pending" },
  { id: 4, domain: "updates.lumen.app", region: "au", spf: "pass", dkim: "pass", dmarc: "fail", status: "Pending" },
  { id: 5, domain: "promo.heritagebank.com", region: "us", spf: "fail", dkim: "fail", dmarc: "fail", status: "Failed" },
];

const DOMAIN_STATUS_MAP = {
  Verified: { label: "Verified", variant: "success", dotClass: "bg-emerald-400" },
  Pending: { label: "Pending", variant: "warning", dotClass: "bg-amber-400" },
  Failed: { label: "Failed", variant: "danger", dotClass: "bg-red-400" },
};

const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "Verified", label: "Verified" },
  { value: "Pending", label: "Pending" },
  { value: "Failed", label: "Failed" },
];

const REGION_FILTER_OPTIONS = [{ value: "all", label: "All regions" }, ...REGION_OPTIONS];

const DNS_CHECKS = [
  { key: "spf", label: "SPF", description: "Authorises our servers to send for this domain." },
  { key: "dkim", label: "DKIM", description: "Signs every message so it can't be tampered with." },
  { key: "dmarc", label: "DMARC", description: "Tells providers what to do with unauthenticated mail." },
];

const DOMAIN_NAV = [
  { key: "details", label: "Details", icon: Globe, desc: "The sending domain and the region it sends from." },
  { key: "dns", label: "DNS checks", icon: ShieldCheck, desc: "SPF, DKIM, and DMARC results from the last verification." },
];

const CheckBadge = ({ value }) => (
  <Badge variant={value === "pass" ? "success" : "danger"}>{value === "pass" ? "Pass" : "Fail"}</Badge>
);

// Pass/fail badge for a single DNS check column
const checkColumn = (key, header) => ({ key, header, render: (d) => <CheckBadge value={d[key]} /> });

function AddDomainDialog({ open, onOpenChange, onCreate }) {
  const [domain, setDomain] = useState("");
  const [region, setRegion] = useState("us");

  const submit = () => {
    if (!domain.trim()) {
      toast.error("Enter a domain to add.");
      return;
    }
    onCreate({
      domain: domain.trim().toLowerCase(),
      region,
      spf: "fail",
      dkim: "fail",
      dmarc: "fail",
      status: "Pending",
    });
    setDomain("");
    setRegion("us");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-background">
        <DialogHeader>
          <DialogTitle>Add sending domain</DialogTitle>
          <DialogDescription>Add a domain, then publish the generated DNS records to verify it.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Domain" htmlFor="d-domain" hint="Use a subdomain dedicated to email, e.g. mail.yourbrand.com.">
            <Input
              id="d-domain"
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
          <Field label="Sending region">
            <Select value={region} onValueChange={setRegion}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {REGION_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" className={OUTLINE_BUTTON} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className={PRIMARY_BUTTON} onClick={submit}>Add domain</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DomainEditor({ record, onBack, onSave, onDelete }) {
  const [domain, setDomain] = useState(record.domain);
  const [region, setRegion] = useState(record.region);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const dirty = domain.trim() !== record.domain || region !== record.region;
  const passing = DNS_CHECKS.filter((c) => record[c.key] === "pass").length;

  const save = (extra) =>
    onSave(record.id, { domain: domain.trim().toLowerCase() || record.domain, region, ...extra });

  return (
    <EditorShell
      back={{ label: "Back", onClick: onBack }}
      title={
        <InlineTitleInput
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          aria-label="Domain name"
          placeholder="Untitled domain"
          className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl"
        />
      }
      badges={
        <>
          <StatusPill status={record.status} map={DOMAIN_STATUS_MAP} />
          <Badge variant="neutral">{REGION_LABEL[record.region]}</Badge>
          <span className="text-xs text-text-tertiary">{passing} of {DNS_CHECKS.length} checks passing</span>
        </>
      }
      actions={
        <>
          <Button variant="outline" className={OUTLINE_BUTTON} disabled={!dirty} onClick={() => save()}>
            Save
          </Button>
          <Button className={PRIMARY_BUTTON} onClick={() => save({ status: "Pending" })}>
            <RefreshCw className="h-4 w-4" /> Re-verify
          </Button>
          <ActionMenu
            label="Domain actions"
            items={[{ icon: Trash2, label: "Delete", variant: "destructive", onSelect: () => setDeleteTarget(record) }]}
          />
        </>
      }
      nav={DOMAIN_NAV}
      defaultSection="details"
      after={
        <DeleteDialog
          target={deleteTarget}
          label={deleteTarget?.domain}
          noun="domain"
          onCancel={() => setDeleteTarget(null)}
          onConfirm={(d) => {
            setDeleteTarget(null);
            onDelete(d);
          }}
        />
      }
    >
      {({ active }) => (
        <>
          {active === "details" ? (
            <SectionCard>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Domain" htmlFor="de-domain" hint="Changing the domain requires re-verifying its DNS.">
                  <Input id="de-domain" value={domain} onChange={(e) => setDomain(e.target.value)} />
                </Field>
                <Field label="Sending region">
                  <Select value={region} onValueChange={setRegion}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {REGION_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </SectionCard>
          ) : null}

          {active === "dns" ? (
            <SectionCard>
              <SettingsList>
                {DNS_CHECKS.map((c) => (
                  <SettingRow
                    key={c.key}
                    title={c.label}
                    description={c.description}
                    control={<CheckBadge value={record[c.key]} />}
                  />
                ))}
              </SettingsList>
            </SectionCard>
          ) : null}
        </>
      )}
    </EditorShell>
  );
}

export function SendingDomainsScreen() {
  const { recordId, openRecord, closeRecord } = useWorkspaceUrl();
  const [domains, setDomains] = useState(INITIAL);
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
    const count = (s) => domains.filter((d) => d.status === s).length.toLocaleString("en-US");
    return [
      { label: "Domains", value: domains.length.toLocaleString("en-US") },
      { label: "Verified", value: count("Verified") },
      { label: "Pending", value: count("Pending") },
      { label: "Failed", value: count("Failed") },
    ];
  }, [domains]);

  const pager = usePagination(filtered, { resetKey: `${search}|${statusFilter}|${regionFilter}` });

  const handleCreate = (d) => {
    const row = { id: crypto.randomUUID(), ...d };
    setDomains((p) => [row, ...p]);
    toast.success("Domain added.");
    openRecord(String(row.id));
  };

  const handleSave = (id, patch) => {
    setDomains((p) => p.map((d) => (d.id === id ? { ...d, ...patch } : d)));
    toast.success(patch.status === "Pending" ? "Verification restarted." : "Domain saved.");
  };

  const handleDuplicate = (d) => {
    const copy = { ...d, id: crypto.randomUUID(), domain: `${d.domain} (copy)`, spf: "fail", dkim: "fail", dmarc: "fail", status: "Pending" };
    setDomains((p) => [copy, ...p]);
    toast.success("Domain duplicated.");
  };

  const handleDelete = (d) => {
    setDeleteTarget(null);
    setDomains((p) => p.filter((x) => x.id !== d.id));
    toast.success(`Deleted "${d.domain}".`);
    if (String(d.id) === recordId) closeRecord();
  };

  const reverify = (id) => handleSave(id, { status: "Pending" });

  const open = domains.find((d) => String(d.id) === recordId);
  if (open) {
    return <DomainEditor key={open.id} record={open} onBack={closeRecord} onSave={handleSave} onDelete={handleDelete} />;
  }

  const filtersActive = search || statusFilter !== "all" || regionFilter !== "all";

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
            <span className="truncate text-xs text-text-secondary">{REGION_LABEL[d.region]}</span>
          </div>
        </div>
      ),
    },
    checkColumn("spf", "SPF"),
    checkColumn("dkim", "DKIM"),
    checkColumn("dmarc", "DMARC"),
    { key: "status", header: "Status", render: (d) => <StatusPill status={d.status} map={DOMAIN_STATUS_MAP} /> },
    {
      key: "actions",
      header: "",
      align: "right",
      className: "text-right",
      render: (d) => (
        <ActionMenu
          label="Domain actions"
          items={[
            { icon: Pencil, label: "Edit", onSelect: () => openRecord(String(d.id)) },
            { icon: Copy, label: "Duplicate", onSelect: () => handleDuplicate(d) },
            { icon: FileText, label: "View DNS records", onSelect: () => openRecord(String(d.id)) },
            { icon: RefreshCw, label: "Re-verify", onSelect: () => reverify(d.id) },
            { separator: true },
            { icon: Trash2, label: "Delete", variant: "destructive", onSelect: () => setDeleteTarget(d) },
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
          <Button className={PRIMARY_BUTTON} onClick={() => setCreateOpen(true)}>
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

      <div className="space-y-5">
        <DataTable
          columns={columns}
          data={pager.pageItems}
          getRowKey={(d) => d.id}
          onRowClick={(d) => openRecord(String(d.id))}
          empty={
            <div className="rounded-xl border border-border bg-surface-subtle">
              <EmptyState
                icon={Globe}
                title={filtersActive ? "No matches" : "No sending domains yet"}
                description={
                  filtersActive
                    ? "Try a different search or filter."
                    : "Add a domain and publish its DNS records to start sending from it."
                }
                action={
                  filtersActive ? (
                    <Button
                      variant="outline"
                      className={OUTLINE_BUTTON}
                      onClick={() => {
                        setSearch("");
                        setStatusFilter("all");
                        setRegionFilter("all");
                      }}
                    >
                      Clear filters
                    </Button>
                  ) : (
                    <Button className={PRIMARY_BUTTON} onClick={() => setCreateOpen(true)}>
                      <Plus className="h-4 w-4" /> Add domain
                    </Button>
                  )
                }
              />
            </div>
          }
        />
        <ListPagination {...pager} itemLabel="domains" />
      </div>

      <AddDomainDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={handleCreate} />

      <DeleteDialog
        target={deleteTarget}
        label={deleteTarget?.domain}
        noun="domain"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </MainScreenWrapper>
  );
}

export default SendingDomainsScreen;
