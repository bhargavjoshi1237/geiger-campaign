"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Activity,
  AtSign,
  Building2,
  CheckSquare,
  Copy,
  ExternalLink,
  FileText,
  Handshake,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Unlink,
  Users,
} from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import { EditorShell } from "@/components/internal/shared/editor_shell";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { useProject } from "@/context/project-context";
import { useRbac } from "@/context/rbac-context";
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
  EmptyState,
  Field,
  InlineTitleInput,
  Input,
  LoadingArea,
  ScreenHeader,
  SearchInput,
  SectionCard,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingRow,
  SettingsList,
  StatsBar,
  Switch,
  Textarea,
  Toolbar,
} from "@geiger/ui";
import { createCompany, listCompanies, softDeleteCompany, updateCompany } from "@/lib/supabase/companies";
import { createDeal, listDeals } from "@/lib/supabase/deals";
import { listPipelines } from "@/lib/supabase/pipelines";
import { listContacts } from "@/lib/supabase/contacts";
import { updateCompanyContacts } from "@/lib/crm/api";
import { COMPANY_SIZES, INDUSTRIES } from "@/lib/crm/constants";
import { isFreeMailDomain, normalizeDomain } from "@/lib/crm/domains";
import { formatMoney, moneySummary } from "@/lib/crm/format";
import {
  DeleteDialog,
  OUTLINE_BTN,
  PRIMARY_BTN,
  PersonChip,
  PersonSelect,
  RecordActivity,
  RecordPicker,
  RelatedTasks,
  personName,
  useCrmPeople,
  useRecordIndex,
} from "./crm_shared";
import { CreateDealDialog, DealStatusBadge } from "./deal_editor";

const NONE = "__none__";

const COMPANY_NAV = [
  { key: "details", label: "Details", icon: FileText, desc: "The organization, its web domain and who owns the relationship." },
  { key: "contacts", label: "Contacts", icon: Users, desc: "People at this company, linked by hand or by their email domain." },
  { key: "deals", label: "Deals", icon: Handshake, desc: "Every opportunity with this company, open and closed." },
  { key: "tasks", label: "Tasks", icon: CheckSquare, desc: "Follow-ups on the account." },
  { key: "activity", label: "Activity", icon: Activity, desc: "Notes, calls and deal history across the account." },
];

const CONTACT_STATUS_TONE = { subscribed: "success", unsubscribed: "neutral", bounced: "danger", complained: "danger", pending: "warning" };

function OptionSelect({ value, onChange, options, placeholder, disabled, id }) {
  const list = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? "" : v)} disabled={disabled}>
      <SelectTrigger id={id} className="w-full"><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{placeholder}</SelectItem>
        {list.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function AddCompanyDialog({ open, onOpenChange, onCreate, people, me }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add company</DialogTitle>
          <DialogDescription>Group contacts and deals under the organization they belong to.</DialogDescription>
        </DialogHeader>
        <AddCompanyForm onClose={() => onOpenChange(false)} onCreate={onCreate} people={people} me={me} />
      </DialogContent>
    </Dialog>
  );
}

function AddCompanyForm({ onClose, onCreate, people, me }) {
  const [form, setForm] = useState({ name: "", domain: "", industry: "", size: "", ownerId: me?.id || null });
  const [pending, setPending] = useState(false);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const domain = normalizeDomain(form.domain);
  const freeMail = domain && isFreeMailDomain(domain);

  const submit = async () => {
    if (!form.name.trim()) {
      toast.error("Give the company a name.");
      return;
    }
    if (form.domain.trim() && !domain) {
      toast.error("Enter a domain like northwind.io.");
      return;
    }
    setPending(true);
    const ok = await onCreate({ ...form, name: form.name.trim(), domain, autoAssociate: Boolean(domain) && !freeMail });
    setPending(false);
    if (ok) onClose();
  };

  return (
    <>
      <div className="grid gap-4">
        <Field label="Company name" htmlFor="co-name">
          <Input id="co-name" value={form.name} onChange={(e) => set("name")(e.target.value)} placeholder="Northwind Outdoor" autoFocus />
        </Field>
        <Field
          label="Domain"
          htmlFor="co-domain"
          hint={freeMail ? `${domain} is a personal email provider, so contacts won't be matched by it.` : "Contacts with an email at this domain are linked to the company."}
        >
          <Input id="co-domain" value={form.domain} onChange={(e) => set("domain")(e.target.value)} placeholder="northwind-outdoor.com" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Industry">
            <OptionSelect value={form.industry} onChange={set("industry")} options={INDUSTRIES} placeholder="Not set" />
          </Field>
          <Field label="Size">
            <OptionSelect value={form.size} onChange={set("size")} options={COMPANY_SIZES} placeholder="Not set" />
          </Field>
        </div>
        <Field label="Owner">
          <PersonSelect value={form.ownerId} onChange={set("ownerId")} people={people} me={me} ariaLabel="Owner" />
        </Field>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button className={PRIMARY_BTN} disabled={pending} onClick={submit}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Add company
        </Button>
      </DialogFooter>
    </>
  );
}

