"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  BarChart3,
  CalendarClock,
  Copy,
  CopyPlus,
  Download,
  FileText,
  KeySquare,
  Loader2,
  Pause,
  Pencil,
  Play,
  Plus,
  TicketPercent,
  Trash2,
} from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import { EditorShell } from "@/components/internal/shared/editor_shell";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { useProject } from "@/context/project-context";
import { useCan } from "@/context/rbac-context";
import { apiPost } from "@/lib/api/client";
import { getUser } from "@/lib/supabase/user";
import { countCouponCodes, createCoupon, listCouponCodes, listCoupons, softDeleteCoupon, updateCoupon } from "@/lib/supabase/coupons";
import { listOrders } from "@/lib/supabase/orders";
import { listStores } from "@/lib/supabase/stores";
import { MAX_CODES_PER_RUN, couponCodesToCsv, couponDisplayStatus, formatCouponValue } from "@/lib/commerce/coupons";
import { netRevenue, totalInPrimaryCurrency } from "@/lib/commerce/metrics";
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
  Progress,
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
  COUPON_KIND_MAP,
  COUPON_STATUS_MAP,
  DANGER_ICON_BUTTON,
  OUTLINE_BUTTON,
  copyText,
  count,
  dateInputToIso,
  formatDate,
  formatDateTime,
  isoToDateInput,
  money,
  moneyShort,
  toFilterOptions,
} from "./constants";
import { ConfirmDialog, ListEmpty, ReadOnly } from "./commerce_ui";

const STATUS_FILTER_OPTIONS = toFilterOptions(COUPON_STATUS_MAP, "All statuses");
const KIND_FILTER_OPTIONS = toFilterOptions(COUPON_KIND_MAP, "All types");
const ALL_STORES = "all";

const COUPON_NAV = [
  { key: "details", label: "Details", icon: FileText, desc: "The code shoppers enter and the discount it gives." },
  { key: "limits", label: "Limits", icon: CalendarClock, desc: "Usage caps, schedule and whether it's live." },
  { key: "codes", label: "Unique codes", icon: KeySquare, desc: "Single-use codes for one shopper each, exportable as CSV." },
  { key: "performance", label: "Performance", icon: BarChart3, desc: "Redemptions and the revenue orders with this coupon brought in." },
];

const EMPTY_FORM = { code: "", kind: "percent", value: "", minSubtotal: "", usageLimit: "", perCustomerLimit: "", startsAt: "", expiresAt: "", uniqueCodes: false };

const intOrNull = (v) => (v === "" || v == null ? null : Math.max(0, Math.trunc(Number(v) || 0)));
const cleanCode = (v) => String(v || "").toUpperCase().replace(/[^A-Z0-9_-]/g, "");

