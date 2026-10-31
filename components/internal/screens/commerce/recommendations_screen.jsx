"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CopyPlus, Eye, FileText, Filter, LayoutGrid, Loader2, Pause, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import { EditorShell } from "@/components/internal/shared/editor_shell";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { useProject } from "@/context/project-context";
import { useCan } from "@/context/rbac-context";
import { apiPost } from "@/lib/api/client";
import { getUser } from "@/lib/supabase/user";
import {
  DEFAULT_RULE_FILTERS,
  createRecommendationRule,
  listRecommendationRules,
  softDeleteRecommendationRule,
  updateRecommendationRule,
} from "@/lib/supabase/recommendation_rules";
import { countProducts, listProducts } from "@/lib/supabase/products";
import { countOrders } from "@/lib/supabase/orders";
import { listStores } from "@/lib/supabase/stores";
import { listContacts } from "@/lib/supabase/contacts";
import { STRATEGY_INFO, STRATEGY_KEYS } from "@/lib/commerce/recommendations";
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
  cn,
} from "@geiger/ui";
import {
  DANGER_ICON_BUTTON,
  OUTLINE_BUTTON,
  PLACEMENT_LABEL,
  PLACEMENT_OPTIONS,
  RULE_STATUS_MAP,
  STRATEGY_MAP,
  count,
  daysAgoIso,
  money,
  toFilterOptions,
} from "./constants";
import { ConfirmDialog, CopyField, ListEmpty, ProductThumb } from "./commerce_ui";

const STRATEGY_FILTER_OPTIONS = toFilterOptions(STRATEGY_MAP, "All strategies");
const STATUS_FILTER_OPTIONS = toFilterOptions(RULE_STATUS_MAP, "All statuses");
const ITEM_COUNTS = ["2", "3", "4", "6", "8"];
const WINDOW_OPTIONS = ["7", "14", "30", "60", "90", "180", "365"];
const ALL_STORES = "all";
const NONE = "none";

const RULE_NAV = [
  { key: "details", label: "Details", icon: FileText, desc: "Name the rule and choose how products are picked." },
  { key: "filters", label: "Filters", icon: Filter, desc: "Which products are eligible and over what time window." },
  { key: "preview", label: "Preview", icon: Eye, desc: "What this rule returns right now, computed from your orders and views." },
];

const EMPTY_FORM = { name: "", strategy: "bestsellers", placement: PLACEMENT_OPTIONS[0].value, limit: "4" };

const splitCategories = (text) => String(text || "").split(",").map((c) => c.trim()).filter(Boolean);
const numOrNull = (v) => (v === "" || v == null ? null : Number(v));

