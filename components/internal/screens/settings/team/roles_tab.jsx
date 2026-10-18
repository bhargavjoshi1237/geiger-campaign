"use client";

import React, { useMemo, useState } from "react";
import { Loader2, Lock, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { groupPermissions, matchesAny } from "@geiger/rbac";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Field,
  Input,
  LoadingArea,
  SectionCard,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingRow,
  SettingsList,
  Switch,
  Textarea,
  cn,
} from "@geiger/ui";
import rbacConfig from "@/geiger-rbac.config";
import { ALL_PERMISSION_KEYS, isProductKey } from "@/lib/rbac";
import { ROLE_COLOR_OPTIONS, roleVariant } from "./constants";

const PERMISSION_GROUPS = groupPermissions(rbacConfig);

// The Campaign keys a role's stored patterns reach ("*" and "campaign.*" expand to every key).
function campaignKeysOf(role) {
  return ALL_PERMISSION_KEYS.filter((key) => matchesAny(role?.permissions, key));
}

function isWildcardRole(role) {
  return (role?.permissions || []).includes("*");
}

function sharedWithOtherProducts(role) {
  return (role?.permissions || []).some((p) => p !== "*" && !isProductKey(p));
}

function ColorSelect({ value, onChange, disabled }) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ROLE_COLOR_OPTIONS.map((c) => (
          <SelectItem key={c.value} value={c.value}>
            {c.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function CreateRoleDialog({ open, onOpenChange, roles, onCreate }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("slate");
  const [template, setTemplate] = useState("blank");
  const [saving, setSaving] = useState(false);

  const close = () => {
    setName("");
    setDescription("");
    setColor("slate");
    setTemplate("blank");
    onOpenChange(false);
  };

  const submit = async () => {
    if (!name.trim()) return;
    const source = roles.find((r) => r.id === template);
    setSaving(true);
    const ok = await onCreate({
      name: name.trim(),
      description: description.trim(),
      color,
      permissions: source ? campaignKeysOf(source) : [],
    });
    setSaving(false);
    if (ok) close();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New role</DialogTitle>
          <DialogDescription>
            A custom role for this project. Pick its permissions after it&apos;s created.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Name" htmlFor="role-name">
            <Input
              id="role-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Campaign editor"
            />
          </Field>
          <Field label="Description" htmlFor="role-description">
            <Textarea
              id="role-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this role is for"
              rows={2}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Color">
              <ColorSelect value={color} onChange={setColor} />
            </Field>
            <Field label="Start from">
              <Select value={template} onValueChange={setTemplate}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="blank">No permissions</SelectItem>
                  {roles.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      Copy of {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!name.trim() || saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Create role
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Inline editor for one role; keyed by role id so switching roles starts from a clean draft.
function RoleEditor({ role, memberCount, canManage, onSave, onDelete }) {
  const locked = isWildcardRole(role);
  const editable = canManage && !locked;
  const initialKeys = useMemo(() => campaignKeysOf(role), [role]);

  const [name, setName] = useState(role.name);
  const [description, setDescription] = useState(role.description);
  const [color, setColor] = useState(role.color);
  const [keys, setKeys] = useState(() => new Set(initialKeys));
  const [saving, setSaving] = useState(false);

  const dirty =
    name !== role.name ||
    description !== role.description ||
    color !== role.color ||
    keys.size !== initialKeys.length ||
    initialKeys.some((k) => !keys.has(k));

  const toggle = (key, on) =>
    setKeys((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  const toggleGroup = (perms, on) =>
    setKeys((prev) => {
      const next = new Set(prev);
      for (const p of perms) {
        if (on) next.add(p.key);
        else next.delete(p.key);
      }
      return next;
    });

  const reset = () => {
    setName(role.name);
    setDescription(role.description);
    setColor(role.color);
    setKeys(new Set(initialKeys));
  };

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    // Keep other products' keys on this shared row; replace only Campaign's half.
    const others = role.permissions.filter((p) => !isProductKey(p));
    await onSave(role, {
      name: name.trim(),
      description: description.trim(),
      color,
      permissions: [...others, ...ALL_PERMISSION_KEYS.filter((k) => keys.has(k))],
    });
    setSaving(false);
  };

  const shared = sharedWithOtherProducts(role);
  const deleteBlocker = role.isSystem
    ? "System roles can't be deleted."
    : memberCount > 0
      ? "Reassign its members before deleting this role."
      : shared
        ? "Other Geiger products use this role."
        : null;

  return (
    <SectionCard
      title={role.name}
      description={
        locked
          ? "Holds every permission across the Geiger suite. It can't be edited."
          : role.description || "No description."
      }
      action={
        <div className="flex items-center gap-2">
          {role.isSystem ? <Badge variant="neutral">System</Badge> : null}
          <Badge variant={roleVariant(role.color)}>
            {memberCount} {memberCount === 1 ? "member" : "members"}
          </Badge>
        </div>
      }
    >
      <div className="space-y-6">
        {editable ? (
          <div className="grid gap-4 md:grid-cols-[1fr_160px]">
            <Field label="Name" htmlFor={`role-${role.id}-name`}>
              <Input
                id={`role-${role.id}-name`}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field label="Color">
              <ColorSelect value={color} onChange={setColor} />
            </Field>
            <Field label="Description" htmlFor={`role-${role.id}-desc`} className="md:col-span-2">
              <Textarea
                id={`role-${role.id}-desc`}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </Field>
            {shared ? (
              <p className="text-xs text-text-secondary md:col-span-2">
                This role is shared with other Geiger products. Its name applies everywhere; only
                Campaign permissions are edited here.
              </p>
            ) : null}
          </div>
        ) : null}

        {PERMISSION_GROUPS.map(({ group, permissions }) => {
          const onCount = permissions.filter((p) => keys.has(p.key)).length;
          return (
            <div key={group} className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-sm font-semibold text-foreground">{group}</h4>
                {editable ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-text-secondary"
                    onClick={() => toggleGroup(permissions, onCount < permissions.length)}
                  >
                    {onCount < permissions.length ? "Select all" : "Clear all"}
                  </Button>
                ) : (
                  <span className="text-xs text-text-secondary">
                    {onCount}/{permissions.length}
                  </span>
                )}
              </div>
              <SettingsList className="overflow-hidden rounded-lg border border-border bg-surface-card">
                {permissions.map((perm) => (
                  <SettingRow
                    key={perm.key}
                    title={perm.label}
                    description={<span className="font-mono text-[11px] text-text-tertiary">{perm.key}</span>}
                    className={cn(
                      "px-4 py-2.5 first:pt-2.5 last:pb-2.5",
                      editable && "hover:bg-surface-hover",
                    )}
                    control={
                      <Switch
                        checked={keys.has(perm.key)}
                        onCheckedChange={(on) => toggle(perm.key, on)}
                        disabled={!editable}
                        aria-label={perm.label}
                      />
                    }
                  />
                ))}
              </SettingsList>
            </div>
          );
        })}

        {editable ? (
          <div className="flex flex-col-reverse gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                onClick={() => onDelete(role)}
                disabled={Boolean(deleteBlocker)}
                className="text-red-600 dark:text-red-400 hover:bg-red-500/10 hover:text-red-700 dark:hover:text-red-300"
              >
                <Trash2 className="h-4 w-4" /> Delete role
              </Button>
              {deleteBlocker ? (
                <span className="text-xs text-text-secondary">{deleteBlocker}</span>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={reset} disabled={!dirty || saving}>
                Discard
              </Button>
              <Button onClick={save} disabled={!dirty || saving || !name.trim()}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save changes
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
}

export function RolesTab({ roles, members, loading, canManage, onSave, onDelete, onCreateClick }) {
  const [selectedId, setSelectedId] = useState(null);

  const counts = useMemo(() => {
    const map = new Map();
    for (const m of members) map.set(m.roleId, (map.get(m.roleId) || 0) + 1);
    return map;
  }, [members]);

  const selected = roles.find((r) => r.id === selectedId) || roles[0] || null;

  if (loading) return <LoadingArea size={48} label="Loading roles" panel />;

  if (!selected) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="No roles yet"
        description="Roles are seeded the first time a member opens this project."
        className="rounded-xl border border-border bg-surface-subtle"
        action={
          canManage ? (
            <Button onClick={onCreateClick}>
              <Plus className="h-4 w-4" /> New role
            </Button>
          ) : null
        }
      />
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <SectionCard className="lg:self-start" contentClassName="p-2">
        <nav aria-label="Roles" className="flex flex-col gap-1">
          {roles.map((role) => {
            const active = role.id === selected.id;
            return (
              <Button
                key={role.id}
                type="button"
                variant="ghost"
                onClick={() => setSelectedId(role.id)}
                className={cn(
                  "h-auto w-full items-start justify-between gap-3 whitespace-normal rounded-lg px-3 py-2.5 text-left font-normal transition-colors has-[>svg]:px-3",
                  active ? "bg-surface-active" : "hover:bg-surface-hover",
                )}
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 truncate text-sm font-medium text-foreground">
                    {isWildcardRole(role) ? <Lock className="size-3 shrink-0 text-text-secondary" /> : null}
                    {role.name}
                  </p>
                  <p className="truncate text-xs text-text-secondary">
                    {role.isSystem ? "System role" : "Custom role"}
                  </p>
                </div>
                <Badge variant={roleVariant(role.color)}>{counts.get(role.id) || 0}</Badge>
              </Button>
            );
          })}
        </nav>
      </SectionCard>
      <RoleEditor
        key={selected.id}
        role={selected}
        memberCount={counts.get(selected.id) || 0}
        canManage={canManage}
        onSave={onSave}
        onDelete={onDelete}
      />
    </div>
  );
}
