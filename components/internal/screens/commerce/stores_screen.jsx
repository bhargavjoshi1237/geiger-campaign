"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Activity,
  FileText,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  ShoppingCart,
  Store,
  Unplug,
  Webhook,
} from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import { EditorShell } from "@/components/internal/shared/editor_shell";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { useProject } from "@/context/project-context";
import { useCan } from "@/context/rbac-context";
import { apiGet, apiPost } from "@/lib/api/client";
import { getUser } from "@/lib/supabase/user";
import { DEFAULT_STORE_SETTINGS, createStore, listStores, softDeleteStore, updateStore } from "@/lib/supabase/stores";
import { countProducts } from "@/lib/supabase/products";
import { countOrders } from "@/lib/supabase/orders";
import { listCarts } from "@/lib/supabase/carts";
import { listTrackedEvents } from "@/lib/supabase/tracked_events";
import { CUSTOM_EVENT_EXAMPLE, PLATFORM_KEYS, platformInfo } from "@/lib/commerce/platforms";
import {
  Badge,
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
  SearchInput,
  ActionMenu,
  Field,
  Toolbar,
  DataTable,
  StatsBar,
  StatusPill,
  SectionCard,
  SettingsList,
  SettingRow,
  InlineTitleInput,
  LoadingArea,
} from "@geiger/ui";
import {
  ABANDON_AFTER_OPTIONS,
  CURRENCIES,
  DANGER_ICON_BUTTON,
  OUTLINE_BUTTON,
  PLATFORM_MAP,
  STORE_STATUS_MAP,
  count,
  daysAgoIso,
  formatDateTime,
  relativeTime,
  toFilterOptions,
} from "./constants";
import { ConfirmDialog, CopyField, ListEmpty, ReadOnly } from "./commerce_ui";

const PLATFORM_FILTER_OPTIONS = toFilterOptions(PLATFORM_MAP, "All platforms");
const STATUS_FILTER_OPTIONS = toFilterOptions(STORE_STATUS_MAP, "All statuses");

const STORE_NAV = [
  { key: "details", label: "Details", icon: FileText, desc: "Store name, storefront domain and currency." },
  { key: "connection", label: "Connection", icon: Webhook, desc: "Where the store sends events and the secret that signs them." },
  { key: "sync", label: "Sync status", icon: Activity, desc: "What has arrived from this store, and when." },
  { key: "recovery", label: "Cart recovery", icon: ShoppingCart, desc: "When an idle cart counts as abandoned." },
];

const EVENT_LABELS = {
  product_viewed: "Product views",
  checkout_started: "Checkouts started",
  cart_abandoned: "Carts abandoned",
  cart_recovered: "Carts recovered",
  order_completed: "Orders completed",
  order_refunded: "Refunds",
  order_cancelled: "Cancellations",
};

const EMPTY_FORM = { name: "", platform: "shopify", domain: "", currency: "USD" };

// Shows a freshly generated secret once, with what to do with it.
function SecretReveal({ secret }) {
  return (
    <div className="space-y-2 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3">
      <p className="text-xs font-medium text-amber-600 dark:text-amber-400">Copy this secret now — it isn&apos;t shown again.</p>
      <CopyField value={secret} label="Signing secret" />
    </div>
  );
}

function TopicList({ platform }) {
  const info = platformInfo(platform);
  return (
    <div className="flex flex-wrap gap-1.5">
      {info.topics.map((t) => (
        <code key={t} className="rounded-md border border-border bg-surface-card px-1.5 py-0.5 font-mono text-[11px] text-text-secondary">
          {t}
        </code>
      ))}
    </div>
  );
}