function NewRuleDialog({ open, onOpenChange, onCreate }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [pending, setPending] = useState(false);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.name.trim()) return toast.error("Name the rule first.");
    setPending(true);
    const ok = await onCreate({
      name: form.name.trim(),
      strategy: form.strategy,
      placement: form.placement,
      limit: Number(form.limit),
      status: "active",
      filters: { ...DEFAULT_RULE_FILTERS, days: STRATEGY_INFO[form.strategy].defaultDays },
    });
    setPending(false);
    if (!ok) return;
    setForm(EMPTY_FORM);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New recommendation rule</DialogTitle>
          <DialogDescription>Rules pick products for product blocks from real orders and views.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Rule name" htmlFor="r-name">
            <Input id="r-name" value={form.name} onChange={(e) => set("name")(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="e.g. Best sellers this month" autoFocus />
          </Field>
          <Field label="Strategy" hint={STRATEGY_INFO[form.strategy].description}>
            <Select value={form.strategy} onValueChange={set("strategy")}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STRATEGY_KEYS.map((s) => <SelectItem key={s} value={s}>{STRATEGY_MAP[s].label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Placement">
              <Select value={form.placement} onValueChange={set("placement")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PLACEMENT_OPTIONS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Products shown">
              <Select value={form.limit} onValueChange={set("limit")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ITEM_COUNTS.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!form.name.trim() || pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Create rule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// The rule as the recommender reads it, built from the (possibly unsaved) draft.
function draftToRule(draft) {
  return {
    strategy: draft.strategy,
    limit: Number(draft.limit) || 4,
    storeId: draft.storeId === ALL_STORES ? null : draft.storeId,
    filters: {
      days: Number(draft.days) || STRATEGY_INFO[draft.strategy].defaultDays,
      categories: splitCategories(draft.categories),
      minPrice: numOrNull(draft.minPrice),
      maxPrice: numOrNull(draft.maxPrice),
      inStockOnly: draft.inStockOnly,
      excludePurchased: draft.excludePurchased,
      fallback: draft.fallback,
    },
  };
}

const NEEDS_COPY = {
  product: "Pick a product to see what's bought with it.",
  contact: "Pick a shopper to see what they viewed.",
  category: "Add at least one category under Filters.",
};

function PreviewSection({ projectId, draft }) {
  const rule = useMemo(() => draftToRule(draft), [draft]);
  const ruleKey = JSON.stringify(rule);
  const [products, setProducts] = useState(null);
  const [contacts, setContacts] = useState(null);
  const [productId, setProductId] = useState(NONE);
  const [contactId, setContactId] = useState(NONE);
  const [state, setState] = useState({ loading: true, data: null, error: "" });
  const wantsProduct = draft.strategy === "also_bought";
  const wantsContact = draft.strategy === "recently_viewed" || draft.strategy === "also_bought" || draft.excludePurchased;

  useEffect(() => {
    let alive = true;
    Promise.all([listProducts(projectId, { status: "active", limit: 500 }), listContacts(projectId, { limit: 300 })]).then(([p, c]) => {
      if (!alive) return;
      setProducts(p ?? []);
      setContacts((c ?? []).filter((x) => x.email));
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  useEffect(() => {
    let alive = true;
    const timer = setTimeout(async () => {
      setState((s) => ({ ...s, loading: true }));
      const res = await apiPost(`/api/projects/${projectId}/commerce/recommendations/preview`, {
        rule: JSON.parse(ruleKey),
        contactId: contactId === NONE ? null : contactId,
        productId: productId === NONE ? null : productId,
      });
      if (!alive) return;
      setState({ loading: false, data: res.ok ? res.data : null, error: res.ok ? "" : res.error });
    }, 350);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [projectId, ruleKey, contactId, productId]);

  const data = state.data;

  return (
    <div className="space-y-6">
      {wantsProduct || wantsContact ? (
        <SectionCard bare title="Preview inputs" description="The product and shopper the preview is computed for.">
          <div className="grid gap-4 sm:grid-cols-2">
            {wantsProduct ? (
              <Field label="Seed product" hint="The product a shopper viewed, carted or bought.">
                <Select value={productId} onValueChange={setProductId}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>{contactId === NONE ? "None" : "Shopper's latest order"}</SelectItem>
                    {(products || []).map((p) => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            ) : null}
            {wantsContact ? (
              <Field label="Preview as shopper" hint="Uses their views and purchases.">
                <Select value={contactId} onValueChange={setContactId}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Anonymous shopper</SelectItem>
                    {(contacts || []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name === c.email ? c.email : `${c.name} · ${c.email}`}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            ) : null}
          </div>
        </SectionCard>
      ) : null}

      <SectionCard
        title="Result"
        description={data ? `Based on ${count(data.basis.orders)} orders and ${count(data.basis.products)} active products · last ${data.basis.days} days` : "Computed from your store data."}
        action={state.loading ? <Loader2 className="h-4 w-4 animate-spin text-text-secondary" aria-label="Updating preview" /> : null}
      >
        {state.error ? (
          <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
        ) : !data ? (
          <LoadingArea size={40} label="Computing preview" className="py-8" />
        ) : (
          <div className="space-y-4">
            {data.needs ? <p className="rounded-lg border border-border bg-surface-card px-3 py-2 text-xs text-text-secondary">{NEEDS_COPY[data.needs]}{data.items.length ? " Showing fallback best sellers meanwhile." : ""}</p> : null}
            {data.items.length ? (
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {data.items.map((item, i) => (
                  <li key={item.productId} className={cn("flex flex-col gap-3 rounded-lg border border-border bg-surface-card p-3", item.fallback && "border-dashed")}>
                    <div className="flex items-start gap-3">
                      <ProductThumb imageUrl={item.imageUrl} title={item.title} size="h-12 w-12" />
                      <div className="min-w-0">
                        <p className="text-[11px] font-medium tabular-nums text-text-tertiary">#{i + 1}</p>
                        <p className="line-clamp-2 text-sm font-medium text-foreground">{item.title}</p>
                      </div>
                    </div>
                    <div className="flex items-baseline gap-1.5 text-sm tabular-nums">
                      <span className="text-foreground">{money(item.price, item.currency)}</span>
                      {item.compareAtPrice > item.price ? <span className="text-xs text-text-tertiary line-through">{money(item.compareAtPrice, item.currency)}</span> : null}
                    </div>
                    <p className="text-xs text-text-secondary">{item.reason}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-text-secondary">
                {data.basis.products ? "No products match this rule and its filters yet." : "No active products yet. Connect a store or add products first."}
              </p>
            )}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// Editable slice of a rule; compared against the row to derive dirty state.
const toDraft = (r) => ({
  name: r.name,
  strategy: r.strategy,
  placement: r.placement,
  limit: String(r.limit),
  status: r.status,
  storeId: r.storeId || ALL_STORES,
  days: String(r.filters.days ?? STRATEGY_INFO[r.strategy]?.defaultDays ?? 30),
  categories: (r.filters.categories || []).join(", "),
  minPrice: r.filters.minPrice == null ? "" : String(r.filters.minPrice),
  maxPrice: r.filters.maxPrice == null ? "" : String(r.filters.maxPrice),
  inStockOnly: r.filters.inStockOnly !== false,
  excludePurchased: r.filters.excludePurchased !== false,
  fallback: r.filters.fallback !== false,
});

function RuleEditor({ projectId, record, stores, categories, canEdit, onBack, onSave, onDelete }) {
  const [draft, setDraft] = useState(() => toDraft(record));
  const [saving, setSaving] = useState(false);
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(record));
  const chosen = splitCategories(draft.categories);
  const windowOptions = WINDOW_OPTIONS.includes(draft.days) ? WINDOW_OPTIONS : [...WINDOW_OPTIONS, draft.days];

  const toggleCategory = (c) => {
    const next = chosen.includes(c) ? chosen.filter((x) => x !== c) : [...chosen, c];
    set("categories")(next.join(", "));
  };

  const save = async () => {
    setSaving(true);
    const rule = draftToRule(draft);
    const saved = await onSave(record.id, {
      name: draft.name.trim() || "Untitled rule",
      strategy: rule.strategy,
      placement: draft.placement,
      limit: rule.limit,
      status: draft.status,
      storeId: rule.storeId,
      filters: rule.filters,
    });
    setSaving(false);
    if (saved) setDraft(toDraft(saved));
  };

  return (
    <EditorShell
      back={{ label: "Back", onClick: onBack }}
      title={
        <InlineTitleInput
          value={draft.name}
          onChange={(e) => set("name")(e.target.value)}
          aria-label="Rule name"
          placeholder="Untitled rule"
          readOnly={!canEdit}
          className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl"
        />
      }
      status={draft.status}
      statusMap={RULE_STATUS_MAP}
      badges={
        <>
          <Badge variant={STRATEGY_MAP[draft.strategy]?.variant}>{STRATEGY_MAP[draft.strategy]?.label}</Badge>
          <span className="text-xs text-text-tertiary">{PLACEMENT_LABEL[draft.placement] || draft.placement} · {draft.limit} products</span>
        </>
      }
      actions={
        canEdit ? (
          <>
            <Button variant="ghost" size="icon" aria-label="Delete rule" className={DANGER_ICON_BUTTON} onClick={() => onDelete(record)}>
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button variant="outline" className={OUTLINE_BUTTON} disabled={!dirty || saving} onClick={save}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save
            </Button>
          </>
        ) : null
      }
      nav={RULE_NAV}
      defaultSection="details"
    >
      {({ active }) => (
        <>
          {active === "details" ? (
            <SectionCard bare title="Rule setup" description="The rule's name, how it picks products and where it's meant to run.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Rule name" htmlFor="re-name">
                  <Input id="re-name" value={draft.name} disabled={!canEdit} onChange={(e) => set("name")(e.target.value)} />
                </Field>
                <Field label="Strategy" hint={STRATEGY_INFO[draft.strategy]?.description}>
                  <Select value={draft.strategy} onValueChange={set("strategy")} disabled={!canEdit}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STRATEGY_KEYS.map((s) => <SelectItem key={s} value={s}>{STRATEGY_MAP[s].label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Placement" hint="Which emails this rule is meant for.">
                  <Select value={draft.placement} onValueChange={set("placement")} disabled={!canEdit}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PLACEMENT_OPTIONS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Products shown">
                  <Select value={draft.limit} onValueChange={set("limit")} disabled={!canEdit}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[...new Set([draft.limit, ...ITEM_COUNTS])].map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <SettingsList className="mt-5 border-t border-border pt-4">
                <SettingRow
                  title="Active"
                  description="Paused rules return nothing to product blocks until resumed."
                  checked={draft.status === "active"}
                  onCheckedChange={(on) => canEdit && set("status")(on ? "active" : "paused")}
                />
              </SettingsList>
              <Field label="Rule id" hint="Product blocks reference the rule by this id." className="mt-5 border-t border-border pt-4">
                <CopyField value={record.id} label="Rule id" />
              </Field>
            </SectionCard>
          ) : null}

          {active === "filters" ? (
            <SectionCard bare title="Eligible products" description="Store, price, category and stock limits on what the rule can return.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Store">
                  <Select value={draft.storeId} onValueChange={set("storeId")} disabled={!canEdit}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_STORES}>All stores</SelectItem>
                      {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Time window" hint={draft.strategy === "trending" ? "Compared with the same window before it." : "Orders and views inside this window count."}>
                  <Select value={draft.days} onValueChange={set("days")} disabled={!canEdit}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {windowOptions.map((d) => <SelectItem key={d} value={d}>Last {d} days</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Minimum price" htmlFor="re-min">
                  <Input id="re-min" type="number" min="0" step="0.01" value={draft.minPrice} disabled={!canEdit} onChange={(e) => set("minPrice")(e.target.value)} placeholder="Any" />
                </Field>
                <Field label="Maximum price" htmlFor="re-max">
                  <Input id="re-max" type="number" min="0" step="0.01" value={draft.maxPrice} disabled={!canEdit} onChange={(e) => set("maxPrice")(e.target.value)} placeholder="Any" />
                </Field>
                <Field label="Categories" htmlFor="re-cats" hint={draft.strategy === "category" ? "Required for the category strategy." : "Optional. Only products in these categories."} className="sm:col-span-2">
                  <Input id="re-cats" value={draft.categories} disabled={!canEdit} onChange={(e) => set("categories")(e.target.value)} placeholder="Coffee, Equipment" />
                </Field>
              </div>
              {categories.length ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {categories.map((c) => (
                    <button
                      key={c}
                      type="button"
                      disabled={!canEdit}
                      onClick={() => toggleCategory(c)}
                      className={cn(
                        "rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors",
                        chosen.includes(c) ? "border-border-strong bg-surface-active text-foreground" : "border-border bg-surface-card text-text-secondary hover:bg-surface-hover",
                      )}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              ) : null}
              <SettingsList className="mt-5 border-t border-border pt-4">
                <SettingRow title="In stock only" description="Skip products with zero inventory." checked={draft.inStockOnly} onCheckedChange={(v) => canEdit && set("inStockOnly")(v)} />
                <SettingRow title="Skip what the shopper bought" description="Leave out products the recipient already ordered." checked={draft.excludePurchased} onCheckedChange={(v) => canEdit && set("excludePurchased")(v)} />
                <SettingRow title="Fill with best sellers" description="When the strategy finds too few products, top up with best sellers." checked={draft.fallback} onCheckedChange={(v) => canEdit && set("fallback")(v)} />
              </SettingsList>
            </SectionCard>
          ) : null}

          {active === "preview" ? <PreviewSection projectId={projectId} draft={draft} /> : null}
        </>
      )}
    </EditorShell>
  );
}

export function RecommendationsScreen() {
  const { projectId } = useProject();
  const canEdit = useCan("campaign.commerce.edit");
  const [rules, setRules] = useState([]);
  const [stores, setStores] = useState([]);
  const [categories, setCategories] = useState([]);
  const [basis, setBasis] = useState({ products: null, orders: null });
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [strategyFilter, setStrategyFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const { recordId, openRecord, closeRecord } = useWorkspaceUrl();

  useEffect(() => {
    if (!projectId) return;
    let alive = true;
    Promise.all([
      listRecommendationRules(projectId),
      listStores(projectId),
      countProducts(projectId, { status: "active" }),
      countOrders(projectId, { since: daysAgoIso(90) }),
      listProducts(projectId, { status: "active", limit: 2000 }),
    ]).then(([rows, storeRows, products, orders, productRows]) => {
      if (!alive) return;
      setRules(rows ?? []);
      setStores(storeRows ?? []);
      setBasis({ products, orders });
      setCategories([...new Set((productRows ?? []).flatMap((p) => p.categories))].sort((a, b) => a.localeCompare(b)));
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rules.filter((r) => {
      if (strategyFilter !== "all" && r.strategy !== strategyFilter) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (q && !r.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rules, query, strategyFilter, statusFilter]);

  const stats = useMemo(
    () => [
      { label: "Rules", value: count(rules.length) },
      { label: "Active", value: count(rules.filter((r) => r.status === "active").length) },
      { label: "Active products", value: basis.products == null ? "—" : count(basis.products), footer: "Eligible to recommend" },
      { label: "Orders (90d)", value: basis.orders == null ? "—" : count(basis.orders), footer: "What rankings learn from" },
    ],
    [rules, basis],
  );

  const pager = usePagination(filtered, { resetKey: `${query}|${strategyFilter}|${statusFilter}` });

  const handleCreate = async (input) => {
    const id = crypto.randomUUID();
    const user = await getUser();
    setRules((p) => [{ id, projectId, storeId: null, ...input }, ...p]);
    const created = await createRecommendationRule(projectId, { ...input, id, createdBy: user?.id ?? null });
    if (!created) {
      setRules((p) => p.filter((r) => r.id !== id));
      toast.error("Couldn't create the rule.");
      return null;
    }
    setRules((p) => p.map((r) => (r.id === id ? created : r)));
    toast.success("Rule created.");
    openRecord(id);
    return created;
  };

  const handleSave = async (id, patch, message = "Rule saved.") => {
    const before = rules.find((r) => r.id === id);
    setRules((p) => p.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    const saved = await updateRecommendationRule(id, patch);
    if (!saved) {
      setRules((p) => p.map((r) => (r.id === id ? before : r)));
      toast.error("Couldn't save the rule.");
      return null;
    }
    setRules((p) => p.map((r) => (r.id === id ? saved : r)));
    toast.success(message);
    return saved;
  };

  const handleDuplicate = async (r) => {
    const id = crypto.randomUUID();
    const input = { name: `${r.name} (copy)`, strategy: r.strategy, placement: r.placement, limit: r.limit, storeId: r.storeId, filters: r.filters, status: "paused" };
    setRules((p) => [{ id, projectId, ...input }, ...p]);
    const created = await createRecommendationRule(projectId, { ...input, id });
    if (!created) {
      setRules((p) => p.filter((x) => x.id !== id));
      toast.error("Couldn't duplicate the rule.");
      return;
    }
    setRules((p) => p.map((x) => (x.id === id ? created : x)));
    toast.success("Rule duplicated (paused).");
  };

  const handleDelete = async (r) => {
    setDeleteTarget(null);
    setRules((p) => p.filter((x) => x.id !== r.id));
    if (String(r.id) === recordId) closeRecord();
    if (await softDeleteRecommendationRule(r.id)) {
      toast.success(`Deleted "${r.name}".`);
    } else {
      setRules((p) => [r, ...p]);
      toast.error(`Couldn't delete "${r.name}".`);
    }
  };

  const deleteDialog = (
    <ConfirmDialog
      open={!!deleteTarget}
      onOpenChange={(o) => !o && setDeleteTarget(null)}
      title="Delete rule"
      description={
        <>
          Delete <span className="font-medium text-foreground">{deleteTarget?.name}</span>? Product blocks using it show nothing until they point at another rule.
        </>
      }
      confirmLabel="Delete"
      icon={Trash2}
      onConfirm={() => handleDelete(deleteTarget)}
    />
  );

  const open = rules.find((r) => String(r.id) === recordId);
  if (open) {
    return (
      <>
        <RuleEditor key={open.id} projectId={projectId} record={open} stores={stores} categories={categories} canEdit={canEdit} onBack={closeRecord} onSave={handleSave} onDelete={setDeleteTarget} />
        {deleteDialog}
      </>
    );
  }

  const filtersActive = query || strategyFilter !== "all" || statusFilter !== "all";

  const clearFilters = () => {
    setQuery("");
    setStrategyFilter("all");
    setStatusFilter("all");
  };

  const columns = [
    {
      key: "rule",
      header: "Rule",
      render: (r) => (
        <div className="flex min-w-0 flex-col">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="truncate text-xs text-text-secondary">{stores.find((s) => s.id === r.storeId)?.name || "All stores"}</span>
        </div>
      ),
    },
    { key: "strategy", header: "Strategy", render: (r) => <Badge variant={STRATEGY_MAP[r.strategy]?.variant}>{STRATEGY_MAP[r.strategy]?.label}</Badge> },
    { key: "placement", header: "Placement", className: "text-muted-foreground", render: (r) => PLACEMENT_LABEL[r.placement] || r.placement },
    { key: "items", header: "Products", className: "tabular-nums text-muted-foreground", render: (r) => r.limit },
    { key: "window", header: "Window", className: "whitespace-nowrap text-muted-foreground", render: (r) => `${r.filters?.days ?? STRATEGY_INFO[r.strategy]?.defaultDays} days` },
    { key: "status", header: "Status", className: "whitespace-nowrap", render: (r) => <StatusPill status={r.status} map={RULE_STATUS_MAP} /> },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (r) => (
        <div onClick={(e) => e.stopPropagation()}>
          <ActionMenu
            label={`Actions for ${r.name}`}
            items={[
              { label: canEdit ? "Edit rule" : "View rule", icon: Pencil, onSelect: () => openRecord(String(r.id)) },
              canEdit && { label: "Duplicate", icon: CopyPlus, onSelect: () => handleDuplicate(r) },
              canEdit &&
                (r.status === "active"
                  ? { label: "Pause", icon: Pause, onSelect: () => handleSave(r.id, { status: "paused" }, `Paused "${r.name}".`) }
                  : { label: "Resume", icon: Play, onSelect: () => handleSave(r.id, { status: "active" }, `Resumed "${r.name}".`) }),
              canEdit && { separator: true },
              canEdit && { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setDeleteTarget(r) },
            ]}
          />
        </div>
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Recommendations"
        description="Rules that rank products from your orders and views for product blocks."
        actions={
          canEdit ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> New rule
            </Button>
          ) : null
        }
      />

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={strategyFilter} onValueChange={setStrategyFilter} options={STRATEGY_FILTER_OPTIONS} height="h-9" />
          <FilterDropdown value={statusFilter} onValueChange={setStatusFilter} options={STATUS_FILTER_OPTIONS} height="h-9" />
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search rules…" />
      </Toolbar>

      {loading ? (
        <LoadingArea size={48} label="Loading rules" panel />
      ) : (
        <div className="space-y-5">
          <DataTable
            columns={columns}
            data={pager.pageItems}
            getRowKey={(r) => r.id}
            onRowClick={(r) => openRecord(String(r.id))}
            empty={
              <ListEmpty
                icon={LayoutGrid}
                title={filtersActive ? "No matches" : "No recommendation rules yet"}
                description={filtersActive ? "Try a different search or filter." : "Create a rule to rank best sellers, trending or frequently-bought-together products."}
                action={
                  filtersActive ? (
                    <Button variant="outline" className={OUTLINE_BUTTON} onClick={clearFilters}>Clear filters</Button>
                  ) : canEdit ? (
                    <Button onClick={() => setCreateOpen(true)}>
                      <Plus className="h-4 w-4" /> New rule
                    </Button>
                  ) : null
                }
              />
            }
          />
          <ListPagination {...pager} itemLabel="rules" />
        </div>
      )}

      <NewRuleDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={handleCreate} />
      {deleteDialog}
    </MainScreenWrapper>
  );
}

export default RecommendationsScreen;
