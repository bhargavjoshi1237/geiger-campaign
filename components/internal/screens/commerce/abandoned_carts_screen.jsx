"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { BookOpen, Copy, Loader2, Mail, Receipt, ShoppingCart, Trash2 } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import { EditorShell } from "@/components/internal/shared/editor_shell";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { useProject } from "@/context/project-context";
import { useCan } from "@/context/rbac-context";
import { apiPost } from "@/lib/api/client";
import { listCarts, softDeleteCart } from "@/lib/supabase/carts";
import { listStores } from "@/lib/supabase/stores";
import { totalInPrimaryCurrency } from "@/lib/commerce/metrics";
import {
  Badge,
  Button,
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
  CART_STATUS_MAP,
  DANGER_ICON_BUTTON,
  OUTLINE_BUTTON,
  copyText,
  count,
  daysAgoIso,
  formatDateTime,
  money,
  moneyShort,
  relativeTime,
} from "./constants";
import { ConfirmDialog, CopyField, ListEmpty, ProductThumb, ReadOnly } from "./commerce_ui";

const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "Abandoned & recovered" },
  { value: "abandoned", label: "Abandoned" },
  { value: "recovered", label: "Recovered" },
  { value: "active", label: "In progress" },
];

const REMINDER_FILTER_OPTIONS = [
  { value: "all", label: "All reminders" },
  { value: "none", label: "Not reminded" },
  { value: "sent", label: "Reminded" },
];

const CART_NAV = [
  { key: "cart", label: "Cart", icon: ShoppingCart, desc: "Who left the cart, what was in it, and when." },
  { key: "recovery", label: "Recovery", icon: Mail, desc: "Reminders sent and whether the sale came back." },
];

// Why a reminder can't go out right now, or null when it can.
function reminderBlocker(cart) {
  if (cart.status === "recovered" || cart.status === "converted") return "This cart already turned into an order.";
  if (cart.status !== "abandoned") return "Reminders go out once the cart is marked abandoned.";
  if (!cart.contactId) return "The store didn't send an email address for this shopper.";
  if (cart.contactStatus && cart.contactStatus !== "subscribed") return `The shopper hasn't opted in to marketing email (${cart.contactStatus}).`;
  return null;
}