const toDraft = (c) => ({
  name: c.name || "",
  domain: c.domain || "",
  website: c.website || "",
  industry: c.industry || "",
  size: c.size || "",
  ownerId: c.ownerId || null,
  address: c.address || "",
  autoAssociate: Boolean(c.autoAssociate),
});

function CompanyContacts({ company, contacts, index, canEdit, onLink, onUnlink, onMatchDomain, busy }) {
  const { openRecordInTab } = useWorkspaceUrl();
  const domain = normalizeDomain(company.domain);
  const freeMail = domain && isFreeMailDomain(domain);
  const [picked, setPicked] = useState(null);

  const columns = [
    {
      key: "name",
      header: "Contact",
      render: (c) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-foreground">{c.name}</span>
          <span className="truncate text-xs text-text-secondary">{c.email || c.phone || "No email"}</span>
        </div>
      ),
    },
    { key: "status", header: "Status", render: (c) => <Badge variant={CONTACT_STATUS_TONE[c.status] || "neutral"}>{c.status}</Badge> },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (c) => (
        <ActionMenu
          label={`Actions for ${c.name}`}
          items={[
            { label: "Open in Audience", icon: ExternalLink, onSelect: () => openRecordInTab(c.id, "Contacts") },
            canEdit ? { separator: true } : null,
            canEdit ? { label: "Remove from company", icon: Unlink, destructive: true, onSelect: () => onUnlink(c) } : null,
          ]}
        />
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {canEdit ? (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-subtle p-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <RecordPicker value={picked} onChange={setPicked} index={index} types={["contact"]} placeholder="Find a contact to add" ariaLabel="Contact to add" />
            <Button
              variant="outline"
              className={OUTLINE_BTN}
              disabled={!picked || busy}
              onClick={async () => {
                if (await onLink(picked.id)) setPicked(null);
              }}
            >
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>
          <Button
            variant="outline"
            className={OUTLINE_BTN}
            disabled={!domain || freeMail || busy}
            title={!domain ? "Add a domain in Details first" : freeMail ? "Personal email domains can't be matched" : undefined}
            onClick={onMatchDomain}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <AtSign className="h-4 w-4" />}
            {domain ? `Match @${domain}` : "Match by domain"}
          </Button>
        </div>
      ) : null}
      <DataTable
        columns={columns}
        data={contacts}
        getRowKey={(c) => c.id}
        onRowClick={(c) => openRecordInTab(c.id, "Contacts")}
        empty={
          <div className="rounded-xl border border-border bg-surface-subtle">
            <EmptyState
              icon={Users}
              title="No contacts linked"
              description={domain ? `Match contacts with an @${domain} email, or add people one by one.` : "Add a domain in Details to match contacts by email, or add people one by one."}
            />
          </div>
        }
      />
    </div>
  );
}

