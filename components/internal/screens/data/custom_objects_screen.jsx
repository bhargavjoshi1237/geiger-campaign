"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Boxes, Pencil, Copy, Database, Trash2, FileText, Braces, Rows3, FileUp, Code2, Loader2 } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import { EditorShell } from "@/components/internal/shared/editor_shell";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { useProject } from "@/context/project-context";
import { useRbac } from "@/context/rbac-context";
import { getUser } from "@/lib/supabase/user";
import {
  contactIdsByEmail,
  createObjectRecord,
  createObjectType,
  importObjectRecords,
  listObjectRecords,
  listObjectTypes,
  softDeleteObjectRecord,
  softDeleteObjectType,
  updateObjectRecord,
  updateObjectType,
} from "@/lib/supabase/custom_objects";
import { formatValue, recordLabel, sanitizeFields, toKey, KEY_PATTERN } from "@/lib/data/fields";
import { SchemaEditor } from "./shared/schema_editor";
import { RecordDialog } from "./shared/record_dialog";
import { CsvImport } from "./shared/csv_import";
import { CodeBlock } from "./shared/code_block";
import { appBaseUrl, DANGER_BUTTON, DANGER_ICON_BUTTON, formatDate, formatNumber, OUTLINE_BUTTON, relativeTime } from "./shared/format";
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
  StatsBar,
  Textarea,
  Toolbar,
} from "@geiger/ui";

const RECORDS_FILTER_OPTIONS = [
  { value: "all", label: "All objects" },
  { value: "populated", label: "Has records" },
  { value: "empty", label: "No records" },
];

const RELATIONSHIPS = [
  { value: "many", label: "Many per contact", hint: "e.g. bookings, tickets, orders" },
  { value: "one", label: "One per contact", hint: "e.g. a subscription or a membership" },
];

const OBJECT_NAV = [
  { key: "details", label: "Details", icon: FileText, desc: "How the object is named and how it relates to contacts." },
  { key: "schema", label: "Fields", icon: Braces, desc: "The fields every record stores. Keys are used in lookups and the API." },
  { key: "records", label: "Records", icon: Rows3, desc: "Stored records, optionally linked to a contact." },
  { key: "import", label: "Import", icon: FileUp, desc: "Add or update records from a CSV file." },
  { key: "api", label: "API & personalization", icon: Code2, desc: "Write records from your systems and use them in messages." },
];

const MANAGE = "campaign.data.manage";

