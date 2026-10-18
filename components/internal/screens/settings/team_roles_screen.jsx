"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button, ScreenHeader, SegmentedTabs, StatsBar } from "@geiger/ui";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { useProject } from "@/context/project-context";
import { useRbac } from "@/context/rbac-context";
import {
  createRole,
  grantRole,
  listMembers,
  listRoles,
  revokeMember,
  setMemberRole,
  softDeleteRole,
  updateRole,
} from "@/lib/supabase/rbac";
import { TEAM_TABS } from "./team/constants";
import { AddMemberDialog, MembersTab } from "./team/members_tab";
import { CreateRoleDialog, RolesTab } from "./team/roles_tab";

// Team & Roles: who holds which role in this project (campaign.role_grants) and what each role may do (public.roles).
export function TeamRolesScreen() {
  const { projectId } = useProject();
  const { can, userId, refresh: refreshRbac } = useRbac();

  const canInvite = can("campaign.team.invite");
  const canAssign = can("campaign.team.assign");
  const canManageRoles = can("campaign.role.manage");

  const [tab, setTab] = useState("members");
  const [members, setMembers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const fetchAll = useCallback(async () => {
    const [memberRows, roleRows] = await Promise.all([
      listMembers(projectId),
      listRoles(projectId),
    ]);
    return { memberRows: memberRows ?? [], roleRows: roleRows ?? [] };
  }, [projectId]);

  const reload = useCallback(async () => {
    const { memberRows, roleRows } = await fetchAll();
    setMembers(memberRows);
    setRoles(roleRows);
  }, [fetchAll]);

  useEffect(() => {
    let alive = true;
    fetchAll().then(({ memberRows, roleRows }) => {
      if (!alive) return;
      setMembers(memberRows);
      setRoles(roleRows);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [fetchAll]);

  const stats = useMemo(
    () => [
      { label: "Members", value: String(members.length) },
      { label: "Owners", value: String(members.filter((m) => m.roleKey === "owner").length) },
      { label: "Roles", value: String(roles.length) },
      { label: "Custom roles", value: String(roles.filter((r) => !r.isSystem).length) },
    ],
    [members, roles],
  );

  const handleChangeRole = async (member, roleId) => {
    const role = roles.find((r) => r.id === roleId);
    if (!role || roleId === member.roleId) return;
    setMembers((prev) =>
      prev.map((m) =>
        m.userId === member.userId
          ? { ...m, roleId, roleKey: role.key, roleName: role.name }
          : m,
      ),
    );
    const ok = await setMemberRole({ projectId, userId: member.userId, roleId, grantedBy: userId });
    if (ok) {
      toast.success(`${member.name || member.email} is now ${role.name}`);
    } else {
      toast.error("Couldn't change the role.");
      reload();
    }
  };

  const handleRemove = async (member) => {
    setMembers((prev) => prev.filter((m) => m.userId !== member.userId));
    if (await revokeMember(projectId, member.userId)) {
      toast.success(`${member.name || member.email} was removed from this project`);
    } else {
      toast.error("Couldn't remove that member.");
      reload();
    }
  };

  const handleAdd = async (candidate, role) => {
    const granted = await grantRole({
      projectId,
      userId: candidate.userId,
      roleId: role.id,
      grantedBy: userId,
    });
    if (!granted) {
      toast.error("Couldn't add that member.");
      return false;
    }
    setMembers((prev) => [
      ...prev,
      {
        ...candidate,
        roleId: role.id,
        roleKey: role.key,
        roleName: role.name,
        status: "active",
        grantedAt: granted.createdAt,
      },
    ]);
    toast.success(`${candidate.name || candidate.email} added as ${role.name}`);
    return true;
  };

  const handleSaveRole = async (role, patch) => {
    const previous = roles;
    setRoles((prev) => prev.map((r) => (r.id === role.id ? { ...r, ...patch } : r)));
    const saved = await updateRole(role.id, patch);
    if (!saved) {
      setRoles(previous);
      toast.error("Couldn't save the role.");
      return;
    }
    setRoles((prev) => prev.map((r) => (r.id === saved.id ? saved : r)));
    setMembers((prev) =>
      prev.map((m) => (m.roleId === saved.id ? { ...m, roleName: saved.name } : m)),
    );
    toast.success(`${saved.name} saved`);
    // Editing a role you hold changes what you can see.
    refreshRbac();
  };

  const handleCreateRole = async (draft) => {
    const optimistic = {
      ...draft,
      id: crypto.randomUUID(),
      projectId,
      key: null,
      isSystem: false,
      sort: 100,
      createdBy: userId,
    };
    setRoles((prev) => [...prev, optimistic]);
    const created = await createRole(optimistic);
    if (!created) {
      setRoles((prev) => prev.filter((r) => r.id !== optimistic.id));
      toast.error("Couldn't create the role.");
      return false;
    }
    setRoles((prev) => prev.map((r) => (r.id === created.id ? created : r)));
    toast.success(`${created.name} created`);
    return true;
  };

  const handleDeleteRole = async (role) => {
    setRoles((prev) => prev.filter((r) => r.id !== role.id));
    if (await softDeleteRole(role.id)) {
      toast.success(`${role.name} deleted`);
    } else {
      toast.error("Couldn't delete the role.");
      reload();
    }
  };

  const action =
    tab === "members"
      ? canInvite && (
          <Button onClick={() => setAddOpen(true)}>
            <UserPlus className="h-4 w-4" /> Add member
          </Button>
        )
      : canManageRoles && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> New role
          </Button>
        );

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Team & Roles"
        description="Manage who has access to this project and what each role can do."
        actions={action || null}
      />

      <StatsBar stats={stats} columns={4} />

      <SegmentedTabs tabs={TEAM_TABS} value={tab} onChange={setTab} />

      {tab === "members" ? (
        <MembersTab
          members={members}
          roles={roles}
          loading={loading}
          currentUserId={userId}
          canAssign={canAssign}
          canInvite={canInvite}
          onAddClick={() => setAddOpen(true)}
          onChangeRole={handleChangeRole}
          onRemove={handleRemove}
        />
      ) : (
        <RolesTab
          roles={roles}
          members={members}
          loading={loading}
          canManage={canManageRoles}
          onSave={handleSaveRole}
          onDelete={handleDeleteRole}
          onCreateClick={() => setCreateOpen(true)}
        />
      )}

      <AddMemberDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        projectId={projectId}
        roles={roles}
        onAdd={handleAdd}
      />
      <CreateRoleDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        roles={roles}
        onCreate={handleCreateRole}
      />
    </MainScreenWrapper>
  );
}

export default TeamRolesScreen;