function CompanyDeals({ deals, pipelines, canEdit, onNewDeal }) {
  const { openRecordInTab } = useWorkspaceUrl();
  const byId = useMemo(() => new Map(pipelines.map((p) => [p.id, p])), [pipelines]);
  const columns = [
    { key: "name", header: "Deal", render: (d) => <span className="font-medium text-foreground">{d.name}</span> },
    { key: "stage", header: "Stage", render: (d) => <DealStatusBadge deal={d} pipeline={byId.get(d.pipelineId)} /> },
    { key: "pipeline", header: "Pipeline", className: "text-muted-foreground", render: (d) => byId.get(d.pipelineId)?.name || "—" },
    { key: "value", header: "Value", align: "right", className: "whitespace-nowrap tabular-nums text-foreground", render: (d) => formatMoney(d.value, d.currency) },
  ];
  return (
    <div className="space-y-4">
      {canEdit && pipelines.length ? (
        <div className="flex justify-end">
          <Button className={PRIMARY_BTN} onClick={onNewDeal}>
            <Plus className="h-4 w-4" /> New deal
          </Button>
        </div>
      ) : null}
      <DataTable
        columns={columns}
        data={deals}
        getRowKey={(d) => d.id}
        onRowClick={(d) => openRecordInTab(d.id, "Deals")}
        empty={
          <div className="rounded-xl border border-border bg-surface-subtle">
            <EmptyState icon={Handshake} title="No deals yet" description="Deals linked to this company appear here." />
          </div>
        }
      />
    </div>
  );
}

