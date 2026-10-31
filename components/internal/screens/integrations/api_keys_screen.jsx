"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, RefreshCw, Pencil, Trash2, KeyRound, FileText, Activity, Ban, Code2, Loader2 } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import { EditorShell } from "@/components/internal/shared/editor_shell";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { useProject } from "@/context/project-context";
import { useRbac } from "@/context/rbac-context";
import { apiPost } from "@/lib/api/client";
import { listApiKeys, normalizeApiKey, softDeleteApiKey, updateApiKey } from "@/lib/supabase/api_keys";
import { API_SCOPES, EXPIRY_OPTIONS, KEY_KINDS, scopeLabel } from "@/lib/integrations/scopes";
import { CodeBlock } from "@/components/internal/screens/data/shared/code_block";
import { appBaseUrl, DANGER_BUTTON, DANGER_ICON_BUTTON, formatDate, formatNumber, OUTLINE_BUTTON, relativeTime } from "@/components/internal/screens/data/shared/format";
import { SecretDialog } from "./shared/secret_dialog";
import {
  ActionMenu,
  Badge,
  Button,
  Checkbox,
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
  Label,
  LoadingArea,
  ScreenHeader,
  SearchInput,
  SectionCard,
  SegmentedTabs,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingRow,
  SettingsList,
  StatsBar,
  StatusPill,
  Toolbar,
} from "@geiger/ui";

const MANAGE = "campaign.integration.manage";

const STATUS_MAP = {
  active: { label: "Active", variant: "success" },
  expired: { label: "Expired", variant: "warning" },
  revoked: { label: "Revoked", variant: "danger" },
};
const KIND_TONE = { secret: "purple", public: "info" };

const KIND_FILTER_OPTIONS = [{ value: "all", label: "All types" }, { value: "secret", label: "Secret" }, { value: "public", label: "Public" }];
const STATUS_FILTER_OPTIONS = [{ value: "all", label: "All statuses" }, ...Object.entries(STATUS_MAP).map(([value, m]) => ({ value, label: m.label }))];

const KEY_NAV = [
  { key: "details", label: "Details", icon: FileText, desc: "Name the key and choose what it can do." },
  { key: "secret", label: "Secret", icon: KeyRound, desc: "How the key starts, and rolling it if it leaked." },
  { key: "usage", label: "Usage", icon: Activity, desc: "When the key was issued, last used and when it expires." },
  { key: "quickstart", label: "Quickstart", icon: Code2, desc: "Requests this key can make." },
];

const masked = (k) => (k.kind === "public" && k.displayKey ? k.displayKey : `${k.prefix}…`);
const expiryLabel = (k) => (k.expiresAt ? `Expires ${formatDate(k.expiresAt)}` : "No expiry");

function ScopePicker({ value, onChange, disabled }) {
  const toggle = (key, on) => onChange(on ? API_SCOPES.map((s) => s.key).filter((s) => s === key || value.includes(s)) : value.filter((s) => s !== key));
  return (
    <div className="space-y-2 rounded-lg border border-border bg-surface-card p-3">
      {API_SCOPES.map((s) => (
        <Label key={s.key} htmlFor={`scope-${s.key}`} className="flex cursor-pointer items-start gap-2.5 font-normal">
          <Checkbox id={`scope-${s.key}`} checked={value.includes(s.key)} disabled={disabled} onCheckedChange={(c) => toggle(s.key, c === true)} className="mt-0.5" />
          <span className="min-w-0">
            <span className="block text-sm text-foreground">{s.label} <span className="font-mono text-xs text-text-tertiary">{s.key}</span></span>
            <span className="block text-xs text-text-secondary">{s.description}</span>
          </span>
        </Label>
      ))}
    </div>
  );
}

const EMPTY_FORM = { name: "", kind: "secret", scopes: ["contacts:read", "contacts:write", "events:write"], expiry: "never" };