function CreateObjectDialog({ open, onOpenChange, onCreate, takenKeys }) {
  const [name, setName] = useState("");
  const [primaryLabel, setPrimaryLabel] = useState("");
  const [relationship, setRelationship] = useState("many");
  const apiName = toKey(name, "object");

  const reset = () => {
    setName("");
    setPrimaryLabel("");
    setRelationship("many");
  };

  const submit = () => {
    if (!name.trim()) {
      toast.error("Give the object a name.");
      return;
    }
    if (takenKeys.has(apiName)) {
      toast.error(`An object called ${apiName} already exists.`);
      return;
    }
    const label = primaryLabel.trim() || "Name";
    const primary = { key: toKey(label, "name"), label, type: "text", required: true };
    onCreate({ name: name.trim(), key: apiName, relationship, primaryField: primary.key, fields: [primary] });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New custom object</DialogTitle>
          <DialogDescription>Model data beyond contacts. You can add more fields after creating it.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Object name" htmlFor="o-name" hint="Singular, e.g. Subscription.">
            <Input id="o-name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }} placeholder="e.g. Subscription" autoFocus />
          </Field>
          <Field label="API name" hint="Derived from the name; used in lookups and /api/v1/objects/<name>/records.">
            <div className="rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-muted-foreground">{name.trim() ? apiName : "—"}</div>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Primary field label" htmlFor="o-primary" hint="Labels each record.">
              <Input id="o-primary" value={primaryLabel} onChange={(e) => setPrimaryLabel(e.target.value)} placeholder="e.g. Plan name" />
            </Field>
            <Field label="Records per contact">
              <Select value={relationship} onValueChange={setRelationship}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{RELATIONSHIPS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!name.trim()}>Create object</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const toDraft = (o) => ({
  name: o.name,
  pluralName: o.pluralName,
  description: o.description,
  relationship: o.relationship,
  primaryField: o.primaryField,
  fields: o.fields,
});

function RecordsSection({ object, canEdit, records, loading, onEdit, onDelete }) {
  const [query, setQuery] = useState("");
  const shownFields = object.fields.slice(0, 3);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return records;
    return records.filter((r) => `${r.externalId} ${r.contact?.email ?? ""} ${Object.values(r.data).join(" ")}`.toLowerCase().includes(q));
  }, [records, query]);
  const pager = usePagination(filtered, { resetKey: query });

  if (loading) return <LoadingArea size={44} panel label="Loading records" />;

  const columns = [
    {
      key: "label",
      header: "Record",
      render: (r) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-foreground">{recordLabel(object.fields, r.data, { primaryField: object.primaryField, externalId: r.externalId })}</span>
          {r.externalId ? <span className="truncate font-mono text-xs text-text-tertiary">{r.externalId}</span> : null}
        </div>
      ),
    },
    ...shownFields
      .filter((f) => f.key !== object.primaryField)
      .slice(0, 2)
      .map((f) => ({ key: f.key, header: f.label, className: "max-w-[180px] truncate text-muted-foreground", render: (r) => formatValue(f, r.data[f.key]) })),
    { key: "contact", header: "Contact", className: "max-w-[200px] truncate text-muted-foreground", render: (r) => r.contact?.email || r.contact?.name || "—" },
    { key: "updated", header: "Updated", className: "whitespace-nowrap text-muted-foreground", render: (r) => relativeTime(r.updatedAt) },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (r) =>
        canEdit ? (
          <ActionMenu
            label="Record actions"
            items={[
              { label: "Edit", icon: Pencil, onSelect: () => onEdit(r) },
              { separator: true },
              { label: "Delete", icon: Trash2, destructive: true, onSelect: () => onDelete(r) },
            ]}
          />
        ) : null,
    },
  ];

  return (
    <div className="space-y-4">
      <Toolbar>
        <SearchInput value={query} onChange={setQuery} placeholder="Search records…" />
      </Toolbar>
      <DataTable
        columns={columns}
        data={pager.pageItems}
        getRowKey={(r) => r.id}
        onRowClick={canEdit ? onEdit : undefined}
        empty={
          <EmptyState
            icon={Rows3}
            title={query ? "No matches" : "No records yet"}
            description={query ? "Try a different search." : "Add a record by hand, import a CSV, or write records through the API."}
            className="rounded-xl border border-border bg-surface-subtle"
          />
        }
      />
      <ListPagination {...pager} itemLabel="records" />
    </div>
  );
}