function CompanyEditor({
  projectId,
  company,
  companies,
  contacts,
  deals,
  pipelines,
  index,
  people,
  byId,
  me,
  canEdit,
  onBack,
  onSave,
  onDelete,
  onContactsChanged,
  onDealCreated,
}) {
  const [draft, setDraft] = useState(() => toDraft(company));
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dealOpen, setDealOpen] = useState(false);
  const set = (k) => (v) => setDraft((d) => ({ ...d, [k]: v }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(company));

  const domain = normalizeDomain(draft.domain);
  const freeMail = domain && isFreeMailDomain(domain);
  const companyContacts = contacts.filter((c) => c.companyId === company.id);
  const ownDeals = deals.filter((d) => d.companyId === company.id);
  const openDeals = ownDeals.filter((d) => d.status === "open");

  const save = async () => {
    if (draft.domain.trim() && !domain) {
      toast.error("Enter a domain like northwind.io.");
      return;
    }
    if (domain && companies.some((c) => c.id !== company.id && normalizeDomain(c.domain) === domain)) {
      toast.error(`Another company already uses ${domain}.`);
      return;
    }
    setSaving(true);
    const patch = { ...draft, name: draft.name.trim() || "Untitled company", domain, autoAssociate: draft.autoAssociate && Boolean(domain) && !freeMail };
    const ok = await onSave(company.id, patch);
    setSaving(false);
    if (ok) setDraft(toDraft({ ...company, ...patch }));
  };

  const link = async (contactId) => {
    setBusy(true);
    const res = await updateCompanyContacts(projectId, company.id, { action: "link", contactIds: [contactId] });
    setBusy(false);
    if (!res.ok || !res.linked) {
      toast.error(res.error || "Couldn't link that contact.");
      return false;
    }
    onContactsChanged([contactId], company.id);
    toast.success("Contact linked.");
    return true;
  };

  const unlink = async (contact) => {
    onContactsChanged([contact.id], null);
    const res = await updateCompanyContacts(projectId, company.id, { action: "unlink", contactIds: [contact.id] });
    if (!res.ok) {
      onContactsChanged([contact.id], company.id);
      toast.error(res.error || "Couldn't remove that contact.");
      return;
    }
    toast.success(`${contact.name} removed from ${company.name}.`);
  };

  const matchDomain = async () => {
    setBusy(true);
    const res = await updateCompanyContacts(projectId, company.id, { action: "match_domain" });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error || "Couldn't match contacts.");
      return;
    }
    if (res.linked) onContactsChanged(null, company.id);
    const skipped = res.skipped ? ` ${res.skipped} already belong to another company.` : "";
    toast.success(res.linked ? `Linked ${res.linked} ${res.linked === 1 ? "contact" : "contacts"} at @${res.domain}.${skipped}` : `No new contacts at @${res.domain}.${skipped}`);
  };

  return (
    <EditorShell
      back={{ label: "Companies", onClick: onBack }}
      title={
        <InlineTitleInput
          value={draft.name}
          onChange={(e) => set("name")(e.target.value)}
          aria-label="Company name"
          placeholder="Untitled company"
          readOnly={!canEdit}
          className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl"
        />
      }
      badges={
        <>
          {company.industry ? <Badge variant="neutral">{company.industry}</Badge> : null}
          {company.domain ? <span className="text-xs text-text-secondary">{company.domain}</span> : null}
          <span className="text-xs tabular-nums text-text-tertiary">
            {companyContacts.length} {companyContacts.length === 1 ? "contact" : "contacts"} · {openDeals.length} open {openDeals.length === 1 ? "deal" : "deals"}
          </span>
        </>
      }
      actions={
        canEdit ? (
          <>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Delete company"
              className="text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400 dark:hover:text-red-400"
              onClick={() => onDelete(company)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button variant="outline" className={OUTLINE_BTN} disabled={!dirty || saving} onClick={save}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save
            </Button>
          </>
        ) : null
      }
      nav={COMPANY_NAV}
      defaultSection="details"
    >
      {({ active }) => (
        <>
          {active === "details" ? (
            <div className="space-y-6">
              <SectionCard bare title="Company profile" description="Who the company is, where it lives online and who owns the relationship.">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Domain" htmlFor="coe-domain">
                    <Input id="coe-domain" value={draft.domain} onChange={(e) => set("domain")(e.target.value)} placeholder="northwind-outdoor.com" disabled={!canEdit} />
                  </Field>
                  <Field label="Website" htmlFor="coe-web">
                    <Input id="coe-web" value={draft.website} onChange={(e) => set("website")(e.target.value)} placeholder="https://northwind-outdoor.com" disabled={!canEdit} />
                  </Field>
                  <Field label="Industry">
                    <OptionSelect value={draft.industry} onChange={set("industry")} options={INDUSTRIES} placeholder="Not set" disabled={!canEdit} />
                  </Field>
                  <Field label="Size" hint="Number of employees.">
                    <OptionSelect value={draft.size} onChange={set("size")} options={COMPANY_SIZES} placeholder="Not set" disabled={!canEdit} />
                  </Field>
                  <Field label="Owner">
                    <PersonSelect value={draft.ownerId} onChange={set("ownerId")} people={people} me={me} disabled={!canEdit} ariaLabel="Owner" />
                  </Field>
                  <Field label="Address" htmlFor="coe-address" className="sm:col-span-2">
                    <Textarea id="coe-address" value={draft.address} onChange={(e) => set("address")(e.target.value)} placeholder="Street, city, country" className="min-h-16" disabled={!canEdit} />
                  </Field>
                </div>
              </SectionCard>
              <SectionCard bare title="Contact matching" description="Automatically link new contacts to this company by their email domain.">
                <SettingsList>
                  <SettingRow
                    icon={AtSign}
                    title="Link new contacts by email domain"
                    description={
                      !domain
                        ? "Add a domain to turn this on."
                        : freeMail
                          ? `${domain} is a personal email provider, so it can't identify this company.`
                          : `New contacts with an @${domain} email join this company automatically.`
                    }
                    control={
                      <Switch
                        checked={draft.autoAssociate && Boolean(domain) && !freeMail}
                        disabled={!canEdit || !domain || freeMail}
                        onCheckedChange={set("autoAssociate")}
                        aria-label="Link new contacts by email domain"
                      />
                    }
                  />
                </SettingsList>
              </SectionCard>
            </div>
          ) : null}

          {active === "contacts" ? (
            <CompanyContacts company={company} contacts={companyContacts} index={index} canEdit={canEdit} onLink={link} onUnlink={unlink} onMatchDomain={matchDomain} busy={busy} />
          ) : null}

          {active === "deals" ? <CompanyDeals deals={ownDeals} pipelines={pipelines} canEdit={canEdit} onNewDeal={() => setDealOpen(true)} /> : null}

          {active === "tasks" ? (
            <RelatedTasks projectId={projectId} relatedType="company" relatedId={company.id} people={people} byId={byId} me={me} canEdit={canEdit} />
          ) : null}

          {active === "activity" ? (
            <RecordActivity
              projectId={projectId}
              relatedType="company"
              relatedId={company.id}
              extraIds={ownDeals.map((d) => d.id)}
              index={index}
              byId={byId}
              me={me}
              canEdit={canEdit}
            />
          ) : null}

          {canEdit && pipelines.length ? (
            <CreateDealDialog
              open={dealOpen}
              onOpenChange={setDealOpen}
              onCreate={onDealCreated}
              pipelines={pipelines}
              index={index}
              people={people}
              me={me}
              defaults={{ companyId: company.id, contactId: companyContacts[0]?.id || null }}
            />
          ) : null}
        </>
      )}
    </EditorShell>
  );
}