function CreateKeyDialog({ open, onOpenChange, onCreate }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.name.trim()) {
      toast.error("Give the key a name first.");
      return;
    }
    if (form.kind === "secret" && !form.scopes.length) {
      toast.error("Choose at least one scope.");
      return;
    }
    setSubmitting(true);
    const ok = await onCreate({ name: form.name.trim(), kind: form.kind, scopes: form.kind === "public" ? ["events:write"] : form.scopes, expiry: form.expiry });
    setSubmitting(false);
    if (ok) {
      setForm(EMPTY_FORM);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) setForm(EMPTY_FORM); onOpenChange(o); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create API key</DialogTitle>
          <DialogDescription>The full key is shown once, right after it&apos;s created.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Key name" htmlFor="k-name">
            <Input id="k-name" value={form.name} onChange={(e) => set("name")(e.target.value)} placeholder="e.g. Production backend" autoFocus />
          </Field>
          <Field label="Type" hint={KEY_KINDS[form.kind].description}>
            <SegmentedTabs tabs={[{ value: "secret", label: "Secret key" }, { value: "public", label: "Public key" }]} value={form.kind} onChange={set("kind")} fullWidth />
          </Field>
          {form.kind === "secret" ? (
            <Field label="Scopes">
              <ScopePicker value={form.scopes} onChange={set("scopes")} />
            </Field>
          ) : (
            <p className="rounded-lg border border-border bg-surface-card px-3 py-2.5 text-sm text-text-secondary">
              Public keys can only send tracking events (<span className="font-mono">events:write</span>) to <span className="font-mono">/api/public/track</span>.
            </p>
          )}
          <Field label="Expiry">
            <Select value={form.expiry} onValueChange={set("expiry")}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{EXPIRY_OPTIONS.map((x) => <SelectItem key={x.value} value={x.value}>{x.label}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!form.name.trim() || submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Create key
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const toDraft = (k) => ({ name: k.name, scopes: k.scopes });

function quickstart(key, base) {
  const auth = `-H "Authorization: Bearer ${key.prefix}…"`;
  const examples = [];
  if (key.kind === "public") {
    examples.push(`# Browser snippet — see Event Tracking for the install code
curl -X POST ${base}/api/public/track \\
  -H "Content-Type: text/plain" \\
  -d '{ "key": "${key.displayKey || `${key.prefix}…`}", "batch": [{ "type": "track", "event": "signup_started", "anonymousId": "a1b2" }] }'`);
    return examples.join("\n\n");
  }
  if (key.scopes.includes("contacts:read")) examples.push(`# List contacts\ncurl ${base}/api/v1/contacts?limit=50 \\\n  ${auth}`);
  if (key.scopes.includes("contacts:write")) examples.push(`# Create or update a contact by email\ncurl -X POST ${base}/api/v1/contacts \\\n  ${auth} \\\n  -H "Content-Type: application/json" \\\n  -d '{ "email": "jane@example.com", "first_name": "Jane", "tags": ["beta"] }'`);
  if (key.scopes.includes("events:write")) examples.push(`# Record an event\ncurl -X POST ${base}/api/v1/events \\\n  ${auth} \\\n  -H "Content-Type: application/json" \\\n  -d '{ "name": "order_completed", "email": "jane@example.com", "revenue": 129, "currency": "USD" }'`);
  if (key.scopes.includes("campaigns:read")) examples.push(`# List sent campaigns\ncurl "${base}/api/v1/campaigns?status=sent" \\\n  ${auth}`);
  if (key.scopes.includes("messages:send")) examples.push(`# Send a message\ncurl -X POST ${base}/api/v1/messages \\\n  ${auth} \\\n  -H "Content-Type: application/json" \\\n  -d '{ … }'`);
  if (key.scopes.includes("data:write")) examples.push(`# Upsert catalog items\ncurl -X PUT ${base}/api/v1/catalogs/<catalog>/items \\\n  ${auth} \\\n  -H "Content-Type: application/json" \\\n  -d '{ "items": [{ "external_id": "SKU-1", "title": "…" }] }'`);
  return examples.join("\n\n") || "# This key has no scopes yet.";
}

function KeyEditor({ record, canEdit, busy, onBack, onSave, onRoll, onRevoke, onRemove }) {
  const [draft, setDraft] = useState(() => toDraft(record));
  const [saving, setSaving] = useState(false);
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(record));
  const live = record.status === "active";
  const editable = canEdit && !record.revokedAt;

  const save = async () => {
    if (!draft.name.trim()) {
      toast.error("A key needs a name.");
      return;
    }
    if (record.kind === "secret" && !draft.scopes.length) {
      toast.error("Choose at least one scope.");
      return;
    }
    setSaving(true);
    const saved = await onSave(record.id, record.kind === "secret" ? { name: draft.name.trim(), scopes: draft.scopes } : { name: draft.name.trim() });
    setSaving(false);
    if (saved) setDraft(toDraft(saved));
  };

  return (
    <EditorShell
      back={{ label: "Back", onClick: onBack }}
      title={<InlineTitleInput value={draft.name} onChange={(e) => set("name")(e.target.value)} disabled={!editable} aria-label="Key name" placeholder="Untitled key" className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl" />}
      status={record.status}
      statusMap={STATUS_MAP}
      badges={
        <>
          <Badge variant={KIND_TONE[record.kind]}>{KEY_KINDS[record.kind].label}</Badge>
          <span className="font-mono text-xs text-text-tertiary">{masked(record)}</span>
        </>
      }
      actions={
        canEdit ? (
          <>
            {record.revokedAt ? (
              <Button variant="ghost" size="icon" aria-label="Remove key" className={DANGER_ICON_BUTTON} onClick={() => onRemove(record)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            ) : (
              <Button variant="outline" className={OUTLINE_BUTTON} onClick={() => onRevoke(record)}>
                <Ban className="h-4 w-4" /> Revoke
              </Button>
            )}
            <Button variant="outline" className={OUTLINE_BUTTON} disabled={!dirty || saving || !editable} onClick={save}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
          </>
        ) : null
      }
      nav={KEY_NAV}
      defaultSection="details"
    >
      {({ active }) => (
        <>
          {active === "details" ? (
            <SectionCard bare title="Name & scopes" description="How the key is labelled and which endpoints it can call.">
              <div className="grid gap-4">
                <Field label="Key name" htmlFor="ke-name">
                  <Input id="ke-name" value={draft.name} disabled={!editable} onChange={(e) => set("name")(e.target.value)} />
                </Field>
                {record.kind === "secret" ? (
                  <Field label="Scopes" hint="Changes apply to the next request.">
                    <ScopePicker value={draft.scopes} onChange={set("scopes")} disabled={!editable} />
                  </Field>
                ) : (
                  <Field label="Scopes">
                    <p className="text-sm text-text-secondary">Public keys can only send tracking events (<span className="font-mono">events:write</span>).</p>
                  </Field>
                )}
              </div>
            </SectionCard>
          ) : null}

          {active === "secret" ? (
            <SectionCard bare title="Key value" description="The stored prefix of this key, and how to replace it if it leaked.">
              <SettingsList>
                <SettingRow
                  title={record.kind === "public" ? "Public key" : "Secret key"}
                  description={record.kind === "public" ? "Public keys are meant to be embedded in pages, so the whole key stays visible." : "Only the first characters are kept for display; the full key was shown once."}
                  control={<span className="max-w-[320px] break-all font-mono text-sm text-foreground">{masked(record)}</span>}
                />
                <SettingRow
                  title="Roll key"
                  description="Issue a new key in place. The current one stops working immediately."
                  control={
                    <Button variant="outline" size="sm" className={OUTLINE_BUTTON} disabled={!editable || busy} onClick={() => onRoll(record)}>
                      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Roll key
                    </Button>
                  }
                />
              </SettingsList>
            </SectionCard>
          ) : null}

          {active === "usage" ? (
            <SectionCard bare title="Key lifetime" description="When the key was issued, last used and when it stops working.">
              <SettingsList>
                <SettingRow title="Created" description="When this key was issued." control={<span className="text-sm font-medium text-foreground">{formatDate(record.createdAt)}</span>} />
                <SettingRow title="Last used" description="The most recent request authenticated with it (updated at most once a minute)." control={<span className="text-sm font-medium text-foreground">{relativeTime(record.lastUsedAt)}</span>} />
                <SettingRow title="Expiry" description="When the key stops working on its own." control={<span className="text-sm font-medium text-foreground">{expiryLabel(record)}</span>} />
                {record.revokedAt ? <SettingRow title="Revoked" description="Requests with this key are rejected." control={<span className="text-sm font-medium text-foreground">{formatDate(record.revokedAt)}</span>} /> : null}
              </SettingsList>
            </SectionCard>
          ) : null}

          {active === "quickstart" ? (
            <SectionCard description={live ? "Replace the truncated key with the full one you copied when it was issued." : "This key no longer works; these show what it could do."}>
              <CodeBlock code={quickstart(record, appBaseUrl())} />
            </SectionCard>
          ) : null}
        </>
      )}
    </EditorShell>
  );
}

export function ApiKeysScreen() {
  const { projectId } = useProject();
  const { can } = useRbac();
  const canEdit = can(MANAGE);
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadedAt, setLoadedAt] = useState(0);
  const [busyId, setBusyId] = useState(null);
  const [issued, setIssued] = useState(null);
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState(null);
  const { recordId, openRecord, closeRecord } = useWorkspaceUrl();

  useEffect(() => {
    let alive = true;
    listApiKeys(projectId).then((rows) => {
      if (!alive) return;
      setKeys(rows ?? []);
      setLoadedAt(Date.now());
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return keys.filter((k) => {
      if (kindFilter !== "all" && k.kind !== kindFilter) return false;
      if (statusFilter !== "all" && k.status !== statusFilter) return false;
      if (q && !`${k.name} ${k.prefix}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [keys, query, kindFilter, statusFilter]);

  const stats = useMemo(() => {
    const active = keys.filter((k) => k.status === "active");
    const weekAgo = loadedAt - 7 * 86_400_000;
    return [
      { label: "Active keys", value: formatNumber(active.length) },
      { label: "Secret", value: formatNumber(active.filter((k) => k.kind === "secret").length) },
      { label: "Public", value: formatNumber(active.filter((k) => k.kind === "public").length) },
      { label: "Used · 7d", value: formatNumber(active.filter((k) => k.lastUsedAt && Date.parse(k.lastUsedAt) >= weekAgo).length) },
    ];
  }, [keys, loadedAt]);

  const pager = usePagination(filtered, { resetKey: `${query}|${kindFilter}|${statusFilter}` });
  const replaceKey = (key) => setKeys((p) => p.map((k) => (k.id === key.id ? key : k)));

  const issuedFor = (key, value) => ({
    title: key.kind === "public" ? "Your public key" : "Copy your new key",
    name: key.name,
    value,
    note: key.kind === "public" ? "Public keys can only send tracking events, so this one stays visible in API Keys and Event Tracking." : undefined,
  });

  const handleCreate = async (input) => {
    const res = await apiPost(`/api/projects/${projectId}/integrations/api-keys`, input);
    if (!res.ok) {
      toast.error(res.error || "Couldn't create the key.");
      return false;
    }
    const key = normalizeApiKey(res.data.apiKey);
    setKeys((p) => [key, ...p]);
    setIssued(issuedFor(key, res.data.key));
    openRecord(key.id);
    return true;
  };

  const handleSave = async (id, patch) => {
    const previous = keys;
    setKeys((p) => p.map((k) => (k.id === id ? { ...k, ...patch } : k)));
    const saved = await updateApiKey(id, patch);
    if (!saved) {
      setKeys(previous);
      toast.error("Couldn't save the key.");
      return null;
    }
    replaceKey(saved);
    toast.success("API key saved.");
    return saved;
  };

  const handleRoll = async (key) => {
    setBusyId(key.id);
    const res = await apiPost(`/api/projects/${projectId}/integrations/api-keys/${key.id}/roll`, {});
    setBusyId(null);
    if (!res.ok) {
      toast.error(res.error || "Couldn't roll the key.");
      return;
    }
    const next = normalizeApiKey(res.data.apiKey);
    replaceKey(next);
    setIssued(issuedFor(next, res.data.key));
    toast.success(`Rolled ${key.name}. Update anything still using the old key.`);
  };

  const handleRevoke = async (key) => {
    setRevokeTarget(null);
    const res = await apiPost(`/api/projects/${projectId}/integrations/api-keys/${key.id}/revoke`, {});
    if (!res.ok) {
      toast.error(res.error || "Couldn't revoke the key.");
      return;
    }
    replaceKey(normalizeApiKey(res.data.apiKey));
    toast.success(`Revoked ${key.name}.`);
  };

  const handleRemove = async (key) => {
    setKeys((p) => p.filter((k) => k.id !== key.id));
    if (key.id === recordId) closeRecord();
    if (await softDeleteApiKey(key.id)) {
      toast.success(`Removed ${key.name}.`);
    } else {
      setKeys((p) => [key, ...p]);
      toast.error("Couldn't remove the key.");
    }
  };

  const revokeDialog = (
    <Dialog open={!!revokeTarget} onOpenChange={(o) => !o && setRevokeTarget(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Revoke API key</DialogTitle>
          <DialogDescription>
            Revoke <span className="font-medium text-foreground">{revokeTarget?.name}</span>? Anything using it loses access immediately, and a revoked key can&apos;t be restored.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setRevokeTarget(null)}>Cancel</Button>
          <Button className={DANGER_BUTTON} onClick={() => handleRevoke(revokeTarget)}>
            <Ban className="h-4 w-4" /> Revoke
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
  const issuedDialog = <SecretDialog issued={issued} onClose={() => setIssued(null)} />;

  const open = !loading ? keys.find((k) => k.id === recordId) : null;
  if (open) {
    return (
      <>
        <KeyEditor key={open.id} record={open} canEdit={canEdit} busy={busyId === open.id} onBack={closeRecord} onSave={handleSave} onRoll={handleRoll} onRevoke={setRevokeTarget} onRemove={handleRemove} />
        {revokeDialog}
        {issuedDialog}
      </>
    );
  }

  const filtersActive = query || kindFilter !== "all" || statusFilter !== "all";
  const clearFilters = () => {
    setQuery("");
    setKindFilter("all");
    setStatusFilter("all");
  };

  const columns = [
    {
      key: "name",
      header: "Name",
      render: (k) => (
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-active text-muted-foreground">
            <KeyRound className="h-4 w-4" />
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="font-medium text-foreground">{k.name}</span>
            <span className="max-w-[280px] truncate text-xs text-text-secondary">{k.scopes.map(scopeLabel).join(" · ") || "No scopes"}</span>
          </div>
        </div>
      ),
    },
    { key: "key", header: "Key", className: "max-w-[220px] truncate font-mono text-muted-foreground", render: masked },
    { key: "kind", header: "Type", render: (k) => <Badge variant={KIND_TONE[k.kind]}>{KEY_KINDS[k.kind].label}</Badge> },
    { key: "created", header: "Created", className: "whitespace-nowrap text-muted-foreground", render: (k) => formatDate(k.createdAt) },
    { key: "lastUsed", header: "Last used", className: "whitespace-nowrap text-muted-foreground", render: (k) => relativeTime(k.lastUsedAt) },
    { key: "status", header: "Status", className: "whitespace-nowrap", render: (k) => <StatusPill status={k.status} map={STATUS_MAP} /> },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (k) => (
        <ActionMenu
          label={`Actions for ${k.name}`}
          items={[
            { label: canEdit ? "Edit key" : "View key", icon: Pencil, onSelect: () => openRecord(k.id) },
            canEdit && !k.revokedAt && { label: "Roll key", icon: RefreshCw, spin: busyId === k.id, onSelect: () => handleRoll(k) },
            canEdit && { separator: true },
            canEdit && !k.revokedAt && { label: "Revoke", icon: Ban, destructive: true, onSelect: () => setRevokeTarget(k) },
            canEdit && k.revokedAt && { label: "Remove", icon: Trash2, destructive: true, onSelect: () => handleRemove(k) },
          ]}
        />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="API Keys"
        description="Secret keys for your servers and public keys for the tracking snippet."
        actions={
          canEdit ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> Create key
            </Button>
          ) : null
        }
      />

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={kindFilter} onValueChange={setKindFilter} options={KIND_FILTER_OPTIONS} height="h-9" />
          <FilterDropdown value={statusFilter} onValueChange={setStatusFilter} options={STATUS_FILTER_OPTIONS} height="h-9" />
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search keys…" />
      </Toolbar>

      {loading ? (
        <LoadingArea size={48} panel label="Loading API keys" />
      ) : (
        <div className="space-y-5">
          <DataTable
            columns={columns}
            data={pager.pageItems}
            getRowKey={(k) => k.id}
            onRowClick={(k) => openRecord(k.id)}
            empty={
              <div className="rounded-xl border border-border bg-surface-subtle">
                <EmptyState
                  icon={KeyRound}
                  title={filtersActive ? "No matches" : "No API keys yet"}
                  description={filtersActive ? "Try a different search or filter." : "Create a secret key to call the Geiger API from your services, or a public key for the tracking snippet."}
                  action={
                    filtersActive ? (
                      <Button variant="outline" className={OUTLINE_BUTTON} onClick={clearFilters}>Clear filters</Button>
                    ) : canEdit ? (
                      <Button onClick={() => setCreateOpen(true)}>
                        <Plus className="h-4 w-4" /> Create key
                      </Button>
                    ) : null
                  }
                />
              </div>
            }
          />
          <ListPagination {...pager} itemLabel="keys" />
        </div>
      )}

      <CreateKeyDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={handleCreate} />
      {revokeDialog}
      {issuedDialog}
    </MainScreenWrapper>
  );
}

export default ApiKeysScreen;