function ObjectEditor({ record: object, projectId, userId, canEdit, onBack, onSave, onDelete, onCountChange }) {
  const [draft, setDraft] = useState(() => toDraft(object));
  const [saving, setSaving] = useState(false);
  const [records, setRecords] = useState([]);
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [dialog, setDialog] = useState(null);
  const { section } = useWorkspaceUrl();
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  const dirty = JSON.stringify({ ...draft, fields: sanitizeFields(draft.fields) }) !== JSON.stringify({ ...toDraft(object), fields: sanitizeFields(object.fields) }) || draft.fields.some((f) => f.isNew);

  const loadRecords = useCallback(async () => {
    const rows = await listObjectRecords(projectId, object.id);
    setRecords(rows ?? []);
    setRecordsLoading(false);
    return rows;
  }, [projectId, object.id]);

  useEffect(() => {
    let alive = true;
    listObjectRecords(projectId, object.id).then((rows) => {
      if (!alive) return;
      setRecords(rows ?? []);
      setRecordsLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [projectId, object.id]);

  const save = async () => {
    if (!draft.name.trim()) {
      toast.error("An object needs a name.");
      return;
    }
    const fields = sanitizeFields(draft.fields);
    if (draft.fields.some((f) => !String(f.label || "").trim())) {
      toast.error("Every field needs a label.");
      return;
    }
    const primaryField = fields.some((f) => f.key === draft.primaryField) ? draft.primaryField : fields[0]?.key || "";
    setSaving(true);
    const saved = await onSave(object.id, { ...draft, name: draft.name.trim(), fields, primaryField });
    setSaving(false);
    if (saved) setDraft(toDraft(saved));
  };

  const saveRecord = async (existing, { externalId, contactId, contact, data }) => {
    if (object.relationship === "one" && contactId && records.some((r) => r.contactId === contactId && r.id !== existing?.id)) {
      toast.error("That contact already has a record of this object (one per contact).");
      return false;
    }
    if (existing) {
      const previous = records;
      setRecords((p) => p.map((r) => (r.id === existing.id ? { ...r, externalId, contactId, contact, data } : r)));
      const saved = await updateObjectRecord(existing.id, { externalId, contactId, data });
      if (!saved) {
        setRecords(previous);
        toast.error("Couldn't save the record. Is that external ID already used?");
        return false;
      }
      setRecords((p) => p.map((r) => (r.id === saved.id ? saved : r)));
      toast.success("Record saved.");
      return true;
    }
    const id = crypto.randomUUID();
    const optimistic = { id, typeId: object.id, externalId, contactId, contact, data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    setRecords((p) => [optimistic, ...p]);
    onCountChange(object.id, 1);
    const created = await createObjectRecord(projectId, { id, typeId: object.id, externalId, contactId, data, createdBy: userId });
    if (!created) {
      setRecords((p) => p.filter((r) => r.id !== id));
      onCountChange(object.id, -1);
      toast.error("Couldn't add the record. Is that external ID already used?");
      return false;
    }
    setRecords((p) => p.map((r) => (r.id === id ? created : r)));
    toast.success("Record added.");
    return true;
  };

  const deleteRecord = async (r) => {
    setRecords((p) => p.filter((x) => x.id !== r.id));
    onCountChange(object.id, -1);
    if (await softDeleteObjectRecord(r.id)) {
      toast.success("Record deleted.");
    } else {
      toast.error("Couldn't delete the record.");
      onCountChange(object.id, 1);
      loadRecords();
    }
  };

  const importRows = async (rows) => {
    const emails = rows.map((r) => r.contactEmail).filter(Boolean);
    const contactIds = emails.length ? await contactIdsByEmail(projectId, emails) : {};
    if (contactIds === null) return null;
    let unmatched = 0;
    const prepared = rows.map((r) => {
      const contactId = r.contactEmail ? contactIds[r.contactEmail.trim().toLowerCase()] || null : null;
      if (r.contactEmail && !contactId) unmatched += 1;
      return { externalId: r.externalId, contactId, data: r.data };
    });
    const out = await importObjectRecords(projectId, object.id, prepared, { createdBy: userId });
    if (!out) return null;
    const before = records.length;
    const rowsNow = await loadRecords();
    if (rowsNow) onCountChange(object.id, rowsNow.length - before);
    return { ...out, unmatched };
  };

  const base = appBaseUrl();
  const firstField = object.fields.find((f) => f.key !== object.primaryField) || object.fields[0];
  const apiExample = `curl -X PUT ${base}/api/v1/objects/${object.key}/records \\
  -H "Authorization: Bearer gck_live_…" \\
  -H "Content-Type: application/json" \\
  -d '{
    "records": [
      {
        "external_id": "${object.key}_1001",
        "email": "jane@example.com",
        "data": { ${object.fields.slice(0, 2).map((f) => `"${f.key}": ${f.type === "number" ? "42" : f.type === "boolean" ? "true" : `"…"`}`).join(", ")} }
      }
    ]
  }'`;
  const lookupBase = object.relationship === "one" ? `objects.${object.key}` : `objects.${object.key}.0`;

  return (
    <>
      <EditorShell
        back={{ label: "Back", onClick: onBack }}
        title={
          <InlineTitleInput
            value={draft.name}
            onChange={(e) => set("name")(e.target.value)}
            disabled={!canEdit}
            aria-label="Object name"
            placeholder="Untitled object"
            className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl"
          />
        }
        badges={
          <>
            <Badge variant="neutral" className="font-mono">{object.key}</Badge>
            <span className="text-xs text-text-tertiary">{formatNumber(object.recordCount)} records · Updated {formatDate(object.updatedAt)}</span>
          </>
        }
        actions={
          canEdit ? (
            <>
              <Button variant="ghost" size="icon" aria-label="Delete object" className={DANGER_ICON_BUTTON} onClick={() => onDelete(object)}>
                <Trash2 className="h-4 w-4" />
              </Button>
              <Button variant="outline" className={OUTLINE_BUTTON} disabled={!dirty || saving} onClick={save}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save
              </Button>
            </>
          ) : null
        }
        nav={OBJECT_NAV}
        defaultSection="details"
        sectionAction={
          section === "records" && canEdit ? (
            <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => setDialog({ record: null })} disabled={!object.fields.length}>
              <Plus className="h-3.5 w-3.5" /> Add record
            </Button>
          ) : null
        }
      >
        {({ active }) => (
          <>
            {active === "details" ? (
              <SectionCard bare title="Naming & relationship" description="What the object is called and how many records each contact can have.">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Object name" htmlFor="oe-name" hint="Singular, e.g. Subscription.">
                    <Input id="oe-name" value={draft.name} disabled={!canEdit} onChange={(e) => set("name")(e.target.value)} />
                  </Field>
                  <Field label="Plural label" htmlFor="oe-plural" hint="Used in lists.">
                    <Input id="oe-plural" value={draft.pluralName} disabled={!canEdit} onChange={(e) => set("pluralName")(e.target.value)} />
                  </Field>
                  <Field label="Records per contact" hint={RELATIONSHIPS.find((r) => r.value === draft.relationship)?.hint}>
                    <Select value={draft.relationship} onValueChange={set("relationship")} disabled={!canEdit}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>{RELATIONSHIPS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                  <Field label="API name" hint="Set at creation; lookups and the API depend on it.">
                    <div className="rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-muted-foreground">{object.key}</div>
                  </Field>
                  <Field label="Description" htmlFor="oe-desc" className="sm:col-span-2">
                    <Textarea id="oe-desc" value={draft.description} disabled={!canEdit} onChange={(e) => set("description")(e.target.value)} placeholder="What one record represents and where it comes from." rows={3} />
                  </Field>
                </div>
              </SectionCard>
            ) : null}

            {active === "schema" ? (
              <SectionCard bare title="Record schema" description="The label, key and type of each field, and which ones are required.">
                <SchemaEditor fields={draft.fields} onChange={set("fields")} primaryField={draft.primaryField} onPrimaryChange={set("primaryField")} readOnly={!canEdit} />
              </SectionCard>
            ) : null}

            {active === "records" ? (
              <RecordsSection
                object={object}
                canEdit={canEdit}
                records={records}
                loading={recordsLoading}
                onEdit={(r) => setDialog({ record: r })}
                onDelete={deleteRecord}
              />
            ) : null}

            {active === "import" ? (
              <SectionCard>
                {object.fields.length ? (
                  <CsvImport fields={object.fields} idLabel="External ID" withContact onImport={importRows} disabled={!canEdit} />
                ) : (
                  <p className="text-sm text-text-secondary">Add at least one field before importing.</p>
                )}
              </SectionCard>
            ) : null}

            {active === "api" ? (
              <div className="space-y-4">
                <SectionCard title="Write records" description="Upsert up to 500 records per request with a secret key that has the data:write scope. Records match on external_id; email or contact_id links a contact.">
                  <CodeBlock code={apiExample} />
                </SectionCard>
                <SectionCard title="Use in messages" description="Personalization reads a contact's records through these paths.">
                  <div className="divide-y divide-border rounded-lg border border-border">
                    {object.fields.map((f) => (
                      <div key={f.key} className="flex items-center justify-between gap-3 px-3 py-2">
                        <span className="text-sm text-foreground">{f.label}</span>
                        <code className="font-mono text-xs text-muted-foreground">{`${lookupBase}.${f.key}`}</code>
                      </div>
                    ))}
                  </div>
                  {object.relationship === "many" && firstField ? (
                    <p className="mt-3 text-xs text-text-secondary">
                      Contacts can have many {object.pluralName.toLowerCase()}; <span className="font-mono">.0</span> is the newest. Use <span className="font-mono">.1</span>, <span className="font-mono">.2</span>… for older ones.
                    </p>
                  ) : null}
                </SectionCard>
              </div>
            ) : null}
          </>
        )}
      </EditorShell>
      {dialog ? (
        <RecordDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          title={dialog.record ? "Edit record" : `New ${object.name.toLowerCase()}`}
          fields={object.fields}
          record={dialog.record}
          withContact
          projectId={projectId}
          onSave={(values) => saveRecord(dialog.record, values)}
        />
      ) : null}
    </>
  );
}

export function CustomObjectsScreen() {
  const { projectId } = useProject();
  const { can } = useRbac();
  const canEdit = can(MANAGE);
  const [objects, setObjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState(null);
  const [query, setQuery] = useState("");
  const [recordsFilter, setRecordsFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const { recordId, openRecord, closeRecord } = useWorkspaceUrl();

  const reload = useCallback(async () => {
    const rows = await listObjectTypes(projectId);
    setObjects(rows ?? []);
  }, [projectId]);

  useEffect(() => {
    let alive = true;
    listObjectTypes(projectId).then((rows) => {
      if (!alive) return;
      setObjects(rows ?? []);
      setLoading(false);
    });
    getUser().then((u) => alive && setUserId(u?.id || null));
    return () => {
      alive = false;
    };
  }, [projectId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return objects.filter((o) => {
      if (recordsFilter === "populated" && o.recordCount === 0) return false;
      if (recordsFilter === "empty" && o.recordCount > 0) return false;
      if (q && !`${o.name} ${o.pluralName} ${o.key}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [objects, query, recordsFilter]);

  const stats = useMemo(
    () => [
      { label: "Objects", value: formatNumber(objects.length) },
      { label: "Records", value: formatNumber(objects.reduce((s, o) => s + o.recordCount, 0)) },
      { label: "Fields", value: formatNumber(objects.reduce((s, o) => s + o.fields.length, 0)) },
    ],
    [objects],
  );

  const pager = usePagination(filtered, { resetKey: `${query}|${recordsFilter}` });
  const takenKeys = useMemo(() => new Set(objects.map((o) => o.key)), [objects]);

  const persistCreate = async (input, { open = true } = {}) => {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const optimistic = { id, projectId, pluralName: `${input.name}s`, description: "", recordCount: 0, createdAt: now, updatedAt: now, ...input };
    setObjects((p) => [optimistic, ...p]);
    if (open) openRecord(id);
    const created = await createObjectType(projectId, { ...input, id, createdBy: userId });
    if (!created) {
      setObjects((p) => p.filter((o) => o.id !== id));
      if (open) closeRecord();
      toast.error("Couldn't create the object.");
      return null;
    }
    setObjects((p) => p.map((o) => (o.id === id ? created : o)));
    return created;
  };

  const handleCreate = async (input) => {
    if (await persistCreate(input)) toast.success(`Created ${input.name}.`);
  };

  const handleSave = async (id, patch) => {
    const previous = objects;
    setObjects((p) => p.map((o) => (o.id === id ? { ...o, ...patch } : o)));
    const saved = await updateObjectType(id, patch);
    if (!saved) {
      setObjects(previous);
      toast.error("Couldn't save the object.");
      return null;
    }
    setObjects((p) => p.map((o) => (o.id === id ? saved : o)));
    toast.success("Object saved.");
    return saved;
  };

  // Copies the schema only; the API name gets a free suffix.
  const handleDuplicate = async (o) => {
    let key = `${o.key}_copy`.slice(0, 63);
    for (let n = 2; takenKeys.has(key); n += 1) key = `${o.key}_copy_${n}`.slice(0, 63);
    if (!KEY_PATTERN.test(key)) return;
    const created = await persistCreate(
      { name: `${o.name} (copy)`, pluralName: `${o.pluralName} (copy)`, key, description: o.description, relationship: o.relationship, primaryField: o.primaryField, fields: o.fields },
      { open: false },
    );
    if (created) toast.success("Object duplicated.");
  };

  const handleDelete = async (o) => {
    setDeleteTarget(null);
    setObjects((p) => p.filter((x) => x.id !== o.id));
    if (o.id === recordId) closeRecord();
    if (await softDeleteObjectType(o.id)) {
      toast.success(`Deleted ${o.name}.`);
    } else {
      toast.error("Couldn't delete the object.");
      reload();
    }
  };

  const bumpCount = (id, delta) => setObjects((p) => p.map((o) => (o.id === id ? { ...o, recordCount: Math.max(0, o.recordCount + delta) } : o)));

  const deleteDialog = (
    <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete custom object</DialogTitle>
          <DialogDescription>
            Delete <span className="font-medium text-foreground">{deleteTarget?.name}</span> and hide its {formatNumber(deleteTarget?.recordCount)} records? Messages and API calls using{" "}
            <span className="font-mono">{deleteTarget?.key}</span> will stop finding them.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button className={DANGER_BUTTON} onClick={() => handleDelete(deleteTarget)}>
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const open = !loading ? objects.find((o) => o.id === recordId) : null;
  if (open) {
    return (
      <>
        <ObjectEditor key={open.id} record={open} projectId={projectId} userId={userId} canEdit={canEdit} onBack={closeRecord} onSave={handleSave} onDelete={setDeleteTarget} onCountChange={bumpCount} />
        {deleteDialog}
      </>
    );
  }

  const filtersActive = query || recordsFilter !== "all";
  const clearFilters = () => {
    setQuery("");
    setRecordsFilter("all");
  };

  const columns = [
    {
      key: "object",
      header: "Object",
      render: (o) => (
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-active text-muted-foreground">
            <Boxes className="h-4 w-4" />
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="font-medium text-foreground">{o.name}</span>
            <span className="truncate text-xs text-text-secondary">{o.relationship === "one" ? "One per contact" : "Many per contact"}</span>
          </div>
        </div>
      ),
    },
    { key: "records", header: "Records", className: "tabular-nums text-muted-foreground", render: (o) => formatNumber(o.recordCount) },
    { key: "fields", header: "Fields", className: "tabular-nums text-muted-foreground", render: (o) => formatNumber(o.fields.length) },
    { key: "key", header: "API name", className: "font-mono text-muted-foreground" },
    { key: "updated", header: "Updated", className: "whitespace-nowrap text-muted-foreground", render: (o) => formatDate(o.updatedAt) },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (o) => (
        <ActionMenu
          label={`Actions for ${o.name}`}
          items={[
            { label: canEdit ? "Edit schema" : "View schema", icon: Pencil, onSelect: () => openRecord(o.id) },
            { label: "View records", icon: Database, onSelect: () => openRecord(o.id) },
            canEdit && { label: "Duplicate", icon: Copy, onSelect: () => handleDuplicate(o) },
            canEdit && { separator: true },
            canEdit && { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setDeleteTarget(o) },
          ]}
        />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Custom Objects"
        description="Model data beyond contacts — subscriptions, bookings, anything — and use it in messages."
        actions={
          canEdit ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> New object
            </Button>
          ) : null
        }
      />

      <StatsBar stats={stats} columns={3} />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={recordsFilter} onValueChange={setRecordsFilter} options={RECORDS_FILTER_OPTIONS} height="h-9" />
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search objects…" />
      </Toolbar>

      {loading ? (
        <LoadingArea size={48} panel label="Loading custom objects" />
      ) : (
        <div className="space-y-5">
          <DataTable
            columns={columns}
            data={pager.pageItems}
            getRowKey={(o) => o.id}
            onRowClick={(o) => openRecord(o.id)}
            empty={
              <div className="rounded-xl border border-border bg-surface-subtle">
                <EmptyState
                  icon={Boxes}
                  title={filtersActive ? "No matches" : "No custom objects yet"}
                  description={filtersActive ? "Try a different search or filter." : "Create an object to store data like subscriptions or bookings against contacts."}
                  action={
                    filtersActive ? (
                      <Button variant="outline" className={OUTLINE_BUTTON} onClick={clearFilters}>Clear filters</Button>
                    ) : canEdit ? (
                      <Button onClick={() => setCreateOpen(true)}>
                        <Plus className="h-4 w-4" /> New object
                      </Button>
                    ) : null
                  }
                />
              </div>
            }
          />
          <ListPagination {...pager} itemLabel="objects" />
        </div>
      )}

      <CreateObjectDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={handleCreate} takenKeys={takenKeys} />
      {deleteDialog}
    </MainScreenWrapper>
  );
}

export default CustomObjectsScreen;