export function CompaniesScreen() {
  const { projectId } = useProject();
  const { can } = useRbac();
  const canEdit = can("campaign.crm.edit");
  const { recordId, openRecord, closeRecord } = useWorkspaceUrl();
  const { people, byId, me } = useCrmPeople(projectId);

  const [companies, setCompanies] = useState([]);
  const [deals, setDeals] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [pipelines, setPipelines] = useState([]);
  const [loadedFor, setLoadedFor] = useState(null);

  const [query, setQuery] = useState("");
  const [industryFilter, setIndustryFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    let alive = true;
    Promise.all([listCompanies(projectId), listDeals(projectId), listContacts(projectId), listPipelines(projectId)]).then(
      ([companyRows, dealRows, contactRows, pipelineRows]) => {
        if (!alive) return;
        if (companyRows === null) toast.error("Couldn't load companies.");
        setCompanies(companyRows ?? []);
        setDeals(dealRows ?? []);
        setContacts(contactRows ?? []);
        setPipelines(pipelineRows ?? []);
        setLoadedFor(projectId);
      },
    );
    return () => {
      alive = false;
    };
  }, [projectId]);

  const loading = loadedFor !== projectId;
  const index = useRecordIndex({ deals, companies, contacts });

  const rollup = useMemo(() => {
    const map = new Map(companies.map((c) => [c.id, { contacts: 0, open: [], won: 0 }]));
    for (const c of contacts) if (c.companyId && map.has(c.companyId)) map.get(c.companyId).contacts += 1;
    for (const d of deals) {
      const entry = d.companyId ? map.get(d.companyId) : null;
      if (!entry) continue;
      if (d.status === "open") entry.open.push(d);
      if (d.status === "won") entry.won += 1;
    }
    return map;
  }, [companies, contacts, deals]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return companies.filter((c) => {
      if (industryFilter !== "all" && c.industry !== industryFilter) return false;
      if (ownerFilter === "me" && c.ownerId !== me?.id) return false;
      if (ownerFilter !== "all" && ownerFilter !== "me" && c.ownerId !== ownerFilter) return false;
      if (q && !`${c.name} ${c.domain}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [companies, query, industryFilter, ownerFilter, me]);

  const stats = useMemo(() => {
    const ids = new Set(companies.map((c) => c.id));
    const openDeals = deals.filter((d) => d.status === "open" && ids.has(d.companyId));
    const withOpen = [...rollup.values()].filter((r) => r.open.length).length;
    const linked = contacts.filter((c) => ids.has(c.companyId)).length;
    const value = moneySummary(openDeals, (d) => d.value);
    return [
      { label: "Companies", value: companies.length.toLocaleString("en-US"), footer: `${new Set(companies.map((c) => c.industry).filter(Boolean)).size} industries` },
      { label: "With open deals", value: withOpen.toLocaleString("en-US"), footer: `${openDeals.length} open deals` },
      { label: "Open pipeline", value: value.value, footer: value.footer || "Across all companies" },
      { label: "Linked contacts", value: linked.toLocaleString("en-US"), footer: `${contacts.length ? Math.round((linked / contacts.length) * 100) : 0}% of all contacts` },
    ];
  }, [companies, deals, contacts, rollup]);

  const pager = usePagination(filtered, { resetKey: `${query}|${industryFilter}|${ownerFilter}` });

  const industryOptions = useMemo(
    () => [{ value: "all", label: "All industries" }, ...[...new Set(companies.map((c) => c.industry).filter(Boolean))].sort().map((i) => ({ value: i, label: i }))],
    [companies],
  );
  const ownerOptions = useMemo(
    () => [
      { value: "all", label: "All owners" },
      { value: "me", label: "My companies" },
      ...people.filter((p) => p.id !== me?.id).map((p) => ({ value: p.id, label: p.name })),
    ],
    [people, me],
  );

  // Mutations ----------------------------------------------------------------

  const setContactCompany = (ids, companyId) => {
    if (ids) {
      setContacts((prev) => prev.map((c) => (ids.includes(c.id) ? { ...c, companyId } : c)));
      return;
    }
    listContacts(projectId).then((rows) => rows && setContacts(rows));
  };

  const handleCreate = async (input) => {
    if (input.domain && companies.some((c) => normalizeDomain(c.domain) === input.domain)) {
      toast.error(`A company with ${input.domain} already exists.`);
      return false;
    }
    const company = { id: crypto.randomUUID(), createdBy: me?.id || null, ...input };
    setCompanies((prev) => [company, ...prev]);
    const saved = await createCompany(projectId, company);
    if (!saved) {
      setCompanies((prev) => prev.filter((c) => c.id !== company.id));
      toast.error("Couldn't add the company.");
      return false;
    }
    setCompanies((prev) => prev.map((c) => (c.id === saved.id ? saved : c)));
    toast.success(`Added ${saved.name}.`);
    openRecord(saved.id);
    // Existing contacts at the domain join straight away; new ones are linked by the database.
    if (saved.domain && saved.autoAssociate) {
      const res = await updateCompanyContacts(projectId, saved.id, { action: "match_domain" });
      if (res.ok && res.linked) {
        setContactCompany(null, saved.id);
        toast.success(`Linked ${res.linked} ${res.linked === 1 ? "contact" : "contacts"} at @${res.domain}.`);
      }
    }
    return true;
  };

  const handleSave = async (id, patch) => {
    const before = companies.find((c) => c.id === id);
    setCompanies((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    const saved = await updateCompany(id, patch);
    if (!saved) {
      setCompanies((prev) => prev.map((c) => (c.id === id ? before : c)));
      toast.error("Couldn't save the company.");
      return false;
    }
    setCompanies((prev) => prev.map((c) => (c.id === id ? saved : c)));
    toast.success("Company saved.");
    return true;
  };

  const handleDuplicate = async (company) => {
    const copy = { ...company, id: crypto.randomUUID(), name: `${company.name} (copy)`, domain: "", autoAssociate: false, createdBy: me?.id || null };
    setCompanies((prev) => [copy, ...prev]);
    const saved = await createCompany(projectId, copy);
    if (!saved) {
      setCompanies((prev) => prev.filter((c) => c.id !== copy.id));
      toast.error("Couldn't duplicate the company.");
      return;
    }
    setCompanies((prev) => prev.map((c) => (c.id === saved.id ? saved : c)));
    toast.success("Company duplicated without its domain.");
  };

  const handleDelete = async (company) => {
    setDeleteTarget(null);
    setCompanies((prev) => prev.filter((c) => c.id !== company.id));
    if (recordId === company.id) closeRecord();
    if (!(await softDeleteCompany(company.id))) {
      setCompanies((prev) => [company, ...prev]);
      toast.error("Couldn't delete the company.");
      return;
    }
    toast.success(`Deleted ${company.name}.`);
  };

  const handleDealCreated = async (input) => {
    const deal = { id: crypto.randomUUID(), status: "open", createdBy: me?.id || null, ...input };
    const saved = await createDeal(projectId, deal);
    if (!saved) {
      toast.error("Couldn't create the deal.");
      return false;
    }
    setDeals((prev) => [saved, ...prev]);
    toast.success("Deal created.");
    return true;
  };

  const deleteDialog = (
    <DeleteDialog
      open={!!deleteTarget}
      title="Delete company"
      name={deleteTarget?.name}
      description="Its contacts and deals stay in the CRM, unlinked."
      onCancel={() => setDeleteTarget(null)}
      onConfirm={() => handleDelete(deleteTarget)}
    />
  );

  const open = !loading && recordId ? companies.find((c) => c.id === recordId) : null;
  if (open) {
    return (
      <>
        <CompanyEditor
          key={open.id}
          projectId={projectId}
          company={open}
          companies={companies}
          contacts={contacts}
          deals={deals}
          pipelines={pipelines}
          index={index}
          people={people}
          byId={byId}
          me={me}
          canEdit={canEdit}
          onBack={closeRecord}
          onSave={handleSave}
          onDelete={setDeleteTarget}
          onContactsChanged={setContactCompany}
          onDealCreated={handleDealCreated}
        />
        {deleteDialog}
      </>
    );
  }

  const filtersActive = query || industryFilter !== "all" || ownerFilter !== "all";
  const clearFilters = () => {
    setQuery("");
    setIndustryFilter("all");
    setOwnerFilter("all");
  };

  const columns = [
    {
      key: "company",
      header: "Company",
      render: (c) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-foreground">{c.name}</span>
          <span className="truncate text-xs text-text-secondary">{c.domain || "No domain"}</span>
        </div>
      ),
    },
    { key: "industry", header: "Industry", className: "text-muted-foreground", render: (c) => c.industry || "—" },
    { key: "size", header: "Size", className: "whitespace-nowrap tabular-nums text-muted-foreground", render: (c) => c.size || "—" },
    { key: "contacts", header: "Contacts", align: "right", className: "tabular-nums text-foreground", render: (c) => (rollup.get(c.id)?.contacts || 0).toLocaleString("en-US") },
    {
      key: "deals",
      header: "Open deals",
      align: "right",
      className: "whitespace-nowrap tabular-nums text-foreground",
      render: (c) => {
        const openList = rollup.get(c.id)?.open || [];
        return openList.length ? `${openList.length} · ${moneySummary(openList, (d) => d.value).value}` : <span className="text-text-tertiary">—</span>;
      },
    },
    { key: "owner", header: "Owner", className: "whitespace-nowrap text-muted-foreground", render: (c) => <PersonChip name={personName(byId, c.ownerId, me)} /> },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (c) => (
        <ActionMenu
          label={`Actions for ${c.name}`}
          items={[
            { label: canEdit ? "Edit company" : "Open", icon: Pencil, onSelect: () => openRecord(c.id) },
            canEdit ? { label: "Duplicate", icon: Copy, onSelect: () => handleDuplicate(c) } : null,
            canEdit ? { separator: true } : null,
            canEdit ? { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setDeleteTarget(c) } : null,
          ]}
        />
      ),
    },
  ];

  const addButton = canEdit ? (
    <Button className={PRIMARY_BTN} onClick={() => setAddOpen(true)}>
      <Plus className="h-4 w-4" /> Add company
    </Button>
  ) : null;

  return (
    <MainScreenWrapper>
      <ScreenHeader title="Companies" description="The organizations behind your contacts and deals." actions={addButton} />

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={industryFilter} onValueChange={setIndustryFilter} options={industryOptions} height="h-9" />
          <FilterDropdown value={ownerFilter} onValueChange={setOwnerFilter} options={ownerOptions} height="h-9" />
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search name or domain…" />
      </Toolbar>

      {loading ? (
        <LoadingArea size={56} panel label="Loading companies" />
      ) : (
        <div className="space-y-5">
          <DataTable
            columns={columns}
            data={pager.pageItems}
            getRowKey={(c) => c.id}
            onRowClick={(c) => openRecord(c.id)}
            empty={
              <div className="rounded-xl border border-border bg-surface-subtle">
                <EmptyState
                  icon={Building2}
                  title={filtersActive ? "No matches" : "No companies yet"}
                  description={filtersActive ? "Try a different search or filter." : "Add a company to group contacts and deals by organization."}
                  action={
                    filtersActive ? (
                      <Button variant="outline" className={OUTLINE_BTN} onClick={clearFilters}>Clear filters</Button>
                    ) : (
                      addButton
                    )
                  }
                />
              </div>
            }
          />
          <ListPagination {...pager} itemLabel="companies" />
        </div>
      )}

      {canEdit ? <AddCompanyDialog open={addOpen} onOpenChange={setAddOpen} onCreate={handleCreate} people={people} me={me} /> : null}
      {deleteDialog}
    </MainScreenWrapper>
  );
}

export default CompaniesScreen;
