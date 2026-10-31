"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, BookOpen, Pencil, Copy, Trash2, FileText, Braces, Rows3, FileUp, Code2, Loader2 } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import { EditorShell } from "@/components/internal/shared/editor_shell";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { useProject } from "@/context/project-context";
import { useRbac } from "@/context/rbac-context";
import { getUser } from "@/lib/supabase/user";
import {
  createCatalog,
  importCatalogItems,
  listCatalogItems,
  listCatalogs,
  saveCatalogItem,
  softDeleteCatalog,
  softDeleteCatalogItem,
  updateCatalog,
} from "@/lib/supabase/catalogs";
import { formatValue, recordLabel, sanitizeFields, toKey } from "@/lib/data/fields";
import { SchemaEditor } from "./shared/schema_editor";
import { RecordDialog } from "./shared/record_dialog";
import { CsvImport } from "./shared/csv_import";
import { CodeBlock } from "./shared/code_block";
import { appBaseUrl, DANGER_BUTTON, DANGER_ICON_BUTTON, formatNumber, OUTLINE_BUTTON, relativeTime } from "./shared/format";
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
  Textarea,
  Toolbar,
} from "@geiger/ui";

const KINDS = [
  { value: "products", label: "Products", tone: "success" },
  { value: "content", label: "Content", tone: "info" },
  { value: "events", label: "Events", tone: "purple" },
  { value: "locations", label: "Locations", tone: "warning" },
  { value: "other", label: "Other", tone: "neutral" },
];
const KIND = Object.fromEntries(KINDS.map((k) => [k.value, k]));

const SOURCE_LABEL = { manual: "Added by hand", csv: "CSV import", api: "API" };

// Starting schema per kind; editable after creation.
const STARTER_FIELDS = {
  products: [
    { key: "title", label: "Title", type: "text", required: true },
    { key: "price", label: "Price", type: "number" },
    { key: "currency", label: "Currency", type: "text" },
    { key: "url", label: "Product URL", type: "url" },
    { key: "image_url", label: "Image URL", type: "url" },
    { key: "in_stock", label: "In stock", type: "boolean" },
  ],
  content: [
    { key: "title", label: "Title", type: "text", required: true },
    { key: "summary", label: "Summary", type: "text" },
    { key: "url", label: "URL", type: "url" },
    { key: "image_url", label: "Image URL", type: "url" },
    { key: "published_on", label: "Published", type: "date" },
  ],
  events: [
    { key: "title", label: "Title", type: "text", required: true },
    { key: "starts_on", label: "Date", type: "date" },
    { key: "location", label: "Location", type: "text" },
    { key: "url", label: "URL", type: "url" },
  ],
  locations: [
    { key: "name", label: "Name", type: "text", required: true },
    { key: "address", label: "Address", type: "text" },
    { key: "city", label: "City", type: "text" },
    { key: "url", label: "URL", type: "url" },
  ],
  other: [{ key: "name", label: "Name", type: "text", required: true }],
};

const KIND_FILTER_OPTIONS = [{ value: "all", label: "All kinds" }, ...KINDS.map((k) => ({ value: k.value, label: k.label }))];
const SOURCE_FILTER_OPTIONS = [{ value: "all", label: "All sources" }, ...Object.entries(SOURCE_LABEL).map(([value, label]) => ({ value, label }))];

const CATALOG_NAV = [
  { key: "details", label: "Details", icon: FileText, desc: "Name the catalog and choose what kind of items it holds." },
  { key: "schema", label: "Fields", icon: Braces, desc: "The fields every item stores." },
  { key: "items", label: "Items", icon: Rows3, desc: "Every item, keyed by its ID (SKU, slug or your own id)." },
  { key: "import", label: "Import", icon: FileUp, desc: "Add or update items from a CSV file." },
  { key: "api", label: "API & personalization", icon: Code2, desc: "Keep the catalog in sync from your systems and use items in messages." },
];

const MANAGE = "campaign.data.manage";
const ITEM_ID = "Item ID";

