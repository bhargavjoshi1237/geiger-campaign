"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CircleX, Eye, Loader2, MousePointerClick, Receipt, ShoppingBag, Trash2, Truck, Undo2, User } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import { EditorShell } from "@/components/internal/shared/editor_shell";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { useProject } from "@/context/project-context";
import { useCan } from "@/context/rbac-context";
import { listOrders, softDeleteOrder, updateOrder } from "@/lib/supabase/orders";
import { listStores } from "@/lib/supabase/stores";
import { listCampaigns } from "@/lib/supabase/campaigns";
import { netRevenue, totalInPrimaryCurrency } from "@/lib/commerce/metrics";
import { ATTRIBUTION_WINDOW_DAYS } from "@/lib/commerce/attribution";
import {
  Badge,
  Button,
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
  LoadingArea,
} from "@geiger/ui";
import {
  DANGER_ICON_BUTTON,
  ORDER_STATUS_MAP,
  OUTLINE_BUTTON,
  count,
  daysAgoIso,
  formatDate,
  formatDateTime,
  money,
  moneyShort,
  toFilterOptions,
} from "./constants";
import { ConfirmDialog, ListEmpty, ProductThumb, ReadOnly } from "./commerce_ui";

const STATUS_FILTER_OPTIONS = toFilterOptions(ORDER_STATUS_MAP, "All statuses");
const ATTRIBUTION_FILTER_OPTIONS = [
  { value: "all", label: "All attribution" },
  { value: "attributed", label: "Attributed to a campaign" },
  { value: "unattributed", label: "Not attributed" },
];

const ORDER_NAV = [
  { key: "details", label: "Details", icon: User, desc: "Who ordered, from which store, and the order's status." },
  { key: "items", label: "Line items", icon: ShoppingBag, desc: "What was bought and what was charged." },
  { key: "attribution", label: "Attribution", icon: MousePointerClick, desc: `The campaign email clicked last, up to ${ATTRIBUTION_WINDOW_DAYS} days before ordering.` },
];

const SOURCE_LABELS = { campaign: "Campaign", automation: "Automation", broadcast: "Broadcast", transactional: "Transactional", commerce: "Cart reminder" };

