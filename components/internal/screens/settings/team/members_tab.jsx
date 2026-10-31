"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Loader2, UserMinus, UserPlus, Users } from "lucide-react";
import {
  ActionMenu,
  Avatar,
  AvatarFallback,
  AvatarImage,
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
  LoadingArea,
  SearchInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Toolbar,
} from "@geiger/ui";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { listOrgCandidates } from "@/lib/supabase/rbac";
import { formatDate, initials, roleVariant } from "./constants";

const OUTLINE_BUTTON =
  "border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground";

function MemberIdentity({ member, isYou }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar className="size-9">
        {member.avatarUrl ? <AvatarImage src={member.avatarUrl} alt="" /> : null}
        <AvatarFallback>{initials(member.name || member.email)}</AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-medium text-foreground">
          {member.name || member.email}
          {isYou ? <span className="ml-1.5 text-xs font-normal text-text-secondary">(you)</span> : null}
        </span>
        <span className="truncate text-xs text-text-secondary">{member.email}</span>
      </div>
    </div>
  );
}

function RoleSelect({ value, roles, onChange, disabled, className }) {
  return (
    <Select value={value || ""} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className={className || "h-8 w-40"}>
        <SelectValue placeholder="Pick a role" />
      </SelectTrigger>
      <SelectContent>
        {roles.map((role) => (
          <SelectItem key={role.id} value={role.id}>
            {role.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// Body of the add-member dialog; mounted only while open, so every open starts fresh and refetches candidates.
function AddMemberForm({ projectId, roles, onAdd, onClose }) {
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState("");
  const [roleId, setRoleId] = useState(() => roles.find((r) => r.key === "member")?.id || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    listOrgCandidates(projectId).then((rows) => {
      if (!alive) return;
      setCandidates(rows ?? []);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const submit = async () => {
    const candidate = candidates.find((c) => c.userId === userId);
    const role = roles.find((r) => r.id === roleId);
    if (!candidate || !role) return;
    setSaving(true);
    const ok = await onAdd(candidate, role);
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Add member</DialogTitle>
        <DialogDescription>
          Give someone from your organization access to this project.
        </DialogDescription>
      </DialogHeader>
      {loading ? (
        <LoadingArea size={36} label="Loading organization members" className="py-8" />
      ) : candidates.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Everyone is already here"
          description="All members of your organization already have access to this project."
          className="py-8"
        />
      ) : (
        <div className="grid gap-4">
          <Field label="Member">
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose a teammate" />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((c) => (
                  <SelectItem key={c.userId} value={c.userId}>
                    {c.name || c.email}
                    {c.email && c.name !== c.email ? ` · ${c.email}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Role" hint="You can change this at any time.">
            <RoleSelect value={roleId} roles={roles} onChange={setRoleId} className="w-full" />
          </Field>
        </div>
      )}
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={!userId || !roleId || saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Add member
        </Button>
      </DialogFooter>
    </>
  );
}

// Add an organization member to this project with a role (the org is the invite boundary, as in the rest of the suite).
export function AddMemberDialog({ open, onOpenChange, projectId, roles, onAdd }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open ? (
          <AddMemberForm
            projectId={projectId}
            roles={roles}
            onAdd={onAdd}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function MembersTab({
  members,
  roles,
  loading,
  currentUserId,
  canAssign,
  canInvite,
  onAddClick,
  onChangeRole,
  onRemove,
  viewFilter = null,
}) {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [removeTarget, setRemoveTarget] = useState(null);

  const ownerCount = useMemo(
    () => members.filter((m) => m.roleKey === "owner").length,
    [members],
  );

  // Roles come from the project, so the filter options follow them.
  const roleFilterOptions = useMemo(
    () => [{ value: "all", label: "All roles" }, ...roles.map((r) => ({ value: r.id, label: r.name }))],
    [roles],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members.filter((m) => {
      if (roleFilter !== "all" && m.roleId !== roleFilter) return false;
      if (q && ![m.name, m.email, m.roleName].some((v) => v?.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [members, search, roleFilter]);

  const pager = usePagination(filtered, { resetKey: `${search}|${roleFilter}` });

  // You can't change or remove yourself, nor the last owner — either would lock the project out of administration.
  const isLocked = (m) =>
    m.userId === currentUserId || (m.roleKey === "owner" && ownerCount <= 1);

  const confirmRemove = () => {
    const target = removeTarget;
    setRemoveTarget(null);
    onRemove(target);
  };

  const filtersActive = search || roleFilter !== "all";

  const clearFilters = () => {
    setSearch("");
    setRoleFilter("all");
  };

  const columns = [
    {
      key: "member",
      header: "Member",
      render: (m) => <MemberIdentity member={m} isYou={m.userId === currentUserId} />,
    },
    {
      key: "role",
      header: "Role",
      render: (m) =>
        canAssign && !isLocked(m) ? (
          <RoleSelect
            value={m.roleId}
            roles={roles}
            onChange={(roleId) => onChangeRole(m, roleId)}
          />
        ) : (
          <Badge variant={roleVariant(roles.find((r) => r.id === m.roleId)?.color)}>
            {m.roleName || "—"}
          </Badge>
        ),
    },
    {
      key: "since",
      header: "Member since",
      className: "whitespace-nowrap text-muted-foreground",
      render: (m) => formatDate(m.grantedAt),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (m) =>
        canAssign && !isLocked(m) ? (
          <ActionMenu
            label={`Actions for ${m.name || m.email}`}
            items={[
              {
                icon: UserMinus,
                label: "Remove from project",
                destructive: true,
                onSelect: () => setRemoveTarget(m),
              },
            ]}
          />
        ) : null,
    },
  ];

  // The screen's view switcher leads the toolbar, so it stays visible while members load.
  const toolbar = (
    <Toolbar>
      <div className="flex items-center gap-2">
        {viewFilter}
        <FilterDropdown value={roleFilter} onValueChange={setRoleFilter} options={roleFilterOptions} height="h-9" />
      </div>
      <SearchInput value={search} onChange={setSearch} placeholder="Search members…" />
    </Toolbar>
  );

  if (loading) {
    return (
      <div className="space-y-4">
        {toolbar}
        <LoadingArea size={48} label="Loading members" panel />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {toolbar}

      <div className="space-y-5">
        <DataTable
          columns={columns}
          data={pager.pageItems}
          getRowKey={(m) => m.userId}
          empty={
            <div className="rounded-xl border border-border bg-surface-subtle">
              <EmptyState
                icon={Users}
                title={filtersActive ? "No matches" : "No members yet"}
                description={filtersActive ? "Try a different search or filter." : "Add teammates from your organization to give them access."}
                action={
                  filtersActive ? (
                    <Button variant="outline" className={OUTLINE_BUTTON} onClick={clearFilters}>
                      Clear filters
                    </Button>
                  ) : canInvite ? (
                    <Button onClick={onAddClick}>
                      <UserPlus className="h-4 w-4" /> Add member
                    </Button>
                  ) : null
                }
              />
            </div>
          }
        />
        <ListPagination {...pager} itemLabel="members" />
      </div>

      <Dialog open={!!removeTarget} onOpenChange={(o) => !o && setRemoveTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove member</DialogTitle>
            <DialogDescription>
              Remove <span className="font-medium text-foreground">{removeTarget?.name || removeTarget?.email}</span> from this project? They lose access right away; you can add them back later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRemoveTarget(null)}>
              Cancel
            </Button>
            <Button className="bg-red-500/90 text-white hover:bg-red-500" onClick={confirmRemove}>
              <UserMinus className="h-4 w-4" /> Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