function CreateCatalogDialog({ open, onOpenChange, onCreate, takenKeys }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState("products");
  const key = toKey(name, "catalog");

  const reset = () => {
    setName("");
    setKind("products");
  };

  const submit = () => {
    if (!name.trim()) {
      toast.error("Give the catalog a name.");
      return;
    }
    if (takenKeys.has(key)) {
      toast.error(`A catalog called ${key} already exists.`);
      return;
    }
    const fields = STARTER_FIELDS[kind];
    onCreate({ name: name.trim(), key, kind, fields, primaryField: fields[0].key });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New catalog</DialogTitle>
          <DialogDescription>A list of products, articles, events or places to reference in messages.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Catalog name" htmlFor="c-name">
            <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }} placeholder="e.g. Storefront products" autoFocus />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Kind" hint="Sets the starting fields.">
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{KINDS.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="API name" hint="Used in lookups and the API.">
              <div className="rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-muted-foreground">{name.trim() ? key : "—"}</div>
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!name.trim()}>Create catalog</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const toDraft = (c) => ({ name: c.name, description: c.description, kind: c.kind, fields: c.fields, primaryField: c.primaryField ?? c.fields[0]?.key ?? "" });

function ItemsSection({ catalog, canEdit, items, loading, onEdit, onDelete }) {
  const [query, setQuery] = useState("");
  const primary = catalog.primaryField || catalog.fields[0]?.key;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => `${i.externalId} ${Object.values(i.data).join(" ")}`.toLowerCase().includes(q));
  }, [items, query]);
  const pager = usePagination(filtered, { resetKey: query });

  if (loading) return <LoadingArea size={44} panel label="Loading items" />;

  const extra = catalog.fields.filter((f) => f.key !== primary).slice(0, 3);
  const columns = [
    {
      key: "item",
      header: "Item",
      render: (i) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-foreground">{recordLabel(catalog.fields, i.data, { primaryField: primary, externalId: i.externalId })}</span>
          <span className="truncate font-mono text-xs text-text-tertiary">{i.externalId}</span>
        </div>
      ),
    },
    ...extra.map((f) => ({ key: f.key, header: f.label, className: "max-w-[180px] truncate text-muted-foreground", render: (i) => formatValue(f, i.data[f.key]) })),
    { key: "updated", header: "Updated", className: "whitespace-nowrap text-muted-foreground", render: (i) => relativeTime(i.updatedAt) },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (i) =>
        canEdit ? (
          <ActionMenu
            label={`Actions for ${i.externalId}`}
            items={[
              { label: "Edit", icon: Pencil, onSelect: () => onEdit(i) },
              { separator: true },
              { label: "Delete", icon: Trash2, destructive: true, onSelect: () => onDelete(i) },
            ]}
          />
        ) : null,
    },
  ];

  return (
    <div className="space-y-4">
      <Toolbar>
        <SearchInput value={query} onChange={setQuery} placeholder="Search items…" />
      </Toolbar>
      <DataTable
        columns={columns}
        data={pager.pageItems}
        getRowKey={(i) => i.id}
        onRowClick={canEdit ? onEdit : undefined}
        empty={
          <EmptyState
            icon={Rows3}
            title={query ? "No matches" : "No items yet"}
            description={query ? "Try a different search." : "Add an item, import a CSV, or push items through the API."}
            className="rounded-xl border border-border bg-surface-subtle"
          />
        }
      />
      <ListPagination {...pager} itemLabel="items" />
    </div>
  );
}