function OrderEditor({ record, store, campaign, canEdit, onBack, onStatus, onDelete, onOpenCampaign, onOpenContact }) {
  const [status, setStatus] = useState(record.status);
  const [saving, setSaving] = useState(false);
  const a = record.attribution;
  const matched = Boolean(a.deliveryId || record.attributedCampaignId);

  const save = async () => {
    setSaving(true);
    const saved = await onStatus(record, status);
    setSaving(false);
    if (!saved) setStatus(record.status);
  };

  return (
    <EditorShell
      back={{ label: "Back", onClick: onBack }}
      title={`Order ${record.number}`}
      status={record.status}
      statusMap={ORDER_STATUS_MAP}
      badges={
        <span className="text-xs text-text-tertiary">
          Placed {formatDateTime(record.placedAt)} · {money(record.total, record.currency)}
          {store ? ` · ${store.name}` : ""}
        </span>
      }
      actions={
        canEdit ? (
          <>
            <Button variant="ghost" size="icon" aria-label="Delete order" className={DANGER_ICON_BUTTON} onClick={() => onDelete(record)}>
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button variant="outline" className={OUTLINE_BUTTON} disabled={status === record.status || saving} onClick={save}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save
            </Button>
          </>
        ) : null
      }
      nav={ORDER_NAV}
      defaultSection="details"
    >
      {({ active }) => (
        <>
          {active === "details" ? (
            <SectionCard bare title="Customer & store" description="Who placed the order, where, and its status in Geiger's reports.">
              <SettingsList>
                <SettingRow
                  title="Customer"
                  description={record.email || "No email on the order"}
                  control={
                    record.contactId ? (
                      <Button variant="outline" size="sm" className={OUTLINE_BUTTON} onClick={() => onOpenContact(record.contactId)}>
                        {record.customer}
                      </Button>
                    ) : (
                      <ReadOnly>{record.customer}</ReadOnly>
                    )
                  }
                />
                <SettingRow title="Store" description="Where the order was placed." control={<ReadOnly>{store?.name || "Unknown store"}</ReadOnly>} />
                <SettingRow title="Store order id" description="The id your store uses for this order." control={<ReadOnly className="font-mono text-xs">{record.externalId || "—"}</ReadOnly>} />
                <SettingRow title="Coupon" description="Discount code used at checkout." control={<ReadOnly className="font-mono">{record.couponCode || "None"}</ReadOnly>} />
                {record.cartId ? <SettingRow title="Cart" description="This order closed a tracked cart." control={<Badge variant="info">Linked</Badge>} /> : null}
              </SettingsList>
              <div className="mt-5 grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
                <Field label="Status" hint="Corrects Geiger's reporting only — your store keeps its own status.">
                  <Select value={status} onValueChange={setStatus} disabled={!canEdit}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(ORDER_STATUS_MAP).map(([value, meta]) => <SelectItem key={value} value={value}>{meta.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </SectionCard>
          ) : null}

          {active === "items" ? (
            <SectionCard>
              <ul className="space-y-2">
                {record.items.map((li, i) => (
                  <li key={`${li.productId || li.externalId || i}-${i}`} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-card px-3 py-2 text-sm">
                    <span className="flex min-w-0 items-center gap-3">
                      <ProductThumb imageUrl={li.imageUrl} title={li.title} size="h-8 w-8" />
                      <span className="truncate text-foreground">
                        {li.title} <span className="text-text-secondary">× {li.quantity}</span>
                      </span>
                    </span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">{money(li.price * li.quantity, record.currency)}</span>
                  </li>
                ))}
                {record.items.length === 0 ? <li className="text-sm text-text-secondary">The store sent no line items.</li> : null}
              </ul>
              <dl className="mt-4 space-y-1.5 border-t border-border pt-4 text-sm">
                {[
                  ["Subtotal", record.subtotal],
                  ["Discount", -record.discount],
                  ["Shipping", record.shipping],
                  ["Tax", record.tax],
                ]
                  .filter(([, v]) => v)
                  .map(([label, v]) => (
                    <div key={label} className="flex justify-between text-muted-foreground">
                      <dt>{label}</dt>
                      <dd className="tabular-nums">{money(v, record.currency)}</dd>
                    </div>
                  ))}
                <div className="flex justify-between font-semibold text-foreground">
                  <dt>Total · {count(record.itemCount)} items</dt>
                  <dd className="tabular-nums">{money(record.total, record.currency)}</dd>
                </div>
                {record.refundedAmount ? (
                  <div className="flex justify-between text-red-600 dark:text-red-400">
                    <dt>Refunded</dt>
                    <dd className="tabular-nums">−{money(record.refundedAmount, record.currency)}</dd>
                  </div>
                ) : null}
              </dl>
            </SectionCard>
          ) : null}

          {active === "attribution" ? (
            <SectionCard bare title="Last-click credit" description="The email click that gets credit for this order's revenue.">
              <SettingsList>
                <SettingRow title="Model" description={`Last email click within ${a.windowDays} days before the order.`} control={<Badge variant="neutral">Last click</Badge>} />
                {matched ? (
                  <>
                    <SettingRow
                      title="Campaign"
                      description={campaign ? "Revenue counts toward this campaign's reports." : a.sourceType ? `From ${SOURCE_LABELS[a.sourceType]?.toLowerCase() || a.sourceType} email, not a campaign.` : "The campaign was deleted."}
                      control={
                        campaign ? (
                          <Button variant="outline" size="sm" className={OUTLINE_BUTTON} onClick={() => onOpenCampaign(campaign.id)}>
                            {campaign.name}
                          </Button>
                        ) : (
                          <ReadOnly>{SOURCE_LABELS[a.sourceType] || "—"}</ReadOnly>
                        )
                      }
                    />
                    <SettingRow title="Clicked" description="When the shopper clicked the email." control={<ReadOnly>{formatDateTime(a.clickedAt)}</ReadOnly>} />
                    <SettingRow title="Attributed revenue" description="Net of refunds." control={<ReadOnly>{money(netRevenue(record), record.currency)}</ReadOnly>} />
                  </>
                ) : (
                  <SettingRow
                    title="Not attributed"
                    description={record.contactId ? `This shopper didn't click an email in the ${a.windowDays} days before ordering.` : "The order had no email that matches a contact."}
                    control={<Badge variant="neutral">None</Badge>}
                  />
                )}
              </SettingsList>
            </SectionCard>
          ) : null}
        </>
      )}
    </EditorShell>
  );
}

export function OrdersScreen() {
  const { projectId } = useProject();
  const canEdit = useCan("campaign.commerce.edit");
  const [orders, setOrders] = useState([]);
  const [stores, setStores] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [recentSince, setRecentSince] = useState(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [storeFilter, setStoreFilter] = useState("all");
  const [attributionFilter, setAttributionFilter] = useState("all");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const { recordId, openRecord, closeRecord, openRecordInTab } = useWorkspaceUrl();

  useEffect(() => {
    if (!projectId) return;
    let alive = true;
    Promise.all([listOrders(projectId, { limit: 5000 }), listStores(projectId), listCampaigns(projectId)]).then(([rows, storeRows, campaignRows]) => {
      if (!alive) return;
      setOrders(rows ?? []);
      setStores(storeRows ?? []);
      setCampaigns(campaignRows ?? []);
      setRecentSince(daysAgoIso(30));
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const storeById = useMemo(() => new Map(stores.map((s) => [s.id, s])), [stores]);
  const campaignById = useMemo(() => new Map(campaigns.map((c) => [c.id, c])), [campaigns]);
  const storeOptions = useMemo(() => [{ value: "all", label: "All stores" }, ...stores.map((s) => ({ value: s.id, label: s.name }))], [stores]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders.filter((o) => {
      if (statusFilter !== "all" && o.status !== statusFilter) return false;
      if (storeFilter !== "all" && o.storeId !== storeFilter) return false;
      if (attributionFilter === "attributed" && !o.attributedCampaignId) return false;
      if (attributionFilter === "unattributed" && o.attributedCampaignId) return false;
      if (q && !`${o.number} ${o.customer} ${o.email} ${o.couponCode}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [orders, query, statusFilter, storeFilter, attributionFilter]);

  const stats = useMemo(() => {
    const revenue = totalInPrimaryCurrency(orders, netRevenue);
    const counted = orders.filter((o) => netRevenue(o) > 0 && o.currency === revenue.currency);
    const attributed = totalInPrimaryCurrency(
      orders.filter((o) => o.attributedCampaignId && o.currency === revenue.currency),
      netRevenue,
    );
    const share = revenue.total ? Math.round((attributed.total / revenue.total) * 100) : 0;
    const recent = recentSince ? orders.filter((o) => o.placedAt >= recentSince).length : 0;
    return [
      { label: "Orders", value: count(orders.length), footer: `${count(recent)} in the last 30 days` },
      { label: "Revenue", value: moneyShort(revenue.total, revenue.currency), footer: revenue.excluded ? `Net of refunds · ${count(revenue.excluded)} in other currencies` : "Net of refunds" },
      { label: "Avg. order value", value: money(counted.length ? revenue.total / counted.length : 0, revenue.currency) },
      { label: "Attributed revenue", value: moneyShort(attributed.total, revenue.currency), footer: `${share}% of revenue · last click, ${ATTRIBUTION_WINDOW_DAYS} days` },
    ];
  }, [orders, recentSince]);

  const pager = usePagination(filtered, { resetKey: `${query}|${statusFilter}|${storeFilter}|${attributionFilter}` });

  const setOrderStatus = async (o, status) => {
    const patch = { status, ...(status === "refunded" ? { refundedAmount: o.total } : {}) };
    setOrders((p) => p.map((x) => (x.id === o.id ? { ...x, ...patch } : x)));
    const saved = await updateOrder(o.id, patch);
    if (!saved) {
      setOrders((p) => p.map((x) => (x.id === o.id ? o : x)));
      toast.error(`Couldn't update order ${o.number}.`);
      return null;
    }
    setOrders((p) => p.map((x) => (x.id === o.id ? saved : x)));
    toast.success(`Order ${o.number} marked ${ORDER_STATUS_MAP[status].label.toLowerCase()} in Geiger.`);
    return saved;
  };

  const handleDelete = async (o) => {
    setDeleteTarget(null);
    setOrders((p) => p.filter((x) => x.id !== o.id));
    if (String(o.id) === recordId) closeRecord();
    if (await softDeleteOrder(o.id)) {
      toast.success(`Removed order ${o.number} from Geiger.`);
    } else {
      setOrders((p) => [o, ...p]);
      toast.error(`Couldn't remove order ${o.number}.`);
    }
  };

  const deleteDialog = (
    <ConfirmDialog
      open={!!deleteTarget}
      onOpenChange={(o) => !o && setDeleteTarget(null)}
      title="Remove order"
      description={
        <>
          Remove order <span className="font-mono font-medium text-foreground">{deleteTarget?.number}</span> from Geiger? It drops out of revenue and attribution reports. Your store keeps its copy.
        </>
      }
      confirmLabel="Remove"
      icon={Trash2}
      onConfirm={() => handleDelete(deleteTarget)}
    />
  );

  const open = orders.find((o) => String(o.id) === recordId);
  if (open) {
    return (
      <>
        <OrderEditor
          key={open.id}
          record={open}
          store={storeById.get(open.storeId)}
          campaign={campaignById.get(open.attributedCampaignId)}
          canEdit={canEdit}
          onBack={closeRecord}
          onStatus={setOrderStatus}
          onDelete={setDeleteTarget}
          onOpenCampaign={(id) => openRecordInTab(id, "All Campaigns")}
          onOpenContact={(id) => openRecordInTab(id, "Contacts")}
        />
        {deleteDialog}
      </>
    );
  }

  const filtersActive = query || statusFilter !== "all" || storeFilter !== "all" || attributionFilter !== "all";

  const clearFilters = () => {
    setQuery("");
    setStatusFilter("all");
    setStoreFilter("all");
    setAttributionFilter("all");
  };

  const columns = [
    {
      key: "order",
      header: "Order",
      render: (o) => (
        <div className="flex min-w-0 flex-col">
          <span className="font-mono font-medium text-foreground">{o.number}</span>
          <span className="truncate text-xs text-text-secondary">{storeById.get(o.storeId)?.name || "—"}</span>
        </div>
      ),
    },
    {
      key: "customer",
      header: "Customer",
      render: (o) => (
        <div className="flex min-w-0 flex-col">
          <span className="font-medium text-foreground">{o.customer}</span>
          <span className="truncate text-xs text-text-secondary">{o.email}</span>
        </div>
      ),
    },
    { key: "items", header: "Items", className: "tabular-nums text-muted-foreground", render: (o) => count(o.itemCount) },
    {
      key: "total",
      header: "Total",
      className: "whitespace-nowrap tabular-nums text-muted-foreground",
      render: (o) => (
        <>
          {money(o.total, o.currency)}
          {o.refundedAmount ? <span className="block text-xs text-red-600 dark:text-red-400">−{money(o.refundedAmount, o.currency)} refunded</span> : null}
        </>
      ),
    },
    {
      key: "attribution",
      header: "Attribution",
      render: (o) => {
        const c = campaignById.get(o.attributedCampaignId);
        if (!o.attributedCampaignId) return <span className="text-text-tertiary">—</span>;
        return (
          <div className="flex min-w-0 max-w-[220px] flex-col">
            <span className="truncate text-foreground">{c?.name || "Deleted campaign"}</span>
            <span className="text-xs text-text-secondary">Last click</span>
          </div>
        );
      },
    },
    { key: "status", header: "Status", className: "whitespace-nowrap", render: (o) => <StatusPill status={o.status} map={ORDER_STATUS_MAP} /> },
    { key: "date", header: "Date", className: "whitespace-nowrap text-muted-foreground", render: (o) => formatDate(o.placedAt) },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (o) => (
        <div onClick={(e) => e.stopPropagation()}>
          <ActionMenu
            label={`Actions for order ${o.number}`}
            items={[
              { label: "View order", icon: Eye, onSelect: () => openRecord(String(o.id)) },
              canEdit && o.status === "paid" && { label: "Mark fulfilled", icon: Truck, onSelect: () => setOrderStatus(o, "fulfilled") },
              canEdit && ["paid", "fulfilled", "partially_refunded"].includes(o.status) && { label: "Mark refunded", icon: Undo2, onSelect: () => setOrderStatus(o, "refunded") },
              canEdit && ["pending", "paid"].includes(o.status) && { label: "Mark cancelled", icon: CircleX, onSelect: () => setOrderStatus(o, "cancelled") },
              canEdit && { separator: true },
              canEdit && { label: "Remove from Geiger", icon: Trash2, destructive: true, onSelect: () => setDeleteTarget(o) },
            ]}
          />
        </div>
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader title="Orders" description="Every order your connected stores send, with the campaign that earned it." />

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex flex-wrap items-center gap-2">
          <FilterDropdown value={statusFilter} onValueChange={setStatusFilter} options={STATUS_FILTER_OPTIONS} height="h-9" />
          <FilterDropdown value={storeFilter} onValueChange={setStoreFilter} options={storeOptions} height="h-9" />
          <FilterDropdown value={attributionFilter} onValueChange={setAttributionFilter} options={ATTRIBUTION_FILTER_OPTIONS} height="h-9" />
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search order, customer, email or coupon…" />
      </Toolbar>

      {loading ? (
        <LoadingArea size={48} label="Loading orders" panel />
      ) : (
        <div className="space-y-5">
          <DataTable
            columns={columns}
            data={pager.pageItems}
            getRowKey={(o) => o.id}
            onRowClick={(o) => openRecord(String(o.id))}
            empty={
              <ListEmpty
                icon={Receipt}
                title={filtersActive ? "No matches" : "No orders yet"}
                description={filtersActive ? "Try a different search or filter." : "Orders appear here as soon as a connected store sends them. Connect one under Stores."}
                action={filtersActive ? <Button variant="outline" className={OUTLINE_BUTTON} onClick={clearFilters}>Clear filters</Button> : null}
              />
            }
          />
          <ListPagination {...pager} itemLabel="orders" />
        </div>
      )}

      {deleteDialog}
    </MainScreenWrapper>
  );
}

export default OrdersScreen;