function CartEditor({ record, store, canEdit, sending, onBack, onRemind, onDelete, onOpenOrder }) {
  const blocker = reminderBlocker(record);

  return (
    <EditorShell
      back={{ label: "Back", onClick: onBack }}
      title={record.customer}
      status={record.status}
      statusMap={CART_STATUS_MAP}
      badges={
        <span className="text-xs text-text-tertiary">
          {record.abandonedAt ? `Abandoned ${relativeTime(record.abandonedAt)}` : `Last activity ${relativeTime(record.lastActivityAt)}`} · {money(record.value, record.currency)}
        </span>
      }
      actions={
        canEdit ? (
          <>
            <Button variant="ghost" size="icon" aria-label="Delete cart" className={DANGER_ICON_BUTTON} onClick={() => onDelete(record)}>
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button variant="outline" className={OUTLINE_BUTTON} disabled={Boolean(blocker) || sending} onClick={() => onRemind(record)}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              {record.remindersSent ? "Send another reminder" : "Send reminder"}
            </Button>
          </>
        ) : null
      }
      nav={CART_NAV}
      defaultSection="cart"
    >
      {({ active }) => (
        <>
          {active === "cart" ? (
            <div className="space-y-6">
              <SectionCard bare title="Shopper details" description="The shopper, the store and when the cart went quiet.">
                <SettingsList>
                  <SettingRow title="Customer" description={record.email || "No email address"} control={<ReadOnly>{record.customer}</ReadOnly>} />
                  <SettingRow title="Store" description="Where the cart was started." control={<ReadOnly>{store?.name || "Unknown store"}</ReadOnly>} />
                  <SettingRow title="Last activity" description="The last time the shopper changed the cart." control={<ReadOnly>{formatDateTime(record.lastActivityAt)}</ReadOnly>} />
                  <SettingRow title="Marked abandoned" description={store ? `After ${store.abandonAfterMinutes} minutes without activity.` : "After the store's idle threshold."} control={<ReadOnly>{formatDateTime(record.abandonedAt)}</ReadOnly>} />
                </SettingsList>
                {record.checkoutUrl ? (
                  <Field label="Checkout link" className="mt-5 border-t border-border pt-4">
                    <CopyField value={record.checkoutUrl} label="Checkout link" mono={false} />
                  </Field>
                ) : null}
              </SectionCard>
              <SectionCard title="Items" description={`${count(record.itemCount)} items · ${money(record.value, record.currency)}`}>
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
              </SectionCard>
            </div>
          ) : null}

          {active === "recovery" ? (
            <SectionCard bare title="Reminders & outcome" description="Reminder emails sent so far and whether the sale came back.">
              <SettingsList>
                <SettingRow title="Status" description="Recovered once an order from this shopper closes the cart." control={<StatusPill status={record.status} map={CART_STATUS_MAP} />} />
                <SettingRow
                  title="Reminders sent"
                  description={record.lastRemindedAt ? `Last one ${formatDateTime(record.lastRemindedAt)}.` : "No manual reminders yet."}
                  control={<ReadOnly>{count(record.remindersSent)}</ReadOnly>}
                />
                <SettingRow
                  title="Reminder email"
                  description={blocker || `Emails ${record.email} the items left behind with a link back to checkout.`}
                  control={
                    canEdit ? (
                      <Button variant="outline" size="sm" className={OUTLINE_BUTTON} disabled={Boolean(blocker) || sending} onClick={() => onRemind(record)}>
                        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />} Send
                      </Button>
                    ) : (
                      <Badge variant="neutral">View only</Badge>
                    )
                  }
                />
                {record.status === "recovered" ? (
                  <SettingRow
                    title="Recovered order"
                    description={`${money(record.recoveredValue ?? 0, record.currency)} on ${formatDateTime(record.recoveredAt)}.`}
                    control={
                      record.orderId ? (
                        <Button variant="outline" size="sm" className={OUTLINE_BUTTON} onClick={() => onOpenOrder(record.orderId)}>
                          <Receipt className="h-4 w-4" /> View order
                        </Button>
                      ) : null
                    }
                  />
                ) : null}
              </SettingsList>
            </SectionCard>
          ) : null}
        </>
      )}
    </EditorShell>
  );
}

