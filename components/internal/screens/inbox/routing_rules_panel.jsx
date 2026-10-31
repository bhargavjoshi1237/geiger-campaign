"use client";

import React, { useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Loader2, Pencil, Plus, Route, Trash2, X } from "lucide-react";
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
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from "@geiger/ui";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import { getUser } from "@/lib/supabase/user";
import { createAssignmentRule, softDeleteAssignmentRule, updateAssignmentRule } from "@/lib/supabase/assignment_rules";
import { RULE_FIELDS, RULE_OPERATORS, ROUTING_STRATEGIES } from "@/lib/inbox/routing";
import { formatListTime } from "@/lib/inbox/format";
import { CHANNEL_OPTIONS, KIND_LABEL, PRIORITY_OPTIONS, channelMeta, initials } from "./constants";

// Routing rules: the first active rule (top to bottom) that matches a new conversation assigns it by
// round robin or least busy; manual rules park it in the unassigned queue.

const OUTLINE = "border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground";
const VALUE_OPTIONS = {
  kind: Object.entries(KIND_LABEL).map(([value, label]) => ({ value, label })),
  priority: PRIORITY_OPTIONS,
  source: [
    { value: "organic", label: "Organic post" },
    { value: "ad", label: "Ad" },
  ],
};
const EMPTY_RULE = { name: "", strategy: "round_robin", members: [], channels: [], conditions: { match: "all", conditions: [] }, maxOpenPerMember: "", active: true };

export function conditionSummary(rule) {
  const list = rule.conditions?.conditions || [];
  if (!list.length) return "Every conversation";
  return list
    .map((c) => {
      const field = RULE_FIELDS.find((f) => f.key === c.field);
      const label = VALUE_OPTIONS[c.field]?.find((o) => o.value === c.value)?.label || c.value;
      return `${field?.label || c.field} ${RULE_OPERATORS[c.operator] || c.operator} ${label ? `“${label}”` : ""}`.trim();
    })
    .join(rule.conditions.match === "any" ? " or " : " and ");
}

