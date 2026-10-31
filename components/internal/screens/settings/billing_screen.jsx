"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Info, Loader2 } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import {
  Badge,
  Button,
  DataTable,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Input,
  LogoLoading,
  Progress,
  ScreenHeader,
  SectionCard,
  SegmentedTabs,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Slider,
  cn,
} from "@geiger/ui";
import { useProject } from "@/context/project-context";
import { useRbac } from "@/context/rbac-context";
import { PASS_THROUGH_CHANNELS, PLANS, getPlan } from "@/lib/billing/plans";
import { billingCycle, estimatePassThrough, estimatePlan, recommendPlan, usagePercent } from "@/lib/billing/pricing";
import { getUsageSummary, getWorkspaceSettings, saveWorkspaceSettings } from "@/lib/supabase/workspace_settings";
import { getUser } from "@/lib/supabase/user";

const DAY = 24 * 60 * 60 * 1000;
const INTERVAL_TABS = [
  { value: "monthly", label: "Monthly" },
  { value: "annual", label: "Annual" },
];
const OUTLINE = "border-border bg-surface-card text-foreground hover:bg-surface-subtle";

const usd = (n) => `$${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
const money = (n, currency = "USD") =>
  Number(n || 0).toLocaleString("en-US", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: n > 0 && n < 1 ? 4 : 2 });
const num = (n) => Number(n || 0).toLocaleString("en-US");
const formatDate = (d) => d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const planPrice = (plan, interval) => (interval === "annual" ? plan.annualMonthly : plan.monthly);

function Meter({ label, used, limit, detail }) {
  const percent = usagePercent(used, limit);
  const over = limit && used > limit;
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className={cn("tabular-nums", over ? "text-red-600 dark:text-red-400" : "text-text-secondary")}>
          {num(used)}
          {limit ? ` / ${num(limit)}` : ""}
        </span>
      </div>
      {percent != null ? <Progress value={percent} className="h-1.5 bg-surface-hover" /> : null}
      {detail ? <p className="text-xs text-text-tertiary">{detail}</p> : null}
    </div>
  );
}

function ChangePlanDialog({ open, onOpenChange, billing, onSave }) {
  const [plan, setPlan] = useState(billing.plan);
  const [interval, setBillingInterval] = useState(billing.interval);
  const [saving, setSaving] = useState(false);
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setPlan(billing.plan);
      setBillingInterval(billing.interval);
    }
  }
  const selected = getPlan(plan);
  const submit = async () => {
    setSaving(true);
    const ok = await onSave({ plan, interval });
    setSaving(false);
    if (ok) onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-background">
        <DialogHeader>
          <DialogTitle>Change plan</DialogTitle>
          <DialogDescription>Records the plan for this workspace. No payment provider is connected, so nothing is charged.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Plan">
            <Select value={plan} onValueChange={setPlan}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLANS.map((p) => (
                  <SelectItem key={p.key} value={p.key}>
                    {p.name} — {usd(planPrice(p, interval))}/mo
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Billing interval" hint="Annual is billed yearly at the per-month price shown.">
            <SegmentedTabs tabs={INTERVAL_TABS} value={interval} onChange={setBillingInterval} />
          </Field>
          <p className="text-sm text-text-secondary">
            {num(selected.contacts)} contacts and {num(selected.emailsPerMonth)} emails a month included
            {selected.extraContactsPer1k ? `; then ${usd(selected.extraContactsPer1k)} per 1,000 contacts and ${usd(selected.extraEmailsPer1k)} per 1,000 emails.` : "; no overage — sending stops at the limit."}
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={saving || (plan === billing.plan && interval === billing.interval)} onClick={submit}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SliderField({ label, value, onChange, max, step, suffix }) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <Input
          type="number"
          min={0}
          value={value}
          onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
          aria-label={label}
          className="h-8 w-32 text-right tabular-nums"
        />
      </div>
      <Slider value={[Math.min(value, max)]} max={max} step={step} onValueChange={([v]) => onChange(v)} aria-label={`${label} slider`} />
      {suffix ? <p className="text-xs text-text-tertiary">{suffix}</p> : null}
    </div>
  );
}

function PriceCalculator({ usage, rates, currentPlan }) {
  const [interval, setBillingInterval] = useState("monthly");
  const [contacts, setContacts] = useState(usage?.contacts ?? 0);
  const [emails, setEmails] = useState(usage?.emails ?? 0);
  const [messages, setMessages] = useState({ sms: usage?.messages?.sms?.count ?? 0, whatsapp: usage?.messages?.whatsapp?.count ?? 0, rcs: 0 });
  const [rateInput, setRateInput] = useState(() => Object.fromEntries(PASS_THROUGH_CHANNELS.map((c) => [c.key, rates[c.key] ? String(rates[c.key]) : ""])));

  const volumes = { contacts, emails };
  const best = recommendPlan(volumes, interval);
  const all = PLANS.map((p) => estimatePlan(p, volumes, interval));
  const passThrough = estimatePassThrough(messages, rateInput);

  return (
    <SectionCard
      title="Price calculator"
      description="Estimate a month at any volume. Platform price comes from the plan table; message costs from your provider rates."
      action={<SegmentedTabs tabs={INTERVAL_TABS} value={interval} onChange={setBillingInterval} />}
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <SliderField label="Marketing contacts" value={contacts} onChange={setContacts} max={200000} step={500} />
          <SliderField label="Emails per month" value={emails} onChange={setEmails} max={2000000} step={5000} />
          {PASS_THROUGH_CHANNELS.map((c) => (
            <div key={c.key} className="grid gap-3 sm:grid-cols-[1fr_160px] sm:items-end">
              <SliderField label={`${c.label} messages per month`} value={messages[c.key]} onChange={(v) => setMessages((m) => ({ ...m, [c.key]: v }))} max={100000} step={100} />
              <Field label="Provider rate" hint={rates[c.key] ? "Your 90-day average" : "Per message, from your provider"}>
                <Input
                  type="number"
                  min={0}
                  step="0.0001"
                  value={rateInput[c.key]}
                  onChange={(e) => setRateInput((r) => ({ ...r, [c.key]: e.target.value }))}
                  placeholder="0.0000"
                  aria-label={`${c.label} provider rate`}
                  className="h-8 tabular-nums"
                />
              </Field>
            </div>
          ))}
        </div>

        <div className="space-y-4 rounded-xl border border-border bg-surface-card p-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-text-secondary">Cheapest fit</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-lg font-semibold text-foreground">{best.plan.name}</span>
              {best.plan.key === currentPlan ? <Badge variant="neutral">Current plan</Badge> : null}
            </div>
          </div>
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-text-secondary">Base price</dt>
              <dd className="tabular-nums text-foreground">{usd(best.base)}</dd>
            </div>
            {best.contactOverage ? (
              <div className="flex justify-between gap-3">
                <dt className="text-text-secondary">+{num(best.extraContacts)} contacts</dt>
                <dd className="tabular-nums text-foreground">{usd(best.contactOverage)}</dd>
              </div>
            ) : null}
            {best.emailOverage ? (
              <div className="flex justify-between gap-3">
                <dt className="text-text-secondary">+{num(best.extraEmails)} emails</dt>
                <dd className="tabular-nums text-foreground">{usd(best.emailOverage)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-3 border-t border-border pt-1.5 font-medium">
              <dt className="text-foreground">Geiger Campaign</dt>
              <dd className="tabular-nums text-foreground">{usd(best.total)}/mo</dd>
            </div>
            {passThrough.lines.map((l) => (
              <div key={l.channel} className="flex justify-between gap-3">
                <dt className="text-text-secondary">
                  {num(l.count)} {PASS_THROUGH_CHANNELS.find((c) => c.key === l.channel)?.label} × {l.rate}
                </dt>
                <dd className="tabular-nums text-foreground">{money(l.cost)}</dd>
              </div>
            ))}
            {passThrough.lines.length ? (
              <div className="flex justify-between gap-3 border-t border-border pt-1.5">
                <dt className="text-text-secondary">Paid to your providers</dt>
                <dd className="tabular-nums text-foreground">{money(passThrough.total)}</dd>
              </div>
            ) : null}
          </dl>
          <p className="text-xs text-text-tertiary">Provider costs are charged by your SMS/WhatsApp/RCS provider accounts at their rates; Geiger adds no markup.</p>
          <div className="border-t border-border pt-3">
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-text-secondary">Every plan at these volumes</p>
            <ul className="space-y-1 text-sm">
              {all.map((e) => (
                <li key={e.plan.key} className="flex justify-between gap-3">
                  <span className={cn(e.plan.key === best.plan.key ? "font-medium text-foreground" : "text-text-secondary")}>{e.plan.name}</span>
                  <span className="tabular-nums text-text-secondary">{e.fits ? `${usd(e.total)}/mo` : "Over the limit"}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

export function BillingScreen() {
  const { projectId } = useProject();
  const { can } = useRbac();
  const canManage = can("campaign.billing.manage");
  const [settings, setSettings] = useState(null);
  const [usage, setUsage] = useState(null);
  const [rates, setRates] = useState({});
  const [loading, setLoading] = useState(true);
  const [changeOpen, setChangeOpen] = useState(false);

  useEffect(() => {
    if (!projectId) return undefined;
    let alive = true;
    (async () => {
      const s = await getWorkspaceSettings(projectId);
      const anchor = s?.billing?.cycleAnchorDay ?? 1;
      const cycle = billingCycle(new Date(), anchor);
      const [current, recent] = await Promise.all([
        getUsageSummary(projectId, { since: cycle.start.toISOString() }),
        getUsageSummary(projectId, { since: new Date(Date.now() - 90 * DAY).toISOString() }),
      ]);
      if (!alive) return;
      setSettings(s);
      setUsage(current);
      const observed = {};
      for (const c of PASS_THROUGH_CHANNELS) {
        const m = recent?.messages?.[c.key];
        if (m?.count && m.cost > 0) observed[c.key] = Math.round((m.cost / m.count) * 10000) / 10000;
      }
      setRates(observed);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [projectId]);

  const billing = settings?.billing ?? { plan: "free", interval: "monthly", cycleAnchorDay: 1 };
  const plan = getPlan(billing.plan);
  const cycle = useMemo(() => billingCycle(new Date(), billing.cycleAnchorDay), [billing.cycleAnchorDay]);
  const estimate = usage ? estimatePlan(plan, { contacts: usage.contacts, emails: usage.emails }, billing.interval) : null;

  const savePlan = async ({ plan: key, interval }) => {
    const user = await getUser();
    const next = { ...billing, plan: key, interval, changedAt: new Date().toISOString(), changedBy: user?.id ?? null };
    const previous = settings;
    setSettings((s) => ({ ...s, billing: next }));
    const saved = await saveWorkspaceSettings(projectId, { billing: next }, { createdBy: user?.id ?? null });
    if (!saved) {
      setSettings(previous);
      toast.error("Couldn't change the plan — it needs the “Manage billing” permission.");
      return false;
    }
    setSettings(saved);
    toast.success(`Plan set to ${getPlan(key).name}.`);
    return true;
  };

  const columns = [
    {
      key: "name",
      header: "Plan",
      render: (p) => (
        <span className="inline-flex items-center gap-2">
          <span className="font-medium text-foreground">{p.name}</span>
          {p.key === plan.key ? <Badge variant="success">Current</Badge> : null}
        </span>
      ),
    },
    { key: "price", header: "Per month", align: "right", className: "whitespace-nowrap tabular-nums text-foreground", render: (p) => `${usd(p.monthly)} · ${usd(p.annualMonthly)} annual` },
    { key: "contacts", header: "Contacts", align: "right", className: "tabular-nums text-muted-foreground", render: (p) => num(p.contacts) },
    { key: "emails", header: "Emails / month", align: "right", className: "tabular-nums text-muted-foreground", render: (p) => num(p.emailsPerMonth) },
    {
      key: "overage",
      header: "Over the allowance",
      className: "whitespace-nowrap text-muted-foreground",
      render: (p) => (p.extraContactsPer1k ? `${usd(p.extraContactsPer1k)} / 1k contacts · ${usd(p.extraEmailsPer1k)} / 1k emails` : "Hard limit"),
    },
    { key: "seats", header: "Seats", align: "right", className: "tabular-nums text-muted-foreground", render: (p) => (p.seats ? p.seats : "Unlimited") },
    { key: "features", header: "Includes", className: "min-w-56 text-xs text-text-secondary", render: (p) => p.features.join(" · ") },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Billing"
        description="Transparent pricing by contacts and sends, live usage, and an estimate for any volume."
        actions={
          canManage ? (
            <Button variant="outline" className={OUTLINE} onClick={() => setChangeOpen(true)} disabled={loading}>
              Change plan
            </Button>
          ) : null
        }
      />

      {loading ? (
        <div className="flex min-h-60 items-center justify-center">
          <LogoLoading size={56} aria-label="Loading billing" />
        </div>
      ) : (
        <div className="space-y-6">
          <SectionCard>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <div className="flex items-baseline gap-2">
                  <h2 className="text-base font-semibold text-foreground">{plan.name}</h2>
                  <span className="text-sm text-muted-foreground">
                    {usd(planPrice(plan, billing.interval))}/mo · billed {billing.interval === "annual" ? "annually" : "monthly"}
                  </span>
                </div>
                <p className="text-xs text-text-secondary">
                  {num(plan.contacts)} contacts · {num(plan.emailsPerMonth)} emails a month · {plan.seats ? `${plan.seats} seats` : "unlimited seats"}
                  {billing.changedAt ? ` · plan set ${formatDate(new Date(billing.changedAt))}` : ""}
                </p>
              </div>
              {estimate ? (
                <div className="text-left sm:text-right">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-text-secondary">This cycle so far</p>
                  <p className="text-lg font-semibold tabular-nums text-foreground">{estimate.fits ? usd(estimate.total) : "Over the plan limit"}</p>
                </div>
              ) : null}
            </div>
            <div className="mt-4 flex items-start gap-2 border-t border-border pt-4 text-xs text-text-secondary">
              <Info className="mt-px h-3.5 w-3.5 shrink-0" />
              <span>
                Billing isn&apos;t connected to a payment provider yet: the plan is recorded for this workspace, no card is on file, nothing is charged and no invoices are issued.
              </span>
            </div>
          </SectionCard>

          <SectionCard title="Usage this cycle" description={`${formatDate(cycle.start)} – ${formatDate(new Date(cycle.end.getTime() - DAY))}`} contentClassName="space-y-5">
            {usage ? (
              <>
                <Meter
                  label="Subscribed contacts"
                  used={usage.contacts}
                  limit={plan.contacts}
                  detail={
                    usage.contacts > plan.contacts
                      ? plan.extraContactsPer1k
                        ? `${num(usage.contacts - plan.contacts)} over the allowance — ${usd(estimate.contactOverage)} at ${usd(plan.extraContactsPer1k)} per 1,000.`
                        : "Over the Free plan's limit — choose a paid plan to keep adding contacts."
                      : null
                  }
                />
                <Meter
                  label="Emails sent"
                  used={usage.emails}
                  limit={plan.emailsPerMonth}
                  detail={
                    usage.emails > plan.emailsPerMonth
                      ? plan.extraEmailsPer1k
                        ? `${num(usage.emails - plan.emailsPerMonth)} over — ${usd(estimate.emailOverage)} at ${usd(plan.extraEmailsPer1k)} per 1,000.`
                        : "Over the Free plan's monthly sends."
                      : null
                  }
                />
                <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-3">
                  {PASS_THROUGH_CHANNELS.map((c) => {
                    const m = usage.messages[c.key];
                    return (
                      <div key={c.key}>
                        <p className="text-sm text-muted-foreground">{c.label} messages</p>
                        <p className="text-lg font-semibold tabular-nums text-foreground">{num(m.count)}</p>
                        <p className="text-xs text-text-tertiary">{m.count ? `${money(m.cost, usage.currency)} provider cost` : "None this cycle"}</p>
                      </div>
                    );
                  })}
                </div>
                {usage.capped ? <p className="text-xs text-text-tertiary">Message costs summarize the first 20,000 text messages this cycle.</p> : null}
              </>
            ) : (
              <p className="text-sm text-text-secondary">Usage couldn&apos;t be loaded.</p>
            )}
          </SectionCard>

          <div className="space-y-3">
            <div>
              <h2 className="text-base font-semibold text-foreground">Plans</h2>
              <p className="text-sm text-text-secondary">Every price and limit, published. Text messages are always at your provider&apos;s cost.</p>
            </div>
            <DataTable columns={columns} data={PLANS} getRowKey={(p) => p.key} />
          </div>

          <PriceCalculator key={usage ? "loaded" : "empty"} usage={usage} rates={rates} currentPlan={plan.key} />
        </div>
      )}

      {settings ? <ChangePlanDialog open={changeOpen} onOpenChange={setChangeOpen} billing={billing} onSave={savePlan} /> : null}
    </MainScreenWrapper>
  );
}

export default BillingScreen;