export function AbandonedCartsScreen() {
  const { projectId } = useProject();
  const canEdit = useCan("campaign.commerce.edit");
  const [carts, setCarts] = useState([]);
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [since, setSince] = useState(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [storeFilter, setStoreFilter] = useState("all");
  const [reminderFilter, setReminderFilter] = useState("all");
  const [sendingId, setSendingId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const { recordId, openRecord, closeRecord, openRecordInTab, setTab } = useWorkspaceUrl();

  useEffect(() => {
    if (!projectId) return;
    let alive = true;
    Promise.all([listCarts(projectId, { statuses: ["active", "abandoned", "recovered"], limit: 5000 }), listStores(projectId)]).then(([rows, storeRows]) => {
      if (!alive) return;
      setCarts(rows ?? []);
      setStores(storeRows ?? []);
      setSince(daysAgoIso(30));
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const storeById = useMemo(() => new Map(stores.map((s) => [s.id, s])), [stores]);
  const storeOptions = useMemo(() => [{ value: "all", label: "All stores" }, ...stores.map((s) => ({ value: s.id, label: s.name }))], [stores]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return carts.filter((c) => {
      if (statusFilter === "all" ? c.status === "active" : c.status !== statusFilter) return false;
      if (storeFilter !== "all" && c.storeId !== storeFilter) return false;
      if (reminderFilter === "none" && c.remindersSent > 0) return false;
      if (reminderFilter === "sent" && c.remindersSent === 0) return false;
      if (q && !`${c.customer} ${c.email}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [carts, query, statusFilter, storeFilter, reminderFilter]);

  const stats = useMemo(() => {
    const open = carts.filter((c) => c.status === "abandoned");
    const atRisk = totalInPrimaryCurrency(open, (c) => c.value);
    const windowed = since ? carts.filter((c) => c.abandonedAt && c.abandonedAt >= since) : [];
    const recoveredRecent = windowed.filter((c) => c.status === "recovered");
    const rate = windowed.length ? (recoveredRecent.length / windowed.length) * 100 : 0;
    const recoveredRevenue = totalInPrimaryCurrency(
      carts.filter((c) => c.status === "recovered" && since && c.recoveredAt >= since),
      (c) => c.recoveredValue ?? c.value,
    );
    return [
      { label: "Abandoned carts", value: count(open.length), footer: `${count(carts.filter((c) => c.status === "active").length)} carts in progress` },
      { label: "Value at risk", value: moneyShort(atRisk.total, atRisk.currency), footer: "Open abandoned carts" },
      { label: "Recovery rate", value: `${rate.toFixed(1)}%`, footer: `${count(recoveredRecent.length)} of ${count(windowed.length)} · last 30 days` },
      { label: "Recovered revenue", value: moneyShort(recoveredRevenue.total, recoveredRevenue.currency), footer: "Last 30 days" },
    ];
  }, [carts, since]);

  const pager = usePagination(filtered, { resetKey: `${query}|${statusFilter}|${storeFilter}|${reminderFilter}` });

  const sendReminder = async (cart) => {
    setSendingId(cart.id);
    const res = await apiPost(`/api/projects/${projectId}/commerce/carts/${cart.id}/remind`, {});
    setSendingId(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setCarts((p) => p.map((c) => (c.id === cart.id ? { ...c, remindersSent: res.data.remindersSent, lastRemindedAt: res.data.lastRemindedAt } : c)));
    toast.success(`Reminder sent to ${cart.email}.`);
  };

  const copyCheckout = async (cart) => {
    if (await copyText(cart.checkoutUrl)) toast.success("Checkout link copied.");
    else toast.error("Couldn't copy the checkout link.");
  };

  const handleDelete = async (c) => {
    setDeleteTarget(null);
    setCarts((p) => p.filter((x) => x.id !== c.id));
    if (String(c.id) === recordId) closeRecord();
    if (await softDeleteCart(c.id)) {
      toast.success(`Deleted ${c.customer}'s cart.`);
    } else {
      setCarts((p) => [c, ...p]);
      toast.error("Couldn't delete the cart.");
    }
  };

  const deleteDialog = (
    <ConfirmDialog
      open={!!deleteTarget}
      onOpenChange={(o) => !o && setDeleteTarget(null)}
      title="Delete cart"
      description={
        <>
          Delete the cart from <span className="font-medium text-foreground">{deleteTarget?.customer}</span>? It drops out of recovery stats. If the store updates the cart again, it comes back.
        </>
      }
      confirmLabel="Delete"
      icon={Trash2}
      onConfirm={() => handleDelete(deleteTarget)}
    />
  );

  const open = carts.find((c) => String(c.id) === recordId);
  if (open) {
    return (
      <>
        <CartEditor
          key={open.id}
          record={open}
          store={storeById.get(open.storeId)}
          canEdit={canEdit}
          sending={sendingId === open.id}
          onBack={closeRecord}
          onRemind={sendReminder}
          onDelete={setDeleteTarget}
          onOpenOrder={(id) => openRecordInTab(id, "Orders")}
        />
        {deleteDialog}
      </>
    );
  }

  const filtersActive = query || statusFilter !== "all" || storeFilter !== "all" || reminderFilter !== "all";

  const clearFilters = () => {
    setQuery("");
    setStatusFilter("all");
    setStoreFilter("all");
    setReminderFilter("all");
  };

  const columns = [
    {
      key: "customer",
      header: "Customer",
      render: (c) => (
        <div className="flex min-w-0 flex-col">
          <span className="font-medium text-foreground">{c.customer}</span>
          <span className="truncate text-xs text-text-secondary">{c.email || "No email"}</span>
        </div>
      ),
    },
    { key: "store", header: "Store", className: "text-muted-foreground", render: (c) => storeById.get(c.storeId)?.name || "—" },
    { key: "items", header: "Items", className: "tabular-nums text-muted-foreground", render: (c) => count(c.itemCount) },
    { key: "value", header: "Cart value", className: "whitespace-nowrap tabular-nums text-muted-foreground", render: (c) => money(c.value, c.currency) },
    {
      key: "abandoned",
      header: "Abandoned",
      className: "whitespace-nowrap text-muted-foreground",
      render: (c) => (c.abandonedAt ? relativeTime(c.abandonedAt) : `Idle ${relativeTime(c.lastActivityAt)}`),
    },
    {
      key: "reminders",
      header: "Reminders",
      className: "whitespace-nowrap text-muted-foreground",
      render: (c) => (c.remindersSent ? `${count(c.remindersSent)} · ${relativeTime(c.lastRemindedAt)}` : "None"),
    },
    { key: "status", header: "Status", className: "whitespace-nowrap", render: (c) => <StatusPill status={c.status} map={CART_STATUS_MAP} /> },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (c) => (
        <div onClick={(e) => e.stopPropagation()}>
          <ActionMenu
            label={`Actions for ${c.customer}'s cart`}
            items={[
              { label: "View cart", icon: ShoppingCart, onSelect: () => openRecord(String(c.id)) },
              canEdit && !reminderBlocker(c) && { label: c.remindersSent ? "Send another reminder" : "Send reminder", icon: Mail, spin: sendingId === c.id, disabled: sendingId === c.id, onSelect: () => sendReminder(c) },
              c.checkoutUrl && { label: "Copy checkout link", icon: Copy, onSelect: () => copyCheckout(c) },
              c.orderId && { label: "View order", icon: Receipt, onSelect: () => openRecordInTab(c.orderId, "Orders") },
              canEdit && { separator: true },
              canEdit && { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setDeleteTarget(c) },
            ]}
          />
        </div>
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader title="Abandoned Carts" description="Carts left idle past each store's threshold, and the sales that came back." />

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex flex-wrap items-center gap-2">
          <FilterDropdown value={statusFilter} onValueChange={setStatusFilter} options={STATUS_FILTER_OPTIONS} height="h-9" />
          <FilterDropdown value={storeFilter} onValueChange={setStoreFilter} options={storeOptions} height="h-9" />
          <FilterDropdown value={reminderFilter} onValueChange={setReminderFilter} options={REMINDER_FILTER_OPTIONS} height="h-9" />
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search customer or email…" />
      </Toolbar>

      {loading ? (
        <LoadingArea size={48} label="Loading carts" panel />
      ) : (
        <div className="space-y-5">
          <DataTable
            columns={columns}
            data={pager.pageItems}
            getRowKey={(c) => c.id}
            onRowClick={(c) => openRecord(String(c.id))}
            empty={
              <ListEmpty
                icon={ShoppingCart}
                title={filtersActive ? "No matches" : "No abandoned carts yet"}
                description={
                  filtersActive
                    ? "Try a different search or filter."
                    : "Carts show up here once a store sends cart or checkout events and the shopper goes idle."
                }
                action={filtersActive ? <Button variant="outline" className={OUTLINE_BUTTON} onClick={clearFilters}>Clear filters</Button> : null}
              />
            }
          />
          <ListPagination {...pager} itemLabel="carts" />
        </div>
      )}

      <SectionCard>
        <SettingsList>
          <SettingRow
            title="Automate recovery"
            description="Every abandoned cart records a cart_abandoned event. The Abandoned cart recovery recipe emails the shopper their items and checkout link, and stops once the cart is recovered."
            control={
              <Button variant="outline" size="sm" className={OUTLINE_BUTTON} onClick={() => setTab("Recipes")}>
                <BookOpen className="h-4 w-4" /> Open recipes
              </Button>
            }
          />
        </SettingsList>
      </SectionCard>

      {deleteDialog}
    </MainScreenWrapper>
  );
}

export default AbandonedCartsScreen;
