"use client";

import React, { useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Loader2, Pencil, Plus, Timer, Trash2 } from "lucide-react";
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
  Switch,
} from "@geiger/ui";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import { getUser } from "@/lib/supabase/user";
import { createSlaPolicy, softDeleteSlaPolicy, updateSlaPolicy } from "@/lib/supabase/sla_policies";
import { DEFAULT_BUSINESS_HOURS } from "@/lib/inbox/sla";
import { formatDuration } from "@/lib/inbox/format";
import { BusinessHoursEditor, businessHoursSummary } from "./business_hours_editor";
import { CHANNEL_OPTIONS, PRIORITY_OPTIONS, channelMeta } from "./constants";

// SLA policies: first-reply and resolution targets on a business-hours clock. The first active policy whose
// channel / priority scope covers a conversation stamps its deadlines when it's routed.

const EMPTY_POLICY = { name: "", firstResponseMinutes: 60, resolutionMinutes: 1440, channels: [], priorities: [], businessHours: DEFAULT_BUSINESS_HOURS, active: true };
const minutesLabel = (m) => (m ? formatDuration(m * 60_000) : "No target");

function PolicyDialog({ initial, onOpenChange, onSave }) {
  const [draft, setDraft] = useState(() => ({ ...EMPTY_POLICY, ...initial, resolutionMinutes: initial?.resolutionMinutes ?? "" }));
  const [busy, setBusy] = useState(false);
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  const toggle = (key, value) => setDraft((d) => ({ ...d, [key]: d[key].includes(value) ? d[key].filter((v) => v !== value) : [...d[key], value] }));

  const submit = async () => {
    if (!draft.name.trim()) return toast.error("Name the policy.");
    if (!(Number(draft.firstResponseMinutes) > 0)) return toast.error("Set a first-reply target in minutes.");
    setBusy(true);
    const ok = await onSave(draft);
    setBusy(false);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{initial?.id ? "Edit SLA policy" : "New SLA policy"}</DialogTitle>
          <DialogDescription>Targets count from the customer&apos;s message; overdue conversations are flagged in every inbox.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Name" htmlFor="sla-name">
            <Input id="sla-name" value={draft.name} onChange={(e) => set("name")(e.target.value)} placeholder="e.g. Urgent — all channels" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First reply within (minutes)" htmlFor="sla-first" hint={minutesLabel(Number(draft.firstResponseMinutes))}>
              <Input id="sla-first" type="number" min={1} value={draft.firstResponseMinutes} onChange={(e) => set("firstResponseMinutes")(e.target.value)} />
            </Field>
            <Field label="Resolve within (minutes)" htmlFor="sla-resolve" hint={draft.resolutionMinutes ? minutesLabel(Number(draft.resolutionMinutes)) : "Empty = no resolution target"}>
              <Input id="sla-resolve" type="number" min={1} value={draft.resolutionMinutes} onChange={(e) => set("resolutionMinutes")(e.target.value)} placeholder="No target" />
            </Field>
          </div>
          <Field label="Channels" hint="Leave all unchecked to cover every channel.">
            <div className="grid grid-cols-2 gap-2 pt-1 sm:grid-cols-3">
              {CHANNEL_OPTIONS.map((c) => (
                <label key={c.value} className="flex items-center gap-2 text-sm text-foreground">
                  <Checkbox checked={draft.channels.includes(c.value)} onCheckedChange={() => toggle("channels", c.value)} />
                  {c.label}
                </label>
              ))}
            </div>
          </Field>
          <Field label="Priorities" hint="Leave all unchecked to cover every priority.">
            <div className="flex flex-wrap gap-4 pt-1">
              {PRIORITY_OPTIONS.map((p) => (
                <label key={p.value} className="flex items-center gap-2 text-sm text-foreground">
                  <Checkbox checked={draft.priorities.includes(p.value)} onCheckedChange={() => toggle("priorities", p.value)} />
                  {p.label}
                </label>
              ))}
            </div>
          </Field>
          <BusinessHoursEditor value={draft.businessHours} onChange={set("businessHours")} idPrefix="sla" />
          <div className="flex items-center gap-2">
            <Switch checked={draft.active} onCheckedChange={set("active")} aria-label="Policy active" />
            <span className="text-sm text-text-secondary">{draft.active ? "Applied to new conversations" : "Paused"}</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-muted-foreground hover:bg-surface-active hover:text-foreground">Cancel</Button>
          <Button onClick={submit} disabled={busy} className="bg-primary text-primary-foreground hover:bg-primary/90">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {initial?.id ? "Save policy" : "Create policy"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SlaPoliciesPanel({ projectId, policies, setPolicies, canEdit }) {
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const ordered = [...policies].sort((a, b) => a.position - b.position || String(a.createdAt).localeCompare(String(b.createdAt)));
  const pager = usePagination(ordered);

  const persist = async (id, patch, fail = "Couldn't save the policy.") => {
    const prev = policies.find((p) => p.id === id);
    setPolicies((list) => list.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    const row = await updateSlaPolicy(id, patch);
    if (!row) {
      setPolicies((list) => list.map((p) => (p.id === id ? prev : p)));
      toast.error(fail);
      return false;
    }
    setPolicies((list) => list.map((p) => (p.id === id ? row : p)));
    return true;
  };

  const save = async (draft) => {
    const input = {
      name: draft.name,
      firstResponseMinutes: Number(draft.firstResponseMinutes),
      resolutionMinutes: draft.resolutionMinutes === "" ? null : Number(draft.resolutionMinutes),
      channels: draft.channels,
      priorities: draft.priorities,
      businessHours: draft.businessHours,
      active: draft.active,
    };
    if (draft.id) {
      const ok = await persist(draft.id, input);
      if (ok) toast.success("Policy saved.");
      return ok;
    }
    const user = await getUser();
    const optimistic = { ...input, id: crypto.randomUUID(), position: ordered.length ? ordered[ordered.length - 1].position + 1 : 0, createdBy: user?.id ?? null, createdAt: new Date().toISOString() };
    setPolicies((list) => [...list, optimistic]);
    const row = await createSlaPolicy(projectId, optimistic);
    if (!row) {
      setPolicies((list) => list.filter((p) => p.id !== optimistic.id));
      toast.error("Couldn't create the policy.");
      return false;
    }
    setPolicies((list) => list.map((p) => (p.id === row.id ? row : p)));
    toast.success("Policy created. It applies to conversations routed from now on.");
    return true;
  };

  const move = async (policy, dir) => {
    const index = ordered.findIndex((p) => p.id === policy.id);
    const target = index + dir;
    if (target < 0 || target >= ordered.length) return;
    const next = [...ordered];
    [next[index], next[target]] = [next[target], next[index]];
    const changed = next.map((p, i) => ({ p, i })).filter(({ p, i }) => p.position !== i);
    await Promise.all(changed.map(({ p, i }) => persist(p.id, { position: i }, "Couldn't reorder the policies.")));
  };

  const remove = async (policy) => {
    setDeleteTarget(null);
    setPolicies((list) => list.filter((p) => p.id !== policy.id));
    if (!(await softDeleteSlaPolicy(policy.id))) {
      setPolicies((list) => [...list, policy]);
      toast.error("Couldn't delete the policy.");
      return;
    }
    toast.success(`Deleted “${policy.name}”.`);
  };

  const scope = (p) => {
    const parts = [
      p.channels.length ? p.channels.map((c) => channelMeta(c).label).join(", ") : "All channels",
      p.priorities.length ? p.priorities.map((x) => PRIORITY_OPTIONS.find((o) => o.value === x)?.label || x).join(", ") : "any priority",
    ];
    return parts.join(" · ");
  };

  const columns = [
    { key: "order", header: "#", className: "w-10 tabular-nums text-text-tertiary", render: (p) => ordered.indexOf(p) + 1 },
    {
      key: "policy",
      header: "Policy",
      render: (p) => (
        <div className="min-w-0 max-w-sm">
          <p className="truncate font-medium text-foreground">{p.name}</p>
          <p className="truncate text-xs text-text-secondary">{scope(p)}</p>
        </div>
      ),
    },
    { key: "first", header: "First reply", className: "whitespace-nowrap tabular-nums text-foreground", render: (p) => minutesLabel(p.firstResponseMinutes) },
    { key: "resolve", header: "Resolution", className: "whitespace-nowrap tabular-nums text-muted-foreground", render: (p) => minutesLabel(p.resolutionMinutes) },
    { key: "hours", header: "Clock", render: (p) => <Badge variant="outline">{businessHoursSummary(p.businessHours)}</Badge> },
    {
      key: "active",
      header: "Active",
      render: (p) => (
        <div onClick={(e) => e.stopPropagation()}>
          <Switch checked={p.active} disabled={!canEdit} onCheckedChange={(active) => persist(p.id, { active }).then((ok) => ok && toast.success(active ? "Policy activated." : "Policy paused."))} aria-label={`${p.name} active`} />
        </div>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (p) =>
        canEdit ? (
          <ActionMenu
            label={`Actions for ${p.name}`}
            items={[
              { label: "Edit", icon: Pencil, onSelect: () => setEditing(p) },
              ordered.indexOf(p) > 0 && { label: "Move up", icon: ArrowUp, onSelect: () => move(p, -1) },
              ordered.indexOf(p) < ordered.length - 1 && { label: "Move down", icon: ArrowDown, onSelect: () => move(p, 1) },
              { separator: true },
              { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setDeleteTarget(p) },
            ]}
          />
        ) : null,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-text-secondary">
          {canEdit ? "The first active policy that covers a conversation sets its deadlines." : "Your role can view SLA policies but not change them (needs “Assign roles”)."}
        </p>
        {canEdit ? (
          <Button onClick={() => setEditing(EMPTY_POLICY)} className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Plus className="h-4 w-4" /> New policy
          </Button>
        ) : null}
      </div>
      <div className="space-y-5">
        <DataTable
          columns={columns}
          data={pager.pageItems}
          getRowKey={(p) => p.id}
          onRowClick={canEdit ? (p) => setEditing(p) : undefined}
          empty={
            <div className="rounded-xl border border-border bg-surface-subtle">
              <EmptyState
                icon={Timer}
                title="No SLA policies"
                description="Set first-reply and resolution targets so overdue conversations stand out in every inbox."
                action={canEdit ? <Button onClick={() => setEditing(EMPTY_POLICY)} className="bg-primary text-primary-foreground hover:bg-primary/90"><Plus className="h-4 w-4" /> New policy</Button> : null}
              />
            </div>
          }
        />
        <ListPagination {...pager} itemLabel="policies" />
      </div>
      {editing ? <PolicyDialog key={editing.id || "new"} initial={editing} onOpenChange={(o) => !o && setEditing(null)} onSave={save} /> : null}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete SLA policy</DialogTitle>
            <DialogDescription>
              Delete <span className="font-medium text-foreground">{deleteTarget?.name}</span>? Deadlines already stamped on conversations stay.
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