// Step 2 of connecting, and the Connection section: generate / paste the secret for one store.
function SecretSetup({ projectId, store, connection, onConnection, canEdit, compact = false }) {
  const info = platformInfo(store.platform);
  const [pasted, setPasted] = useState("");
  const [pending, setPending] = useState(false);
  const [revealed, setRevealed] = useState("");

  const submit = async () => {
    setPending(true);
    const res = await apiPost(
      `/api/projects/${projectId}/commerce/stores/${store.id}/connection`,
      info.secretSource === "store" ? { secret: pasted.trim() } : {},
    );
    setPending(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setPasted("");
    setRevealed(res.data.secret || "");
    onConnection(res.data);
    toast.success(info.secretSource === "store" ? "Signing secret saved." : connection?.configured ? "Secret rotated." : "Signing secret generated.");
  };

  if (info.secretSource === "store") {
    return (
      <div className="space-y-3">
        <Field label="Shopify webhook signing secret" htmlFor={`secret-${store.id}`} hint="Shown in Shopify admin under Settings → Notifications → Webhooks.">
          <div className="flex items-center gap-2">
            <Input id={`secret-${store.id}`} value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder={connection?.configured ? `Replace •••• ${connection.hint}` : "Paste the secret"} className="font-mono text-xs" disabled={!canEdit} />
            <Button variant="outline" className={OUTLINE_BUTTON} disabled={!canEdit || pending || pasted.trim().length < 16} onClick={submit}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} Save
            </Button>
          </div>
        </Field>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {revealed ? <SecretReveal secret={revealed} /> : null}
      {!revealed && !compact ? (
        <p className="text-xs text-text-secondary">
          {connection?.configured
            ? "Rotating issues a new secret and stops accepting events signed with the old one."
            : "Generate the secret your store signs every request with."}
        </p>
      ) : null}
      {!revealed ? (
        <Button variant="outline" className={OUTLINE_BUTTON} disabled={!canEdit || pending} onClick={submit}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {connection?.configured ? "Rotate secret" : "Generate secret"}
        </Button>
      ) : null}
    </div>
  );
}

function ConnectStoreDialog({ open, onOpenChange, projectId, onCreate, onDone }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [store, setStore] = useState(null);
  const [connection, setConnection] = useState(null);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const reset = () => {
    setForm(EMPTY_FORM);
    setStore(null);
    setConnection(null);
  };

  const close = (next) => {
    if (next) return;
    const created = store;
    onOpenChange(false);
    reset();
    if (created) onDone(created);
  };

  const submit = async () => {
    if (!form.name.trim()) {
      toast.error("Name the store first.");
      return;
    }
    setCreating(true);
    const created = await onCreate({ ...form, name: form.name.trim(), domain: form.domain.trim() });
    if (!created) {
      setCreating(false);
      return;
    }
    const res = await apiGet(`/api/projects/${projectId}/commerce/stores/${created.id}/connection`);
    setCreating(false);
    setStore(created);
    if (res.ok) setConnection(res.data);
    else toast.error(res.error);
  };

  const info = platformInfo(store?.platform || form.platform);

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{store ? `Connect ${store.name}` : "Connect store"}</DialogTitle>
          <DialogDescription>
            {store ? info.setup : "Your store pushes products, carts and orders to Geiger over signed webhooks."}
          </DialogDescription>
        </DialogHeader>

        {store ? (
          <div className="grid gap-4">
            <Field label="Ingest URL">
              {connection ? <CopyField value={connection.ingestUrl} label="Ingest URL" /> : <p className="text-sm text-text-secondary">Couldn&apos;t load the ingest URL. Open the store&apos;s Connection section to retry.</p>}
            </Field>
            <Field label={store.platform === "custom" ? "Event types" : "Webhook topics"}>
              <TopicList platform={store.platform} />
            </Field>
            {connection ? (
              <SecretSetup projectId={projectId} store={store} connection={connection} onConnection={setConnection} canEdit compact />
            ) : null}
          </div>
        ) : (
          <div className="grid gap-4">
            <Field label="Store name" htmlFor="store-name">
              <Input id="store-name" value={form.name} onChange={(e) => set("name")(e.target.value)} placeholder="e.g. Atlas Coffee shop" autoFocus />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Platform">
                <Select value={form.platform} onValueChange={set("platform")}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PLATFORM_KEYS.map((p) => <SelectItem key={p} value={p}>{PLATFORM_MAP[p].label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Currency">
                <Select value={form.currency} onValueChange={set("currency")}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="Storefront domain" htmlFor="store-domain" hint="Used to build product links, e.g. shop.example.com.">
              <Input id="store-domain" value={form.domain} onChange={(e) => set("domain")(e.target.value)} placeholder="shop.example.com" />
            </Field>
          </div>
        )}

        <DialogFooter>
          {store ? (
            <Button onClick={() => close(false)}>Done</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => close(false)}>Cancel</Button>
              <Button onClick={submit} disabled={!form.name.trim() || creating}>
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Continue
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConnectionSection({ projectId, store, canEdit }) {
  const [connection, setConnection] = useState(null);
  const [error, setError] = useState("");
  const info = platformInfo(store.platform);

  useEffect(() => {
    let alive = true;
    apiGet(`/api/projects/${projectId}/commerce/stores/${store.id}/connection`).then((res) => {
      if (!alive) return;
      if (res.ok) setConnection(res.data);
      else setError(res.error);
    });
    return () => {
      alive = false;
    };
  }, [projectId, store.id]);

  if (!connection && !error) return <LoadingArea size={40} label="Loading connection" panel />;

  return (
    <div className="space-y-6">
      <SectionCard bare title="Endpoint & secret" description="Point your store's webhooks here and keep the signing secret in sync.">
        {error ? (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        ) : (
          <div className="grid gap-5">
            <Field label="Ingest URL" hint="Every webhook and event for this store is POSTed here.">
              <CopyField value={connection.ingestUrl} label="Ingest URL" />
            </Field>
            <SettingsList className="border-t border-border pt-4">
              <SettingRow
                title="Signing secret"
                description={
                  connection.configured
                    ? `Ends in ${connection.hint} · set ${formatDateTime(connection.rotatedAt)} · verified via ${connection.signatureHeader}`
                    : "Not set — the ingest URL rejects every request until it is."
                }
                control={connection.configured ? <Badge variant="success">Set</Badge> : <Badge variant="warning">Missing</Badge>}
              />
            </SettingsList>
            <SecretSetup projectId={projectId} store={store} connection={connection} onConnection={setConnection} canEdit={canEdit} />
          </div>
        )}
      </SectionCard>

      <SectionCard title="Setup" description={info.setup}>
        <div className="space-y-4">
          <TopicList platform={store.platform} />
          {store.platform === "custom" ? (
            <div className="space-y-2">
              <p className="text-xs text-text-secondary">
                Example body — send one event, or up to 100 as <code className="font-mono">{"{ \"events\": [...] }"}</code>. Products and orders are matched on your ids, so re-sending is safe.
              </p>
              <pre className="overflow-x-auto rounded-lg border border-border bg-surface-card p-3 font-mono text-[11px] leading-relaxed text-text-secondary">
                {JSON.stringify(CUSTOM_EVENT_EXAMPLE, null, 2)}
              </pre>
            </div>
          ) : null}
        </div>
      </SectionCard>
    </div>
  );
}

function SyncSection({ projectId, store, draft, set, canEdit }) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    let alive = true;
    const since30 = daysAgoIso(30);
    const since7 = daysAgoIso(7);
    Promise.all([
      countProducts(projectId, { storeId: store.id }),
      countOrders(projectId, { storeId: store.id, since: since30 }),
      listCarts(projectId, { storeId: store.id, statuses: ["active", "abandoned"] }),
      listTrackedEvents(projectId, { source: "commerce", since: since7, limit: 2000 }),
    ]).then(([products, orders, carts, events]) => {
      if (!alive) return;
      const byName = {};
      for (const e of events || []) {
        if (e.properties?.store_id !== store.id) continue;
        byName[e.name] = (byName[e.name] || 0) + 1;
      }
      setStats({
        products: products ?? 0,
        orders: orders ?? 0,
        active: (carts || []).filter((c) => c.status === "active").length,
        abandoned: (carts || []).filter((c) => c.status === "abandoned").length,
        byName,
      });
    });
    return () => {
      alive = false;
    };
  }, [projectId, store.id]);

  return (
    <div className="space-y-6">
      <SectionCard bare title="Sync health" description="Whether events are arriving, and the last problem if there was one.">
        <SettingsList>
          <SettingRow
            title="Status"
            description={store.status === "pending" ? "No events have arrived yet." : store.lastEventType ? `Last event: ${store.lastEventType.replace(/_/g, " ")}` : "Receiving events."}
            control={<StatusPill status={store.status} map={STORE_STATUS_MAP} />}
          />
          <SettingRow title="Last event received" description={formatDateTime(store.lastEventAt)} control={<ReadOnly>{relativeTime(store.lastEventAt)}</ReadOnly>} />
          {store.lastError ? (
            <SettingRow
              title="Last error"
              description={`${store.lastError} (${formatDateTime(store.lastErrorAt)})`}
              control={<Badge variant="danger">Error</Badge>}
            />
          ) : null}
        </SettingsList>
      </SectionCard>

      <SectionCard bare title="Received" description="Live counts from what this store has sent.">
        {stats ? (
          <SettingsList>
            <SettingRow title="Products" description="In the catalogue for product blocks and recommendations." control={<ReadOnly>{count(stats.products)}</ReadOnly>} />
            <SettingRow title="Orders (30 days)" description="Orders placed in the last 30 days." control={<ReadOnly>{count(stats.orders)}</ReadOnly>} />
            <SettingRow title="Open carts" description={`${count(stats.abandoned)} abandoned, ${count(stats.active)} in progress.`} control={<ReadOnly>{count(stats.active + stats.abandoned)}</ReadOnly>} />
            {Object.entries(EVENT_LABELS).map(([key, label]) => (
              <SettingRow key={key} title={label} description="Last 7 days" control={<ReadOnly>{count(stats.byName[key] || 0)}</ReadOnly>} />
            ))}
          </SettingsList>
        ) : (
          <LoadingArea size={36} label="Loading sync counts" className="py-8" />
        )}
      </SectionCard>

      <SectionCard bare title="What to sync" description="Turned-off data is acknowledged and dropped when it arrives.">
        <SettingsList>
          <SettingRow
            title="Products"
            description="Create and update catalogue products from product webhooks."
            checked={draft.settings.syncProducts}
            onCheckedChange={(v) => canEdit && set("settings")({ ...draft.settings, syncProducts: v })}
          />
          <SettingRow
            title="Orders"
            description="Record orders, attribute revenue and close carts."
            checked={draft.settings.syncOrders}
            onCheckedChange={(v) => canEdit && set("settings")({ ...draft.settings, syncOrders: v })}
          />
          <SettingRow
            title="Customers"
            description="Add new shoppers to your audience. Off: only shoppers already in Contacts are linked."
            checked={draft.settings.syncCustomers}
            onCheckedChange={(v) => canEdit && set("settings")({ ...draft.settings, syncCustomers: v })}
          />
        </SettingsList>
      </SectionCard>
    </div>
  );
}

// Editable slice of a store; compared against the row to derive dirty state.
const toDraft = (s) => ({
  name: s.name,
  domain: s.domain ?? "",
  currency: s.currency,
  abandonAfterMinutes: String(s.abandonAfterMinutes ?? 60),
  settings: { ...DEFAULT_STORE_SETTINGS, ...(s.settings || {}) },
});

function StoreEditor({ projectId, record, canEdit, onBack, onSave, onDelete, onOpenRecipes }) {
  const [draft, setDraft] = useState(() => toDraft(record));
  const [saving, setSaving] = useState(false);
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(record));
  const abandonOptions = ABANDON_AFTER_OPTIONS.some((o) => o.value === draft.abandonAfterMinutes)
    ? ABANDON_AFTER_OPTIONS
    : [...ABANDON_AFTER_OPTIONS, { value: draft.abandonAfterMinutes, label: `${draft.abandonAfterMinutes} minutes` }];

  const save = async () => {
    setSaving(true);
    const ok = await onSave(record.id, {
      ...draft,
      name: draft.name.trim() || "Untitled store",
      domain: draft.domain.trim(),
      abandonAfterMinutes: Number(draft.abandonAfterMinutes),
    });
    setSaving(false);
    if (ok) setDraft(toDraft(ok));
  };

  return (
    <EditorShell
      back={{ label: "Back", onClick: onBack }}
      title={
        <InlineTitleInput
          value={draft.name}
          onChange={(e) => set("name")(e.target.value)}
          aria-label="Store name"
          placeholder="Untitled store"
          readOnly={!canEdit}
          className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl"
        />
      }
      status={record.status}
      statusMap={STORE_STATUS_MAP}
      badges={
        <>
          <Badge variant={PLATFORM_MAP[record.platform]?.variant}>{PLATFORM_MAP[record.platform]?.label}</Badge>
          <span className="text-xs text-text-tertiary">Last event {relativeTime(record.lastEventAt)}</span>
        </>
      }
      actions={
        canEdit ? (
          <>
            <Button variant="ghost" size="icon" aria-label="Disconnect store" className={DANGER_ICON_BUTTON} onClick={() => onDelete(record)}>
              <Unplug className="h-4 w-4" />
            </Button>
            <Button variant="outline" className={OUTLINE_BUTTON} disabled={!dirty || saving} onClick={save}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save
            </Button>
          </>
        ) : null
      }
      nav={STORE_NAV}
      defaultSection="details"
    >
      {({ active }) => (
        <>
          {active === "details" ? (
            <SectionCard bare title="Store details" description="The store's name, domain and the currency used when a payload names none.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Store name" htmlFor="se-name">
                  <Input id="se-name" value={draft.name} disabled={!canEdit} onChange={(e) => set("name")(e.target.value)} placeholder="e.g. Atlas Coffee shop" />
                </Field>
                <Field label="Storefront domain" htmlFor="se-domain" hint="Used to build product links.">
                  <Input id="se-domain" value={draft.domain} disabled={!canEdit} onChange={(e) => set("domain")(e.target.value)} placeholder="shop.example.com" />
                </Field>
                <Field label="Currency" hint="Applied when a payload doesn't name one.">
                  <Select value={draft.currency} onValueChange={set("currency")} disabled={!canEdit}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[...new Set([draft.currency, ...CURRENCIES])].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <SettingsList className="mt-5 border-t border-border pt-4">
                <SettingRow
                  title="Platform"
                  description="Decides how webhooks are verified and read. To switch platforms, connect the store again."
                  control={<Badge variant={PLATFORM_MAP[record.platform]?.variant}>{PLATFORM_MAP[record.platform]?.label}</Badge>}
                />
              </SettingsList>
            </SectionCard>
          ) : null}

          {active === "connection" ? <ConnectionSection projectId={projectId} store={record} canEdit={canEdit} /> : null}

          {active === "sync" ? <SyncSection projectId={projectId} store={record} draft={draft} set={set} canEdit={canEdit} /> : null}

          {active === "recovery" ? (
            <SectionCard bare title="Idle threshold" description="How long a cart waits before it's abandoned, and the recipe that follows up.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Mark carts abandoned after" hint="Carts with items and no activity for this long.">
                  <Select value={draft.abandonAfterMinutes} onValueChange={set("abandonAfterMinutes")} disabled={!canEdit}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {abandonOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <SettingsList className="mt-5 border-t border-border pt-4">
                <SettingRow
                  title="Abandoned cart automation"
                  description="Each abandoned cart records a cart_abandoned event, which triggers the Abandoned cart recovery recipe."
                  control={
                    <Button variant="outline" size="sm" className={OUTLINE_BUTTON} onClick={onOpenRecipes}>
                      Open recipes
                    </Button>
                  }
                />
              </SettingsList>
            </SectionCard>
          ) : null}
        </>
      )}
    </EditorShell>
  );
}

export function StoresScreen() {
  const { projectId } = useProject();
  const canEdit = useCan("campaign.commerce.edit");
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState({});
  const [query, setQuery] = useState("");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [connectOpen, setConnectOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const { recordId, openRecord, closeRecord, setTab } = useWorkspaceUrl();

  useEffect(() => {
    if (!projectId) return;
    let alive = true;
    listStores(projectId).then(async (rows) => {
      if (!alive) return;
      const list = rows ?? [];
      setStores(list);
      setLoading(false);
      const since = daysAgoIso(30);
      const entries = await Promise.all(
        list.map(async (s) => {
          const [products, orders] = await Promise.all([
            countProducts(projectId, { storeId: s.id }),
            countOrders(projectId, { storeId: s.id, since }),
          ]);
          return [s.id, { products: products ?? 0, orders: orders ?? 0 }];
        }),
      );
      if (alive) setCounts(Object.fromEntries(entries));
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return stores.filter((s) => {
      if (platformFilter !== "all" && s.platform !== platformFilter) return false;
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (q && !`${s.name} ${s.domain}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [stores, query, platformFilter, statusFilter]);

  const stats = useMemo(() => {
    const values = Object.values(counts);
    const products = values.reduce((sum, c) => sum + c.products, 0);
    const orders = values.reduce((sum, c) => sum + c.orders, 0);
    const attention = stores.filter((s) => s.status !== "connected").length;
    return [
      { label: "Stores", value: count(stores.length), footer: `${count(stores.filter((s) => s.status === "connected").length)} receiving events` },
      { label: "Products synced", value: count(products) },
      { label: "Orders (30d)", value: count(orders) },
      { label: "Needs attention", value: count(attention), footer: "Awaiting events or erroring" },
    ];
  }, [stores, counts]);

  const pager = usePagination(filtered, { resetKey: `${query}|${platformFilter}|${statusFilter}` });

  const handleCreate = async (form) => {
    const id = crypto.randomUUID();
    const user = await getUser();
    const optimistic = {
      id,
      projectId,
      ...form,
      status: "pending",
      abandonAfterMinutes: 60,
      settings: DEFAULT_STORE_SETTINGS,
      secretHint: "",
      lastEventAt: null,
      lastEventType: "",
      lastError: "",
    };
    setStores((p) => [optimistic, ...p]);
    const created = await createStore(projectId, { ...form, id, createdBy: user?.id ?? null });
    if (!created) {
      setStores((p) => p.filter((s) => s.id !== id));
      toast.error("Couldn't add the store.");
      return null;
    }
    setStores((p) => p.map((s) => (s.id === id ? created : s)));
    setCounts((c) => ({ ...c, [id]: { products: 0, orders: 0 } }));
    return created;
  };

  const handleSave = async (id, patch) => {
    const before = stores.find((s) => s.id === id);
    setStores((p) => p.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    const saved = await updateStore(id, patch);
    if (!saved) {
      setStores((p) => p.map((s) => (s.id === id ? before : s)));
      toast.error("Couldn't save the store.");
      return null;
    }
    setStores((p) => p.map((s) => (s.id === id ? saved : s)));
    toast.success("Store saved.");
    return saved;
  };

  const handleDelete = async (s) => {
    setDeleteTarget(null);
    setStores((p) => p.filter((x) => x.id !== s.id));
    if (String(s.id) === recordId) closeRecord();
    if (await softDeleteStore(s.id)) {
      toast.success(`Disconnected ${s.name}.`);
    } else {
      setStores((p) => [s, ...p]);
      toast.error(`Couldn't disconnect ${s.name}.`);
    }
  };

  const deleteDialog = (
    <ConfirmDialog
      open={!!deleteTarget}
      onOpenChange={(o) => !o && setDeleteTarget(null)}
      title="Disconnect store"
      description={
        <>
          Disconnect <span className="font-medium text-foreground">{deleteTarget?.name}</span>? Its webhooks are rejected from now on. Products, orders and carts already received stay in Geiger.
        </>
      }
      confirmLabel="Disconnect"
      icon={Unplug}
      onConfirm={() => handleDelete(deleteTarget)}
    />
  );

  const open = stores.find((s) => String(s.id) === recordId);
  if (open) {
    return (
      <>
        <StoreEditor
          key={open.id}
          projectId={projectId}
          record={open}
          canEdit={canEdit}
          onBack={closeRecord}
          onSave={handleSave}
          onDelete={setDeleteTarget}
          onOpenRecipes={() => setTab("Recipes")}
        />
        {deleteDialog}
      </>
    );
  }

  const filtersActive = query || platformFilter !== "all" || statusFilter !== "all";

  const clearFilters = () => {
    setQuery("");
    setPlatformFilter("all");
    setStatusFilter("all");
  };

  const columns = [
    {
      key: "store",
      header: "Store",
      render: (s) => (
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-active text-muted-foreground"><Store className="h-4 w-4" /></span>
          <div className="flex min-w-0 flex-col">
            <span className="font-medium text-foreground">{s.name}</span>
            <span className="truncate text-xs text-text-secondary">{s.domain || "No domain set"}</span>
          </div>
        </div>
      ),
    },
    { key: "platform", header: "Platform", render: (s) => <Badge variant={PLATFORM_MAP[s.platform]?.variant}>{PLATFORM_MAP[s.platform]?.label}</Badge> },
    { key: "products", header: "Products", className: "tabular-nums text-muted-foreground", render: (s) => (counts[s.id] ? count(counts[s.id].products) : "—") },
    { key: "orders", header: "Orders (30d)", className: "tabular-nums text-muted-foreground", render: (s) => (counts[s.id] ? count(counts[s.id].orders) : "—") },
    { key: "status", header: "Status", className: "whitespace-nowrap", render: (s) => <StatusPill status={s.status} map={STORE_STATUS_MAP} /> },
    { key: "lastEvent", header: "Last event", className: "whitespace-nowrap text-muted-foreground", render: (s) => (s.lastEventAt ? relativeTime(s.lastEventAt) : "None yet") },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (s) => (
        <div onClick={(e) => e.stopPropagation()}>
          <ActionMenu
            label={`Actions for ${s.name}`}
            items={[
              { label: canEdit ? "Edit store" : "View store", icon: Pencil, onSelect: () => openRecord(String(s.id)) },
              canEdit && { separator: true },
              canEdit && { label: "Disconnect", icon: Unplug, destructive: true, onSelect: () => setDeleteTarget(s) },
            ]}
          />
        </div>
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Stores"
        description="Connect storefronts so products, carts and orders stream into Geiger."
        actions={
          canEdit ? (
            <Button onClick={() => setConnectOpen(true)}>
              <Plus className="h-4 w-4" /> Connect store
            </Button>
          ) : null
        }
      />

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={platformFilter} onValueChange={setPlatformFilter} options={PLATFORM_FILTER_OPTIONS} height="h-9" />
          <FilterDropdown value={statusFilter} onValueChange={setStatusFilter} options={STATUS_FILTER_OPTIONS} height="h-9" />
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search stores…" />
      </Toolbar>

      {loading ? (
        <LoadingArea size={48} label="Loading stores" panel />
      ) : (
        <div className="space-y-5">
          <DataTable
            columns={columns}
            data={pager.pageItems}
            getRowKey={(s) => s.id}
            onRowClick={(s) => openRecord(String(s.id))}
            empty={
              <ListEmpty
                icon={Store}
                title={filtersActive ? "No matches" : "No stores yet"}
                description={filtersActive ? "Try a different search or filter." : "Connect a Shopify, WooCommerce or custom store to receive its products, carts and orders."}
                action={
                  filtersActive ? (
                    <Button variant="outline" className={OUTLINE_BUTTON} onClick={clearFilters}>Clear filters</Button>
                  ) : canEdit ? (
                    <Button onClick={() => setConnectOpen(true)}>
                      <Plus className="h-4 w-4" /> Connect store
                    </Button>
                  ) : null
                }
              />
            }
          />
          <ListPagination {...pager} itemLabel="stores" />
        </div>
      )}

      <ConnectStoreDialog
        open={connectOpen}
        onOpenChange={setConnectOpen}
        projectId={projectId}
        onCreate={handleCreate}
        onDone={(s) => openRecord(String(s.id))}
      />
      {deleteDialog}
    </MainScreenWrapper>
  );
}

export default StoresScreen;