function downloadCsv(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Orders that used a coupon: its own code, or one of its single-use codes (prefix "CODE-").
function ordersForCoupon(orders, coupon, codeSet) {
  const code = coupon.code.toUpperCase();
  return orders.filter((o) => {
    const used = String(o.couponCode || "").toUpperCase();
    if (!used) return false;
    if (used === code) return true;
    if (codeSet?.has(used)) return true;
    return coupon.uniqueCodes && used.startsWith(`${code}-`);
  });
}

function validValue(kind, value) {
  if (kind === "free_shipping") return true;
  const n = Number(value);
  if (!(n > 0)) return false;
  return kind !== "percent" || n <= 100;
}

function CreateCouponDialog({ open, onOpenChange, existingCodes, onCreate }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [pending, setPending] = useState(false);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    const code = cleanCode(form.code);
    if (!code) return toast.error("Add a coupon code first.");
    if (existingCodes.has(code)) return toast.error(`${code} already exists.`);
    if (!validValue(form.kind, form.value)) return toast.error(form.kind === "percent" ? "Use a percentage between 1 and 100." : "Enter the discount amount.");
    setPending(true);
    const ok = await onCreate({
      code,
      kind: form.kind,
      value: form.kind === "free_shipping" ? 0 : Number(form.value),
      minSubtotal: Number(form.minSubtotal) || 0,
      usageLimit: intOrNull(form.usageLimit),
      perCustomerLimit: intOrNull(form.perCustomerLimit),
      startsAt: dateInputToIso(form.startsAt),
      expiresAt: dateInputToIso(form.expiresAt, true),
      uniqueCodes: form.uniqueCodes,
      status: "active",
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
          <DialogTitle>Create coupon</DialogTitle>
          <DialogDescription>Geiger tracks redemptions from incoming orders. Create the same code in your store so it works at checkout.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label={form.uniqueCodes ? "Code prefix" : "Code"} htmlFor="c-code" hint={form.uniqueCodes ? "Single-use codes are generated as PREFIX-XXXXXXXX." : "What shoppers type at checkout."}>
            <Input id="c-code" value={form.code} onChange={(e) => set("code")(cleanCode(e.target.value))} placeholder="SUMMER20" className="font-mono uppercase" autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Type">
              <Select value={form.kind} onValueChange={set("kind")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(COUPON_KIND_MAP).map(([value, meta]) => <SelectItem key={value} value={value}>{meta.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label={form.kind === "percent" ? "Percent off" : "Amount off"} htmlFor="c-value" hint={form.kind === "free_shipping" ? "Not needed for free shipping." : null}>
              <Input id="c-value" type="number" min="0" step="0.01" value={form.kind === "free_shipping" ? "" : form.value} onChange={(e) => set("value")(e.target.value)} disabled={form.kind === "free_shipping"} placeholder={form.kind === "percent" ? "20" : "15"} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Usage limit" htmlFor="c-limit" hint="Empty = unlimited.">
              <Input id="c-limit" type="number" min="0" value={form.usageLimit} onChange={(e) => set("usageLimit")(e.target.value)} placeholder="Unlimited" />
            </Field>
            <Field label="Expires" htmlFor="c-expiry">
              <Input id="c-expiry" type="date" value={form.expiresAt} onChange={(e) => set("expiresAt")(e.target.value)} />
            </Field>
          </div>
          <SettingsList className="border-t border-border pt-4">
            <SettingRow title="Single-use codes" description="Generate one unique code per shopper instead of a shared code." checked={form.uniqueCodes} onCheckedChange={set("uniqueCodes")} />
          </SettingsList>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!form.code || pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Create coupon
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CodesSection({ projectId, coupon, canEdit, onEnable, onGenerated }) {
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);
  const [form, setForm] = useState({ count: "100", prefix: coupon.code, length: "8" });
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [lastBatch, setLastBatch] = useState(null);
  const [version, setVersion] = useState(0);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    let alive = true;
    Promise.all([countCouponCodes(projectId, coupon.id), listCouponCodes(projectId, coupon.id, { limit: 20 })]).then(([c, rows]) => {
      if (!alive) return;
      setStats(c ?? { total: 0, redeemed: 0 });
      setRecent(rows ?? []);
    });
    return () => {
      alive = false;
    };
  }, [projectId, coupon.id, version]);

  const generate = async () => {
    const n = Math.trunc(Number(form.count));
    if (!(n >= 1 && n <= MAX_CODES_PER_RUN)) return toast.error(`Generate between 1 and ${count(MAX_CODES_PER_RUN)} codes at a time.`);
    setGenerating(true);
    const res = await apiPost(`/api/projects/${projectId}/commerce/coupons/${coupon.id}/codes`, {
      count: n,
      prefix: form.prefix,
      length: Number(form.length) || 8,
    });
    setGenerating(false);
    if (!res.ok) return toast.error(res.error);
    setLastBatch(res.data);
    setVersion((v) => v + 1);
    onGenerated();
    toast.success(`${count(res.data.created)} codes generated.`);
  };

  const exportAll = async () => {
    setExporting(true);
    const rows = await listCouponCodes(projectId, coupon.id);
    setExporting(false);
    if (!rows) return toast.error("Couldn't load the codes.");
    downloadCsv(`${coupon.code.toLowerCase()}-codes.csv`, couponCodesToCsv(rows));
  };

  const downloadBatch = () => {
    if (!lastBatch) return;
    downloadCsv(
      `${coupon.code.toLowerCase()}-batch.csv`,
      couponCodesToCsv(lastBatch.codes.map((code) => ({ code, batch: lastBatch.batch, redeemedAt: null, createdAt: lastBatch.batch }))),
    );
  };

  if (!coupon.uniqueCodes) {
    return (
      <SectionCard bare title="Code mode" description="Whether shoppers share one code or each get their own.">
        <SettingsList>
          <SettingRow
            title="Single-use codes are off"
            description={`Shoppers share the code ${coupon.code}. Turn on single-use codes to give every shopper their own.`}
            control={
              canEdit ? (
                <Button variant="outline" size="sm" className={OUTLINE_BUTTON} onClick={onEnable}>Turn on</Button>
              ) : null
            }
          />
        </SettingsList>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-6">
      <SectionCard bare title="Code inventory" description="How many codes exist, how many were used, and a CSV of them all.">
        <SettingsList>
          <SettingRow title="Codes generated" description="Across every batch." control={<ReadOnly>{stats ? count(stats.total) : "—"}</ReadOnly>} />
          <SettingRow title="Redeemed" description="Codes used on an incoming order." control={<ReadOnly>{stats ? count(stats.redeemed) : "—"}</ReadOnly>} />
          <SettingRow
            title="Export"
            description="All codes with their status, for importing into your store's discount settings."
            control={
              <Button variant="outline" size="sm" className={OUTLINE_BUTTON} disabled={exporting || !stats?.total} onClick={exportAll}>
                {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Export CSV
              </Button>
            }
          />
        </SettingsList>
      </SectionCard>

      {canEdit ? (
        <SectionCard bare title="Generate codes" description="Random, unambiguous characters (no 0/O or 1/I), checked for duplicates.">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="How many" htmlFor="cc-count" hint={`Up to ${count(MAX_CODES_PER_RUN)} per run.`}>
              <Input id="cc-count" type="number" min="1" max={MAX_CODES_PER_RUN} value={form.count} onChange={(e) => set("count")(e.target.value)} />
            </Field>
            <Field label="Prefix" htmlFor="cc-prefix">
              <Input id="cc-prefix" value={form.prefix} onChange={(e) => set("prefix")(cleanCode(e.target.value))} className="font-mono uppercase" />
            </Field>
            <Field label="Random characters" htmlFor="cc-length">
              <Select value={form.length} onValueChange={set("length")}>
                <SelectTrigger id="cc-length" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["6", "8", "10", "12"].map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button onClick={generate} disabled={generating}>
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Generate
            </Button>
            {lastBatch ? (
              <Button variant="outline" className={OUTLINE_BUTTON} onClick={downloadBatch}>
                <Download className="h-4 w-4" /> Download this batch ({count(lastBatch.created)})
              </Button>
            ) : null}
            <span className="text-xs text-text-tertiary">
              Example: <span className="font-mono">{form.prefix ? `${form.prefix}-` : ""}{"7KQ2M9XA".slice(0, Number(form.length) || 8).padEnd(Number(form.length) || 8, "X")}</span>
            </span>
          </div>
        </SectionCard>
      ) : null}

      <SectionCard title="Latest codes">
        {recent.length ? (
          <ul className="divide-y divide-border">
            {recent.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2 text-sm first:pt-0 last:pb-0">
                <span className="font-mono text-foreground">{c.code}</span>
                <span className="flex items-center gap-3">
                  <span className="text-xs text-text-tertiary">{c.redeemedAt ? `Redeemed ${formatDate(c.redeemedAt)}` : `Created ${formatDate(c.createdAt)}`}</span>
                  {c.redeemedAt ? <Badge variant="success">Redeemed</Badge> : <Badge variant="neutral">Available</Badge>}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-text-secondary">No codes yet. Generate a batch above.</p>
        )}
      </SectionCard>
    </div>
  );
}

function PerformanceSection({ projectId, coupon, orders, onOpenOrder }) {
  const [codeSet, setCodeSet] = useState(null);

  useEffect(() => {
    if (!coupon.uniqueCodes) return;
    let alive = true;
    listCouponCodes(projectId, coupon.id).then((rows) => {
      if (alive) setCodeSet(new Set((rows ?? []).map((r) => r.code.toUpperCase())));
    });
    return () => {
      alive = false;
    };
  }, [projectId, coupon.id, coupon.uniqueCodes]);

  const used = useMemo(() => ordersForCoupon(orders, coupon, codeSet), [orders, coupon, codeSet]);
  const revenue = totalInPrimaryCurrency(used, netRevenue);
  const discount = totalInPrimaryCurrency(used, (o) => o.discount);

  return (
    <div className="space-y-6">
      <SectionCard bare title="Redemption summary" description="Redemptions, revenue and discount from orders that used this coupon.">
        <SettingsList>
          <SettingRow title="Redemptions" description="Counted as orders arrive from your stores." control={<ReadOnly>{count(coupon.usedCount)}</ReadOnly>} />
          <SettingRow title="Orders with this coupon" description="Orders in Geiger that used it." control={<ReadOnly>{count(used.length)}</ReadOnly>} />
          <SettingRow title="Revenue" description="Net of refunds." control={<ReadOnly>{money(revenue.total, revenue.currency)}</ReadOnly>} />
          <SettingRow title="Discount given" description="Total discount on those orders." control={<ReadOnly>{money(discount.total, discount.currency)}</ReadOnly>} />
          <SettingRow title="Last used" control={<ReadOnly>{used[0] ? formatDateTime(used[0].placedAt) : "Never"}</ReadOnly>} />
        </SettingsList>
      </SectionCard>
      {used.length ? (
        <SectionCard title="Recent orders">
          <ul className="divide-y divide-border">
            {used.slice(0, 10).map((o) => (
              <li key={o.id}>
                <button type="button" onClick={() => onOpenOrder(o.id)} className="flex w-full items-center justify-between gap-3 py-2 text-left text-sm hover:text-foreground">
                  <span className="flex min-w-0 flex-col">
                    <span className="font-mono text-foreground">{o.number} <span className="font-sans text-text-tertiary">· {o.couponCode}</span></span>
                    <span className="truncate text-xs text-text-secondary">{o.customer}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block tabular-nums text-foreground">{money(o.total, o.currency)}</span>
                    <span className="block text-xs text-text-tertiary">{formatDate(o.placedAt)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}
    </div>
  );
}

// Editable slice of a coupon; compared against the row to derive dirty state.
const toDraft = (c) => ({
  code: c.code,
  kind: c.kind,
  value: c.kind === "free_shipping" ? "" : String(c.value),
  minSubtotal: c.minSubtotal ? String(c.minSubtotal) : "",
  usageLimit: c.usageLimit == null ? "" : String(c.usageLimit),
  perCustomerLimit: c.perCustomerLimit == null ? "" : String(c.perCustomerLimit),
  startsAt: isoToDateInput(c.startsAt),
  expiresAt: isoToDateInput(c.expiresAt),
  storeId: c.storeId || ALL_STORES,
  status: c.status,
});

function CouponEditor({ projectId, record, now, stores, orders, existingCodes, canEdit, onBack, onSave, onDelete, onCodesChanged, onOpenOrder }) {
  const [draft, setDraft] = useState(() => toDraft(record));
  const [saving, setSaving] = useState(false);
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(record));
  const freeShipping = draft.kind === "free_shipping";
  const display = couponDisplayStatus(record, now);
  const store = stores.find((s) => s.id === record.storeId);

  const save = async () => {
    const code = cleanCode(draft.code);
    if (!code) return toast.error("A coupon needs a code.");
    if (code !== record.code && existingCodes.has(code)) return toast.error(`${code} already exists.`);
    if (!validValue(draft.kind, draft.value)) return toast.error(draft.kind === "percent" ? "Use a percentage between 1 and 100." : "Enter the discount amount.");
    setSaving(true);
    const saved = await onSave(record.id, {
      code,
      kind: draft.kind,
      value: freeShipping ? 0 : Number(draft.value),
      minSubtotal: Number(draft.minSubtotal) || 0,
      usageLimit: intOrNull(draft.usageLimit),
      perCustomerLimit: intOrNull(draft.perCustomerLimit),
      startsAt: dateInputToIso(draft.startsAt),
      expiresAt: dateInputToIso(draft.expiresAt, true),
      storeId: draft.storeId === ALL_STORES ? null : draft.storeId,
      status: draft.status,
    });
    setSaving(false);
    if (saved) setDraft(toDraft(saved));
  };

  return (
    <EditorShell
      back={{ label: "Back", onClick: onBack }}
      title={
        <InlineTitleInput
          value={draft.code}
          onChange={(e) => set("code")(cleanCode(e.target.value))}
          aria-label="Coupon code"
          placeholder="NEWCODE"
          readOnly={!canEdit}
          className="font-mono text-2xl font-semibold uppercase tracking-tight text-foreground md:text-3xl"
        />
      }
      status={display}
      statusMap={COUPON_STATUS_MAP}
      badges={
        <>
          <Badge variant={COUPON_KIND_MAP[record.kind]?.variant}>{formatCouponValue(record, store?.currency)}</Badge>
          {record.uniqueCodes ? <Badge variant="neutral">Single-use codes</Badge> : null}
          <span className="text-xs text-text-tertiary">
            {count(record.usedCount)} {record.usageLimit != null ? `of ${count(record.usageLimit)} ` : ""}redeemed
          </span>
        </>
      }
      actions={
        canEdit ? (
          <>
            <Button variant="ghost" size="icon" aria-label="Delete coupon" className={DANGER_ICON_BUTTON} onClick={() => onDelete(record)}>
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button variant="outline" className={OUTLINE_BUTTON} disabled={!dirty || saving} onClick={save}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save
            </Button>
          </>
        ) : null
      }
      nav={COUPON_NAV}
      defaultSection={record.uniqueCodes ? "codes" : "details"}
    >
      {({ active }) => (
        <>
          {active === "details" ? (
            <SectionCard bare title="Code & discount" description="What shoppers enter, what it takes off and where it applies.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={record.uniqueCodes ? "Code prefix" : "Code"} htmlFor="ce-code" hint="Create the same code in your store so it works at checkout.">
                  <Input id="ce-code" value={draft.code} disabled={!canEdit} onChange={(e) => set("code")(cleanCode(e.target.value))} className="font-mono uppercase" />
                </Field>
                <Field label="Type">
                  <Select value={draft.kind} onValueChange={set("kind")} disabled={!canEdit}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(COUPON_KIND_MAP).map(([value, meta]) => <SelectItem key={value} value={value}>{meta.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label={draft.kind === "percent" ? "Percent off" : "Amount off"} htmlFor="ce-value" hint={freeShipping ? "Not needed for free shipping." : null}>
                  <Input id="ce-value" type="number" min="0" step="0.01" value={freeShipping ? "" : draft.value} disabled={!canEdit || freeShipping} onChange={(e) => set("value")(e.target.value)} />
                </Field>
                <Field label="Minimum subtotal" htmlFor="ce-min" hint="Empty = no minimum.">
                  <Input id="ce-min" type="number" min="0" step="0.01" value={draft.minSubtotal} disabled={!canEdit} onChange={(e) => set("minSubtotal")(e.target.value)} placeholder="None" />
                </Field>
                <Field label="Store">
                  <Select value={draft.storeId} onValueChange={set("storeId")} disabled={!canEdit}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_STORES}>All stores</SelectItem>
                      {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </SectionCard>
          ) : null}

          {active === "limits" ? (
            <SectionCard bare title="Caps & schedule" description="How often it can be used, when it runs and whether it's live.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Usage limit" htmlFor="ce-limit" hint="Total redemptions across all shoppers. Empty = unlimited.">
                  <Input id="ce-limit" type="number" min="0" value={draft.usageLimit} disabled={!canEdit} onChange={(e) => set("usageLimit")(e.target.value)} placeholder="Unlimited" />
                </Field>
                <Field label="Per shopper" htmlFor="ce-per" hint="Empty = unlimited.">
                  <Input id="ce-per" type="number" min="0" value={draft.perCustomerLimit} disabled={!canEdit} onChange={(e) => set("perCustomerLimit")(e.target.value)} placeholder="Unlimited" />
                </Field>
                <Field label="Starts" htmlFor="ce-start" hint="Empty = live now.">
                  <Input id="ce-start" type="date" value={draft.startsAt} disabled={!canEdit} onChange={(e) => set("startsAt")(e.target.value)} />
                </Field>
                <Field label="Expires" htmlFor="ce-expiry" hint="Ends at the close of this day.">
                  <Input id="ce-expiry" type="date" value={draft.expiresAt} disabled={!canEdit} onChange={(e) => set("expiresAt")(e.target.value)} />
                </Field>
              </div>
              <SettingsList className="mt-5 border-t border-border pt-4">
                <SettingRow
                  title="Live"
                  description="Paused coupons show as paused in Geiger. Pause the code in your store too so checkout rejects it."
                  checked={draft.status === "active"}
                  onCheckedChange={(on) => canEdit && set("status")(on ? "active" : "paused")}
                />
              </SettingsList>
            </SectionCard>
          ) : null}

          {active === "codes" ? (
            <CodesSection
              projectId={projectId}
              coupon={record}
              canEdit={canEdit}
              onEnable={() => onSave(record.id, { uniqueCodes: true }, "Single-use codes turned on.")}
              onGenerated={() => onCodesChanged(record.id)}
            />
          ) : null}

          {active === "performance" ? <PerformanceSection projectId={projectId} coupon={record} orders={orders} onOpenOrder={onOpenOrder} /> : null}
        </>
      )}
    </EditorShell>
  );
}

export function CouponsScreen() {
  const { projectId } = useProject();
  const canEdit = useCan("campaign.commerce.edit");
  const [coupons, setCoupons] = useState([]);
  const [orders, setOrders] = useState([]);
  const [stores, setStores] = useState([]);
  const [codeCounts, setCodeCounts] = useState({});
  const [now, setNow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [kindFilter, setKindFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const { recordId, openRecord, closeRecord, openRecordInTab } = useWorkspaceUrl();

  const refreshCodeCount = async (couponId) => {
    const c = await countCouponCodes(projectId, couponId);
    if (c) setCodeCounts((prev) => ({ ...prev, [couponId]: c }));
    setCoupons((prev) => prev.map((x) => (x.id === couponId ? { ...x, uniqueCodes: true } : x)));
  };

  useEffect(() => {
    if (!projectId) return;
    let alive = true;
    Promise.all([listCoupons(projectId), listOrders(projectId, { withCoupon: true, limit: 5000 }), listStores(projectId)]).then(async ([rows, orderRows, storeRows]) => {
      if (!alive) return;
      const list = rows ?? [];
      setCoupons(list);
      setOrders(orderRows ?? []);
      setStores(storeRows ?? []);
      setNow(new Date());
      setLoading(false);
      const entries = await Promise.all(list.filter((c) => c.uniqueCodes).map(async (c) => [c.id, await countCouponCodes(projectId, c.id)]));
      if (alive) setCodeCounts(Object.fromEntries(entries.filter(([, v]) => v)));
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const existingCodes = useMemo(() => new Set(coupons.map((c) => c.code.toUpperCase())), [coupons]);
  const displayStatus = (c) => couponDisplayStatus(c, now || undefined);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return coupons.filter((c) => {
      if (statusFilter !== "all" && couponDisplayStatus(c, now || undefined) !== statusFilter) return false;
      if (kindFilter !== "all" && c.kind !== kindFilter) return false;
      if (q && !c.code.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [coupons, query, statusFilter, kindFilter, now]);

  const stats = useMemo(() => {
    const live = coupons.filter((c) => couponDisplayStatus(c, now || undefined) === "active").length;
    const redemptions = coupons.reduce((s, c) => s + c.usedCount, 0);
    const known = orders.filter((o) => coupons.some((c) => ordersForCoupon([o], c).length));
    const revenue = totalInPrimaryCurrency(known, netRevenue);
    const discount = totalInPrimaryCurrency(known, (o) => o.discount);
    return [
      { label: "Coupons", value: count(coupons.length), footer: `${count(live)} live now` },
      { label: "Redemptions", value: count(redemptions), footer: "From incoming orders" },
      { label: "Revenue with coupons", value: moneyShort(revenue.total, revenue.currency), footer: `${count(known.length)} orders · net of refunds` },
      { label: "Discount given", value: moneyShort(discount.total, discount.currency) },
    ];
  }, [coupons, orders, now]);

  const pager = usePagination(filtered, { resetKey: `${query}|${statusFilter}|${kindFilter}` });

  const handleCreate = async (input) => {
    const id = crypto.randomUUID();
    const user = await getUser();
    setCoupons((p) => [{ id, projectId, usedCount: 0, storeId: null, ...input }, ...p]);
    const created = await createCoupon(projectId, { ...input, id, createdBy: user?.id ?? null });
    if (!created) {
      setCoupons((p) => p.filter((c) => c.id !== id));
      toast.error(`Couldn't create ${input.code}. The code may already exist.`);
      return null;
    }
    setCoupons((p) => p.map((c) => (c.id === id ? created : c)));
    toast.success(`${created.code} created.`);
    openRecord(id);
    return created;
  };

  const handleSave = async (id, patch, message = "Coupon saved.") => {
    const before = coupons.find((c) => c.id === id);
    setCoupons((p) => p.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    const saved = await updateCoupon(id, patch);
    if (!saved) {
      setCoupons((p) => p.map((c) => (c.id === id ? before : c)));
      toast.error("Couldn't save the coupon.");
      return null;
    }
    setCoupons((p) => p.map((c) => (c.id === id ? saved : c)));
    toast.success(message);
    return saved;
  };

  const handleDuplicate = async (c) => {
    let code = `${c.code}-COPY`;
    for (let i = 2; existingCodes.has(code); i += 1) code = `${c.code}-COPY${i}`;
    const input = {
      code,
      kind: c.kind,
      value: c.value,
      minSubtotal: c.minSubtotal,
      usageLimit: c.usageLimit,
      perCustomerLimit: c.perCustomerLimit,
      startsAt: c.startsAt,
      expiresAt: c.expiresAt,
      storeId: c.storeId,
      uniqueCodes: c.uniqueCodes,
      status: "paused",
    };
    const id = crypto.randomUUID();
    setCoupons((p) => [{ id, projectId, usedCount: 0, ...input }, ...p]);
    const created = await createCoupon(projectId, { ...input, id });
    if (!created) {
      setCoupons((p) => p.filter((x) => x.id !== id));
      toast.error("Couldn't duplicate the coupon.");
      return;
    }
    setCoupons((p) => p.map((x) => (x.id === id ? created : x)));
    toast.success(`Duplicated as ${code} (paused).`);
  };

  const copyCode = async (code) => {
    if (await copyText(code)) toast.success(`Copied ${code}.`);
    else toast.error("Couldn't copy the code.");
  };

  const handleDelete = async (c) => {
    setDeleteTarget(null);
    setCoupons((p) => p.filter((x) => x.id !== c.id));
    if (String(c.id) === recordId) closeRecord();
    if (await softDeleteCoupon(c.id)) {
      toast.success(`Deleted ${c.code}.`);
    } else {
      setCoupons((p) => [c, ...p]);
      toast.error(`Couldn't delete ${c.code}.`);
    }
  };

  const deleteDialog = (
    <ConfirmDialog
      open={!!deleteTarget}
      onOpenChange={(o) => !o && setDeleteTarget(null)}
      title="Delete coupon"
      description={
        <>
          Delete <span className="font-mono font-medium text-foreground">{deleteTarget?.code}</span>? Geiger stops counting its redemptions. Remove it from your store too so checkout rejects it.
        </>
      }
      confirmLabel="Delete"
      icon={Trash2}
      onConfirm={() => handleDelete(deleteTarget)}
    />
  );

  const open = coupons.find((c) => String(c.id) === recordId);
  if (open) {
    return (
      <>
        <CouponEditor
          key={open.id}
          projectId={projectId}
          record={open}
          now={now || undefined}
          stores={stores}
          orders={orders}
          existingCodes={existingCodes}
          canEdit={canEdit}
          onBack={closeRecord}
          onSave={handleSave}
          onDelete={setDeleteTarget}
          onCodesChanged={refreshCodeCount}
          onOpenOrder={(id) => openRecordInTab(id, "Orders")}
        />
        {deleteDialog}
      </>
    );
  }

  const filtersActive = query || statusFilter !== "all" || kindFilter !== "all";

  const clearFilters = () => {
    setQuery("");
    setStatusFilter("all");
    setKindFilter("all");
  };

  const columns = [
    {
      key: "code",
      header: "Code",
      render: (c) => (
        <div className="flex min-w-0 flex-col">
          <span className="font-mono font-medium uppercase text-foreground">{c.uniqueCodes ? `${c.code}-…` : c.code}</span>
          {c.uniqueCodes ? (
            <span className="text-xs text-text-secondary">
              {codeCounts[c.id] ? `${count(codeCounts[c.id].total)} single-use codes` : "Single-use codes"}
            </span>
          ) : null}
        </div>
      ),
    },
    { key: "type", header: "Type", render: (c) => <Badge variant={COUPON_KIND_MAP[c.kind]?.variant}>{COUPON_KIND_MAP[c.kind]?.label}</Badge> },
    { key: "value", header: "Value", className: "whitespace-nowrap tabular-nums text-muted-foreground", render: (c) => formatCouponValue(c, stores.find((s) => s.id === c.storeId)?.currency) },
    {
      key: "usage",
      header: "Usage",
      render: (c) => {
        if (c.usageLimit == null) return <span className="text-xs tabular-nums text-muted-foreground">{count(c.usedCount)} used · no limit</span>;
        const pct = c.usageLimit > 0 ? Math.min(100, Math.round((c.usedCount / c.usageLimit) * 100)) : 100;
        return (
          <div className="w-[120px] space-y-1.5">
            <p className="text-xs tabular-nums text-muted-foreground">{count(c.usedCount)} / {count(c.usageLimit)}</p>
            <Progress value={pct} className="h-1.5 bg-surface-hover" />
          </div>
        );
      },
    },
    { key: "expires", header: "Expires", className: "whitespace-nowrap text-muted-foreground", render: (c) => (c.expiresAt ? formatDate(c.expiresAt) : "Never") },
    { key: "status", header: "Status", className: "whitespace-nowrap", render: (c) => <StatusPill status={displayStatus(c)} map={COUPON_STATUS_MAP} /> },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (c) => (
        <div onClick={(e) => e.stopPropagation()}>
          <ActionMenu
            label={`Actions for ${c.code}`}
            items={[
              { label: canEdit ? "Edit coupon" : "View coupon", icon: Pencil, onSelect: () => openRecord(String(c.id)) },
              !c.uniqueCodes && { label: "Copy code", icon: Copy, onSelect: () => copyCode(c.code) },
              canEdit && { label: "Duplicate", icon: CopyPlus, onSelect: () => handleDuplicate(c) },
              canEdit &&
                (c.status === "active"
                  ? { label: "Pause", icon: Pause, onSelect: () => handleSave(c.id, { status: "paused" }, `${c.code} paused.`) }
                  : { label: "Resume", icon: Play, onSelect: () => handleSave(c.id, { status: "active" }, `${c.code} is live again.`) }),
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
      <ScreenHeader
        title="Coupons"
        description="Discount codes for your campaigns, with redemptions counted from real orders."
        actions={
          canEdit ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> Create coupon
            </Button>
          ) : null
        }
      />

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={statusFilter} onValueChange={setStatusFilter} options={STATUS_FILTER_OPTIONS} height="h-9" />
          <FilterDropdown value={kindFilter} onValueChange={setKindFilter} options={KIND_FILTER_OPTIONS} height="h-9" />
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search codes…" />
      </Toolbar>

      {loading ? (
        <LoadingArea size={48} label="Loading coupons" panel />
      ) : (
        <div className="space-y-5">
          <DataTable
            columns={columns}
            data={pager.pageItems}
            getRowKey={(c) => c.id}
            onRowClick={(c) => openRecord(String(c.id))}
            empty={
              <ListEmpty
                icon={TicketPercent}
                title={filtersActive ? "No matches" : "No coupons yet"}
                description={filtersActive ? "Try a different search or filter." : "Create a shared code, or a batch of single-use codes, to reward shoppers in your campaigns."}
                action={
                  filtersActive ? (
                    <Button variant="outline" className={OUTLINE_BUTTON} onClick={clearFilters}>Clear filters</Button>
                  ) : canEdit ? (
                    <Button onClick={() => setCreateOpen(true)}>
                      <Plus className="h-4 w-4" /> Create coupon
                    </Button>
                  ) : null
                }
              />
            }
          />
          <ListPagination {...pager} itemLabel="coupons" />
        </div>
      )}

      <CreateCouponDialog open={createOpen} onOpenChange={setCreateOpen} existingCodes={existingCodes} onCreate={handleCreate} />
      {deleteDialog}
    </MainScreenWrapper>
  );
}

export default CouponsScreen;