function CatalogEditor({ record: catalog, projectId, userId, canEdit, onBack, onSave, onDelete, onPatch }) {
  const [draft, setDraft] = useState(() => toDraft(catalog));
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [dialog, setDialog] = useState(null);
  const { section } = useWorkspaceUrl();
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  const dirty = JSON.stringify({ ...draft, fields: sanitizeFields(draft.fields) }) !== JSON.stringify({ ...toDraft(catalog), fields: sanitizeFields(catalog.fields) }) || draft.fields.some((f) => f.isNew);

  const loadItems = useCallback(async () => {
    const rows = await listCatalogItems(projectId, catalog.id);
    setItems(rows ?? []);
    setItemsLoading(false);
    return rows;
  }, [projectId, catalog.id]);

  useEffect(() => {
    let alive = true;
    listCatalogItems(projectId, catalog.id).then((rows) => {
      if (!alive) return;
      setItems(rows ?? []);
      setItemsLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [projectId, catalog.id]);

  const save = async () => {
    if (!draft.name.trim()) {
      toast.error("A catalog needs a name.");
      return;
    }
    if (draft.fields.some((f) => !String(f.label || "").trim())) {
      toast.error("Every field needs a label.");
      return;
    }
    const fields = sanitizeFields(draft.fields);
    const primaryField = fields.some((f) => f.key === draft.primaryField) ? draft.primaryField : fields[0]?.key || "";
    setSaving(true);
    const saved = await onSave(catalog.id, { name: draft.name.trim(), description: draft.description, kind: draft.kind, fields, metadata: { primaryField } });
    setSaving(false);
    if (saved) setDraft(toDraft(saved));
  };

  const saveItem = async (existing, { externalId, data }) => {
    if (existing) {
      const previous = items;
      setItems((p) => p.map((i) => (i.id === existing.id ? { ...i, externalId, data } : i)));
      const saved = await saveCatalogItem(projectId, catalog.id, { id: existing.id, externalId, data });
      if (!saved) {
        setItems(previous);
        toast.error("Couldn't save the item. Is that ID already used?");
        return false;
      }
      setItems((p) => p.map((i) => (i.id === saved.id ? saved : i)));
      toast.success("Item saved.");
      return true;
    }
    if (items.some((i) => i.externalId === externalId)) {
      toast.error(`An item with ID ${externalId} already exists — edit it instead.`);
      return false;
    }
    const saved = await saveCatalogItem(projectId, catalog.id, { externalId, data });
    if (!saved) {
      toast.error("Couldn't add the item.");
      return false;
    }
    setItems((p) => [saved, ...p]);
    onPatch(catalog.id, { itemCount: catalog.itemCount + 1 });
    toast.success("Item added.");
    return true;
  };

  const deleteItem = async (item) => {
    setItems((p) => p.filter((i) => i.id !== item.id));
    onPatch(catalog.id, { itemCount: Math.max(0, catalog.itemCount - 1) });
    if (await softDeleteCatalogItem(item.id)) {
      toast.success("Item deleted.");
    } else {
      toast.error("Couldn't delete the item.");
      const rows = await loadItems();
      if (rows) onPatch(catalog.id, { itemCount: rows.length });
    }
  };

  const importRows = async (rows) => {
    const out = await importCatalogItems(projectId, catalog.id, rows, { createdBy: userId });
    if (!out) return null;
    const rowsNow = await loadItems();
    onPatch(catalog.id, { itemCount: rowsNow ? rowsNow.length : catalog.itemCount, source: "csv", lastImportedAt: new Date().toISOString() });
    return out;
  };

  const base = appBaseUrl();
  const sample = Object.fromEntries(catalog.fields.slice(0, 3).map((f) => [f.key, f.type === "number" ? 149 : f.type === "boolean" ? true : f.type === "url" ? "https://example.com/…" : "…"]));
  const apiExample = `curl -X PUT ${base}/api/v1/catalogs/${catalog.key}/items \\
  -H "Authorization: Bearer gck_live_…" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify({ items: [{ external_id: "SKU-4821", ...sample }] }, null, 2).replace(/\n/g, "\n  ")}'`;
  const exampleId = items[0]?.externalId || "SKU-4821";

  return (
    <>
      <EditorShell
        back={{ label: "Back", onClick: onBack }}
        title={
          <InlineTitleInput value={draft.name} onChange={(e) => set("name")(e.target.value)} disabled={!canEdit} aria-label="Catalog name" placeholder="Untitled catalog" className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl" />
        }
        badges={
          <>
            <Badge variant={KIND[catalog.kind]?.tone || "neutral"}>{KIND[catalog.kind]?.label || catalog.kind}</Badge>
            <Badge variant="neutral" className="font-mono">{catalog.key}</Badge>
            <span className="text-xs text-text-tertiary">{formatNumber(catalog.itemCount)} items · {SOURCE_LABEL[catalog.source] || catalog.source}</span>
          </>
        }
        actions={
          canEdit ? (
            <>
              <Button variant="ghost" size="icon" aria-label="Delete catalog" className={DANGER_ICON_BUTTON} onClick={() => onDelete(catalog)}>
                <Trash2 className="h-4 w-4" />
              </Button>
              <Button variant="outline" className={OUTLINE_BUTTON} disabled={!dirty || saving} onClick={save}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save
              </Button>
            </>
          ) : null
        }
        nav={CATALOG_NAV}
        defaultSection="details"
        sectionAction={
          section === "items" && canEdit ? (
            <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => setDialog({ item: null })} disabled={!catalog.fields.length}>
              <Plus className="h-3.5 w-3.5" /> Add item
            </Button>
          ) : null
        }
      >
        {({ active }) => (
          <>
            {active === "details" ? (
              <SectionCard bare title="Catalog details" description="What the catalog is called, the kind of items it holds and where they come from.">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Catalog name" htmlFor="ce-name">
                    <Input id="ce-name" value={draft.name} disabled={!canEdit} onChange={(e) => set("name")(e.target.value)} />
                  </Field>
                  <Field label="Kind">
                    <Select value={draft.kind} onValueChange={set("kind")} disabled={!canEdit}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>{KINDS.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                  <Field label="Description" htmlFor="ce-desc" className="sm:col-span-2">
                    <Textarea id="ce-desc" value={draft.description} disabled={!canEdit} onChange={(e) => set("description")(e.target.value)} rows={3} placeholder="What's in this catalog and where it comes from." />
                  </Field>
                </div>
                <SettingsList className="mt-5 border-t border-border pt-4">
                  <SettingRow title="Items" description="Live items in this catalog." control={<span className="text-sm font-semibold tabular-nums text-foreground">{formatNumber(catalog.itemCount)}</span>} />
                  <SettingRow title="Last import" description="The most recent CSV import or API write." control={<span className="text-sm text-muted-foreground">{relativeTime(catalog.lastImportedAt)}</span>} />
                </SettingsList>
              </SectionCard>
            ) : null}

            {active === "schema" ? (
              <SectionCard bare title="Item schema" description="The label, key and type of each field, and which ones are required.">
                <SchemaEditor fields={draft.fields} onChange={set("fields")} primaryField={draft.primaryField} onPrimaryChange={set("primaryField")} readOnly={!canEdit} />
              </SectionCard>
            ) : null}

            {active === "items" ? (
              <ItemsSection
                catalog={catalog}
                canEdit={canEdit}
                items={items}
                loading={itemsLoading}
                onEdit={(i) => setDialog({ item: i })}
                onDelete={deleteItem}
              />
            ) : null}

            {active === "import" ? (
              <SectionCard>
                <CsvImport fields={catalog.fields} idLabel={ITEM_ID} idRequired onImport={importRows} disabled={!canEdit} />
              </SectionCard>
            ) : null}

            {active === "api" ? (
              <div className="space-y-4">
                <SectionCard title="Sync items" description="Upsert up to 500 items per request with a secret key that has the data:write scope. Items match on external_id.">
                  <CodeBlock code={apiExample} />
                </SectionCard>
                <SectionCard title="Use in messages" description="Look an item up by its ID — for example from a tracked event's product id.">
                  <div className="divide-y divide-border rounded-lg border border-border">
                    {catalog.fields.map((f) => (
                      <div key={f.key} className="flex items-center justify-between gap-3 px-3 py-2">
                        <span className="text-sm text-foreground">{f.label}</span>
                        <code className="font-mono text-xs text-muted-foreground">{`catalogs.${catalog.key}.${exampleId}.${f.key}`}</code>
                      </div>
                    ))}
                  </div>
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
          title={dialog.item ? "Edit item" : "New item"}
          fields={catalog.fields}
          record={dialog.item}
          idLabel={ITEM_ID}
          idRequired
          projectId={projectId}
          onSave={(values) => saveItem(dialog.item, values)}
        />
      ) : null}
    </>
  );
}

export function CatalogsScreen() {
  const { projectId } = useProject();
  const { can } = useRbac();
  const canEdit = can(MANAGE);
  const [catalogs, setCatalogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadedAt, setLoadedAt] = useState(0);
  const [userId, setUserId] = useState(null);
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const { recordId, openRecord, closeRecord } = useWorkspaceUrl();

  const reload = useCallback(async () => {
    const rows = await listCatalogs(projectId);
    setCatalogs(rows ?? []);
  }, [projectId]);

  useEffect(() => {
    let alive = true;
    listCatalogs(projectId).then((rows) => {
      if (!alive) return;
      setCatalogs(rows ?? []);
      setLoadedAt(Date.now());
      setLoading(false);
    });
    getUser().then((u) => alive && setUserId(u?.id || null));
    return () => {
      alive = false;
    };
  }, [projectId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalogs.filter((c) => {
      if (kindFilter !== "all" && c.kind !== kindFilter) return false;
      if (sourceFilter !== "all" && c.source !== sourceFilter) return false;
      if (q && !`${c.name} ${c.key} ${c.description}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [catalogs, query, kindFilter, sourceFilter]);

  const stats = useMemo(() => {
    const weekAgo = loadedAt - 7 * 86_400_000;
    return [
      { label: "Catalogs", value: formatNumber(catalogs.length) },
      { label: "Items", value: formatNumber(catalogs.reduce((s, c) => s + c.itemCount, 0)) },
      { label: "Updated this week", value: formatNumber(catalogs.filter((c) => c.lastImportedAt && Date.parse(c.lastImportedAt) >= weekAgo).length) },
      { label: "Synced by API", value: formatNumber(catalogs.filter((c) => c.source === "api").length) },
    ];
  }, [catalogs, loadedAt]);

  const pager = usePagination(filtered, { resetKey: `${query}|${kindFilter}|${sourceFilter}` });
  const takenKeys = useMemo(() => new Set(catalogs.map((c) => c.key)), [catalogs]);

  const persistCreate = async ({ primaryField, ...input }, { open = true } = {}) => {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const optimistic = { id, projectId, description: "", source: "manual", itemCount: 0, lastImportedAt: null, createdAt: now, updatedAt: now, primaryField, ...input };
    setCatalogs((p) => [optimistic, ...p]);
    if (open) openRecord(id);
    const created = await createCatalog(projectId, { ...input, id, createdBy: userId, metadata: { primaryField } });
    if (!created) {
      setCatalogs((p) => p.filter((c) => c.id !== id));
      if (open) closeRecord();
      toast.error("Couldn't create the catalog.");
      return null;
    }
    setCatalogs((p) => p.map((c) => (c.id === id ? created : c)));
    return created;
  };

  const handleCreate = async (input) => {
    if (await persistCreate(input)) toast.success(`Created ${input.name}.`);
  };

  const handleSave = async (id, patch) => {
    const previous = catalogs;
    setCatalogs((p) => p.map((c) => (c.id === id ? { ...c, ...patch, ...patch.metadata } : c)));
    const saved = await updateCatalog(id, patch);
    if (!saved) {
      setCatalogs(previous);
      toast.error("Couldn't save the catalog.");
      return null;
    }
    setCatalogs((p) => p.map((c) => (c.id === id ? saved : c)));
    toast.success("Catalog saved.");
    return saved;
  };

  const handleDuplicate = async (c) => {
    let key = `${c.key}_copy`.slice(0, 63);
    for (let n = 2; takenKeys.has(key); n += 1) key = `${c.key}_copy_${n}`.slice(0, 63);
    const created = await persistCreate({ name: `${c.name} (copy)`, key, kind: c.kind, description: c.description, fields: c.fields, primaryField: c.primaryField }, { open: false });
    if (created) toast.success("Catalog duplicated (schema only).");
  };

  const handleDelete = async (c) => {
    setDeleteTarget(null);
    setCatalogs((p) => p.filter((x) => x.id !== c.id));
    if (c.id === recordId) closeRecord();
    if (await softDeleteCatalog(c.id)) {
      toast.success(`Deleted ${c.name}.`);
    } else {
      toast.error("Couldn't delete the catalog.");
      reload();
    }
  };

  const patchLocal = (id, patch) => setCatalogs((p) => p.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const deleteDialog = (
    <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete catalog</DialogTitle>
          <DialogDescription>
            Delete <span className="font-medium text-foreground">{deleteTarget?.name}</span> and its {formatNumber(deleteTarget?.itemCount)} items? Messages looking up <span className="font-mono">{deleteTarget?.key}</span> will stop finding them.
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

  const open = !loading ? catalogs.find((c) => c.id === recordId) : null;
  if (open) {
    return (
      <>
        <CatalogEditor key={open.id} record={open} projectId={projectId} userId={userId} canEdit={canEdit} onBack={closeRecord} onSave={handleSave} onDelete={setDeleteTarget} onPatch={patchLocal} />
        {deleteDialog}
      </>
    );
  }

  const filtersActive = query || kindFilter !== "all" || sourceFilter !== "all";
  const clearFilters = () => {
    setQuery("");
    setKindFilter("all");
    setSourceFilter("all");
  };

  const columns = [
    {
      key: "catalog",
      header: "Catalog",
      render: (c) => (
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-active text-muted-foreground">
            <BookOpen className="h-4 w-4" />
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="font-medium text-foreground">{c.name}</span>
            <span className="truncate font-mono text-xs text-text-tertiary">{c.key}</span>
          </div>
        </div>
      ),
    },
    { key: "kind", header: "Kind", render: (c) => <Badge variant={KIND[c.kind]?.tone || "neutral"}>{KIND[c.kind]?.label || c.kind}</Badge> },
    { key: "items", header: "Items", className: "tabular-nums text-muted-foreground", render: (c) => formatNumber(c.itemCount) },
    { key: "source", header: "Source", className: "whitespace-nowrap text-muted-foreground", render: (c) => SOURCE_LABEL[c.source] || c.source },
    { key: "lastImport", header: "Last import", className: "whitespace-nowrap text-muted-foreground", render: (c) => relativeTime(c.lastImportedAt) },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (c) => (
        <ActionMenu
          label={`Actions for ${c.name}`}
          items={[
            { label: canEdit ? "Edit" : "View", icon: Pencil, onSelect: () => openRecord(c.id) },
            canEdit && { label: "Duplicate", icon: Copy, onSelect: () => handleDuplicate(c) },
            canEdit && { separator: true },
            canEdit && { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setDeleteTarget(c) },
          ]}
        />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Catalogs"
        description="Products, content and other items you reference in messages and recommendations."
        actions={
          canEdit ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> New catalog
            </Button>
          ) : null
        }
      />

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={kindFilter} onValueChange={setKindFilter} options={KIND_FILTER_OPTIONS} height="h-9" />
          <FilterDropdown value={sourceFilter} onValueChange={setSourceFilter} options={SOURCE_FILTER_OPTIONS} height="h-9" />
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search catalogs…" />
      </Toolbar>

      {loading ? (
        <LoadingArea size={48} panel label="Loading catalogs" />
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
                  icon={BookOpen}
                  title={filtersActive ? "No matches" : "No catalogs yet"}
                  description={filtersActive ? "Try a different search or filter." : "Create a catalog, then import a CSV or sync items through the API."}
                  action={
                    filtersActive ? (
                      <Button variant="outline" className={OUTLINE_BUTTON} onClick={clearFilters}>Clear filters</Button>
                    ) : canEdit ? (
                      <Button onClick={() => setCreateOpen(true)}>
                        <Plus className="h-4 w-4" /> New catalog
                      </Button>
                    ) : null
                  }
                />
              </div>
            }
          />
          <ListPagination {...pager} itemLabel="catalogs" />
        </div>
      )}

      <CreateCatalogDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={handleCreate} takenKeys={takenKeys} />
      {deleteDialog}
    </MainScreenWrapper>
  );
}

export default CatalogsScreen;