function ConditionRow({ condition, onChange, onRemove }) {
  const field = RULE_FIELDS.find((f) => f.key === condition.field) || RULE_FIELDS[0];
  const options = VALUE_OPTIONS[field.key];
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-2 sm:grid-cols-[150px_130px_1fr_auto]">
      <Select value={field.key} onValueChange={(key) => onChange({ field: key, operator: RULE_FIELDS.find((f) => f.key === key).operators[0], value: "" })}>
        <SelectTrigger className="h-8 w-full" aria-label="Condition field"><SelectValue /></SelectTrigger>
        <SelectContent>{RULE_FIELDS.map((f) => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={condition.operator} onValueChange={(operator) => onChange({ operator })}>
        <SelectTrigger className="h-8 w-full" aria-label="Condition operator"><SelectValue /></SelectTrigger>
        <SelectContent>{field.operators.map((op) => <SelectItem key={op} value={op}>{RULE_OPERATORS[op]}</SelectItem>)}</SelectContent>
      </Select>
      {options ? (
        <Select value={condition.value || ""} onValueChange={(value) => onChange({ value })}>
          <SelectTrigger className="h-8 w-full" aria-label="Condition value"><SelectValue placeholder="Choose…" /></SelectTrigger>
          <SelectContent>{options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
        </Select>
      ) : (
        <Input value={condition.value || ""} onChange={(e) => onChange({ value: e.target.value })} placeholder={field.key === "tag" ? "vip" : "refund"} aria-label="Condition value" className="h-8" />
      )}
      <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove condition" onClick={onRemove} className="text-muted-foreground hover:bg-surface-active hover:text-foreground">
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

function RuleDialog({ initial, members, onOpenChange, onSave }) {
  const [draft, setDraft] = useState(() => ({ ...EMPTY_RULE, ...initial, maxOpenPerMember: initial?.maxOpenPerMember ?? "" }));
  const [busy, setBusy] = useState(false);
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  const toggle = (key, value) => setDraft((d) => ({ ...d, [key]: d[key].includes(value) ? d[key].filter((v) => v !== value) : [...d[key], value] }));
  const conditions = draft.conditions.conditions;
  const setConditions = (next) => setDraft((d) => ({ ...d, conditions: { ...d.conditions, conditions: next } }));

  const submit = async () => {
    if (!draft.name.trim()) return toast.error("Name the rule.");
    if (draft.strategy !== "manual" && !draft.members.length) return toast.error("Pick at least one teammate to route to.");
    if (conditions.some((c) => !String(c.value || "").trim())) return toast.error("Fill in every condition or remove it.");
    setBusy(true);
    const ok = await onSave(draft);
    setBusy(false);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{initial?.id ? "Edit routing rule" : "New routing rule"}</DialogTitle>
          <DialogDescription>New conversations run through rules top to bottom; the first match assigns them.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="rule-name">
              <Input id="rule-name" value={draft.name} onChange={(e) => set("name")(e.target.value)} placeholder="e.g. WhatsApp sales" />
            </Field>
            <Field label="Strategy" hint={ROUTING_STRATEGIES.find((s) => s.value === draft.strategy)?.hint}>
              <Select value={draft.strategy} onValueChange={set("strategy")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{ROUTING_STRATEGIES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>

          {draft.strategy !== "manual" ? (
            <Field label="Route to" hint="Teammates who share this queue.">
              {members.length ? (
                <div className="grid max-h-44 grid-cols-1 gap-2 overflow-y-auto pt-1 sm:grid-cols-2">
                  {members.map((m) => (
                    <label key={m.userId} className="flex items-center gap-2 text-sm text-foreground">
                      <Checkbox checked={draft.members.includes(m.userId)} onCheckedChange={() => toggle("members", m.userId)} />
                      <span className="truncate">{m.name || m.email}</span>
                      <span className="truncate text-xs text-text-tertiary">{m.roleName}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-text-secondary">No teammates in this project yet — add them in Settings → Team.</p>
              )}
            </Field>
          ) : null}

          <Field label="Channels" hint="Leave all unchecked to match every channel.">
            <div className="grid grid-cols-2 gap-2 pt-1 sm:grid-cols-3">
              {CHANNEL_OPTIONS.map((c) => (
                <label key={c.value} className="flex items-center gap-2 text-sm text-foreground">
                  <Checkbox checked={draft.channels.includes(c.value)} onCheckedChange={() => toggle("channels", c.value)} />
                  {c.label}
                </label>
              ))}
            </div>
          </Field>

          <Field label="Conditions">
            <div className="space-y-2 pt-1">
              {conditions.length > 1 ? (
                <Select value={draft.conditions.match} onValueChange={(match) => setDraft((d) => ({ ...d, conditions: { ...d.conditions, match } }))}>
                  <SelectTrigger className="h-8 w-48" aria-label="Match"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Match all conditions</SelectItem>
                    <SelectItem value="any">Match any condition</SelectItem>
                  </SelectContent>
                </Select>
              ) : null}
              {conditions.map((c, i) => (
                <ConditionRow
                  key={c.id}
                  condition={c}
                  onChange={(patch) => setConditions(conditions.map((x, j) => (j === i ? { ...x, ...patch } : x)))}
                  onRemove={() => setConditions(conditions.filter((_, j) => j !== i))}
                />
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={OUTLINE}
                onClick={() => setConditions([...conditions, { id: crypto.randomUUID(), field: "tag", operator: "has", value: "" }])}
              >
                <Plus className="h-3.5 w-3.5" /> Add condition
              </Button>
            </div>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Capacity per teammate" htmlFor="rule-cap" hint="Skip anyone already holding this many open conversations. Empty = no cap.">
              <Input id="rule-cap" type="number" min={1} value={draft.maxOpenPerMember} onChange={(e) => set("maxOpenPerMember")(e.target.value)} placeholder="No cap" />
            </Field>
            <Field label="Active">
              <div className="flex h-9 items-center gap-2">
                <Switch checked={draft.active} onCheckedChange={set("active")} aria-label="Rule active" />
                <span className="text-sm text-text-secondary">{draft.active ? "Routing new conversations" : "Paused"}</span>
              </div>
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-muted-foreground hover:bg-surface-active hover:text-foreground">Cancel</Button>
          <Button onClick={submit} disabled={busy} className="bg-primary text-primary-foreground hover:bg-primary/90">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {initial?.id ? "Save rule" : "Create rule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RoutingRulesPanel({ projectId, rules, setRules, members, membersById, canEdit, now }) {
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const ordered = [...rules].sort((a, b) => a.position - b.position || String(a.createdAt).localeCompare(String(b.createdAt)));
  const pager = usePagination(ordered);

  const persist = async (id, patch, fail = "Couldn't save the rule.") => {
    const prev = rules.find((r) => r.id === id);
    setRules((list) => list.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    const row = await updateAssignmentRule(id, patch);
    if (!row) {
      setRules((list) => list.map((r) => (r.id === id ? prev : r)));
      toast.error(fail);
      return false;
    }
    setRules((list) => list.map((r) => (r.id === id ? row : r)));
    return true;
  };

  const save = async (draft) => {
    const input = {
      name: draft.name,
      strategy: draft.strategy,
      members: draft.strategy === "manual" ? [] : draft.members,
      channels: draft.channels,
      conditions: draft.conditions,
      maxOpenPerMember: draft.maxOpenPerMember,
      active: draft.active,
    };
    if (draft.id) {
      const ok = await persist(draft.id, input);
      if (ok) toast.success("Rule saved.");
      return ok;
    }
    const user = await getUser();
    const optimistic = { ...input, id: crypto.randomUUID(), position: ordered.length ? ordered[ordered.length - 1].position + 1 : 0, assignedCount: 0, nextIndex: 0, createdBy: user?.id ?? null, createdAt: new Date().toISOString() };
    setRules((list) => [...list, { ...optimistic, maxOpenPerMember: Number(input.maxOpenPerMember) || null }]);
    const row = await createAssignmentRule(projectId, optimistic);
    if (!row) {
      setRules((list) => list.filter((r) => r.id !== optimistic.id));
      toast.error("Couldn't create the rule.");
      return false;
    }
    setRules((list) => list.map((r) => (r.id === row.id ? row : r)));
    toast.success("Rule created.");
    return true;
  };

  // Swap two rules, then renumber positions to their index so the order is unambiguous.
  const move = async (rule, dir) => {
    const index = ordered.findIndex((r) => r.id === rule.id);
    const target = index + dir;
    if (target < 0 || target >= ordered.length) return;
    const next = [...ordered];
    [next[index], next[target]] = [next[target], next[index]];
    const changed = next.map((r, i) => ({ r, i })).filter(({ r, i }) => r.position !== i);
    await Promise.all(changed.map(({ r, i }) => persist(r.id, { position: i }, "Couldn't reorder the rules.")));
  };

  const remove = async (rule) => {
    setDeleteTarget(null);
    setRules((list) => list.filter((r) => r.id !== rule.id));
    if (!(await softDeleteAssignmentRule(rule.id))) {
      setRules((list) => [...list, rule]);
      toast.error("Couldn't delete the rule.");
      return;
    }
    toast.success(`Deleted “${rule.name}”.`);
  };

  const columns = [
    { key: "order", header: "#", className: "w-10 tabular-nums text-text-tertiary", render: (r) => ordered.indexOf(r) + 1 },
    {
      key: "rule",
      header: "Rule",
      render: (r) => (
        <div className="min-w-0 max-w-sm">
          <p className="truncate font-medium text-foreground">{r.name}</p>
          <p className="truncate text-xs text-text-secondary">{conditionSummary(r)}</p>
        </div>
      ),
    },
    { key: "strategy", header: "Strategy", className: "whitespace-nowrap text-muted-foreground", render: (r) => ROUTING_STRATEGIES.find((s) => s.value === r.strategy)?.label || r.strategy },
    {
      key: "members",
      header: "Routes to",
      render: (r) =>
        r.strategy === "manual" ? (
          <span className="text-sm text-text-secondary">Unassigned queue</span>
        ) : (
          <div className="flex -space-x-1.5">
            {r.members.slice(0, 5).map((id) => {
              const m = membersById.get(id);
              return (
                <span key={id} title={m?.name || m?.email || "Former member"} className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-surface-active text-[10px] font-medium text-muted-foreground">
                  {initials(m?.name || m?.email || "?")}
                </span>
              );
            })}
            {r.members.length > 5 ? <span className="pl-2.5 text-xs text-text-tertiary">+{r.members.length - 5}</span> : null}
          </div>
        ),
    },
    {
      key: "channels",
      header: "Channels",
      render: (r) =>
        r.channels.length ? (
          <div className="flex flex-wrap gap-1">{r.channels.map((c) => <Badge key={c} variant="outline">{channelMeta(c).label}</Badge>)}</div>
        ) : (
          <span className="text-sm text-text-secondary">All</span>
        ),
    },
    {
      key: "assigned",
      header: "Assigned",
      align: "right",
      render: (r) => (
        <div className="text-right">
          <p className="tabular-nums text-foreground">{r.assignedCount.toLocaleString("en-US")}</p>
          <p className="text-[11px] text-text-tertiary">{r.lastAssignedAt ? formatListTime(r.lastAssignedAt, now) : "Not yet"}</p>
        </div>
      ),
    },
    {
      key: "active",
      header: "Active",
      render: (r) => (
        <div onClick={(e) => e.stopPropagation()}>
          <Switch checked={r.active} disabled={!canEdit} onCheckedChange={(active) => persist(r.id, { active }).then((ok) => ok && toast.success(active ? "Rule activated." : "Rule paused."))} aria-label={`${r.name} active`} />
        </div>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (r) =>
        canEdit ? (
          <ActionMenu
            label={`Actions for ${r.name}`}
            items={[
              { label: "Edit", icon: Pencil, onSelect: () => setEditing(r) },
              ordered.indexOf(r) > 0 && { label: "Move up", icon: ArrowUp, onSelect: () => move(r, -1) },
              ordered.indexOf(r) < ordered.length - 1 && { label: "Move down", icon: ArrowDown, onSelect: () => move(r, 1) },
              { separator: true },
              { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setDeleteTarget(r) },
            ]}
          />
        ) : null,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-text-secondary">
          {canEdit ? "Order matters — the first active rule that matches wins." : "Your role can view routing but not change it (needs “Assign roles”)."}
        </p>
        {canEdit ? (
          <Button onClick={() => setEditing(EMPTY_RULE)} className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Plus className="h-4 w-4" /> New rule
          </Button>
        ) : null}
      </div>
      <div className="space-y-5">
        <DataTable
          columns={columns}
          data={pager.pageItems}
          getRowKey={(r) => r.id}
          onRowClick={canEdit ? (r) => setEditing(r) : undefined}
          empty={
            <div className="rounded-xl border border-border bg-surface-subtle">
              <EmptyState
                icon={Route}
                title="No routing rules"
                description="Without a rule every new conversation waits in the unassigned queue. Add one to share the load automatically."
                action={canEdit ? <Button onClick={() => setEditing(EMPTY_RULE)} className="bg-primary text-primary-foreground hover:bg-primary/90"><Plus className="h-4 w-4" /> New rule</Button> : null}
              />
            </div>
          }
        />
        <ListPagination {...pager} itemLabel="rules" />
      </div>
      {editing ? <RuleDialog key={editing.id || "new"} initial={editing} members={members} onOpenChange={(o) => !o && setEditing(null)} onSave={save} /> : null}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete routing rule</DialogTitle>
            <DialogDescription>
              Delete <span className="font-medium text-foreground">{deleteTarget?.name}</span>? Conversations already assigned keep their owner.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button className="bg-red-500/90 text-white hover:bg-red-500" onClick={() => remove(deleteTarget)}><Trash2 className="h-4 w-4" /> Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
